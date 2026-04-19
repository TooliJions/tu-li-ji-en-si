import type { Hook } from '../models/state';

// ─── Types ─────────────────────────────────────────────────────────

export interface AdmissionCheck {
  admitted: boolean;
  score: number; // 0-100, higher = more likely to conflict
  conflicts: HookConflict[];
  recommendation: string;
}

export interface HookConflict {
  hookId: string;
  type: 'time' | 'character' | 'theme';
  severity: 'high' | 'medium' | 'low';
  score: number;
  detail: string;
}

export interface AdmissionConfig {
  /** 时间重叠阈值：埋设章节差距在此范围内视为时间冲突 */
  timeProximityThreshold: number;
  /** 角色重叠阈值：共享角色比例超过此值视为角色冲突 */
  characterOverlapThreshold: number;
  /** 主题相似度阈值：超过此值视为主题冲突 */
  themeSimilarityThreshold: number;
  /** 是否启用时间检测 */
  enableTimeCheck: boolean;
  /** 是否启用角色检测 */
  enableCharacterCheck: boolean;
  /** 是否启用主题检测 */
  enableThemeCheck: boolean;
}

const DEFAULT_CONFIG: AdmissionConfig = {
  timeProximityThreshold: 5,
  characterOverlapThreshold: 0.5,
  themeSimilarityThreshold: 0.6,
  enableTimeCheck: true,
  enableCharacterCheck: true,
  enableThemeCheck: true,
};

const ACTIVE_STATUSES: Hook['status'][] = ['open', 'progressing', 'deferred'];

// ─── HookAdmission ──────────────────────────────────────────────
/**
 * 伏笔准入控制模块。
 * 评估新伏笔是否与现有伏笔家族冲突，基于：
 *   - 时间 proximity（埋设章节差距）
 *   - 角色重叠（relatedCharacters 交集）
 *   - 主题相似度（type + description 相似度）
 * 高相似度伏笔被拦截，并提示关联的已有伏笔。
 */
export class HookAdmission {
  private config: AdmissionConfig;

  constructor(config?: Partial<AdmissionConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 评估新伏笔的准入资格。
   */
  evaluate(newHook: Hook, existingHooks: Hook[]): AdmissionCheck {
    const activeHooks = existingHooks.filter((h) => ACTIVE_STATUSES.includes(h.status));
    const conflicts: HookConflict[] = [];

    for (const existing of activeHooks) {
      // Time proximity check
      if (this.config.enableTimeCheck) {
        const timeConflict = this.#checkTimeProximity(newHook, existing);
        if (timeConflict) conflicts.push(timeConflict);
      }

      // Character overlap check
      if (this.config.enableCharacterCheck && newHook.relatedCharacters.length > 0) {
        const charConflict = this.#checkCharacterOverlap(newHook, existing);
        if (charConflict) conflicts.push(charConflict);
      }

      // Theme similarity check
      if (this.config.enableThemeCheck) {
        const themeConflict = this.#checkThemeSimilarity(newHook, existing);
        if (themeConflict) conflicts.push(themeConflict);
      }
    }

    // Calculate overall score
    const maxSeverityScore = (s: HookConflict['severity']) => {
      switch (s) {
        case 'high':
          return 100;
        case 'medium':
          return 60;
        case 'low':
          return 30;
      }
    };
    const score =
      conflicts.length > 0
        ? Math.min(100, Math.max(...conflicts.map((c) => maxSeverityScore(c.severity))))
        : 0;

    const admitted = score < 60;
    const recommendation = this.#buildRecommendation(admitted, conflicts, newHook);

    return { admitted, score, conflicts, recommendation };
  }

  // ── Time Proximity ────────────────────────────────────────────

  #checkTimeProximity(newHook: Hook, existing: Hook): HookConflict | null {
    const distance = Math.abs(newHook.plantedChapter - existing.plantedChapter);
    if (distance > this.config.timeProximityThreshold) return null;

    // Closer = higher severity
    const ratio = 1 - distance / this.config.timeProximityThreshold;
    const severity = ratio > 0.7 ? 'high' : ratio > 0.4 ? 'medium' : 'low';
    const score = Math.round(ratio * 100);

    return {
      hookId: existing.id,
      type: 'time',
      severity,
      score,
      detail: `埋设章节接近（新: 第${newHook.plantedChapter}章, 已有: 第${existing.plantedChapter}章, 差距: ${distance}章）`,
    };
  }

  // ── Character Overlap ─────────────────────────────────────────

  #checkCharacterOverlap(newHook: Hook, existing: Hook): HookConflict | null {
    const newChars = new Set(newHook.relatedCharacters);
    const existingChars = new Set(existing.relatedCharacters);
    if (newChars.size === 0 || existingChars.size === 0) return null;

    const overlap = [...newChars].filter((c) => existingChars.has(c));
    const overlapRatio = overlap.length / Math.max(newChars.size, existingChars.size);

    if (overlapRatio < this.config.characterOverlapThreshold) return null;

    const severity = overlapRatio > 0.8 ? 'high' : overlapRatio > 0.5 ? 'medium' : 'low';
    const score = Math.round(overlapRatio * 100);

    return {
      hookId: existing.id,
      type: 'character',
      severity,
      score,
      detail: `角色重叠 ${overlap.length}/${Math.max(newChars.size, existingChars.size)}: ${overlap.join(', ')}`,
    };
  }

  // ── Theme Similarity ──────────────────────────────────────────

  #checkThemeSimilarity(newHook: Hook, existing: Hook): HookConflict | null {
    // Same type = baseline similarity boost
    const typeMatch = newHook.type === existing.type ? 0.2 : 0;

    // Description word-level Jaccard similarity
    const descSim = this.#wordSimilarity(newHook.description, existing.description);
    const totalSim = typeMatch + descSim;

    if (totalSim < this.config.themeSimilarityThreshold) return null;

    const severity = totalSim > 0.8 ? 'high' : totalSim > 0.65 ? 'medium' : 'low';
    const score = Math.round(totalSim * 100);

    return {
      hookId: existing.id,
      type: 'theme',
      severity,
      score,
      detail: `主题相似（类型${newHook.type === existing.type ? '相同' : '不同'}, 描述相似度: ${(descSim * 100).toFixed(0)}%）`,
    };
  }

  // ── Recommendation ────────────────────────────────────────────

  #buildRecommendation(admitted: boolean, conflicts: HookConflict[], newHook: Hook): string {
    if (admitted) return `伏笔「${newHook.id}」可以准入`;

    const highCount = conflicts.filter((c) => c.severity === 'high').length;
    const relatedIds = [...new Set(conflicts.map((c) => c.hookId))];

    if (highCount > 0) {
      return `伏笔「${newHook.id}」与 ${highCount} 个现有伏笔高度冲突（关联: ${relatedIds.join(', ')}），建议合并或延后`;
    }

    return `伏笔「${newHook.id}」与现有伏笔存在中度冲突（关联: ${relatedIds.join(', ')}），建议修改描述或调整埋设时机`;
  }

  // ── Internal ──────────────────────────────────────────────────

  /**
   * 词级 Jaccard 相似度（比字符级更适合语义比较）。
   */
  #wordSimilarity(a: string, b: string): number {
    const tokenize = (s: string) => {
      // 中文按字分割，英文按词分割
      return s
        .toLowerCase()
        .split(/[\s,，。！？；：、]+/)
        .filter(Boolean);
    };

    const wordsA = new Set(tokenize(a));
    const wordsB = new Set(tokenize(b));

    const intersection = new Set([...wordsA].filter((w) => wordsB.has(w)));
    const union = new Set([...wordsA, ...wordsB]);

    return union.size === 0 ? 0 : intersection.size / union.size;
  }
}
