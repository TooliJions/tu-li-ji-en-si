import { BaseAgent, type AgentContext, type AgentResult } from './base';
import type { Character, Hook, Fact, WorldRule } from '../models/state';

export interface ScenePolishInput {
  draftContent: string;
  chapterNumber: number;
  title?: string;
  genre: string;
  contextCard?: {
    characters: Character[];
    hooks: Hook[];
    facts: Fact[];
    worldRules: WorldRule[];
    previousChapterSummary: string;
    formattedText: string;
  };
}

export interface ScenePolishOutput {
  polishedContent: string;
  wordCount: number;
  originalWordCount: number;
}

const GENRE_GUIDANCE: Record<string, string> = {
  xianxia: '仙侠文风：修炼描写要具体，斗法场景要有气势，日常段落注重师徒/同门情谊，用词古朴雅致',
  fantasy: '玄幻文风：注重能力觉醒的震撼感、种族间的文化差异、史诗感的营造',
  urban: '都市文风：贴近现实，对话自然流畅，注重职场细节和人际关系的微妙变化',
  'sci-fi': '科幻文风：科技描写严谨，注重未来感和未知感，术语使用准确',
  history: '历史文风：符合时代语言风格，注重历史场景还原和权谋斗争的智性美',
  game: '游戏文风：注重游戏机制的趣味性、升级爽感和竞技对抗的紧张感',
  horror: '悬疑文风：注重氛围营造、细节暗示、节奏控制，让读者有身临其境的紧张感',
  romance: '言情文风：注重心理描写、情感细节、对话的暗示和留白，情感推进自然',
  fanfic: '同人文风：保持原作语言风格和角色说话方式一致性，注重粉丝共鸣点',
};

export class ScenePolisher extends BaseAgent {
  readonly name = 'ScenePolisher';
  readonly temperature = 0.5;

  async execute(ctx: AgentContext): Promise<AgentResult> {
    const input = ctx.promptContext?.input as ScenePolishInput | undefined;
    if (!input) {
      return { success: false, error: '缺少润色输入' };
    }

    const validationError = this.#validate(input);
    if (validationError) {
      return { success: false, error: validationError };
    }

    const prompt = this.#buildPrompt(input);

    try {
      const polished = await this.generate(prompt);

      return {
        success: true,
        data: {
          polishedContent: polished,
          wordCount: polished.length,
          originalWordCount: input.draftContent.length,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: `场景润色失败: ${message}` };
    }
  }

  #validate(input: ScenePolishInput): string | null {
    if (!input.draftContent || input.draftContent.trim().length === 0) {
      return '草稿内容不能为空';
    }
    if (!input.genre || input.genre.trim().length === 0) {
      return '题材不能为空';
    }
    return null;
  }

  #buildPrompt(input: ScenePolishInput): string {
    const genreHint = GENRE_GUIDANCE[input.genre] ?? '';
    const lines: string[] = [];

    lines.push(`你是一位专业的网络小说文字润色师。请对以下章节初稿进行文字润色，提升语言质量和阅读体验。

## 基本信息

- **章节**: 第 ${input.chapterNumber} 章${input.title ? ` — ${input.title}` : ''}
- **题材**: ${input.genre}${genreHint ? `（${genreHint}）` : ''}`);

    // Context card data
    if (input.contextCard) {
      const card = input.contextCard;

      if (card.previousChapterSummary) {
        lines.push(`
## 上一章摘要

${card.previousChapterSummary}`);
      }

      if (card.characters.length > 0) {
        lines.push(`
## 本章角色

${card.characters.map((c) => `- ${c.name}（${c.role}）：${c.traits.join('、')}`).join('\n')}`);
      }

      if (card.hooks.length > 0) {
        lines.push(`
## 进行中伏笔

${card.hooks.map((h) => `- [${h.priority}] ${h.description}`).join('\n')}`);
      }

      if (card.worldRules.length > 0) {
        lines.push(`
## 世界观设定

${card.worldRules.map((r) => `- [${r.category}] ${r.rule}`).join('\n')}`);
      }
    }

    lines.push(`
## 初稿内容

${input.draftContent}

## 润色要求

1. 保持原有情节和结构不变
2. 提升语言的流畅性和画面感
3. 角色对话要自然生动，符合角色身份性格
4. 场景描写要具体有画面感
5. 删除冗余和重复表达
6. 注意段落节奏，张弛有度
7. 保持题材风格的统一性

请直接输出润色后的正文内容，不需要额外说明。`);

    return lines.join('\n');
  }
}
