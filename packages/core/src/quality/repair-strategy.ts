import type { AICategory } from './ai-detector';

// ─── Types ─────────────────────────────────────────────────────────

export type RepairStrategy =
  | 'accept'
  | 'local-replace'
  | 'paragraph-reorder'
  | 'beat-rewrite'
  | 'chapter-rewrite';

export interface AuditIssue {
  description: string;
  tier: 'blocker' | 'warning' | 'suggestion';
  category: string;
  suggestion: string;
  affectedParagraphs?: number[];
}

export interface AICategoryResult {
  category: AICategory;
  score: number;
  severity: 'none' | 'low' | 'medium' | 'high';
  issues: Array<{ text: string }>;
}

export interface RepairDecision {
  strategy: RepairStrategy;
  reason: string;
  triggeringCategories: string[];
  affectedText: string[];
  estimatedTokenCost: number;
}

export interface DeciderOptions {
  tokenCosts?: Record<RepairStrategy, number>;
}

// ─── Strategy hierarchy (ascending severity) ───────────────────────

const STRATEGY_ORDER: RepairStrategy[] = [
  'accept',
  'local-replace',
  'paragraph-reorder',
  'beat-rewrite',
  'chapter-rewrite',
];

function strategyLevel(s: RepairStrategy): number {
  return STRATEGY_ORDER.indexOf(s);
}

// ─── Token cost estimates ──────────────────────────────────────────

const DEFAULT_TOKEN_COSTS: Record<RepairStrategy, number> = {
  accept: 0,
  'local-replace': 800,
  'paragraph-reorder': 2000,
  'beat-rewrite': 4000,
  'chapter-rewrite': 10000,
};

// ─── Strategy mapping for AI categories ────────────────────────────

const AI_STRATEGY_MAP: Partial<Record<AICategory, RepairStrategy>> = {
  'cliche-phrase': 'local-replace',
  'semantic-repetition': 'local-replace',
  'imagery-repetition': 'local-replace',
  'hollow-description': 'local-replace',
  'monotonous-syntax': 'paragraph-reorder',
  'analytical-report': 'paragraph-reorder',
  'false-emotion': 'paragraph-reorder',
  'logic-gap': 'beat-rewrite',
  'meta-narrative': 'beat-rewrite',
};

// ─── Audit category → strategy mapping ─────────────────────────────

const AUDIT_STRATEGY_MAP: Record<string, RepairStrategy> = {
  // Blocker-level
  'character-state': 'beat-rewrite',
  timeline: 'beat-rewrite',
  pov: 'beat-rewrite',
  'outline-deviation': 'chapter-rewrite',
  'physical-law': 'beat-rewrite',
  'resource-change': 'beat-rewrite',
  'relationship-state': 'beat-rewrite',
  location: 'beat-rewrite',
  'ability-level': 'beat-rewrite',
  'appearance-age': 'beat-rewrite',
  'time-span': 'beat-rewrite',
  'dead-character': 'chapter-rewrite',
  'entity-existence': 'beat-rewrite',

  // Warning-level
  'character-detail': 'local-replace',
  pacing: 'paragraph-reorder',
  'scene-transition': 'paragraph-reorder',
  'emotional-arc': 'beat-rewrite',
  'style-drift': 'paragraph-reorder',
  repetition: 'local-replace',
  'dialogue-resistance': 'paragraph-reorder',
  'title-consistency': 'local-replace',
  'cross-chapter-repeat': 'local-replace',
  'info-density': 'paragraph-reorder',
  'suspense-missing': 'beat-rewrite',
  'hook-progress-missing': 'beat-rewrite',
};

// ─── Thresholds ────────────────────────────────────────────────────

const AI_HIGH_THRESHOLD = 70;
const AI_MEDIUM_THRESHOLD = 40;
const BLOCKER_CHAPTER_REWRITE = 3;
const WARNING_CHAPTER_REWRITE = 5;

// ─── RepairDecider ─────────────────────────────────────────────────
/**
 * 修复策略决策器。
 * 根据审计结果（三级分类）和 AI 检测结果（9 类痕迹），
 * 自动选择最合适的修复策略：
 *   - accept: 无需修复
 *   - local-replace: 局部替换（短语/词汇级）
 *   - paragraph-reorder: 段落重排（段落级顺序/风格）
 *   - beat-rewrite: 节拍重写（场景/节拍级）
 *   - chapter-rewrite: 整章重写（严重问题）
 */
export class RepairDecider {
  private tokenCosts: Record<RepairStrategy, number>;

  constructor(options?: DeciderOptions) {
    this.tokenCosts = { ...DEFAULT_TOKEN_COSTS, ...options?.tokenCosts };
  }

  /**
   * 根据审计和 AI 检测结果决策修复策略。
   */
  decide(auditIssues: AuditIssue[], aiResults: AICategoryResult[]): RepairDecision {
    const auditStrategy = this.#decideFromAudit(auditIssues);
    const aiStrategy = this.#decideFromAI(aiResults);
    const combined = this.#pickHighest(auditStrategy, aiStrategy);

    return {
      strategy: combined,
      reason: this.#buildReason(combined, auditIssues, aiResults),
      triggeringCategories: this.#collectTriggers(auditIssues, aiResults),
      affectedText: this.#collectAffectedText(auditIssues, aiResults),
      estimatedTokenCost: this.tokenCosts[combined] ?? 0,
    };
  }

  #decideFromAudit(auditIssues: AuditIssue[]): RepairStrategy {
    const blockers = auditIssues.filter((i) => i.tier === 'blocker');
    const warnings = auditIssues.filter((i) => i.tier === 'warning');

    // Many warnings → chapter-rewrite
    if (warnings.length >= WARNING_CHAPTER_REWRITE) return 'chapter-rewrite';

    // Multiple blockers → chapter-rewrite
    if (blockers.length >= BLOCKER_CHAPTER_REWRITE) return 'chapter-rewrite';

    // Check individual issue strategies
    let highest: RepairStrategy = 'accept';

    for (const issue of auditIssues) {
      if (issue.tier === 'suggestion') continue;

      const mapped = AUDIT_STRATEGY_MAP[issue.category];
      if (!mapped) continue;

      highest = this.#pickHighest(highest, mapped);
    }

    // Blocker with no specific mapping → beat-rewrite minimum
    if (blockers.length > 0 && highest === 'accept') return 'beat-rewrite';

    return highest;
  }

  #decideFromAI(aiResults: AICategoryResult[]): RepairStrategy {
    let highest: RepairStrategy = 'accept';
    const highCount = aiResults.filter((r) => r.severity === 'high').length;
    const mediumCount = aiResults.filter((r) => r.severity === 'medium').length;

    // Many high-severity AI issues → chapter-rewrite
    if (highCount >= 4) return 'chapter-rewrite';

    for (const result of aiResults) {
      if (result.severity === 'none' || result.severity === 'low') continue;

      const mapped = AI_STRATEGY_MAP[result.category];
      if (!mapped) continue;

      // Only escalate for extremely high individual scores
      const effective = result.score >= 85 ? this.#escalate(mapped) : mapped;

      highest = this.#pickHighest(highest, effective);
    }

    // Multiple medium issues → escalate to beat-rewrite minimum
    if (mediumCount >= 3 && strategyLevel(highest) < strategyLevel('beat-rewrite')) {
      return 'beat-rewrite';
    }

    return highest;
  }

  #escalate(strategy: RepairStrategy): RepairStrategy {
    const idx = strategyLevel(strategy);
    if (idx >= STRATEGY_ORDER.length - 1) return 'chapter-rewrite';
    return STRATEGY_ORDER[idx + 1];
  }

  #pickHighest(a: RepairStrategy, b: RepairStrategy): RepairStrategy {
    return strategyLevel(a) >= strategyLevel(b) ? a : b;
  }

  #collectTriggers(auditIssues: AuditIssue[], aiResults: AICategoryResult[]): string[] {
    const triggers: string[] = [];

    for (const issue of auditIssues) {
      if (issue.tier !== 'suggestion') triggers.push(issue.category);
    }
    for (const result of aiResults) {
      if (result.severity !== 'none' && result.severity !== 'low') {
        triggers.push(result.category);
      }
    }

    return triggers;
  }

  #collectAffectedText(auditIssues: AuditIssue[], aiResults: AICategoryResult[]): string[] {
    const texts: string[] = [];

    // AI issues with specific text
    for (const result of aiResults) {
      for (const issue of result.issues) {
        if (issue.text) texts.push(issue.text);
      }
    }

    // Audit issues with descriptions
    for (const issue of auditIssues) {
      if (issue.tier !== 'suggestion') texts.push(issue.description);
    }

    return texts.slice(0, 20); // cap at 20 entries
  }

  #buildReason(
    strategy: RepairStrategy,
    auditIssues: AuditIssue[],
    aiResults: AICategoryResult[]
  ): string {
    const blockers = auditIssues.filter((i) => i.tier === 'blocker');
    const warnings = auditIssues.filter((i) => i.tier === 'warning');
    const highAI = aiResults.filter((r) => r.severity === 'high');

    switch (strategy) {
      case 'accept':
        return '无严重问题，章节质量可接受';
      case 'local-replace': {
        const parts: string[] = [];
        if (highAI.length > 0) parts.push(`${highAI.length} 类 AI 痕迹需局部替换`);
        if (warnings.length > 0) parts.push(`${warnings.length} 个警告级审计问题`);
        return parts.length > 0 ? parts.join('，') : '存在轻度 AI 痕迹，建议局部替换';
      }
      case 'paragraph-reorder':
        return '检测到句式/风格/节奏问题，建议段落级重排';
      case 'beat-rewrite':
        return `检测到逻辑/时间线/情感弧线问题${blockers.length > 0 ? `（含 ${blockers.length} 个阻断级）` : ''}，需要节拍级重写`;
      case 'chapter-rewrite': {
        const reasons: string[] = [];
        if (blockers.length >= BLOCKER_CHAPTER_REWRITE)
          reasons.push(`${blockers.length} 个阻断级问题`);
        if (highAI.length >= 4) reasons.push(`${highAI.length} 类 AI 痕迹严重`);
        if (warnings.length >= WARNING_CHAPTER_REWRITE)
          reasons.push(`${warnings.length} 个警告级问题累积`);
        return `问题严重，建议整章重写：${reasons.join('；')}`;
      }
    }
  }
}
