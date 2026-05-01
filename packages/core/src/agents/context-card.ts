import { BaseAgent, type AgentContext, type AgentResult } from './base';
import type { Character, Hook, Fact, WorldRule, Manifest } from '../models/state';
import { GENRE_CONTEXT_KEYWORDS as GENRE_GUIDANCE } from './genre-guidance';

/** 上下文卡片最大 Token 预算 */
const MAX_CONTEXT_TOKENS = 4000;

/** 各元素默认最大保留数（在 Token 限制内逐步降级） */
const LIMIT_PRESETS = [
  { hooks: 10, chars: 10, facts: 10 },
  { hooks: 7, chars: 7, facts: 7 },
  { hooks: 5, chars: 5, facts: 5 },
  { hooks: 3, chars: 3, facts: 3 },
];

export interface ContextCardInput {
  bookId: string;
  chapterNumber: number;
  title: string;
  genre: string;
}

export interface ContextCardOutput {
  characters: Character[];
  hooks: Hook[];
  facts: Fact[];
  worldRules: WorldRule[];
  currentFocus?: string;
  previousChapterSummary: string;
  chapterContext: string;
  formattedText: string;
}

/**
 * 数据源接口，由外部注入（通常是 MemoryDB + StateManager 的组合封装）。
 */
export interface ContextDataSources {
  getManifest: () => Promise<Manifest>;
  getPreviousChapterSummary: (chapterNumber: number) => Promise<string>;
  getChapterContext: (chapterNumber: number) => Promise<string>;
}

export class ContextCard extends BaseAgent {
  readonly name = 'ContextCard';
  readonly temperature = 0.2;

  async execute(ctx: AgentContext): Promise<AgentResult> {
    const input = ctx.promptContext?.input as ContextCardInput | undefined;
    if (!input) {
      return { success: false, error: '缺少上下文卡片输入' };
    }

    const validationError = this.#validate(input);
    if (validationError) {
      return { success: false, error: validationError };
    }

    const sources = ctx.promptContext?.sources as ContextDataSources | undefined;
    if (!sources) {
      return { success: false, error: '缺少数据源' };
    }

    try {
      const manifest = await sources.getManifest();

      const [previousSummary, chapterContext] = await Promise.allSettled([
        sources.getPreviousChapterSummary(input.chapterNumber - 1),
        sources.getChapterContext(input.chapterNumber),
      ]);

      const prevText = previousSummary.status === 'fulfilled' ? previousSummary.value : '';
      const ctxText = chapterContext.status === 'fulfilled' ? chapterContext.value : '';

      // Filter hooks to only active ones
      const activeHooks = manifest.hooks.filter(
        (h) => h.status === 'open' || h.status === 'progressing',
      );

      // 按相关性评分并截断，避免上下文过长
      const scoredHooks = this.#scoreHooks(activeHooks, input.chapterNumber);
      const scoredChars = this.#scoreCharacters(manifest.characters, input.chapterNumber);
      const scoredFacts = this.#scoreFacts(manifest.facts, input.chapterNumber);
      const selected = this.#selectByTokenLimit(
        scoredHooks,
        scoredChars,
        scoredFacts,
        manifest.worldRules,
        prevText,
        ctxText,
        input,
        manifest.currentFocus,
      );

      const output: ContextCardOutput = {
        characters: selected.characters,
        hooks: selected.hooks,
        facts: selected.facts,
        worldRules: manifest.worldRules,
        currentFocus: manifest.currentFocus,
        previousChapterSummary: prevText,
        chapterContext: ctxText,
        formattedText: selected.text,
      };

      return { success: true, data: output };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: `上下文卡片构建失败: ${message}` };
    }
  }

  #validate(input: ContextCardInput): string | null {
    if (!input.bookId || input.bookId.trim().length === 0) {
      return '缺少 bookId';
    }
    if (!input.chapterNumber || input.chapterNumber < 1) {
      return '章节号必须大于 0';
    }
    return null;
  }

  // ── Relevance scoring ───────────────────────────────────────

  #scoreHooks(hooks: Hook[], currentChapter: number): Array<{ item: Hook; score: number }> {
    return hooks
      .map((h) => {
        let score = 100;
        const distance = Math.abs(currentChapter - h.plantedChapter);
        score -= distance * 5;
        if (h.priority === 'critical') score += 30;
        else if (h.priority === 'major') score += 15;
        else if (h.priority === 'minor') score += 5;
        return { item: h, score };
      })
      .sort((a, b) => b.score - a.score);
  }

  #scoreCharacters(
    characters: Character[],
    _currentChapter: number,
  ): Array<{ item: Character; score: number }> {
    return characters
      .map((c) => {
        let score = 50;
        if (c.role === 'protagonist') score += 40;
        else if (c.role === 'antagonist') score += 20;
        else if (c.role === 'supporting') score += 10;
        return { item: c, score };
      })
      .sort((a, b) => b.score - a.score);
  }

  #scoreFacts(facts: Fact[], currentChapter: number): Array<{ item: Fact; score: number }> {
    return facts
      .map((f) => {
        let score = 50;
        const chapterNum = typeof f.chapterNumber === 'number' ? f.chapterNumber : 0;
        const distance = Math.abs(currentChapter - chapterNum);
        score -= distance * 3;
        if (f.confidence === 'high') score += 15;
        return { item: f, score };
      })
      .sort((a, b) => b.score - a.score);
  }

  #estimateTokens(text: string): number {
    const chineseChars = (text.match(/[一-龥]/g) || []).length;
    const nonChineseChars = text.length - chineseChars;
    const englishWords = Math.ceil(nonChineseChars / 4);
    return chineseChars + englishWords;
  }

  /**
   * 按 Token 限制选取元素并构建格式化文本。
   * 依次尝试递减的数量限制，直到总 Token 数在预算内。
   */
  #selectByTokenLimit(
    scoredHooks: Array<{ item: Hook; score: number }>,
    scoredChars: Array<{ item: Character; score: number }>,
    scoredFacts: Array<{ item: Fact; score: number }>,
    worldRules: WorldRule[],
    prevSummary: string,
    chapterCtx: string,
    input: ContextCardInput,
    currentFocus?: string,
  ): { characters: Character[]; hooks: Hook[]; facts: Fact[]; text: string } {
    for (const limit of LIMIT_PRESETS) {
      const hooks = scoredHooks.slice(0, limit.hooks).map((s) => s.item);
      const characters = scoredChars.slice(0, limit.chars).map((s) => s.item);
      const facts = scoredFacts.slice(0, limit.facts).map((s) => s.item);
      const text = this.#buildFormattedText(
        input,
        characters,
        hooks,
        facts,
        worldRules,
        prevSummary,
        chapterCtx,
        currentFocus,
      );
      if (this.#estimateTokens(text) <= MAX_CONTEXT_TOKENS) {
        return { characters, hooks, facts, text };
      }
    }

    // 兜底：最精简版本
    const hooks = scoredHooks.slice(0, 2).map((s) => s.item);
    const characters = scoredChars.slice(0, 2).map((s) => s.item);
    const facts = scoredFacts.slice(0, 2).map((s) => s.item);
    return {
      characters,
      hooks,
      facts,
      text: this.#buildFormattedText(
        input,
        characters,
        hooks,
        facts,
        worldRules,
        prevSummary,
        chapterCtx,
        currentFocus,
      ),
    };
  }

  #buildFormattedText(
    input: ContextCardInput,
    characters: Character[],
    activeHooks: Hook[],
    facts: Fact[],
    worldRules: WorldRule[],
    prevSummary: string,
    chapterCtx: string,
    currentFocus?: string,
  ): string {
    const genreHint = GENRE_GUIDANCE[input.genre] ?? '';
    const lines: string[] = [];

    lines.push(`# 上下文卡片 — 第 ${input.chapterNumber} 章`);
    lines.push(`**题材**: ${input.genre}${genreHint ? `（${genreHint}）` : ''}`);
    lines.push('');

    if (currentFocus) {
      lines.push('## 当前焦点');
      lines.push(currentFocus);
      lines.push('');
    }

    if (characters.length > 0) {
      lines.push('## 角色');
      for (const char of characters) {
        const traits = Array.isArray(char.traits)
          ? char.traits.join('、')
          : typeof char.traits === 'string'
            ? char.traits
            : '';
        lines.push(`- **${char.name}** (${char.role})${traits ? ` — ${traits}` : ''}`);
      }
      lines.push('');
    }

    if (activeHooks.length > 0) {
      lines.push('## 进行中伏笔');
      for (const hook of activeHooks) {
        lines.push(`- [${hook.priority}] ${hook.description}（第 ${hook.plantedChapter} 章埋设）`);
      }
      lines.push('');
    }

    if (worldRules.length > 0) {
      lines.push('## 世界规则');
      for (const rule of worldRules) {
        lines.push(`- [${rule.category}] ${rule.rule}`);
      }
      lines.push('');
    }

    if (prevSummary) {
      lines.push('## 上一章摘要');
      lines.push(prevSummary);
      lines.push('');
    }

    if (chapterCtx) {
      lines.push('## 章节上下文');
      lines.push(chapterCtx);
      lines.push('');
    }

    return lines.join('\n');
  }
}

import { agentRegistry } from './registry';
agentRegistry.register('context-card', (p) => new ContextCard(p));
