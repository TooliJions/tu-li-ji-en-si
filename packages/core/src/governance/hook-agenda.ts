import type { Hook } from '../models/state';
import type { HookPolicy } from './hook-policy';
import { WakeSmoothing, type WakeCandidate } from './wake-smoothing';

// ─── Types ─────────────────────────────────────────────────────────

export interface HookScheduleItem {
  hookId: string;
  status: 'scheduled' | 'deferred' | 'unscheduled';
  currentChapter: number;
  priority: 'critical' | 'major' | 'minor';
  plantedChapter: number;
}

export interface OverdueReport {
  overdueHooks: Array<{
    hookId: string;
    plantedChapter: number;
    chaptersSincePlanted: number;
    priority: 'critical' | 'major' | 'minor';
  }>;
  totalActive: number;
}

export interface WakeResult {
  woken: Array<{ hookId: string; priority: string }>;
  deferred: Array<{ hookId: string; wakeAtChapter: number }>;
  totalCandidates: number;
  thunderingHerd?: boolean;
  notification?: string | null;
  /** 状态变更指令列表，调用者负责应用到实际 hook 对象 */
  statusChanges: Array<{ hookId: string; newStatus: string; updatedAt: string }>;
}

export interface WakeDeferredResult {
  success: boolean;
  newStatus?: string;
  reason?: string;
}

// ─── Active statuses (participate in scheduling and overdue) ───────

const ACTIVE_STATUSES = new Set<Hook['status']>(['open', 'progressing', 'deferred']);

// ─── HookAgenda ──────────────────────────────────────────────────
/**
 * 伏笔排班层。
 * 负责：
 *   - scheduleHook: 为每个伏笔安排推进计划
 *   - checkOverdue: 检查逾期（跳过 dormant/deferred 伏笔）
 *   - isWithinResolutionWindow: 窗口期校验
 *   - onChapterReached: 章节到达时唤醒休眠伏笔（含惊群平滑）
 *   - wakeDeferredHook: 唤醒延期的伏笔
 */
export class HookAgenda {
  private policy: HookPolicy;
  private smoothing: WakeSmoothing;
  private schedule = new Map<string, HookScheduleItem>();

  constructor(policy: HookPolicy) {
    this.policy = policy;
    this.smoothing = new WakeSmoothing(policy);
  }

  // ── Scheduling ────────────────────────────────────────────────

  /**
   * 为单个伏笔创建排班条目。
   * dormant/resolved/abandoned → unscheduled
   * deferred → deferred
   * open/progressing → scheduled
   */
  scheduleHook(hook: Hook): HookScheduleItem {
    let status: HookScheduleItem['status'];

    if (hook.status === 'deferred') {
      status = 'deferred';
    } else if (
      hook.status === 'dormant' ||
      hook.status === 'resolved' ||
      hook.status === 'abandoned'
    ) {
      status = 'unscheduled';
    } else {
      status = 'scheduled';
    }

    const item: HookScheduleItem = {
      hookId: hook.id,
      status,
      currentChapter: hook.plantedChapter,
      priority: hook.priority,
      plantedChapter: hook.plantedChapter,
    };

    this.schedule.set(hook.id, item);
    return item;
  }

  /**
   * 批量为所有伏笔创建排班。
   */
  scheduleAll(hooks: Hook[]): HookScheduleItem[] {
    return hooks.map((h) => this.scheduleHook(h));
  }

  /**
   * 获取当前排班表。
   */
  getSchedule(): HookScheduleItem[] {
    return [...this.schedule.values()];
  }

  /**
   * 推进伏笔的当前章节号。
   */
  advanceHook(hookId: string, chapterNumber: number): boolean {
    const item = this.schedule.get(hookId);
    if (!item) return false;
    item.currentChapter = chapterNumber;
    return true;
  }

  // ── Overdue Detection ─────────────────────────────────────────

  /**
   * 检查所有活跃伏笔的逾期情况。
   * 跳过 dormant、deferred、resolved、abandoned 伏笔。
   * 窗口期内不报逾期：即使距离超过 overdueThreshold，只要在预期回收窗口内就不标记为逾期。
   */
  checkOverdue(hooks: Hook[], currentChapter: number): OverdueReport {
    const overdueHooks: OverdueReport['overdueHooks'] = [];
    const activeHooks = hooks.filter((h) => ACTIVE_STATUSES.has(h.status));

    for (const hook of activeHooks) {
      // dormant and deferred don't participate in overdue check
      if (hook.status === 'dormant' || hook.status === 'deferred') continue;

      // Within resolution window → not overdue (窗口期保护)
      if (this.isWithinResolutionWindow(hook, currentChapter)) continue;

      const chaptersSincePlanted = currentChapter - hook.plantedChapter;
      if (this.policy.isOverdue({ chaptersSincePlanted })) {
        overdueHooks.push({
          hookId: hook.id,
          plantedChapter: hook.plantedChapter,
          chaptersSincePlanted,
          priority: hook.priority,
        });
      }
    }

    return {
      overdueHooks,
      totalActive: activeHooks.length,
    };
  }

  // ── Resolution Window ─────────────────────────────────────────

  /**
   * 判断当前章节是否在伏笔的预期回收窗口内。
   * 优先使用伏笔自身的 expectedResolutionMin/Max，
   * 若无则回退到 HookPolicy 的全局窗口。
   */
  isWithinResolutionWindow(hook: Hook, currentChapter: number): boolean {
    const min = hook.expectedResolutionMin ?? this.policy.expectedResolutionWindow.min;
    const max = hook.expectedResolutionMax ?? this.policy.expectedResolutionWindow.max;

    const distance = currentChapter - hook.plantedChapter;
    return distance >= min && distance <= max;
  }

  // ── Wake Mechanism ────────────────────────────────────────────

  /**
   * 章节到达时触发：检查休眠伏笔是否在回收窗口内，按策略唤醒。
   * 同时检查 deferred 队列中是否有到期需要唤醒的伏笔。
   * 超过 maxWakePerChapter 时触发惊群平滑：
   *   - 前 N 个按优先级唤醒为 open
   *   - 剩余分配为 deferred，设置 wakeAtChapter
   */
  onChapterReached(hooks: Hook[], currentChapter: number): WakeResult {
    // 1. Find dormant hooks within resolution window
    const candidates = hooks.filter((h) => {
      if (h.status !== 'dormant') return false;
      return this.isWithinResolutionWindow(h, currentChapter);
    });

    // 2. Also check deferred queue for due wakes
    const dueWakes = this.smoothing.getPendingWakes(currentChapter);
    const dueIds = new Set(dueWakes.map((d) => d.hookId));

    // 3. Process through WakeSmoothing
    const wakeCandidates: WakeCandidate[] = candidates.map((h) => ({
      id: h.id,
      status: 'dormant' as const,
      priority: h.priority,
      plantedChapter: h.plantedChapter,
      expectedResolutionMin: h.expectedResolutionMin ?? this.policy.expectedResolutionWindow.min,
      expectedResolutionMax: h.expectedResolutionMax ?? this.policy.expectedResolutionWindow.max,
    }));

    const smoothingResult = this.smoothing.processWakes(wakeCandidates, currentChapter);
    const wokenIds = new Set(smoothingResult.woken.map((w) => w.hookId));

    // 4. Build status change instructions (do NOT mutate hooks directly)
    const statusChanges: WakeResult['statusChanges'] = [];
    const now = new Date().toISOString();

    for (const hook of hooks) {
      if (wokenIds.has(hook.id)) {
        statusChanges.push({ hookId: hook.id, newStatus: 'open', updatedAt: now });
      }
    }

    // 5. Handle due deferred hooks (from previous chapters)
    for (const hook of hooks) {
      if (dueIds.has(hook.id) && hook.status === 'deferred') {
        statusChanges.push({ hookId: hook.id, newStatus: 'open', updatedAt: now });
      }
    }

    // Apply status changes to hooks (preserving existing behavior for backward compatibility)
    for (const change of statusChanges) {
      const hook = hooks.find((h) => h.id === change.hookId);
      if (hook) {
        hook.status = change.newStatus as Hook['status'];
        hook.updatedAt = change.updatedAt;
      }
    }

    return {
      woken: smoothingResult.woken,
      deferred: smoothingResult.deferred,
      totalCandidates: smoothingResult.totalCandidates,
      thunderingHerd: smoothingResult.thunderingHerd,
      notification: smoothingResult.notification,
      statusChanges,
    };
  }

  /**
   * 获取惊队平滑器实例（用于查询队列状态）。
   */
  getSmoothing(): WakeSmoothing {
    return this.smoothing;
  }

  /**
   * 唤醒指定的 deferred 伏笔。
   * 若当前章节 >= wakeAtChapter（或无 wakeAtChapter），则转为 open。
   */
  wakeDeferredHook(hook: Hook, currentChapter?: number): WakeDeferredResult {
    if (hook.status !== 'deferred') {
      return { success: false, reason: `伏笔「${hook.id}」不是 deferred 状态` };
    }

    if (hook.wakeAtChapter !== undefined) {
      const ch = currentChapter ?? 0;
      if (ch < hook.wakeAtChapter) {
        return {
          success: false,
          reason: `未到唤醒章节（预期: ${hook.wakeAtChapter}，当前: ${ch}）`,
        };
      }
    }

    return { success: true, newStatus: 'open' };
  }
}
