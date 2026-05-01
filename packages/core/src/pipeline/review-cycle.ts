import type { RunnerAuditIssue } from './types';

// ─── Types ─────────────────────────────────────────────────────────

export type ReviewStatus = 'pass' | 'warning' | 'fail';

export interface ReviewDecision {
  overallScore: number;
  overallStatus: ReviewStatus;
  aiTraceScore: number;
}

export interface ReviewCycleConfig {
  /** 通过分数线（默认 80） */
  passThreshold?: number;
  /** 警告分数线（默认 60） */
  warningThreshold?: number;
  /** AI 检测分数权重（默认 0.5，与审计分数等权） */
  aiTraceWeight?: number;
}

// ─── ReviewCycle ───────────────────────────────────────────────────
/**
 * 审计结果综合决策模块。
 *
 * 职责：
 *   - computeOverallScore: 综合连续性审计分数与 AI 检测分数
 *   - decideStatus: 根据总分判定 pass / warning / fail
 *   - decide: 一站式决策入口
 *
 * 阈值规则（默认）：
 *   - overallScore >= 80 → pass
 *   - overallScore >= 60 → warning
 *   - overallScore <  60 → fail
 */
export class ReviewCycle {
  readonly #passThreshold: number;
  readonly #warningThreshold: number;
  readonly #aiTraceWeight: number;

  constructor(config: ReviewCycleConfig = {}) {
    this.#passThreshold = config.passThreshold ?? 80;
    this.#warningThreshold = config.warningThreshold ?? 60;
    this.#aiTraceWeight = config.aiTraceWeight ?? 0.5;
  }

  /**
   * 综合审计分数与 AI 检测分数，返回总体评分。
   *
   * 公式：auditScore * (1 - weight) + (1 - aiTrace) * 100 * weight
   * 默认等权：weight = 0.5
   */
  computeOverallScore(auditScore: number, aiTraceScore: number): number {
    const w = this.#aiTraceWeight;
    const score = auditScore * (1 - w) + (1 - aiTraceScore) * 100 * w;
    return Math.round(score);
  }

  /**
   * 根据总分判定状态。
   */
  decideStatus(overallScore: number): ReviewStatus {
    if (overallScore >= this.#passThreshold) return 'pass';
    if (overallScore >= this.#warningThreshold) return 'warning';
    return 'fail';
  }

  /**
   * 一站式决策：输入审计报告和 AI 检测结果，输出综合决策。
   */
  decide(auditScore: number, aiTraceScore: number): ReviewDecision {
    const overallScore = this.computeOverallScore(auditScore, aiTraceScore);
    const overallStatus = this.decideStatus(overallScore);
    return { overallScore, overallStatus, aiTraceScore };
  }

  /**
   * 根据决策结果判定是否需要修订。
   * pass 不需要修订，warning/fail 需要进入修订循环。
   */
  needsRevision(decision: ReviewDecision): boolean {
    return decision.overallStatus !== 'pass';
  }

  /**
   * 构建降级后的 AuditResult（当审计调用失败时使用）。
   */
  static buildFallbackResult(
    bookId: string,
    chapterNumber: number,
    errorMessage: string,
  ): {
    success: false;
    bookId: string;
    chapterNumber: number;
    overallScore: 0;
    overallStatus: 'fail';
    issues: RunnerAuditIssue[];
    summary: string;
  } {
    return {
      success: false,
      bookId,
      chapterNumber,
      overallScore: 0,
      overallStatus: 'fail',
      issues: [],
      summary: `审计失败: ${errorMessage}`,
    };
  }
}
