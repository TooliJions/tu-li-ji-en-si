import { BaseAgent, type AgentContext, type AgentResult } from './base';
import type { Character, Hook, Fact, WorldRule } from '../models/state';
import { GENRE_STYLE_GUIDANCE as GENRE_GUIDANCE } from './genre-guidance';
import { countChineseWords } from '../utils';

export interface ScenePolishInput {
  draftContent: string;
  chapterNumber: number;
  title?: string;
  genre: string;
  intentGuidance?: string;
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
          wordCount: countChineseWords(polished),
          originalWordCount: countChineseWords(input.draftContent),
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

${card.characters.map((c) => `- ${c.name}（${c.role}）：${Array.isArray(c.traits) ? c.traits.join('、') : c.traits}`).join('\n')}`);
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

    if (input.intentGuidance) {
      lines.push(`
## 润色方向指引

${input.intentGuidance}`);
    }

    lines.push(`
## 初稿内容

${input.draftContent}

## 润色要求

1. 保持原有情节和结构不变
2. **字数保留**：润色后字数不得少于初稿字数的 90%。可以优化表达，但不可删除场景、对话或心理描写来缩减篇幅
3. 提升语言的流畅性和画面感
4. 角色对话要自然生动，符合角色身份性格
5. 场景描写要具体有画面感
6. 删除冗余和重复表达（但保留有叙事价值的细节）
7. 注意段落节奏，张弛有度
8. 保持题材风格的统一性
9. 确保世界观设定在润色后仍被严格遵守

请直接输出润色后的正文内容，不需要额外说明。`);

    return lines.join('\n');
  }
}
