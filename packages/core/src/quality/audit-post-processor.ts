// ─── 审计后处理层 ──────────────────────────────────────────────
// 对 AuditTierClassifier 输出的 33 维结果进行后处理，计算最终行动决策。

import {
  type AuditReport,
  type AuditDimensionResult,
  AUDIT_DIMENSIONS,
  getDimensionById,
} from './audit-dimensions';

export type AuditAction = 'revise' | 'accept_with_warnings' | 'pass';

export interface ProcessedAudit {
  action: AuditAction;
  /** 需要修复的维度 ID 列表（按优先级排序） */
  targetDimensions: number[];
  /** 原始报告 */
  rawReport: AuditReport;
  /** 失败维度详情 */
  failedDimensions: AuditDimensionResult[];
  /** 阻塞级失败维度数 */
  blockerCount: number;
  /** 警告级失败维度数 */
  warningCount: number;
  /** 建议级失败维度数 */
  suggestionCount: number;
  /** 综合得分（0-1） */
  compositeScore: number;
}

export interface PostProcessOptions {
  /** 最大允许警告级未通过数量（超过则降级为 revise） */
  maxWarningsBeforeDowngrade?: number;
  /** 权重配置：阻断级/警告级/建议级 */
  tierWeights?: { blocker: number; warning: number; suggestion: number };
}

const DEFAULT_OPTIONS: Required<PostProcessOptions> = {
  maxWarningsBeforeDowngrade: 5,
  tierWeights: { blocker: 1.0, warning: 0.7, suggestion: 0.3 },
};

/**
 * 对 AuditReport 进行后处理，输出最终行动决策。
 */
export function processAuditResult(
  report: AuditReport,
  options?: PostProcessOptions,
): ProcessedAudit {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const failed = report.dimensions.filter((d) => !d.passed);

  const blockerCount = failed.filter((d) => {
    const dim = getDimensionById(d.dimensionId);
    return dim?.tier === 'blocker';
  }).length;

  const warningCount = failed.filter((d) => {
    const dim = getDimensionById(d.dimensionId);
    return dim?.tier === 'warning';
  }).length;

  const suggestionCount = failed.filter((d) => {
    const dim = getDimensionById(d.dimensionId);
    return dim?.tier === 'suggestion';
  }).length;

  // 按优先级排序目标维度：blocker > warning > suggestion，同 tier 内按 score 升序
  const targetDimensions = failed
    .map((d) => ({ ...d, dim: getDimensionById(d.dimensionId)! }))
    .sort((a, b) => {
      const tierOrder = { blocker: 0, warning: 1, suggestion: 2 };
      const tierDiff = tierOrder[a.dim.tier] - tierOrder[b.dim.tier];
      if (tierDiff !== 0) return tierDiff;
      return a.score - b.score;
    })
    .map((d) => d.dimensionId);

  // 综合得分：基于加权通过维度计算
  const totalWeight = AUDIT_DIMENSIONS.reduce((sum, d) => sum + d.weight, 0);
  const earnedWeight = report.dimensions.reduce((sum, d) => {
    const dim = getDimensionById(d.dimensionId);
    if (!dim) return sum;
    const tierWeight =
      dim.tier === 'blocker'
        ? opts.tierWeights.blocker
        : dim.tier === 'warning'
          ? opts.tierWeights.warning
          : opts.tierWeights.suggestion;
    return sum + (d.passed ? dim.weight * tierWeight : 0);
  }, 0);
  const compositeScore = earnedWeight / totalWeight;

  // 行动决策
  let action: AuditAction;
  if (blockerCount > 0) {
    action = 'revise';
  } else if (warningCount > opts.maxWarningsBeforeDowngrade) {
    action = 'revise';
  } else if (warningCount > 0) {
    action = 'accept_with_warnings';
  } else {
    action = 'pass';
  }

  return {
    action,
    targetDimensions,
    rawReport: report,
    failedDimensions: failed,
    blockerCount,
    warningCount,
    suggestionCount,
    compositeScore,
  };
}

/**
 * 生成面向修订代理的反馈文本。
 */
export function buildRevisionFeedback(processed: ProcessedAudit): string {
  const lines: string[] = [];
  lines.push(
    `审计结果：${processed.action === 'revise' ? '需修订' : processed.action === 'accept_with_warnings' ? '通过（含警告）' : '通过'}`,
  );
  lines.push(`综合得分：${(processed.compositeScore * 100).toFixed(1)}%`);
  lines.push(
    `未通过维度：阻断 ${processed.blockerCount} / 警告 ${processed.warningCount} / 建议 ${processed.suggestionCount}`,
  );

  if (processed.targetDimensions.length > 0) {
    lines.push('');
    lines.push('重点关注维度：');
    for (const dimId of processed.targetDimensions.slice(0, 10)) {
      const dim = getDimensionById(dimId);
      const result = processed.rawReport.dimensions.find((d) => d.dimensionId === dimId);
      if (dim && result) {
        lines.push(`- [${dim.displayName}] ${result.feedback || '未提供具体反馈'}`);
      }
    }
  }

  return lines.join('\n');
}
