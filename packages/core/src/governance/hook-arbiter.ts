import type { Hook } from '../models/state';

// ─── Types ─────────────────────────────────────────────────────────

export interface Conflict {
  hookA: string;
  hookB: string;
  type: 'time' | 'character' | 'theme';
  severity: 'high' | 'medium' | 'low';
  detail: string;
}

export interface Resolution {
  conflict: Conflict;
  action: 'defer' | 'merge' | 'ignore';
  deferredHookId: string;
  reason: string;
}

export interface ArbiterResult {
  conflicts: Conflict[];
  resolutions: Resolution[];
  deferredHookIds: string[];
  totalResolved: number;
}

export interface ArbiterConfig {
  /** 时间冲突：埋设章节差距在此范围内 */
  timeConflictThreshold: number;
  /** 角色冲突：共享角色比例超过此值 */
  characterConflictThreshold: number;
  /** 主题冲突：描述相似度超过此值 */
  themeConflictThreshold: number;
  /** 仅检查活跃伏笔（默认：open + progressing） */
  activeStatuses: Hook['status'][];
}

const DEFAULT_CONFIG: ArbiterConfig = {
  timeConflictThreshold: 3,
  characterConflictThreshold: 0.5,
  themeConflictThreshold: 0.6,
  activeStatuses: ['open', 'progressing'],
};

const PRIORITY_WEIGHT: Record<string, number> = { critical: 3, major: 2, minor: 1 };

// ─── HookArbiter ──────────────────────────────────────────────
/**
 * 伏笔仲裁层。
 * 检测活跃伏笔之间的冲突（时间/角色/主题），按优先级解决：
 *   - 高优先级保留，低优先级延后（deferred）
 *   - 同优先级时埋设更早的保留
 *   - dormant 伏笔不参与冲突检测
 */
export class HookArbiter {
  private config: ArbiterConfig;

  constructor(config?: Partial<ArbiterConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 检测并解决伏笔冲突。
   */
  arbitrate(hooks: Hook[]): ArbiterResult {
    const activeHooks = hooks.filter((h) => this.config.activeStatuses.includes(h.status));
    const conflicts = this.#detectConflicts(activeHooks);
    const resolutions = this.#resolveConflicts(conflicts, activeHooks);
    const deferredHookIds = [...new Set(resolutions.map((r) => r.deferredHookId))];

    return {
      conflicts,
      resolutions,
      deferredHookIds,
      totalResolved: resolutions.length,
    };
  }

  // ── Conflict Detection ──────────────────────────────────────

  #detectConflicts(hooks: Hook[]): Conflict[] {
    const conflicts: Conflict[] = [];

    for (let i = 0; i < hooks.length; i++) {
      for (let j = i + 1; j < hooks.length; j++) {
        const a = hooks[i];
        const b = hooks[j];

        // Time conflict
        const timeConflict = this.#checkTimeConflict(a, b);
        if (timeConflict) conflicts.push(timeConflict);

        // Character conflict
        const charConflict = this.#checkCharacterConflict(a, b);
        if (charConflict) conflicts.push(charConflict);

        // Theme conflict
        const themeConflict = this.#checkThemeConflict(a, b);
        if (themeConflict) conflicts.push(themeConflict);
      }
    }

    return conflicts;
  }

  #checkTimeConflict(a: Hook, b: Hook): Conflict | null {
    const distance = Math.abs(a.plantedChapter - b.plantedChapter);
    if (distance > this.config.timeConflictThreshold) return null;

    const severity = distance === 0 ? 'high' : distance <= 1 ? 'medium' : 'low';
    return {
      hookA: a.id,
      hookB: b.id,
      type: 'time',
      severity,
      detail: `同一章或相邻章节埋设（差距 ${distance} 章）`,
    };
  }

  #checkCharacterConflict(a: Hook, b: Hook): Conflict | null {
    const charsA = new Set(a.relatedCharacters);
    const charsB = new Set(b.relatedCharacters);
    if (charsA.size === 0 || charsB.size === 0) return null;

    const overlap = [...charsA].filter((c) => charsB.has(c));
    const overlapRatio = overlap.length / Math.min(charsA.size, charsB.size);

    if (overlapRatio < this.config.characterConflictThreshold) return null;

    const severity = overlapRatio >= 1.0 ? 'high' : overlapRatio > 0.7 ? 'medium' : 'low';
    return {
      hookA: a.id,
      hookB: b.id,
      type: 'character',
      severity,
      detail: `共享角色 ${overlap.length}/${Math.min(charsA.size, charsB.size)}: ${overlap.join(', ')}`,
    };
  }

  #checkThemeConflict(a: Hook, b: Hook): Conflict | null {
    const typeMatch = a.type === b.type ? 0.2 : 0;
    const descSim = this.#wordSimilarity(a.description, b.description);
    const totalSim = typeMatch + descSim;

    if (totalSim < this.config.themeConflictThreshold) return null;

    const severity = totalSim > 0.8 ? 'high' : totalSim > 0.65 ? 'medium' : 'low';
    return {
      hookA: a.id,
      hookB: b.id,
      type: 'theme',
      severity,
      detail: `主题相似（类型${a.type === b.type ? '相同' : '不同'}, 描述相似度: ${(descSim * 100).toFixed(0)}%）`,
    };
  }

  // ── Conflict Resolution ─────────────────────────────────────

  #resolveConflicts(conflicts: Conflict[], hooks: Hook[]): Resolution[] {
    const resolutions: Resolution[] = [];

    for (const conflict of conflicts) {
      const hookA = hooks.find((h) => h.id === conflict.hookA)!;
      const hookB = hooks.find((h) => h.id === conflict.hookB)!;

      // Determine which hook to defer
      const deferred = this.#chooseDeferred(hookA, hookB);
      const retained = deferred === hookA ? hookB : hookA;

      resolutions.push({
        conflict,
        action: 'defer',
        deferredHookId: deferred.id,
        reason: `伏笔「${retained.id}」（${retained.priority}）优先级高于「${deferred.id}」（${deferred.priority}），延后低优先级伏笔`,
      });
    }

    return resolutions;
  }

  #chooseDeferred(a: Hook, b: Hook): Hook {
    const weightA = PRIORITY_WEIGHT[a.priority] ?? 0;
    const weightB = PRIORITY_WEIGHT[b.priority] ?? 0;

    // Higher priority wins
    if (weightA !== weightB) {
      return weightA < weightB ? a : b;
    }

    // Same priority: earlier planted wins
    return a.plantedChapter > b.plantedChapter ? a : b;
  }

  // ── Internal ──────────────────────────────────────────────────

  /**
   * 词级 Jaccard 相似度。
   */
  #wordSimilarity(a: string, b: string): number {
    const tokenize = (s: string) =>
      s
        .toLowerCase()
        .split(/[\s,，。！？；：、]+/)
        .filter(Boolean);

    const wordsA = new Set(tokenize(a));
    const wordsB = new Set(tokenize(b));

    const intersection = new Set([...wordsA].filter((w) => wordsB.has(w)));
    const union = new Set([...wordsA, ...wordsB]);

    return union.size === 0 ? 0 : intersection.size / union.size;
  }
}
