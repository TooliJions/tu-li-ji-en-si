import { BaseAgent, type AgentContext, type AgentResult } from './base';
import type { Character, Hook, Fact, WorldRule, Manifest } from '../models/state';
import { GENRE_CONTEXT_KEYWORDS as GENRE_GUIDANCE } from './genre-guidance';

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
        (h) => h.status === 'open' || h.status === 'progressing'
      );

      const output: ContextCardOutput = {
        characters: manifest.characters,
        hooks: activeHooks,
        facts: manifest.facts,
        worldRules: manifest.worldRules,
        currentFocus: manifest.currentFocus,
        previousChapterSummary: prevText,
        chapterContext: ctxText,
        formattedText: this.#formatContext(input, manifest, activeHooks, prevText, ctxText),
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

  #formatContext(
    input: ContextCardInput,
    manifest: Manifest,
    activeHooks: Hook[],
    prevSummary: string,
    chapterCtx: string
  ): string {
    const genreHint = GENRE_GUIDANCE[input.genre] ?? '';
    const lines: string[] = [];

    lines.push(`# 上下文卡片 — 第 ${input.chapterNumber} 章`);
    lines.push(`**题材**: ${input.genre}${genreHint ? `（${genreHint}）` : ''}`);
    lines.push('');

    if (manifest.currentFocus) {
      lines.push('## 当前焦点');
      lines.push(manifest.currentFocus);
      lines.push('');
    }

    if (manifest.characters.length > 0) {
      lines.push('## 角色');
      for (const char of manifest.characters) {
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

    if (manifest.worldRules.length > 0) {
      lines.push('## 世界规则');
      for (const rule of manifest.worldRules) {
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
