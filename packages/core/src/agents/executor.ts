import { BaseAgent, type AgentContext, type AgentResult } from './base';
import type { ChapterPlan } from './chapter-planner';

export interface ChapterExecutionInput {
  title: string;
  genre: string;
  brief: string;
  chapterNumber: number;
  plan: ChapterPlan;
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

const GENRE_GUIDANCE: Record<string, string> = {
  xianxia: '仙侠文风：修炼描写要具体，斗法场景要有气势，日常段落注重师徒/同门情谊',
  fantasy: '玄幻文风：注重世界观展现、能力觉醒的震撼感、种族间的文化差异',
  urban: '都市文风：贴近现实，对话自然流畅，注重职场细节和人际关系的微妙变化',
  'sci-fi': '科幻文风：科技描写要严谨，注重未来感和未知感',
  history: '历史文风：符合时代语言风格，注重历史场景还原和权谋斗争的智性美',
  game: '游戏文风：注重游戏机制的趣味性、升级爽感和竞技对抗的紧张感',
  horror: '悬疑文风：注重氛围营造、细节暗示、节奏控制，让读者有身临其境的紧张感',
  romance: '言情文风：注重心理描写、情感细节、对话的暗示和留白',
  fanfic: '同人文风：保持原作语言风格和角色说话方式，注重粉丝共鸣点',
};

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
          wordCount: content.length,
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
    const genreHint = GENRE_GUIDANCE[input.genre] ?? '';
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

## 写作要求

请直接输出章节正文内容，不需要标题外的任何格式标记。内容应自然流畅，角色对话生动，描写具体，避免空洞叙述。`;

    const response = await this.generate(prompt);
    return response;
  }
}
