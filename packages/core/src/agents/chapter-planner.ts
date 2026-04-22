import { BaseAgent, type AgentContext, type AgentResult } from './base';
import type { HookAgenda } from '../governance/hook-agenda';
import type { Hook } from '../models/state';
import type { LLMProvider } from '../llm/provider';
import { generateJSONWithValidation, type LLMOutputRule } from '../llm/output-validator';
import { GENRE_GUIDANCE } from './genre-guidance';

// ─── Input Types ────────────────────────────────────────────────

export interface ChapterPlanBrief {
  title: string;
  genre: string;
  brief: string;
  chapterNumber: number;
  wordCountTarget?: number;
}

/** 批量区间规划的输入参数 */
export interface BatchPlanRange {
  /** 区间起始章节号（含） */
  startChapter: number;
  /** 区间结束章节号（含） */
  endChapter: number;
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

// ─── Enhanced Output Types ────────────────────────────────────────

/** 场景分解：一章中的单个场景 */
export interface SceneBreakdown {
  /** 场景标题（2-6字） */
  title: string;
  /** 场景内容描述（50-100字，包含具体动作、对话方向、环境细节） */
  description: string;
  /** 该场景出场角色 */
  characters: string[];
  /** 场景情感调性 */
  mood: string;
  /** 预估字数 */
  wordCount: number;
}

/** 增强版章节计划——可直接供 Writer 节点使用 */
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
  // ─── 新增字段 ───
  /** 开篇钩子：本章开头如何抓住读者（50字以内） */
  openingHook: string;
  /** 结尾悬念：本章结尾如何制造悬念引向下一章（50字以内） */
  closingHook: string;
  /** 场景分解：将一章拆为 2-4 个连续场景，每个场景有具体描写目标 */
  sceneBreakdown: SceneBreakdown[];
  /** 本章对主角成长弧光的推进点 */
  characterGrowthBeat: string;
  /** 本章需要伏笔的动作：埋设/推进/回收，以及对应伏笔描述 */
  hookActions: Array<{ action: 'plant' | 'advance' | 'payoff'; description: string }>;
  /** 叙事节奏标记：slow_build / rising / climax / cooldown / transition */
  pacingTag: 'slow_build' | 'rising' | 'climax' | 'cooldown' | 'transition';
}

export interface ChapterPlanResult {
  plan: ChapterPlan;
}

/** 批量章节规划结果 */
export interface BatchChapterPlanResult {
  plans: ChapterPlan[];
}

// ─── Agent ────────────────────────────────────────────────────────

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

    // 判断是批量模式还是单章模式
    const batchRange = ctx.promptContext?.batchRange as BatchPlanRange | undefined;
    if (batchRange) {
      return this.#executeBatch(brief, ctx, batchRange);
    }
    return this.#executeSingle(brief, ctx);
  }

  // ── 单章规划（保持向后兼容） ────────────────────────────────

  async #executeSingle(brief: ChapterPlanBrief, ctx: AgentContext): Promise<AgentResult> {
    const hooks = ctx.promptContext?.hooks as Hook[] | undefined;
    const agendaData = this.#computeAgenda(hooks, brief.chapterNumber);
    const prompt = this.#buildSingleChapterPrompt(brief, ctx.promptContext, agendaData);

    try {
      const rules: LLMOutputRule[] = [
        { field: 'plan', type: 'required' },
        { field: 'plan.chapterNumber', type: 'required' },
        { field: 'plan.title', type: 'min_string_length', min: 2 },
        { field: 'plan.intention', type: 'min_string_length', min: 10 },
        { field: 'plan.keyEvents', type: 'min_array_length', min: 2 },
        { field: 'plan.characters', type: 'non_empty_array' },
        { field: 'plan.sceneBreakdown', type: 'min_array_length', min: 2 },
        { field: 'plan.openingHook', type: 'min_string_length', min: 5 },
        { field: 'plan.closingHook', type: 'min_string_length', min: 5 },
      ];

      const raw = await generateJSONWithValidation<ChapterPlanResult>(
        this.provider,
        prompt,
        rules,
        {
          temperature: this.temperature,
          maxTokens: 4096,
          agentName: this.name,
          retry: { maxRetries: 2, retryDelayMs: 500 },
        }
      );

      const plan = this.#sanitizePlan(raw.plan, brief);

      if (agendaData) {
        return { success: true, data: { plan: { ...plan, hookAgenda: agendaData } } };
      }
      return { success: true, data: { plan } };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: `LLM 调用失败: ${message}` };
    }
  }

  // ── 批量区间规划 ────────────────────────────────────────────

  async #executeBatch(
    brief: ChapterPlanBrief,
    ctx: AgentContext,
    range: BatchPlanRange
  ): Promise<AgentResult> {
    const chapterCount = range.endChapter - range.startChapter + 1;
    if (chapterCount < 1 || chapterCount > 10) {
      return {
        success: false,
        error: `批量规划区间必须在 1-10 章之间，当前请求 ${chapterCount} 章`,
      };
    }

    const prompt = this.#buildBatchPrompt(brief, ctx.promptContext, range);

    try {
      const rules: LLMOutputRule[] = [
        { field: 'plans', type: 'min_array_length', min: chapterCount },
      ];

      const raw = await generateJSONWithValidation<BatchChapterPlanResult>(
        this.provider,
        prompt,
        rules,
        {
          temperature: this.temperature,
          maxTokens: 8192,
          agentName: `${this.name}-Batch`,
          retry: { maxRetries: 2, retryDelayMs: 500 },
        }
      );

      const plans = (raw.plans ?? []).map((p, i) =>
        this.#sanitizePlan(p, { ...brief, chapterNumber: range.startChapter + i })
      );

      return { success: true, data: { plans } };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: `批量规划失败: ${message}` };
    }
  }

  // ── Sanitize ────────────────────────────────────────────────

  #sanitizePlan(plan: Partial<ChapterPlan>, brief: ChapterPlanBrief): ChapterPlan {
    const defaultScene: SceneBreakdown = {
      title: '主场景',
      description: plan.intention ?? '推进情节',
      characters: plan.characters ?? [],
      mood: plan.emotionalBeat ?? '平稳',
      wordCount: plan.wordCountTarget ?? brief.wordCountTarget ?? 3000,
    };

    return {
      chapterNumber: plan.chapterNumber ?? brief.chapterNumber,
      title: plan.title ?? `第${brief.chapterNumber}章`,
      intention: plan.intention ?? '推进主线情节',
      wordCountTarget: plan.wordCountTarget ?? brief.wordCountTarget ?? 3000,
      characters:
        Array.isArray(plan.characters) && plan.characters.length > 0 ? plan.characters : [],
      keyEvents:
        Array.isArray(plan.keyEvents) && plan.keyEvents.length > 0 ? plan.keyEvents : ['情节推进'],
      hooks: Array.isArray(plan.hooks) ? plan.hooks : [],
      worldRules:
        Array.isArray(plan.worldRules) && plan.worldRules.length > 0 ? plan.worldRules : [],
      emotionalBeat: plan.emotionalBeat ?? '平稳推进',
      sceneTransition: plan.sceneTransition ?? '自然过渡',
      openingHook: plan.openingHook ?? '以动作或悬念开篇',
      closingHook: plan.closingHook ?? '留下悬念引向下一章',
      sceneBreakdown:
        Array.isArray(plan.sceneBreakdown) && plan.sceneBreakdown.length >= 2
          ? plan.sceneBreakdown
          : [defaultScene],
      characterGrowthBeat: plan.characterGrowthBeat ?? '',
      hookActions: Array.isArray(plan.hookActions) ? plan.hookActions : [],
      pacingTag: plan.pacingTag ?? 'slow_build',
    };
  }

  // ── Agenda ──────────────────────────────────────────────────

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

  // ── Prompt: 单章规划 ────────────────────────────────────────

  #buildSingleChapterPrompt(
    brief: ChapterPlanBrief,
    context?: Record<string, unknown>,
    agendaData?: HookAgendaData
  ): string {
    const genreHint = GENRE_GUIDANCE[brief.genre] ?? '';

    let prompt = `你是一位专业的网络小说章节策划师。请为以下章节制定**详尽的**写作计划，使下游写手可直接按此计划写出完整章节正文，无需额外补充。

## 创作简报

- **书名**: ${brief.title}
- **题材**: ${brief.genre}${genreHint ? `（${genreHint}）` : ''}
- **简介**: ${brief.brief}
- **章节**: 第 ${brief.chapterNumber} 章`;

    if (brief.wordCountTarget) {
      prompt += `\n- **目标字数**: ${brief.wordCountTarget} 字`;
    }

    prompt = this.#appendContextSections(prompt, context);
    prompt = this.#appendAgendaSection(prompt, agendaData);
    prompt = this.#appendSingleOutputSpec(prompt, brief);

    return prompt;
  }

  // ── Prompt: 批量区间规划 ────────────────────────────────────

  #buildBatchPrompt(
    brief: ChapterPlanBrief,
    context?: Record<string, unknown>,
    range?: BatchPlanRange
  ): string {
    const genreHint = GENRE_GUIDANCE[brief.genre] ?? '';
    const count = range!.endChapter - range!.startChapter + 1;

    let prompt = `你是一位专业的网络小说章节策划师。请为以下连续 ${count} 章制定**详尽的**写作计划。

**关键原则**：这 ${count} 章必须在叙事上首尾连贯——前一章的结尾必须自然衔接到后一章的开篇，形成不间断的阅读体验。

## 创作简报

- **书名**: ${brief.title}
- **题材**: ${brief.genre}${genreHint ? `（${genreHint}）` : ''}
- **简介**: ${brief.brief}
- **规划范围**: 第 ${range!.startChapter} 章 ~ 第 ${range!.endChapter} 章（共 ${count} 章）`;

    if (brief.wordCountTarget) {
      prompt += `\n- **每章目标字数**: ${brief.wordCountTarget} 字`;
    }

    prompt = this.#appendContextSections(prompt, context);
    prompt = this.#appendBatchOutputSpec(prompt, range!);

    return prompt;
  }

  // ── Shared context sections ─────────────────────────────────

  #appendContextSections(prompt: string, context?: Record<string, unknown>): string {
    const characters = context?.characters as string[] | undefined;
    if (characters && characters.length > 0) {
      prompt += `

## 已有角色（出场角色必须且只能从此列表中选择，禁止引入任何未列出的具名角色）

${characters.map((c) => `- ${c}`).join('\n')}`;

      const characterNames = characters.map((c) => {
        const match = c.match(/^([^（(]+)/);
        return match ? match[1].trim() : c;
      });
      prompt += `

**characters 字段只能包含以下名字**：${characterNames.join('、')}`;
    }

    const currentFocus = context?.currentFocus as string | undefined;
    if (currentFocus) {
      prompt += `

## 当前故事焦点

${currentFocus}`;
    }

    const centralConflict = context?.centralConflict as string | undefined;
    if (centralConflict) {
      prompt += `

## 全书核心矛盾

${centralConflict}`;
    }

    const growthArc = context?.growthArc as string | undefined;
    if (growthArc) {
      prompt += `

## 主角成长主线

${growthArc}`;
    }

    const chapterAnchor = context?.chapterAnchor as string | undefined;
    if (chapterAnchor) {
      prompt += `

## 本章定位

${chapterAnchor}`;
    }

    const candidateWorldRules = context?.candidateWorldRules as string[] | undefined;
    if (candidateWorldRules && candidateWorldRules.length > 0) {
      prompt += `

## 必须优先落地的书级规则

${candidateWorldRules.map((rule) => `- ${rule}`).join('\n')}`;
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

    return prompt;
  }

  #appendAgendaSection(prompt: string, agendaData?: HookAgendaData): string {
    if (!agendaData?.wakeResult) return prompt;
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
    return prompt;
  }

  // ── Output specification: 单章 ──────────────────────────────

  #appendSingleOutputSpec(prompt: string, brief: ChapterPlanBrief): string {
    prompt += `

## 输出要求

请以 JSON 格式输出章节计划，包含以下字段：
- plan: 章节计划对象
  - chapterNumber: 章节号（${brief.chapterNumber}）
  - title: 章节标题
  - intention: 本章意图（1-2句话描述本章要达成什么叙事目标）
  - wordCountTarget: 目标字数（${brief.wordCountTarget ?? 3000}）
  - characters: 出场角色姓名列表（必须且只能从上方"已有角色"列表中选择）
  - keyEvents: 关键事件列表（3-5个，每个事件必须是本章**可完成的、有时间边界的具体动作**）
  - hooks: 伏笔计划（包含 description、type、priority）
  - worldRules: 本章涉及的世界观设定（必须从上方"书级规则"中选取并具体化）
  - emotionalBeat: 情感节拍（如"平静→紧张→释然"）
  - sceneTransition: 场景过渡描述
  - openingHook: 开篇钩子（50字以内，描述本章开头如何抓住读者：以动作、悬念、对话或画面直接切入，禁止"话说"式开场）
  - closingHook: 结尾悬念（50字以内，描述本章结尾如何制造悬念引向下一章）
  - sceneBreakdown: 场景分解数组（2-4个场景），每个场景包含：
    - title: 场景标题（2-6字）
    - description: 场景内容描述（50-100字，包含具体动作、对话方向、环境细节、角色心理）
    - characters: 该场景出场角色
    - mood: 场景情感调性
    - wordCount: 该场景预估字数（各场景字数之和应等于 wordCountTarget）
  - characterGrowthBeat: 本章对主角成长弧光的推进点（1句话描述主角在本章有何变化或领悟）
  - hookActions: 伏笔动作数组，每项包含：
    - action: "plant"（埋设）/"advance"（推进）/"payoff"（回收）
    - description: 具体伏笔内容
  - pacingTag: 叙事节奏标记（slow_build / rising / climax / cooldown / transition）

### 关键约束
1. **事件边界**：keyEvents 中每个事件必须是本章**能够完成**的动作，禁止写跨章事件
2. **场景具体**：sceneBreakdown 中每个场景的 description 必须具体到角色做了什么、说了什么方向的话，不能泛泛而谈
3. **伏笔可操作**：hookActions 中每个动作必须是 Writer 可以在正文中执行的（如"在李承泽翻阅仓库目录时，一行加密条目闪烁即逝"）
4. **首尾衔接**：openingHook 必须与前章结尾或全书开篇衔接，closingHook 必须为下一章创造阅读动力
5. **字数分配**：sceneBreakdown 各场景 wordCount 之和必须等于 wordCountTarget
6. **规则落地**：worldRules 不能照搬书级规则的原文，必须写出"本章如何体现/触发该规则"
7. 出场角色必须且只能从已有角色列表中选择，如需路人/龙套用泛称`;

    return prompt;
  }

  // ── Output specification: 批量 ──────────────────────────────

  #appendBatchOutputSpec(prompt: string, range: BatchPlanRange): string {
    const count = range.endChapter - range.startChapter + 1;

    prompt += `

## 输出要求

请以 JSON 格式输出 ${count} 章的连续规划，包含以下字段：
- plans: 章节计划数组（恰好 ${count} 个，按章节号升序排列），每项包含：
  - chapterNumber: 章节号（从 ${range.startChapter} 到 ${range.endChapter}）
  - title: 章节标题
  - intention: 本章意图
  - wordCountTarget: 目标字数
  - characters: 出场角色姓名列表（必须且只能从上方"已有角色"列表中选择）
  - keyEvents: 关键事件列表（3-5个，每个事件必须是本章可完成的具体动作）
  - hooks: 伏笔计划（包含 description、type、priority）
  - worldRules: 本章涉及的世界观设定
  - emotionalBeat: 情感节拍
  - sceneTransition: 场景过渡描述
  - openingHook: 开篇钩子（50字以内）
  - closingHook: 结尾悬念（50字以内）
  - sceneBreakdown: 场景分解数组（2-4个场景），每个场景包含：
    - title: 场景标题（2-6字）
    - description: 场景内容描述（50-100字，包含具体动作、对话方向、环境细节、角色心理）
    - characters: 该场景出场角色
    - mood: 场景情感调性
    - wordCount: 该场景预估字数
  - characterGrowthBeat: 主角成长弧光推进点
  - hookActions: 伏笔动作数组（action: plant/advance/payoff + description）
  - pacingTag: 叙事节奏标记

### 批量规划关键约束
1. **章间连贯**：第 N 章的 closingHook 必须与第 N+1 章的 openingHook 形成因果衔接——前章结尾的悬念/动作就是后章开篇的起点
2. **事件边界**：keyEvents 中每个事件必须是本章可完成的动作，禁止跨章事件
3. **节奏递进**：${count} 章的 pacingTag 应形成合理递进（如 slow_build → rising → rising → climax → cooldown）
4. **场景具体**：sceneBreakdown 中每个场景的 description 必须具体到角色做了什么，不能泛泛而谈
5. **伏笔贯穿**：hookActions 可以跨章安排（如第1章 plant，第3章 advance，第5章 payoff）
6. **字数分配**：每章 sceneBreakdown 各场景 wordCount 之和必须等于该章 wordCountTarget
7. 出场角色必须且只能从已有角色列表中选择，如需路人/龙套用泛称`;

    return prompt;
  }
}
