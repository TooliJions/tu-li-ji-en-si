import { BaseAgent, type AgentContext, type AgentResult } from './base';
import type { Character, Hook, Fact, WorldRule, Manifest } from '../models/state';

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

const GENRE_GUIDANCE: Record<string, string> = {
  xianxia: '仙侠：修炼体系、宗门势力、法宝灵药、师徒传承',
  fantasy: '玄幻：种族设定、魔法体系、血脉传承、世界地图',
  urban: '都市：职场身份、社会关系、现实场景、现代科技',
  'sci-fi': '科幻：科技设定、未来社会、太空探索、AI伦理',
  history: '历史：历史背景、人物考据、时代风貌、政治格局',
  game: '游戏：游戏机制、等级体系、副本挑战、竞技对战',
  horror: '悬疑：线索伏笔、人物关系网、时间线、动机分析',
  romance: '言情：情感发展线、角色心理、关系进展、冲突节点',
  fanfic: '同人：原作正典设定、角色性格一致性、时间线对齐',
};

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
        const traits = char.traits.join('、');
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
