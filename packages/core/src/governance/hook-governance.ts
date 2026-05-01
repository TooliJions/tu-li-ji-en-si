import { HookPolicy } from './hook-policy';
import { HookAgenda } from './hook-agenda';
import { IntentDeclaration } from './intent-declaration';
import type { Hook } from '../models/state';
import type { IntentResult, WakeResult, DormantResult } from './intent-declaration';

export type { IntentResult, WakeResult, DormantResult };

// ─── Types ─────────────────────────────────────────────────────────

export interface AdmissionResult {
  admitted: boolean;
  reason?: string;
  relatedHookIds?: string[];
}

export interface PayoffValidation {
  valid: boolean;
  issues: string[];
  qualityScore: number; // 0-100
}

export interface HealthReport {
  totalHooks: number;
  byStatus: Record<Hook['status'], number>;
  overdueCount: number;
  dormantCount: number;
  inResolutionWindow: number;
  healthScore: number; // 0-100
  warnings: string[];
}

// ─── Active hook statuses ────────────────────────────────────────

const ACTIVE_HOOK_STATUSES: Hook['status'][] = ['open', 'progressing', 'deferred'];

// ─── HookGovernance ──────────────────────────────────────────────
/**
 * 伏笔治理层。
 * 负责：
 *   - evaluateAdmission: 伏笔准入控制
 *   - validatePayoff: 伏笔回收验证
 *   - checkHealth: 健康度检查
 *   - markDormant: 人工意图声明（休眠伏笔）
 */
export class HookGovernance {
  private policy: HookPolicy;
  private agenda: HookAgenda;
  private intentDeclaration: IntentDeclaration;

  constructor(policy: HookPolicy, agenda?: HookAgenda) {
    this.policy = policy;
    this.agenda = agenda ?? new HookAgenda(policy);
    this.intentDeclaration = new IntentDeclaration();
  }

  // ── Admission Control ─────────────────────────────────────────

  /**
   * 评估新伏笔是否可以准入。
   * 检查：
   *   1. 活跃伏笔数是否超过上限
   *   2. 是否与现有伏笔高度重复（description 相似度）
   */
  evaluateAdmission(newHook: Hook, existingHooks: Hook[]): AdmissionResult {
    // Check active count limit
    const activeCount = existingHooks.filter((h) => ACTIVE_HOOK_STATUSES.includes(h.status)).length;
    if (!this.policy.canAdmitHook({ activeCount })) {
      return {
        admitted: false,
        reason: `活跃伏笔数已达上限 (${this.policy.maxActiveHooks})`,
      };
    }

    // Check for duplicates by description similarity
    const relatedHookIds: string[] = [];
    for (const existing of existingHooks) {
      if (!ACTIVE_HOOK_STATUSES.includes(existing.status)) continue;
      const similarity = this.#textSimilarity(newHook.description, existing.description);
      if (similarity > 0.85) {
        relatedHookIds.push(existing.id);
      }
    }

    if (relatedHookIds.length > 0) {
      return {
        admitted: false,
        reason: `与 ${relatedHookIds.length} 个现有伏笔高度相似`,
        relatedHookIds,
      };
    }

    return { admitted: true };
  }

  // ── Payoff Validation ─────────────────────────────────────────

  /**
   * 验证伏笔回收的有效性。
   * 检查：
   *   1. 伏笔状态是否为 active（open/progressing）
   *   2. 是否在预期回收窗口内
   *   3. 是否有 payoffDescription
   */
  validatePayoff(hook: Hook, currentChapter: number): PayoffValidation {
    const issues: string[] = [];
    let score = 100;

    // Status check
    if (!ACTIVE_HOOK_STATUSES.includes(hook.status) && hook.status !== 'dormant') {
      issues.push(`伏笔状态「${hook.status}」无法回收`);
      score -= 50;
    }

    // Resolution window check
    if (!this.agenda.isWithinResolutionWindow(hook, currentChapter)) {
      const min = hook.expectedResolutionMin ?? this.policy.expectedResolutionWindow.min;
      const max = hook.expectedResolutionMax ?? this.policy.expectedResolutionWindow.max;
      issues.push(`当前不在回收窗口内（预期: 埋设后第 ${min}-${max} 章）`);
      score -= 30;
    }

    // Payoff description check
    if (!hook.payoffDescription || hook.payoffDescription.trim().length === 0) {
      issues.push('缺少 payoffDescription（回收描述）');
      score -= 20;
    }

    return {
      valid: issues.length === 0,
      issues,
      qualityScore: Math.max(0, score),
    };
  }

  // ── Health Check ──────────────────────────────────────────────

  /**
   * 全面健康度检查。
   * 返回各状态分布、逾期数、休眠数、窗口内伏笔数和健康评分。
   */
  checkHealth(hooks: Hook[], currentChapter: number): HealthReport {
    const byStatus: Record<Hook['status'], number> = {
      open: 0,
      progressing: 0,
      deferred: 0,
      dormant: 0,
      resolved: 0,
      abandoned: 0,
    };
    let overdueCount = 0;
    let inResolutionWindow = 0;
    const warnings: string[] = [];

    for (const hook of hooks) {
      byStatus[hook.status] = (byStatus[hook.status] ?? 0) + 1;

      // Overdue check (only active non-dormant, skip if within resolution window)
      if (hook.status === 'open' || hook.status === 'progressing') {
        if (!this.agenda.isWithinResolutionWindow(hook, currentChapter)) {
          const chaptersSincePlanted = currentChapter - hook.plantedChapter;
          if (this.policy.isOverdue({ chaptersSincePlanted })) {
            overdueCount++;
          }
        }
      }

      // Resolution window check
      if (this.agenda.isWithinResolutionWindow(hook, currentChapter)) {
        inResolutionWindow++;
      }
    }

    // Health score calculation
    const total = hooks.length || 1;
    let healthScore = 100;

    // Penalty for overdue hooks
    const overdueRatio = overdueCount / total;
    if (overdueRatio > 0.3) healthScore -= 40;
    else if (overdueRatio > 0.1) healthScore -= 20;

    // Penalty for too many dormant hooks
    const dormantRatio = byStatus.dormant / total;
    if (dormantRatio > 0.5) healthScore -= 20;
    else if (dormantRatio > 0.3) healthScore -= 10;

    // Bonus for hooks in resolution window
    const windowRatio = inResolutionWindow / total;
    if (windowRatio > 0.5) healthScore += 10;

    healthScore = Math.max(0, Math.min(100, healthScore));

    // Generate warnings
    if (overdueCount > 0) {
      warnings.push(`${overdueCount} 个伏笔逾期`);
    }
    if (byStatus.dormant > 5) {
      warnings.push(`${byStatus.dormant} 个伏笔处于休眠状态`);
    }
    if (byStatus.open + byStatus.progressing >= this.policy.maxActiveHooks) {
      warnings.push(`活跃伏笔数已达上限 (${this.policy.maxActiveHooks})`);
    }

    return {
      totalHooks: hooks.length,
      byStatus,
      overdueCount,
      dormantCount: byStatus.dormant,
      inResolutionWindow,
      healthScore,
      warnings,
    };
  }

  // ── Mark Dormant ──────────────────────────────────────────────

  /**
   * 人工标记伏笔为休眠状态。
   * 休眠伏笔不参与排班和逾期检测，直到被唤醒。
   * 委托给 IntentDeclaration 模块。
   */
  markDormant(
    hook: Hook,
    options?: {
      expectedResolutionMin?: number;
      expectedResolutionMax?: number;
    },
  ): DormantResult {
    return this.intentDeclaration.markDormant(hook, options);
  }

  // ── Declare Intent ──────────────────────────────────────────

  /**
   * 人工意图声明：设置预期回收窗口，可选择同时标记为休眠。
   * 委托给 IntentDeclaration 模块。
   */
  declareIntent(
    hook: Hook,
    options: {
      min?: number;
      max?: number;
      setDormant?: boolean;
    },
  ): IntentResult {
    return this.intentDeclaration.declareIntent(hook, options);
  }

  // ── Wake Up ──────────────────────────────────────────────────

  /**
   * 唤醒休眠伏笔。
   * 从 dormant 状态恢复到 open 或 progressing。
   * 委托给 IntentDeclaration 模块。
   */
  wakeUp(
    hook: Hook,
    targetStatus: 'open' | 'progressing' = 'open',
    options?: { min?: number; max?: number },
  ): WakeResult {
    return this.intentDeclaration.wakeUp(hook, targetStatus, options);
  }

  // ── Internal ──────────────────────────────────────────────────

  /**
   * 简易文本相似度计算（基于字符集合 Jaccard 相似度）。
   */
  #textSimilarity(a: string, b: string): number {
    const setA = new Set(a.toLowerCase().split(''));
    const setB = new Set(b.toLowerCase().split(''));

    const intersection = new Set([...setA].filter((c) => setB.has(c)));
    const union = new Set([...setA, ...setB]);

    return union.size === 0 ? 0 : intersection.size / union.size;
  }
}
