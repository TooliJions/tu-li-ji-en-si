import { BaseAgent, type AgentContext, type AgentResult } from './base';
import type { HookAgenda } from '../governance/hook-agenda';
import type { Hook } from '../models/state';
import type { LLMProvider } from '../llm/provider';

export interface ChapterPlanBrief {
  title: string;
  genre: string;
  brief: string;
  chapterNumber: number;
  wordCountTarget?: number;
}

export interface HookPlan {
  description: string;
  type: string;
  priority: string;
}

export interface WakeAgendaInfo {
  woken: Array<{ hookId: string; priority: string }>;
  deferred: Array<{ hookId: string; wakeAtChapter: number }>;
  totalCandidates: number;
}

export interface HookAgendaData {
  wakeResult?: WakeAgendaInfo;
  schedule?: Array<{ hookId: string; priority: string; plantedChapter: number }>;
}

export interface ChapterPlan {
  chapterNumber: number;
  title: string;
  intention: string;
  wordCountTarget: number;
  characters: string[];
  keyEvents: string[];
  hooks: HookPlan[];
  hookAgenda?: HookAgendaData;
  worldRules: string[];
  emotionalBeat: string;
  sceneTransition: string;
}

export interface ChapterPlanResult {
  plan: ChapterPlan;
}

const GENRE_GUIDANCE: Record<string, string> = {
  xianxia: '仙侠题材：注重修炼突破、宗门斗争、法宝机缘的节奏安排',
  fantasy: '玄幻题材：注重能力觉醒、种族冲突、地图探索的层次感',
  urban: '都市题材：注重职场冲突、人际关系、现实困境的交织',
  'sci-fi': '科幻题材：注重科技设定展示、未来社会规则、未知探索',
  history: '历史题材：注重历史事件融入、权谋斗争、时代氛围',
  game: '游戏题材：注重副本挑战、等级突破、竞技对战',
  horror: '悬疑题材：注重线索铺设、悬念制造、反转伏笔',
  romance: '言情题材：注重情感推进、误会与和解、关系发展',
  fanfic: '同人体裁：注重原作角色互动、正典事件呼应',
};

export class ChapterPlanner extends BaseAgent {
  readonly name = 'ChapterPlanner';
  readonly temperature = 0.6;
  private hookAgenda?: HookAgenda;

  constructor(provider: LLMProvider, hookAgenda?: HookAgenda) {
    super(provider);
    this.hookAgenda = hookAgenda;
  }

  async execute(ctx: AgentContext): Promise<AgentResult> {
    const brief = ctx.promptContext?.brief as ChapterPlanBrief | undefined;
    if (!brief) {
      return { success: false, error: '缺少创作简报' };
    }

    if (!brief.chapterNumber || brief.chapterNumber < 1) {
      return { success: false, error: '章节号必须大于 0' };
    }
    if (!brief.title || brief.title.trim().length === 0) {
      return { success: false, error: '书名不能为空' };
    }
    if (!brief.brief || brief.brief.trim().length === 0) {
      return { success: false, error: '作品简介不能为空' };
    }

    const hooks = ctx.promptContext?.hooks as Hook[] | undefined;
    const agendaData = this.#computeAgenda(hooks, brief.chapterNumber);

    const prompt = this.#buildPrompt(brief, ctx.promptContext, agendaData);

    try {
      const raw = await this.generateJSON<ChapterPlanResult>(prompt);
      if (raw?.plan && agendaData) {
        const result: ChapterPlanResult = {
          plan: { ...raw.plan, hookAgenda: agendaData },
        };
        return { success: true, data: result };
      }
      return { success: true, data: raw };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: `LLM 调用失败: ${message}` };
    }
  }

  #computeAgenda(hooks: Hook[] | undefined, chapterNumber: number): HookAgendaData | undefined {
    if (!this.hookAgenda || !hooks || hooks.length === 0) return undefined;

    const wakeResult = this.hookAgenda.onChapterReached(hooks, chapterNumber);
    return {
      wakeResult,
      schedule: hooks.map((h) => ({
        hookId: h.id,
        priority: h.priority,
        plantedChapter: h.plantedChapter,
      })),
    };
  }

  #buildPrompt(
    brief: ChapterPlanBrief,
    context?: Record<string, unknown>,
    agendaData?: HookAgendaData
  ): string {
    const genreHint = GENRE_GUIDANCE[brief.genre] ?? '';

    let prompt = `你是一位专业的网络小说章节策划师。请为以下章节制定详细的写作计划。

## 创作简报

- **书名**: ${brief.title}
- **题材**: ${brief.genre}${genreHint ? `（${genreHint}）` : ''}
- **简介**: ${brief.brief}
- **章节**: 第 ${brief.chapterNumber} 章`;

    if (brief.wordCountTarget) {
      prompt += `
- **目标字数**: ${brief.wordCountTarget} 字`;
    }

    const characters = context?.characters as string[] | undefined;
    if (characters && characters.length > 0) {
      prompt += `

## 已有角色

${characters.map((c) => `- ${c}`).join('\n')}`;
    }

    const outline = context?.outline as string | undefined;
    if (outline) {
      prompt += `

## 故事大纲

${outline}`;
    }

    const prevSummary = context?.previousChapterSummary as string | undefined;
    if (prevSummary) {
      prompt += `

## 上一章摘要

${prevSummary}`;
    }

    const openHooks = context?.openHooks as
      | Array<{
          description: string;
          type: string;
          status: string;
          priority: string;
          plantedChapter: number;
        }>
      | undefined;
    if (openHooks && openHooks.length > 0) {
      prompt += `

## 进行中伏笔

${openHooks.map((h) => `- [${h.priority}] ${h.description}（埋设于第 ${h.plantedChapter} 章）`).join('\n')}`;
    }

    // HookAgenda scheduling info
    if (agendaData?.wakeResult) {
      const { woken, deferred } = agendaData.wakeResult;
      if (woken.length > 0) {
        prompt += `

## 唤醒伏笔

以下休眠伏笔在本章被唤醒，请在计划中考虑：
${woken.map((h) => `- [唤醒] ${h.hookId}（优先级: ${h.priority}）`).join('\n')}`;
      }
      if (deferred.length > 0) {
        prompt += `

## 延期唤醒

以下伏笔因惊群平滑被延期，将在指定章节唤醒：
${deferred.map((h) => `- [延期] ${h.hookId} → 第 ${h.wakeAtChapter} 章唤醒`).join('\n')}`;
      }
    }

    prompt += `

## 输出要求

请以 JSON 格式输出章节计划，包含以下字段：
- plan: 章节计划对象
  - chapterNumber: 章节号
  - title: 章节标题
  - intention: 本章意图（1-2句话描述本章要达成什么叙事目标）
  - wordCountTarget: 目标字数
  - characters: 出场角色姓名列表
  - keyEvents: 关键事件列表（3-5个）
  - hooks: 伏笔计划（本章埋设或回收的伏笔列表，包含 description、type、priority）
  - worldRules: 本章涉及的世界观设定
  - emotionalBeat: 情感节拍（本章的情感走向，如"平静→紧张→释然"）
  - sceneTransition: 场景过渡描述（本章如何与前后章节衔接）

注意伏笔埋设要有前瞻性，与大纲保持一致。出场角色应与已有角色列表协调。`;

    return prompt;
  }
}
