import type { HookPolicy } from './hook-policy';

// ─── Types ─────────────────────────────────────────────────────────

export interface WakeCandidate {
  id: string;
  status: 'dormant';
  priority: 'critical' | 'major' | 'minor';
  plantedChapter: number;
  expectedResolutionMin: number;
  expectedResolutionMax: number;
}

interface DeferredEntry {
  hookId: string;
  wakeAtChapter: number;
}

export interface SmoothingResult {
  woken: Array<{ hookId: string; priority: string }>;
  deferred: DeferredEntry[];
  pending: Array<{ hookId: string }>;
  totalCandidates: number;
  thunderingHerd: boolean;
  notification: string | null;
}

interface WakeStats {
  totalPending: number;
  dueNow: number;
  nextWakeChapter: number | null;
}

// ─── Priority ordering ─────────────────────────────────────────────

const PRIORITY_ORDER: Record<string, number> = { critical: 0, major: 1, minor: 2 };

// ─── WakeSmoothing ─────────────────────────────────────────────────
/**
 * 惊群平滑器。
 * 当同一章节有多个休眠伏笔同时到达回收窗口时，
 * 按优先级分批唤醒，避免排班队列爆炸。
 */
export class WakeSmoothing {
  private policy: HookPolicy;
  private deferredQueue: Map<string, number> = new Map(); // hookId → wakeAtChapter

  constructor(policy: HookPolicy) {
    this.policy = policy;
  }

  /**
   * 处理一批待唤醒的休眠伏笔。
   * 按优先级排序，前 maxWakePerChapter 个立即唤醒，剩余 defer 到后续章节。
   */
  processWakes(candidates: WakeCandidate[], currentChapter: number): SmoothingResult {
    if (candidates.length === 0) {
      return {
        woken: [],
        deferred: [],
        pending: [],
        totalCandidates: 0,
        thunderingHerd: false,
        notification: null,
      };
    }

    // Auto-wake disabled → hold all as pending
    if (!this.policy.wakePolicy.autoWakeEnabled) {
      return {
        woken: [],
        deferred: [],
        pending: candidates.map((c) => ({ hookId: c.id })),
        totalCandidates: candidates.length,
        thunderingHerd: false,
        notification: null,
      };
    }

    const maxWake = this.policy.wakePolicy.maxWakePerChapter;
    const batchSize = this.policy.wakePolicy.wakeBatchSize;
    const interval = this.policy.wakePolicy.wakeInterval;

    // Sort: priority desc, then plantedChapter asc
    const sorted = [...candidates].sort((a, b) => {
      const pDiff = (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99);
      if (pDiff !== 0) return pDiff;
      return a.plantedChapter - b.plantedChapter;
    });

    const isThundering = sorted.length > maxWake;
    const woken: SmoothingResult['woken'] = [];
    const deferred: SmoothingResult['deferred'] = [];

    // Immediate wake for top maxWake
    const toWake = sorted.slice(0, maxWake);
    for (const h of toWake) {
      woken.push({ hookId: h.id, priority: h.priority });
    }

    // Defer remaining in batches
    const remaining = sorted.slice(maxWake);
    for (let i = 0; i < remaining.length; i++) {
      const batchIdx = Math.floor(i / batchSize);
      const wakeChapter = currentChapter + (batchIdx + 1) * interval;
      deferred.push({ hookId: remaining[i].id, wakeAtChapter: wakeChapter });
      this.deferredQueue.set(remaining[i].id, wakeChapter);
    }

    // Notification for thundering herd events
    const notification = isThundering
      ? `第${currentChapter}章有${sorted.length}个伏笔到达回收窗口，已唤醒${woken.length}个，其余${deferred.length}个分批唤醒`
      : null;

    return {
      woken,
      deferred,
      pending: [],
      totalCandidates: candidates.length,
      thunderingHerd: isThundering,
      notification,
    };
  }

  /**
   * 注册 deferred 伏笔的唤醒章节。
   */
  registerDeferred(hookId: string, wakeAtChapter: number): void {
    this.deferredQueue.set(hookId, wakeAtChapter);
  }

  /**
   * 获取当前章节已到达唤醒时间的 deferred 伏笔。
   * 返回的条目会从队列中移除。
   */
  getPendingWakes(currentChapter: number): Array<{ hookId: string }> {
    const due: Array<{ hookId: string }> = [];
    const toRemove: string[] = [];

    for (const [hookId, wakeAt] of this.deferredQueue) {
      if (currentChapter >= wakeAt) {
        due.push({ hookId });
        toRemove.push(hookId);
      }
    }

    for (const hookId of toRemove) {
      this.deferredQueue.delete(hookId);
    }

    return due;
  }

  /**
   * 获取唤醒队列统计信息。
   */
  getWakeStats(currentChapter: number): WakeStats {
    const entries = [...this.deferredQueue.entries()];
    const dueNow = entries.filter(([, wakeAt]) => currentChapter >= wakeAt).length;
    const futureWakes = entries
      .filter(([, wakeAt]) => currentChapter < wakeAt)
      .map(([, wakeAt]) => wakeAt)
      .sort((a, b) => a - b);

    return {
      totalPending: entries.length,
      dueNow,
      nextWakeChapter: futureWakes.length > 0 ? futureWakes[0] : null,
    };
  }
}
