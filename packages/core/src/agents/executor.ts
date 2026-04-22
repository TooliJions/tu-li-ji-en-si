import { BaseAgent, type AgentContext, type AgentResult } from './base';
import type { ChapterPlan } from './chapter-planner';
import { GENRE_WRITER_STYLE_MAP } from './genre-guidance';
import { countChineseWords } from '../utils';

export interface ChapterExecutionInput {
  title: string;
  genre: string;
  brief: string;
  chapterNumber: number;
  plan: ChapterPlan;
  /** 用户创作意图，供 fallback prompt 使用 */
  userIntent?: string;
}

export interface ChapterExecutionResult {
  chapterNumber: number;
  title: string;
  content: string;
  wordCount: number;
}

/**
 * 回调接口，供外部注入 ContextCard 和 ScenePolisher 等 Agent 能力。
 * 当依赖未注入时，回退到直接调用 LLM 生成正文。
 */
export interface AgentDependencies {
  buildContext: (input: ChapterExecutionInput) => Promise<string>;
  generateScene: (plan: ChapterPlan, context: string) => Promise<string>;
}

export class ChapterExecutor extends BaseAgent {
  readonly name = 'ChapterExecutor';
  readonly temperature = 0.8;

  async execute(ctx: AgentContext): Promise<AgentResult> {
    const input = ctx.promptContext?.input as ChapterExecutionInput | undefined;
    if (!input) {
      return { success: false, error: '缺少执行输入' };
    }

    const validationError = this.#validate(input);
    if (validationError) {
      return { success: false, error: validationError };
    }

    const deps = ctx.promptContext?.dependencies as AgentDependencies | undefined;

    try {
      let content: string;
      if (deps) {
        const context = await deps.buildContext(input);
        content = await deps.generateScene(input.plan, context);
      } else {
        content = await this.#generateFallback(input);
      }

      return {
        success: true,
        data: {
          chapterNumber: input.chapterNumber,
          title: input.plan.title || `第 ${input.chapterNumber} 章`,
          content,
          wordCount: countChineseWords(content),
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: `章节执行失败: ${message}` };
    }
  }

  #validate(input: ChapterExecutionInput): string | null {
    if (!input.chapterNumber || input.chapterNumber < 1) {
      return '章节号必须大于 0';
    }
    if (!input.title || input.title.trim().length === 0) {
      return '书名不能为空';
    }
    if (!input.brief || input.brief.trim().length === 0) {
      return '作品简介不能为空';
    }
    if (!input.plan) {
      return '缺少章节计划';
    }
    return null;
  }

  async #generateFallback(input: ChapterExecutionInput): Promise<string> {
    const genreHint = GENRE_WRITER_STYLE_MAP[input.genre] ?? '';
    const plan = input.plan;

    const prompt = `你是网络小说作家。请根据以下章节计划，撰写正文。

## 基本信息

- **书名**: ${input.title}
- **题材**: ${input.genre}${genreHint ? `（${genreHint}）` : ''}
- **简介**: ${input.brief}
- **章节**: 第 ${input.chapterNumber} 章 — ${plan.title || '未知'}

## 章节计划

- **本章意图**: ${plan.intention}
- **目标字数**: ${plan.wordCountTarget} 字
- **出场角色**: ${plan.characters.length > 0 ? plan.characters.join('、') : '无'}
- **关键事件**:
${plan.keyEvents.map((e) => `  - ${e}`).join('\n') || '  无'}
${
  plan.hooks.length > 0
    ? `
- **伏笔**:
${plan.hooks.map((h) => `  - [${h.priority}] ${h.description}`).join('\n')}`
    : ''
}
${
  plan.worldRules.length > 0
    ? `
- **世界观设定**:
${plan.worldRules.map((r) => `  - ${r}`).join('\n')}`
    : ''
}

- **情感节拍**: ${plan.emotionalBeat}
- **场景过渡**: ${plan.sceneTransition}
${plan.openingHook ? `- **开篇钩子**: ${plan.openingHook}` : ''}
${plan.closingHook ? `- **结尾悬念**: ${plan.closingHook}` : ''}
${plan.characterGrowthBeat ? `- **主角成长点**: ${plan.characterGrowthBeat}` : ''}
${plan.pacingTag ? `- **叙事节奏**: ${plan.pacingTag}` : ''}
${input.userIntent ? `\n## 用户创作意图\n${input.userIntent}` : ''}

## 写作要求

1. 保持情节连贯性
2. 角色对话自然生动
3. 场景描写具体有画面感
4. 注意段落节奏，张弛有度
5. 保持题材风格的统一性
6. 遵守世界观设定中的每一条规则

请直接输出章节正文内容，不需要标题外的任何格式标记。内容应自然流畅，角色对话生动，描写具体，避免空洞叙述。`;

    const response = await this.generate(prompt);
    return response;
  }
}
