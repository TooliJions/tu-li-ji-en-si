import type { ChapterPlan } from '../agents/chapter-planner';

// ─── Types ───────────────────────────────────────────────────────

export interface CoverageThresholds {
  /** 角色名覆盖率下限（0~1） */
  characterCoverageMin: number;
  /** 关键事件覆盖率下限（0~1） */
  keyEventCoverageMin: number;
  /** 世界观关键词匹配率下限（0~1） */
  worldRuleKeywordMatchMin: number;
  /** 伏笔覆盖数量下限 */
  hookCoverageMin: number;
  /** 场景分解覆盖数量下限 */
  sceneBreakdownCoverageMin: number;
  /** 情感节拍覆盖数量下限 */
  emotionalBeatCoverageMin: number;
  /** 字数与目标比率下限 */
  wordCountRatioMin: number;
  /** 字数与目标比率上限 */
  wordCountRatioMax: number;
}

export const DEFAULT_COVERAGE_THRESHOLDS: CoverageThresholds = {
  characterCoverageMin: 0.6,
  keyEventCoverageMin: 0.6,
  worldRuleKeywordMatchMin: 0.2,
  hookCoverageMin: 1,
  sceneBreakdownCoverageMin: 1,
  emotionalBeatCoverageMin: 1,
  wordCountRatioMin: 0.5,
  wordCountRatioMax: 1.5,
};

export interface CoverageDimension {
  name: string;
  total: number;
  covered: number;
  missed: string[];
  pass: boolean;
}

export interface CoverageReport {
  pass: boolean;
  dimensions: CoverageDimension[];
  wordCount: number;
  wordCountTarget: number;
  wordCountRatio: number;
  summary: string;
}

// ─── Helpers ─────────────────────────────────────────────────────

/** 中文友好的字数统计 */
function countChineseWords(text: string): number {
  const cjk = text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g)?.length ?? 0;
  const words = text.match(/[a-zA-Z0-9]+/g)?.length ?? 0;
  return cjk + words;
}

const MAX_FRAGMENT_TEXT_LENGTH = 5000;

/** 从文本中提取关键片段（支持 2~4 字中文子串 + 整句 + 逗号分句） */
function extractKeyFragments(text: string): string[] {
  const fragments: string[] = [];
  fragments.push(text);
  const parts = text.split(/[，。、]/);
  for (const part of parts) {
    if (part.length >= 2) fragments.push(part.trim());
  }
  // 长文本跳过 O(n²) 子串提取，避免性能问题
  if (text.length <= MAX_FRAGMENT_TEXT_LENGTH) {
    for (let len = 2; len <= 4; len++) {
      for (let i = 0; i <= text.length - len; i++) {
        const sub = text.substring(i, i + len);
        if (/[\u4e00-\u9fff]{2,}/.test(sub)) {
          fragments.push(sub);
        }
      }
    }
  }
  return [...new Set(fragments)];
}

/** 检查文本中是否包含任一关键片段 */
function containsAnyFragment(content: string, fragments: string[]): boolean {
  return fragments.some((f) => content.includes(f));
}

function parseEmotionalBeatTerms(beat: string): string[] {
  return beat
    .split(/(?:→|->|=>|、|，|,|\|\/)/)
    .map((term) => term.trim())
    .filter(Boolean);
}

// ─── Core Checker ────────────────────────────────────────────────

export class CoverageChecker {
  constructor(private thresholds: CoverageThresholds = DEFAULT_COVERAGE_THRESHOLDS) {}

  check(content: string, plan: ChapterPlan): CoverageReport {
    const dimensions: CoverageDimension[] = [];

    // 1. 角色覆盖
    dimensions.push(this.#checkCharacters(content, plan));

    // 2. 关键事件覆盖
    dimensions.push(this.#checkKeyEvents(content, plan));

    // 3. 世界观规则覆盖
    dimensions.push(this.#checkWorldRules(content, plan));

    // 4. 伏笔覆盖
    dimensions.push(this.#checkHooks(content, plan));

    // 5. 场景分解覆盖
    dimensions.push(this.#checkSceneBreakdown(content, plan));

    // 6. 情感节拍覆盖
    dimensions.push(this.#checkEmotionalBeat(content, plan));

    // 字数统计
    const wordCount = countChineseWords(content);
    const wordCountTarget = plan.wordCountTarget ?? 3000;
    const wordCountRatio = wordCountTarget > 0 ? wordCount / wordCountTarget : 0;

    const pass = dimensions.every((d) => d.pass);
    const summary = this.#buildSummary(dimensions, wordCount, wordCountTarget, wordCountRatio);

    return {
      pass,
      dimensions,
      wordCount,
      wordCountTarget,
      wordCountRatio,
      summary,
    };
  }

  // ─── 各维度检测 ────────────────────────────────────────────────

  #checkCharacters(content: string, plan: ChapterPlan): CoverageDimension {
    const characters = Array.isArray(plan.characters) ? plan.characters : [];
    const covered: string[] = [];
    const missed: string[] = [];

    for (const name of characters) {
      if (content.includes(name)) {
        covered.push(name);
      } else {
        missed.push(name);
      }
    }

    const total = characters.length;
    const pass = total === 0 || covered.length / total >= this.thresholds.characterCoverageMin;

    return {
      name: '角色覆盖',
      total,
      covered: covered.length,
      missed,
      pass,
    };
  }

  #checkKeyEvents(content: string, plan: ChapterPlan): CoverageDimension {
    const keyEvents = Array.isArray(plan.keyEvents) ? plan.keyEvents : [];
    const covered: string[] = [];
    const missed: string[] = [];

    for (const event of keyEvents) {
      const fragments = extractKeyFragments(event);
      if (containsAnyFragment(content, fragments)) {
        covered.push(event);
      } else {
        missed.push(event);
      }
    }

    const total = keyEvents.length;
    const pass = total === 0 || covered.length / total >= this.thresholds.keyEventCoverageMin;

    return {
      name: '关键事件覆盖',
      total,
      covered: covered.length,
      missed,
      pass,
    };
  }

  #checkWorldRules(content: string, plan: ChapterPlan): CoverageDimension {
    const worldRules = Array.isArray(plan.worldRules) ? plan.worldRules : [];
    const allFragments: string[] = [];

    for (const rule of worldRules) {
      for (let len = 2; len <= 4; len++) {
        for (let i = 0; i <= rule.length - len; i++) {
          const sub = rule.substring(i, i + len);
          if (/[\u4e00-\u9fff]{2,}/.test(sub)) allFragments.push(sub);
        }
      }
    }

    const uniqueFragments = [...new Set(allFragments)];
    const matched = uniqueFragments.filter((f) => content.includes(f));

    const total = uniqueFragments.length;
    const pass = total === 0 || matched.length / total >= this.thresholds.worldRuleKeywordMatchMin;

    return {
      name: '世界观覆盖',
      total,
      covered: matched.length,
      missed: total > 0 && !pass ? ['世界观关键词匹配率不足'] : [],
      pass,
    };
  }

  #checkHooks(content: string, plan: ChapterPlan): CoverageDimension {
    const hooks = Array.isArray(plan.hooks) ? plan.hooks : [];
    const covered: string[] = [];
    const missed: string[] = [];

    for (const hook of hooks) {
      const desc = hook.description ?? '';
      const fragments = extractKeyFragments(desc);
      if (containsAnyFragment(content, fragments)) {
        covered.push(desc);
      } else {
        missed.push(desc);
      }
    }

    const total = hooks.length;
    const pass = total === 0 || covered.length >= this.thresholds.hookCoverageMin;

    return {
      name: '伏笔覆盖',
      total,
      covered: covered.length,
      missed,
      pass,
    };
  }

  #checkSceneBreakdown(content: string, plan: ChapterPlan): CoverageDimension {
    const scenes = Array.isArray(plan.sceneBreakdown) ? plan.sceneBreakdown : [];
    const covered: string[] = [];
    const missed: string[] = [];

    for (const scene of scenes) {
      const title = scene.title ?? '';
      const desc = scene.description ?? '';
      const titleFragments = extractKeyFragments(title);
      const descFragments = extractKeyFragments(desc);
      if (
        containsAnyFragment(content, titleFragments) ||
        containsAnyFragment(content, descFragments)
      ) {
        covered.push(title);
      } else {
        missed.push(title);
      }
    }

    const total = scenes.length;
    const pass = total === 0 || covered.length >= this.thresholds.sceneBreakdownCoverageMin;

    return {
      name: '场景分解覆盖',
      total,
      covered: covered.length,
      missed,
      pass,
    };
  }

  #checkEmotionalBeat(content: string, plan: ChapterPlan): CoverageDimension {
    const beat = plan.emotionalBeat ?? '';
    const emotions = parseEmotionalBeatTerms(beat);

    const covered: string[] = [];
    const missed: string[] = [];

    for (const emotion of emotions) {
      if (content.includes(emotion)) {
        covered.push(emotion);
      } else {
        missed.push(emotion);
      }
    }

    const total = emotions.length;
    const pass = total === 0 || covered.length >= this.thresholds.emotionalBeatCoverageMin;

    return {
      name: '情感节拍覆盖',
      total,
      covered: covered.length,
      missed,
      pass,
    };
  }

  #buildSummary(
    dimensions: CoverageDimension[],
    wordCount: number,
    wordCountTarget: number,
    wordCountRatio: number,
  ): string {
    const failed = dimensions.filter((d) => !d.pass);
    const parts: string[] = [];

    parts.push(`字数: ${wordCount}/${wordCountTarget} (${(wordCountRatio * 100).toFixed(0)}%)`);

    for (const d of dimensions) {
      const status = d.pass ? '✓' : '✗';
      parts.push(`${status} ${d.name}: ${d.covered}/${d.total}`);
      if (!d.pass && d.missed.length > 0) {
        parts.push(`  缺失: ${d.missed.join('、')}`);
      }
    }

    if (failed.length > 0) {
      parts.push(`\n未通过: ${failed.map((d) => d.name).join('、')}`);
    }

    return parts.join('\n');
  }
}
