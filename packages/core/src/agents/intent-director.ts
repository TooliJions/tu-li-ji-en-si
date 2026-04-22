import { BaseAgent, type AgentContext, type AgentResult } from './base';
import { generateJSONWithValidation, type LLMOutputRule } from '../llm/output-validator';
import { GENRE_GUIDANCE } from './genre-guidance';

export interface IntentInput {
  userIntent: string;
  chapterNumber: number;
  genre: string;
  previousChapterSummary?: string;
  outlineContext?: string;
  characterProfiles?: Array<{ name: string; role: string; traits: string[] }>;
}

export interface IntentOutput {
  narrativeGoal: string;
  emotionalTone: string;
  keyBeats: string[];
  focusCharacters: string[];
  styleNotes: string;
  chapterNumber: number;
  genre: string;
  agentName: string;
}

export class IntentDirector extends BaseAgent {
  readonly name = 'IntentDirector';
  readonly temperature = 0.7;

  async execute(ctx: AgentContext): Promise<AgentResult> {
    const input = ctx.promptContext?.input as IntentInput | undefined;
    if (!input) {
      return { success: false, error: '缺少意图指导输入' };
    }

    const validationError = this.#validate(input);
    if (validationError) {
      return { success: false, error: validationError };
    }

    const prompt = this.#buildPrompt(input);

    try {
      const INTENT_RULES: LLMOutputRule[] = [
        { field: 'narrativeGoal', type: 'min_string_length', min: 5 },
        { field: 'keyBeats', type: 'min_array_length', min: 2 },
        { field: 'focusCharacters', type: 'non_empty_array' },
      ];
      const result = await generateJSONWithValidation<IntentOutput>(
        this.provider,
        prompt,
        INTENT_RULES,
        {
          temperature: this.temperature,
          agentName: this.name,
          retry: { maxRetries: 2, retryDelayMs: 500 },
        }
      );

      return {
        success: true,
        data: {
          ...result,
          chapterNumber: input.chapterNumber,
          genre: input.genre,
          agentName: this.name,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: `意图指导失败: ${message}` };
    }
  }

  #validate(input: IntentInput): string | null {
    if (!input.userIntent || input.userIntent.trim().length === 0) {
      return '用户意图不能为空';
    }
    if (!input.genre || input.genre.trim().length === 0) {
      return '题材不能为空';
    }
    return null;
  }

  #buildPrompt(input: IntentInput): string {
    const genreHint = GENRE_GUIDANCE[input.genre] ?? '';
    const lines: string[] = [];

    lines.push(`你是一位专业的小说创作指导师。请将用户的创作意图转化为结构化的章节叙事指令，供后续写作 Agent 使用。

## 基本信息

- **章节**: 第 ${input.chapterNumber} 章
- **题材**: ${input.genre}${genreHint ? `（${genreHint}）` : ''}`);

    if (input.previousChapterSummary) {
      lines.push(`
## 上一章摘要

${input.previousChapterSummary}`);
    }

    if (input.outlineContext) {
      lines.push(`
## 大纲上下文

${input.outlineContext}`);
    }

    if (input.characterProfiles && input.characterProfiles.length > 0) {
      lines.push(`
## 角色档案

${input.characterProfiles.map((c) => `- ${c.name}（${c.role}）：${c.traits.join('、')}`).join('\n')}`);
    }

    lines.push(`
## 用户创作意图

${input.userIntent}

## 输出要求

请将上述意图转化为以下结构化叙事指令（以 JSON 格式输出）：

{
  "narrativeGoal": "本章的叙事目标（1-2句话，描述本章要达成什么叙事目的）",
  "emotionalTone": "本章的情感基调（如"紧张→释然→期待"）",
  "keyBeats": ["关键节拍1", "关键节拍2", "关键节拍3"],
  "focusCharacters": ["重点关注角色1", "重点关注角色2"],
  "styleNotes": "风格建议（如何描写、对话风格、节奏控制等）"
}

keyBeats 应该包含 3-5 个关键情感/叙事节拍点。focusCharacters 必须从上方"角色档案"中选择，禁止创建角色档案中不存在的角色。选择 1-3 个核心角色。`);

    return lines.join('\n');
  }
}
