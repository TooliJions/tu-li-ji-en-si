import * as fs from 'fs';
import * as path from 'path';
import { StateManager } from '../state/manager';
import { RuntimeStateStore } from '../state/runtime-store';
import { applyRuntimeStateDelta } from '../state/reducer';
import { OpenAICompatibleProvider, LLMProvider, type LLMConfig } from '../llm/provider';
import {
  ContextCard,
  type ContextCardInput,
  type ContextCardOutput,
  type ContextDataSources,
} from '../agents/context-card';
import { IntentDirector, type IntentInput, type IntentOutput } from '../agents/intent-director';
import {
  ChapterExecutor,
  type ChapterExecutionInput,
  type AgentDependencies,
} from '../agents/executor';
import { ScenePolisher, type ScenePolishInput } from '../agents/scene-polisher';
import {
  ChapterPlanner,
  type ChapterPlan,
  type ChapterPlanResult,
  type ChapterPlanBrief,
  type BatchChapterPlanResult,
} from '../agents/chapter-planner';

import type { ChapterIndexEntry } from '../models/chapter';
import type { Delta, Manifest, ChapterPlanStore } from '../models/state';
import { TelemetryLogger, type TelemetryChannel } from '../telemetry/logger';
import { RevisionLoop } from './revision-loop';
import { ChapterRestructurer } from './restructurer';
import type { MergeChaptersInput, SplitChapterInput, RestructureResult } from './restructurer';
import { GENRE_WRITER_STYLE_MAP } from '../agents/genre-guidance';
import { countChineseWords, isValidBookId, stripFrontmatter } from '../utils';
import { ProjectionRenderer } from '../state/projections';

// ─── Configuration ──────────────────────────────────────────────

export interface PipelineConfig {
  rootDir: string;
  llmConfig?: LLMConfig;
  provider?: LLMProvider;
  maxRevisionRetries?: number;
  fallbackAction?: 'accept_with_warnings' | 'pause';
  telemetryLogger?: TelemetryLogger;
}

// ─── Input / Output Types ───────────────────────────────────────

export interface InitBookInput {
  bookId: string;
  title: string;
  genre: string;
  synopsis: string;
  tone?: string;
  targetAudience?: string;
  platform?: string;
}

export interface InitBookResult {
  success: boolean;
  bookId: string;
  bookDir?: string;
  error?: string;
}

export interface PlanChapterInput {
  bookId: string;
  chapterNumber: number;
  outlineContext: string;
}

export interface PlanChapterResult {
  success: boolean;
  chapterNumber: number;
  title?: string;
  /** 章节意图（原 summary，语义修正） */
  intention?: string;
  keyEvents?: string[];
  characters?: string[];
  hooks?: Array<{ description: string; type: string; priority: string }>;
  error?: string;
}

export interface WriteDraftInput {
  bookId: string;
  chapterNumber: number;
  title: string;
  genre: string;
  sceneDescription: string;
  previousChapterContent?: string;
  bookContext?: string;
}

export interface UpgradeDraftInput {
  bookId: string;
  chapterNumber: number;
  userIntent?: string;
}

export interface WriteNextChapterInput {
  bookId: string;
  chapterNumber: number;
  title: string;
  genre: string;
  userIntent: string;
  previousChapterContent?: string;
}

export interface ChapterResult {
  success: boolean;
  bookId: string;
  chapterNumber: number;
  content?: string;
  status?: 'draft' | 'final';
  error?: string;
  warning?: string;
  warningCode?: 'accept_with_warnings' | 'context_drift';
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  persisted?: boolean;
}

export interface AuditDraftInput {
  bookId: string;
  chapterNumber: number;
  content: string;
  genre: string;
}

/** 审计结果条目（runner 内部使用，避免与 models/quality.ts 中的 Zod 推断类型冲突） */
export interface RunnerAuditIssue {
  severity: 'blocker' | 'warning' | 'suggestion';
  dimension: string;
  description: string;
}

export interface AuditResult {
  success: boolean;
  bookId: string;
  chapterNumber: number;
  overallScore: number;
  overallStatus: 'pass' | 'warning' | 'fail';
  issues: RunnerAuditIssue[];
  summary: string;
  aiTraceScore?: number;
}

export interface ReviseDraftInput {
  bookId: string;
  chapterNumber: number;
  content: string;
  genre: string;
  auditIssues?: RunnerAuditIssue[];
}

// 复用 restructurer.ts 中已定义的类型，避免导出冲突
export { MergeChaptersInput, SplitChapterInput, RestructureResult } from './restructurer';

// ─── PipelineRunner ─────────────────────────────────────────────

export class PipelineRunner {
  private stateManager: StateManager;
  private stateStore: RuntimeStateStore;
  private provider: LLMProvider;
  private maxRevisionRetries: number;
  private fallbackAction: 'accept_with_warnings' | 'pause';
  private telemetryLogger: TelemetryLogger;

  constructor(config: PipelineConfig) {
    this.stateManager = new StateManager(config.rootDir);
    this.stateStore = new RuntimeStateStore(this.stateManager);
    if (!config.provider && !config.llmConfig) {
      throw new Error('必须提供 provider 或 llmConfig');
    }
    this.provider = config.provider ?? new OpenAICompatibleProvider(config.llmConfig!);
    this.maxRevisionRetries = config.maxRevisionRetries ?? 2;
    this.fallbackAction = config.fallbackAction ?? 'accept_with_warnings';
    this.telemetryLogger = config.telemetryLogger ?? new TelemetryLogger(config.rootDir);
  }

  // ── initBook ──────────────────────────────────────────────────

  /**
   * 初始化一本新书：创建目录结构、生成元数据、初始化状态。
   */
  async initBook(input: InitBookInput): Promise<InitBookResult> {
    if (!input.bookId || input.bookId.trim().length === 0) {
      return { success: false, bookId: '', error: 'bookId 不能为空' };
    }
    if (!isValidBookId(input.bookId)) {
      return {
        success: false,
        bookId: input.bookId,
        error: 'bookId 格式无效：仅允许字母、数字、下划线和连字符',
      };
    }
    if (!input.title || input.title.trim().length === 0) {
      return { success: false, bookId: input.bookId, error: '书名不能为空' };
    }
    if (!input.genre || input.genre.trim().length === 0) {
      return { success: false, bookId: input.bookId, error: '题材不能为空' };
    }
    if (!input.synopsis || input.synopsis.trim().length === 0) {
      return { success: false, bookId: input.bookId, error: '简介不能为空' };
    }

    // 检查是否已存在
    const bookPath = this.stateManager.getBookPath(input.bookId);
    if (fs.existsSync(bookPath)) {
      return { success: false, bookId: input.bookId, error: `书籍「${input.bookId}」已存在` };
    }

    // 创建目录结构
    this.stateManager.ensureBookStructure(input.bookId);

    // 初始化状态
    this.stateStore.initializeBookState(input.bookId);

    // 保存元数据（meta.json — API 兼容层）
    const metaPath = this.stateManager.getBookPath(input.bookId, 'meta.json');
    const metadata = {
      title: input.title,
      genre: input.genre,
      synopsis: input.synopsis,
      tone: input.tone ?? '',
      targetAudience: input.targetAudience ?? '',
      platform: input.platform ?? '',
      createdAt: new Date().toISOString(),
    };
    fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2), 'utf-8');

    // 同时写入 book.json（与 StateBootstrap 保持一致，供 #buildPlanContext 读取）
    const bookDataPath = this.stateManager.getBookPath(input.bookId, 'book.json');
    const bookData = {
      id: input.bookId,
      title: input.title,
      genre: input.genre,
      brief: input.synopsis,
      targetWords: 0,
      targetWordsPerChapter: 3000,
      currentWords: 0,
      chapterCount: 0,
      status: 'active',
      language: 'zh-CN',
      promptVersion: 'v2',
      fanficMode: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(bookDataPath, JSON.stringify(bookData, null, 2), 'utf-8');

    // 创建章节索引
    this.stateManager.writeIndex(input.bookId, {
      bookId: input.bookId,
      chapters: [],
      totalChapters: 0,
      totalWords: 0,
      lastUpdated: new Date().toISOString(),
    });

    // 写入初始投影文件
    const manifest = this.stateStore.loadManifest(input.bookId);
    const stateDir = this.stateManager.getBookPath(input.bookId, 'story', 'state');
    ProjectionRenderer.writeProjectionFiles(manifest, stateDir, []);

    return { success: true, bookId: input.bookId, bookDir: bookPath };
  }

  // ── planChapter ───────────────────────────────────────────────

  /**
   * 规划章节：使用 ChapterPlanner Agent 生成章节写作计划，保存到 manifest。
   */
  async planChapter(input: PlanChapterInput): Promise<PlanChapterResult> {
    if (input.chapterNumber < 1) {
      return { success: false, chapterNumber: input.chapterNumber, error: '章节号必须从 1 开始' };
    }

    // 检查书籍是否存在
    if (!this.stateStore.hasState(input.bookId)) {
      return {
        success: false,
        chapterNumber: input.chapterNumber,
        error: `书籍「${input.bookId}」不存在`,
      };
    }

    // 计算批量规划区间：从当前章节到下一个 beat 的前一章
    const manifest = this.stateStore.loadManifest(input.bookId);
    const batchRange = this.#computeBatchRange(manifest.outline ?? [], input.chapterNumber);

    // 构建公共上下文
    const {
      meta,
      wordCountTarget,
      centralConflict,
      growthArc,
      candidateWorldRules,
      openHooks,
      outlineContext,
      previousChapterSummary,
    } = this.#buildPlanContext(input, manifest);

    // 选择批量或单章模式
    const chapterPlanner = new ChapterPlanner(this.provider);
    const promptContextBase = {
      brief: {
        title: meta.title || input.outlineContext || '未知书名',
        genre: meta.genre || 'unknown',
        brief: meta.synopsis || input.outlineContext || '',
        chapterNumber: input.chapterNumber,
        wordCountTarget,
      },
      characters: manifest.characters.map(
        (c) =>
          `${c.name}（${c.role}）：${Array.isArray(c.traits) ? c.traits.join('、') : c.traits}${c.arc ? `；成长弧光：${c.arc}` : ''}`
      ),
      outline: outlineContext,
      previousChapterSummary,
      openHooks,
      currentFocus: manifest.currentFocus || undefined,
      centralConflict: centralConflict || undefined,
      growthArc: growthArc || undefined,
      candidateWorldRules: candidateWorldRules.length > 0 ? candidateWorldRules : undefined,
    };

    let plans: ChapterPlan[];

    if (batchRange && batchRange.endChapter > batchRange.startChapter) {
      // 批量规划模式
      const batchResult = await chapterPlanner.execute({
        bookId: input.bookId,
        chapterId: input.chapterNumber,
        promptContext: {
          ...promptContextBase,
          batchRange,
        },
      });

      if (!batchResult.success || !batchResult.data) {
        // 批量失败，降级到单章
        plans = [await this.#fallbackSinglePlan(chapterPlanner, promptContextBase, input)];
      } else {
        const batchData = batchResult.data as Record<string, unknown>;
        if ('plans' in batchData && Array.isArray(batchData.plans)) {
          plans = (batchData as unknown as BatchChapterPlanResult).plans;
        } else if ('plan' in batchData) {
          plans = [(batchData as unknown as ChapterPlanResult).plan];
        } else {
          plans = [await this.#fallbackSinglePlan(chapterPlanner, promptContextBase, input)];
        }
      }
    } else {
      // 单章规划模式
      const planResult = await chapterPlanner.execute({
        bookId: input.bookId,
        chapterId: input.chapterNumber,
        promptContext: promptContextBase,
      });

      if (!planResult.success || !planResult.data) {
        return {
          success: false,
          chapterNumber: input.chapterNumber,
          error: planResult.error ?? '章节规划失败',
        };
      }

      const planData = planResult.data;
      if (!planData || typeof planData !== 'object' || !('plan' in planData)) {
        return {
          success: false,
          chapterNumber: input.chapterNumber,
          error: '章节规划返回数据格式异常：缺少 plan 字段',
        };
      }
      plans = [(planData as ChapterPlanResult).plan];
    }

    // 批量保存所有章节计划到 manifest
    const now = new Date().toISOString();
    const updatedPlans = { ...manifest.chapterPlans };
    const index = this.stateManager.readIndex(input.bookId);

    for (const plan of plans) {
      if (!plan || typeof plan !== 'object') continue;
      updatedPlans[String(plan.chapterNumber)] = this.#planToStore(plan, now);
      this.#upsertChapterIndex(index, plan.chapterNumber, plan.title, now);
    }

    index.totalChapters = index.chapters.length;
    index.totalWords = index.chapters.reduce(
      (sum, ch) => sum + (Number.isFinite(ch.wordCount) ? ch.wordCount : 0),
      0
    );
    index.lastUpdated = now;

    this.stateStore.saveRuntimeStateSnapshot(input.bookId, {
      ...manifest,
      chapterPlans: updatedPlans,
    } as Manifest);
    this.stateManager.writeIndex(input.bookId, index);

    const primaryPlan = plans.find((p) => p.chapterNumber === input.chapterNumber) ?? plans[0];
    return {
      success: true,
      chapterNumber: input.chapterNumber,
      title: primaryPlan.title,
      intention: primaryPlan.intention,
      keyEvents: primaryPlan.keyEvents,
      characters: primaryPlan.characters,
      hooks: primaryPlan.hooks.map((h) => ({
        description: typeof h === 'object' && h.description ? h.description : String(h),
        type: typeof h === 'object' && h.type ? h.type : 'plot',
        priority: typeof h === 'object' && h.priority ? h.priority : 'minor',
      })),
    };
  }

  /**
   * 构建规划所需的公共上下文数据
   */
  #buildPlanContext(input: PlanChapterInput, manifest: Manifest) {
    const metaPath = this.stateManager.getBookPath(input.bookId, 'meta.json');
    const meta = fs.existsSync(metaPath)
      ? (JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as {
          genre: string;
          title: string;
          synopsis: string;
        })
      : { genre: 'unknown', title: '', synopsis: '' };

    const previousChapterSummary =
      manifest.lastChapterWritten > 0
        ? this.#readChapterSummary(input.bookId, manifest.lastChapterWritten)
        : '第一章，需要建立世界观和角色介绍';

    const outlineContext = this.#buildOutlineContext(
      manifest.outline ?? [],
      input.chapterNumber,
      input.outlineContext || manifest.currentFocus || '',
      input.bookId
    );

    const bookDataPath = this.stateManager.getBookPath(input.bookId, 'book.json');
    let bookData: Record<string, unknown> = {};
    if (fs.existsSync(bookDataPath)) {
      try {
        bookData = JSON.parse(fs.readFileSync(bookDataPath, 'utf-8'));
      } catch {
        /* ignore */
      }
    }
    const wordCountTarget = (bookData.targetWordsPerChapter as number) ?? 3000;

    const expandedBrief = (bookData.expandedBrief as string) ?? '';
    const planningBrief = (bookData.planningBrief as string) ?? '';
    let centralConflict = '';
    let growthArc = '';
    if (expandedBrief) {
      const conflictMatch = expandedBrief.match(/【矛盾主线】([\s\S]*?)(?=\n【|$)/);
      if (conflictMatch) centralConflict = conflictMatch[1].trim();
      const growthMatch = expandedBrief.match(/【主角定位】([\s\S]*?)(?=\n【|$)/);
      if (growthMatch) growthArc = growthMatch[1].trim();
    }
    if (planningBrief) {
      const conflictMatch = planningBrief.match(/核心矛盾[：:]([\s\S]*?)(?=；|$)/);
      if (!centralConflict && conflictMatch) centralConflict = conflictMatch[1].trim();
      const growthMatch = planningBrief.match(/成长主线[：:]([\s\S]*?)(?=；|$)/);
      if (!growthArc && growthMatch) growthArc = growthMatch[1].trim();
    }

    const candidateWorldRules = manifest.worldRules.map((r) => `[${r.category}] ${r.rule}`);

    const openHooksRaw = manifest.hooks.filter(
      (h) => h.status === 'open' || h.status === 'progressing'
    );
    const seenHookDescs = new Set<string>();
    const openHooks = openHooksRaw
      .filter((h) => {
        const key = h.description.trim();
        if (seenHookDescs.has(key)) return false;
        seenHookDescs.add(key);
        return true;
      })
      .map((h) => ({
        description: h.description,
        type: h.type,
        status: h.status,
        priority: h.priority,
        plantedChapter: h.plantedChapter,
      }));

    return {
      meta,
      bookData,
      wordCountTarget,
      centralConflict,
      growthArc,
      candidateWorldRules,
      openHooks,
      outlineContext,
      previousChapterSummary,
    };
  }

  /**
   * 计算批量规划区间：从当前章节到下一个 beat 之前，最多 10 章
   */
  #computeBatchRange(
    outline: Array<{
      actNumber: number;
      title: string;
      summary: string;
      chapters: Array<{ chapterNumber: number; title: string; summary: string }>;
    }>,
    chapterNumber: number
  ): { startChapter: number; endChapter: number } | null {
    if (!outline || outline.length === 0) return null;

    // 收集所有 beat 的章节号
    const allBeatChapters: number[] = [];
    for (const act of outline) {
      for (const ch of act.chapters ?? []) {
        if (ch.chapterNumber > 0) allBeatChapters.push(ch.chapterNumber);
      }
    }
    allBeatChapters.sort((a, b) => a - b);

    if (allBeatChapters.length === 0) return null;

    // 找到当前章节之后的下一个 beat
    let nextBeat = allBeatChapters.find((c) => c > chapterNumber);
    if (nextBeat === undefined) {
      // 当前章节已在最后一个 beat 之后，规划 5 章
      nextBeat = chapterNumber + 5;
    }

    // 区间：从当前章节到 nextBeat - 1（不含 beat 本身，beat 章节单独规划）
    // 如果 nextBeat 正好是 chapterNumber + 1，则只规划单章
    const endChapter = Math.min(nextBeat - 1, chapterNumber + 9); // 最多 10 章
    if (endChapter < chapterNumber) return null;

    return { startChapter: chapterNumber, endChapter };
  }

  /**
   * 降级到单章规划
   */
  async #fallbackSinglePlan(
    chapterPlanner: ChapterPlanner,
    promptContextBase: Record<string, unknown>,
    input: PlanChapterInput
  ): Promise<ChapterPlan> {
    const result = await chapterPlanner.execute({
      bookId: input.bookId,
      chapterId: input.chapterNumber,
      promptContext: promptContextBase,
    });

    if (result.success && result.data) {
      const data = result.data as Record<string, unknown>;
      if ('plan' in data) {
        return (data as unknown as ChapterPlanResult).plan;
      }
    }

    // 兜底
    return {
      chapterNumber: input.chapterNumber,
      title: `第${input.chapterNumber}章`,
      intention: '推进主线情节',
      wordCountTarget: (promptContextBase.brief as ChapterPlanBrief).wordCountTarget ?? 3000,
      characters: [],
      keyEvents: ['情节推进'],
      hooks: [],
      worldRules: [],
      emotionalBeat: '平稳推进',
      sceneTransition: '自然过渡',
      openingHook: '以动作或悬念开篇',
      closingHook: '留下悬念引向下一章',
      sceneBreakdown: [
        {
          title: '主场景',
          description: '推进情节发展',
          characters: [],
          mood: '平稳',
          wordCount: (promptContextBase.brief as ChapterPlanBrief).wordCountTarget ?? 3000,
        },
      ],
      characterGrowthBeat: '',
      hookActions: [],
      pacingTag: 'slow_build' as const,
    };
  }

  /**
   * 将 ChapterPlan 转换为 ChapterPlanStore 格式
   */
  #planToStore(plan: ChapterPlan, now: string): ChapterPlanStore {
    return {
      chapterNumber: plan.chapterNumber,
      title: plan.title,
      intention: plan.intention,
      wordCountTarget: plan.wordCountTarget,
      characters: plan.characters,
      keyEvents: plan.keyEvents,
      hooks: plan.hooks.map((h) => ({
        description: typeof h === 'object' && h.description ? h.description : String(h),
        type: typeof h === 'object' && h.type ? h.type : 'plot',
        priority: typeof h === 'object' && h.priority ? h.priority : 'minor',
      })),
      worldRules: plan.worldRules,
      emotionalBeat: plan.emotionalBeat,
      sceneTransition: plan.sceneTransition,
      createdAt: now,
      openingHook: plan.openingHook ?? '',
      closingHook: plan.closingHook ?? '',
      sceneBreakdown: plan.sceneBreakdown ?? [],
      characterGrowthBeat: plan.characterGrowthBeat ?? '',
      hookActions: plan.hookActions ?? [],
      pacingTag: plan.pacingTag ?? 'slow_build',
    };
  }

  /**
   * 更新或插入章节索引条目
   */
  #upsertChapterIndex(
    index: {
      chapters: Array<{
        number: number;
        title: string | null;
        fileName: string;
        wordCount: number;
        createdAt: string;
      }>;
      totalChapters: number;
      totalWords: number;
      lastUpdated: string;
    },
    chapterNumber: number,
    title: string,
    now: string
  ): void {
    const existing = index.chapters.find((ch) => ch.number === chapterNumber);
    if (existing) {
      existing.title = title;
    } else {
      const paddedChapterNumber = String(chapterNumber).padStart(4, '0');
      index.chapters.push({
        number: chapterNumber,
        title,
        fileName: `chapter-${paddedChapterNumber}.md`,
        wordCount: 0,
        createdAt: now,
      });
    }
  }

  // ── composeChapter ────────────────────────────────────────────

  /**
   * 组合章节：从规划到草稿到润色到审计到持久化的完整流程。
   * 使用 ContextCard → IntentDirector → ChapterExecutor Agent 链路。
   */
  async composeChapter(input: WriteNextChapterInput): Promise<ChapterResult> {
    // 获取书籍元数据
    const metaPath = this.stateManager.getBookPath(input.bookId, 'meta.json');
    if (!fs.existsSync(metaPath)) {
      return {
        success: false,
        bookId: input.bookId,
        chapterNumber: input.chapterNumber,
        error: `书籍「${input.bookId}」不存在`,
      };
    }
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as {
      genre: string;
      title: string;
      synopsis: string;
    };

    // 获取锁
    this.stateManager.acquireBookLock(input.bookId, 'composeChapter');

    try {
      // 缓存 manifest，避免同一次 composeChapter 内重复 I/O
      let manifest = this.stateStore.loadManifest(input.bookId);

      // 1. ContextCard Agent — 构建上下文卡片
      const contextCardAgent = new ContextCard(this.provider);
      const contextDataSources: ContextDataSources = {
        getManifest: async () => manifest,
        getPreviousChapterSummary: async (chapterNum: number) => {
          if (chapterNum < 1) return '';
          return this.#readChapterSummary(input.bookId, chapterNum);
        },
        getChapterContext: async (chapterNum: number) => {
          return this.#readChapterContent(input.bookId, chapterNum);
        },
      };

      const contextCardResult = await contextCardAgent.execute({
        bookId: input.bookId,
        chapterId: input.chapterNumber,
        promptContext: {
          input: {
            bookId: input.bookId,
            chapterNumber: input.chapterNumber,
            title: input.title,
            genre: input.genre,
          } as ContextCardInput,
          sources: contextDataSources,
        },
      });

      if (!contextCardResult.success || !contextCardResult.data) {
        return {
          success: false,
          bookId: input.bookId,
          chapterNumber: input.chapterNumber,
          error: `上下文卡片构建失败: ${contextCardResult.error ?? '未知错误'}`,
        };
      }
      this.#trackUsage(input.bookId, input.chapterNumber, 'planner', contextCardResult.usage);

      const contextCardData = contextCardResult.data;
      if (!contextCardData || typeof contextCardData !== 'object') {
        return {
          success: false,
          bookId: input.bookId,
          chapterNumber: input.chapterNumber,
          error: '上下文卡片返回数据格式异常',
        };
      }
      const contextCard = contextCardData as ContextCardOutput;

      // 1.5. 获取世界规则（PRD-014）
      const worldRules = contextCard.worldRules ?? [];

      // 2. 获取章节计划：优先使用 manifest 中已存储的计划，否则通过 IntentDirector 生成
      const storedPlan = manifest.chapterPlans[String(input.chapterNumber)];
      let plan: ChapterPlan;

      if (storedPlan) {
        // 使用已存储的章节计划，同时保留用户意图用于生成
        plan = {
          chapterNumber: storedPlan.chapterNumber,
          title: storedPlan.title || input.title,
          intention: storedPlan.intention,
          wordCountTarget: storedPlan.wordCountTarget || 3000,
          characters: storedPlan.characters,
          keyEvents: storedPlan.keyEvents,
          hooks: storedPlan.hooks,
          worldRules: storedPlan.worldRules,
          emotionalBeat: storedPlan.emotionalBeat,
          sceneTransition: storedPlan.sceneTransition,
          openingHook: storedPlan.openingHook ?? '',
          closingHook: storedPlan.closingHook ?? '',
          sceneBreakdown: storedPlan.sceneBreakdown ?? [],
          characterGrowthBeat: storedPlan.characterGrowthBeat ?? '',
          hookActions: storedPlan.hookActions ?? [],
          pacingTag: storedPlan.pacingTag ?? 'slow_build',
        };
      } else {
        // 无已存储计划，通过 IntentDirector 生成
        const intentAgent = new IntentDirector(this.provider);
        const characterProfiles = manifest.characters.map((c) => ({
          name: c.name,
          role: c.role,
          traits: Array.isArray(c.traits)
            ? c.traits
            : typeof c.traits === 'string'
              ? [c.traits]
              : [],
        }));

        const intentInput: IntentInput = {
          userIntent: input.userIntent,
          chapterNumber: input.chapterNumber,
          genre: input.genre,
          previousChapterSummary: contextCard.previousChapterSummary,
          outlineContext: contextCard.formattedText,
          characterProfiles,
        };

        const intentResult = await intentAgent.execute({
          bookId: input.bookId,
          chapterId: input.chapterNumber,
          promptContext: { input: intentInput },
        });

        if (!intentResult.success || !intentResult.data) {
          return {
            success: false,
            bookId: input.bookId,
            chapterNumber: input.chapterNumber,
            error: `意图定向失败: ${intentResult.error ?? '未知错误'}`,
          };
        }
        this.#trackUsage(input.bookId, input.chapterNumber, 'planner', intentResult.usage);

        const intentData = intentResult.data;
        if (!intentData || typeof intentData !== 'object') {
          return {
            success: false,
            bookId: input.bookId,
            chapterNumber: input.chapterNumber,
            error: '意图定向返回数据格式异常',
          };
        }
        const intent = intentData as IntentOutput;

        plan = {
          chapterNumber: input.chapterNumber,
          title: input.title,
          intention: intent.narrativeGoal,
          wordCountTarget: 3000,
          characters: intent.focusCharacters,
          keyEvents: intent.keyBeats,
          hooks: contextCard.hooks.map((h) => ({
            description: h.description,
            type: h.type,
            priority: h.priority,
          })),
          worldRules: contextCard.worldRules.map((r) => `[${r.category}] ${r.rule}`),
          emotionalBeat: intent.emotionalTone,
          sceneTransition: intent.styleNotes,
          openingHook: '',
          closingHook: '',
          sceneBreakdown: [],
          characterGrowthBeat: '',
          hookActions: [],
          pacingTag: 'slow_build' as const,
        };
      }

      // 3. ChapterExecutor Agent — 正文生成（传递 userIntent）
      const executorAgent = new ChapterExecutor(this.provider);

      const deps: AgentDependencies = {
        buildContext: async (_execInput: ChapterExecutionInput) => contextCard.formattedText,
        generateScene: async (p: ChapterPlan, context: string) => {
          const draftPrompt = this.#buildAgentDraftPrompt(input, p, context, meta.synopsis ?? '');
          const result = await this.provider.generate({ prompt: draftPrompt, agentName: 'Writer' });
          // 在 runner 层直接追踪 writer usage（Agent 无法从 deps 回传 usage）
          this.#trackUsage(input.bookId, input.chapterNumber, 'writer', result.usage);
          return result.text;
        },
      };

      const execInput: ChapterExecutionInput = {
        title: meta.title ?? input.title,
        genre: input.genre,
        brief: meta.synopsis ?? '',
        chapterNumber: input.chapterNumber,
        plan,
        userIntent: input.userIntent,
      };

      const execResult = await executorAgent.execute({
        bookId: input.bookId,
        chapterId: input.chapterNumber,
        promptContext: {
          input: execInput,
          dependencies: deps,
        },
      });

      if (!execResult.success || !execResult.data) {
        return {
          success: false,
          bookId: input.bookId,
          chapterNumber: input.chapterNumber,
          error: `正文生成失败: ${execResult.error ?? '未知错误'}`,
        };
      }
      // writer usage 已在 deps.generateScene 中追踪

      const draftData = execResult.data;
      if (!draftData || typeof draftData !== 'object' || !('content' in draftData)) {
        return {
          success: false,
          bookId: input.bookId,
          chapterNumber: input.chapterNumber,
          error: '正文生成返回数据格式异常：缺少 content 字段',
        };
      }
      const draftContent = (draftData as { content: string }).content;

      // 4. 世界规则执行检查（PRD-014）
      const ruleViolations = await this.#checkWorldRules(
        draftContent,
        input.chapterNumber,
        worldRules
      );

      // 5. ScenePolisher Agent — 场景润色（仅传 formattedText + intentGuidance，避免冗余）
      const polisher = new ScenePolisher(this.provider);
      const polishResult = await polisher.execute({
        bookId: input.bookId,
        chapterId: input.chapterNumber,
        promptContext: {
          input: {
            draftContent,
            chapterNumber: input.chapterNumber,
            title: input.title,
            genre: input.genre,
            contextCard: {
              characters: contextCard.characters,
              hooks: contextCard.hooks,
              facts: contextCard.facts,
              worldRules: contextCard.worldRules,
              previousChapterSummary: contextCard.previousChapterSummary,
              formattedText: contextCard.formattedText,
            },
          } as ScenePolishInput,
        },
      });
      this.#trackUsage(input.bookId, input.chapterNumber, 'composer', polisher.getLastUsage());

      const polishedResultData = polishResult.data;
      const polishedContent =
        polishResult.success &&
        polishedResultData &&
        typeof polishedResultData === 'object' &&
        'polishedContent' in polishedResultData
          ? (polishedResultData as { polishedContent: string }).polishedContent
          : draftContent;

      // 6. 质量审计 + 修订循环（使用 RevisionLoop 统一实现）
      // 世界规则违规：若存在，先尝试一次修订再进入审计循环
      let contentForAudit = polishedContent;
      let preRevisionWarning: string | undefined;
      if (ruleViolations.length > 0) {
        try {
          const preRevisePrompt = `请根据以下世界规则违规修订章节内容：

## 世界规则违规
${ruleViolations.map((v) => `- ${v}`).join('\n')}

## 当前内容
${polishedContent}

请修订后输出完整正文。`;

          const preReviseResult = await this.provider.generate({ prompt: preRevisePrompt });
          contentForAudit = preReviseResult.text;
          this.#trackUsage(input.bookId, input.chapterNumber, 'reviser', preReviseResult.usage);
        } catch (err) {
          preRevisionWarning = `世界规则修订失败: ${err instanceof Error ? err.message : String(err)}`;
        }
      }

      const loop = new RevisionLoop({
        provider: this.provider,
        maxRevisionRetries: this.maxRevisionRetries,
        fallbackAction: this.fallbackAction,
      });

      let auditedContent = polishedContent;
      let auditedWarning: string | undefined;
      let auditedWarningCode: 'accept_with_warnings' | undefined;

      try {
        const revisionResult = await loop.run({
          content: contentForAudit,
          bookId: input.bookId,
          chapterNumber: input.chapterNumber,
          genre: meta.genre,
        });

        auditedContent = revisionResult.content;

        if (revisionResult.action === 'accepted_with_warnings') {
          auditedWarning = `修订后仍存在问题，已降级接受: ${revisionResult.warnings.join('; ')}`;
          auditedWarningCode = 'accept_with_warnings';
        }
        // 合并世界规则修订警告
        if (preRevisionWarning) {
          auditedWarning = (auditedWarning ? auditedWarning + '；' : '') + preRevisionWarning;
          auditedWarningCode = auditedWarningCode ?? 'accept_with_warnings';
        }
      } catch (error) {
        // RevisionLoop 抛出异常时回退到原始润色内容，带 warning
        auditedWarning = `审计修订失败，使用润色后版本: ${error instanceof Error ? error.message : String(error)}`;
        auditedWarningCode = 'accept_with_warnings';
      }

      // 7. 记忆提取（使用缓存的 manifest）
      const manifestAfterMemory = await this.#extractMemory(
        auditedContent,
        input.bookId,
        input.chapterNumber
      );
      if (manifestAfterMemory) {
        manifest = manifestAfterMemory;
      }

      // 8. 原子持久化
      this.#persistChapterAtomic(
        auditedContent,
        input.bookId,
        input.chapterNumber,
        input.title,
        'final',
        {
          warning: auditedWarning,
          warningCode: auditedWarningCode,
        }
      );

      // 9. 更新状态（合并 manifest 保存，versionToken 仅增 1）
      this.#updateStateAfterChapter(
        input.bookId,
        input.chapterNumber,
        input.title,
        auditedContent,
        manifest
      );

      return {
        success: true,
        bookId: input.bookId,
        chapterNumber: input.chapterNumber,
        content: auditedContent,
        status: 'final',
        warning: auditedWarning,
        warningCode: auditedWarningCode,
        persisted: true,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        bookId: input.bookId,
        chapterNumber: input.chapterNumber,
        error: `章节创作失败: ${message}`,
      };
    } finally {
      this.stateManager.releaseBookLock(input.bookId);
    }
  }

  // ── writeDraft ────────────────────────────────────────────────

  /**
   * 草稿模式：生成草稿并持久化，跳过审计修订。
   */
  async writeDraft(input: WriteDraftInput): Promise<ChapterResult> {
    if (!this.stateStore.hasState(input.bookId)) {
      return {
        success: false,
        bookId: input.bookId,
        chapterNumber: input.chapterNumber,
        error: `书籍「${input.bookId}」不存在`,
      };
    }

    this.stateManager.acquireBookLock(input.bookId, 'writeDraft');

    try {
      // 获取书籍元数据以构建高质量 prompt
      const metaPath = this.stateManager.getBookPath(input.bookId, 'meta.json');
      const meta = fs.existsSync(metaPath)
        ? (JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as {
            genre: string;
            title: string;
            synopsis: string;
          })
        : { genre: input.genre, title: input.title, synopsis: '' };

      // 构建简化的 ChapterPlan 供 prompt 使用
      const draftPlan: ChapterPlan = {
        chapterNumber: input.chapterNumber,
        title: input.title,
        intention: input.sceneDescription,
        wordCountTarget: 3000,
        characters: [],
        keyEvents: [input.sceneDescription],
        hooks: [],
        worldRules: [],
        emotionalBeat: '平稳推进',
        sceneTransition: '自然过渡',
        openingHook: '',
        closingHook: '',
        sceneBreakdown: [],
        characterGrowthBeat: '',
        hookActions: [],
        pacingTag: 'slow_build' as const,
      };

      const prompt = this.#buildAgentDraftPrompt(
        {
          bookId: input.bookId,
          chapterNumber: input.chapterNumber,
          title: input.title,
          genre: input.genre,
          userIntent: input.sceneDescription,
        },
        draftPlan,
        input.bookContext ?? input.previousChapterContent?.substring(0, 500) ?? '',
        meta.synopsis ?? ''
      );
      const result = await this.provider.generate({ prompt, agentName: 'Writer' });
      this.#trackUsage(input.bookId, input.chapterNumber, 'writer', result.usage);

      // 持久化（原子写入）
      this.#persistChapterAtomic(
        result.text,
        input.bookId,
        input.chapterNumber,
        input.title,
        'draft'
      );

      // 更新状态
      this.#updateStateAfterChapter(input.bookId, input.chapterNumber, input.title, result.text);

      return {
        success: true,
        bookId: input.bookId,
        chapterNumber: input.chapterNumber,
        content: result.text,
        status: 'draft',
        usage: result.usage,
        persisted: true,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        bookId: input.bookId,
        chapterNumber: input.chapterNumber,
        error: `草稿生成失败: ${message}`,
      };
    } finally {
      this.stateManager.releaseBookLock(input.bookId);
    }
  }

  // ── writeFastDraft ────────────────────────────────────────────

  /**
   * 快速试写：仅调用 ScenePolisher，不持久化。
   */
  async writeFastDraft(input: WriteDraftInput): Promise<ChapterResult> {
    try {
      // PRD-022a: 先生成初稿，再通过 ScenePolisher 润色
      const prompt = this.#buildDraftPrompt(input);
      const draftResult = await this.provider.generate({ prompt, agentName: 'Writer' });
      this.#trackUsage(input.bookId, input.chapterNumber, 'writer', draftResult.usage);

      // ScenePolisher 润色
      const polisher = new ScenePolisher(this.provider);
      const polishedResult = await polisher.execute({
        bookId: input.bookId,
        chapterId: input.chapterNumber,
        promptContext: {
          input: {
            draftContent: draftResult.text,
            chapterNumber: input.chapterNumber,
            genre: input.genre ?? '',
          },
        },
      });

      const totalUsage = {
        promptTokens:
          (draftResult.usage?.promptTokens ?? 0) + (polishedResult.usage?.promptTokens ?? 0),
        completionTokens:
          (draftResult.usage?.completionTokens ?? 0) +
          (polishedResult.usage?.completionTokens ?? 0),
        totalTokens:
          (draftResult.usage?.totalTokens ?? 0) + (polishedResult.usage?.totalTokens ?? 0),
      };

      const fastPolishData = polishedResult.data;
      const fastPolishedContent =
        polishedResult.success &&
        fastPolishData &&
        typeof fastPolishData === 'object' &&
        'polishedContent' in fastPolishData
          ? (fastPolishData as { polishedContent: string }).polishedContent
          : draftResult.text;

      return {
        success: polishedResult.success,
        bookId: input.bookId,
        chapterNumber: input.chapterNumber,
        content: polishedResult.success ? fastPolishedContent : draftResult.text,
        status: 'draft',
        usage: totalUsage,
        persisted: false,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        bookId: input.bookId,
        chapterNumber: input.chapterNumber,
        error: `快速草稿生成失败: ${message}`,
      };
    }
  }

  // ── upgradeDraft ────────────────────────────────────────────

  /**
   * 草稿转正：检测上下文漂移，重新润色后持久化为正式章节。
   */
  async upgradeDraft(input: UpgradeDraftInput): Promise<ChapterResult> {
    if (input.chapterNumber < 1) {
      return {
        success: false,
        bookId: input.bookId,
        chapterNumber: input.chapterNumber,
        error: '章节号必须从 1 开始',
      };
    }

    // 检查书籍是否存在
    const metaPath = this.stateManager.getBookPath(input.bookId, 'meta.json');
    if (!fs.existsSync(metaPath)) {
      return {
        success: false,
        bookId: input.bookId,
        chapterNumber: input.chapterNumber,
        error: `书籍「${input.bookId}」不存在`,
      };
    }

    // 检查草稿章节是否存在
    const chapterPath = this.stateManager.getChapterFilePath(input.bookId, input.chapterNumber);
    if (!fs.existsSync(chapterPath)) {
      return {
        success: false,
        bookId: input.bookId,
        chapterNumber: input.chapterNumber,
        error: `第 ${input.chapterNumber} 章草稿不存在`,
      };
    }

    // 读取草稿内容，用正则精确匹配开头 frontmatter（避免正文中的 --- 误截断）
    const rawContent = fs.readFileSync(chapterPath, 'utf-8');
    const draftContent = stripFrontmatter(rawContent);

    // 获取书籍元数据
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as { genre: string; title: string };

    // 检测版本漂移：此草稿之后是否已有新章节写入
    const manifest = this.stateStore.loadManifest(input.bookId);
    const chaptersAhead = manifest.lastChapterWritten - input.chapterNumber;
    let driftWarning =
      chaptersAhead > 0
        ? `⚠️ 检测到上下文漂移：草稿写作后已写入 ${chaptersAhead} 章新内容，已重新对齐`
        : undefined;

    // PRD-024a: 真相文件 versionToken 比对，检测手动修改
    const truthFilesPath = this.stateManager.getBookPath(input.bookId, 'story', 'state', 'truths');
    if (fs.existsSync(truthFilesPath)) {
      const truthFiles = ['characters.json', 'facts.json', 'hooks.json', 'world-rules.json'];
      for (const file of truthFiles) {
        const filePath = path.join(truthFilesPath, file);
        if (fs.existsSync(filePath)) {
          try {
            const truthData = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as {
              versionToken?: number;
            };
            if (truthData.versionToken && truthData.versionToken > manifest.versionToken) {
              driftWarning = `⚠️ 检测到真相文件 ${file} 在草稿之后被手动修改（versionToken: ${truthData.versionToken} > ${manifest.versionToken}），已重新对齐上下文`;
              break;
            }
          } catch {
            // ignore parse errors
          }
        }
      }
    }

    // 获取锁
    this.stateManager.acquireBookLock(input.bookId, 'upgradeDraft');

    try {
      // 重新生成上下文卡片（使用 ContextCard Agent）
      const contextCardAgent = new ContextCard(this.provider);
      const contextDataSources: ContextDataSources = {
        getManifest: async () => this.stateStore.loadManifest(input.bookId),
        getPreviousChapterSummary: async (chapterNum: number) => {
          if (chapterNum < 1) return '';
          return this.#readChapterSummary(input.bookId, chapterNum);
        },
        getChapterContext: async (chapterNum: number) => {
          return this.#readChapterContent(input.bookId, chapterNum);
        },
      };

      const contextCardResult = await contextCardAgent.execute({
        bookId: input.bookId,
        chapterId: input.chapterNumber,
        promptContext: {
          input: {
            bookId: input.bookId,
            chapterNumber: input.chapterNumber,
            title: '',
            genre: meta.genre,
          } as ContextCardInput,
          sources: contextDataSources,
        },
      });
      this.#trackUsage(input.bookId, input.chapterNumber, 'planner', contextCardResult.usage);

      const contextCard =
        contextCardResult.success &&
        contextCardResult.data &&
        typeof contextCardResult.data === 'object'
          ? (contextCardResult.data as ContextCardOutput)
          : null;

      // 意图定向（如果有用户意图，使用 IntentDirector Agent 指导润色方向）
      let intentGuidance: string | undefined;
      if (input.userIntent) {
        const intentAgent = new IntentDirector(this.provider);
        const currentManifest = this.stateStore.loadManifest(input.bookId);
        const characterProfiles = currentManifest.characters.map((c) => ({
          name: c.name,
          role: c.role,
          traits: Array.isArray(c.traits)
            ? c.traits
            : typeof c.traits === 'string'
              ? [c.traits]
              : [],
        }));

        const intentResult = await intentAgent.execute({
          bookId: input.bookId,
          chapterId: input.chapterNumber,
          promptContext: {
            input: {
              userIntent: input.userIntent,
              chapterNumber: input.chapterNumber,
              genre: meta.genre,
              previousChapterSummary: contextCard?.previousChapterSummary ?? '',
              outlineContext: contextCard?.formattedText ?? '',
              characterProfiles,
            } as IntentInput,
          },
        });

        if (intentResult.success && intentResult.data) {
          const intent = intentResult.data as IntentOutput;
          intentGuidance = intent.styleNotes || intent.narrativeGoal;
        }
        this.#trackUsage(input.bookId, input.chapterNumber, 'planner', intentResult.usage);
      }

      // 使用 ScenePolisher 重新润色草稿（注入上下文卡片和意图指引）
      const polisher = new ScenePolisher(this.provider);
      const polishResult = await polisher.execute({
        bookId: input.bookId,
        chapterId: input.chapterNumber,
        promptContext: {
          input: {
            draftContent,
            chapterNumber: input.chapterNumber,
            title: '',
            genre: meta.genre,
            intentGuidance,
            contextCard: contextCard
              ? {
                  characters: contextCard.characters,
                  hooks: contextCard.hooks,
                  facts: contextCard.facts,
                  worldRules: contextCard.worldRules,
                  previousChapterSummary: contextCard.previousChapterSummary,
                  formattedText: contextCard.formattedText,
                }
              : undefined,
          } as ScenePolishInput,
        },
      });
      this.#trackUsage(input.bookId, input.chapterNumber, 'composer', polishResult.usage);

      const polishedResultData = polishResult.data;
      const polishedContent =
        polishResult.success &&
        polishedResultData &&
        typeof polishedResultData === 'object' &&
        'polishedContent' in polishedResultData
          ? (polishedResultData as { polishedContent: string }).polishedContent
          : draftContent;

      // 持久化为正式章节（原子写入 + 审计修订）
      // 先进行世界规则检查
      const ruleViolations = await this.#checkWorldRules(
        polishedContent,
        input.chapterNumber,
        contextCard?.worldRules ?? []
      );

      // 轻量审计修订：若世界规则有违规，进行一次修订
      let finalContent = polishedContent;
      let finalWarning = driftWarning;
      let finalWarningCode: 'context_drift' | 'accept_with_warnings' | undefined = driftWarning
        ? 'context_drift'
        : undefined;

      if (ruleViolations.length > 0) {
        try {
          const revisePrompt = `请根据以下世界规则违规修订章节内容：

## 世界规则违规
${ruleViolations.map((v) => `- ${v}`).join('\n')}

## 当前内容
${polishedContent}

请修订后输出完整正文。`;

          const reviseResult = await this.provider.generate({ prompt: revisePrompt });
          finalContent = reviseResult.text;
          this.#trackUsage(input.bookId, input.chapterNumber, 'reviser', reviseResult.usage);
        } catch (err) {
          finalWarning =
            (finalWarning ? finalWarning + '；' : '') +
            `世界规则修订失败: ${err instanceof Error ? err.message : String(err)}`;
          finalWarningCode = finalWarningCode ?? 'accept_with_warnings';
        }
      }

      // 原子持久化为正式章节
      const title = meta.title || `第 ${input.chapterNumber} 章`;
      this.#persistChapterAtomic(finalContent, input.bookId, input.chapterNumber, title, 'final', {
        warning: finalWarning,
        warningCode: finalWarningCode,
      });

      // 更新状态
      this.#updateStateAfterChapter(input.bookId, input.chapterNumber, title, finalContent);

      return {
        success: true,
        bookId: input.bookId,
        chapterNumber: input.chapterNumber,
        content: finalContent,
        status: 'final',
        warning: finalWarning,
        warningCode: finalWarningCode,
        usage: polishResult.usage,
        persisted: true,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        bookId: input.bookId,
        chapterNumber: input.chapterNumber,
        error: `草稿转正失败: ${message}`,
      };
    } finally {
      this.stateManager.releaseBookLock(input.bookId);
    }
  }

  // ── writeNextChapter ──────────────────────────────────────────

  /**
   * 写下一章：完整链路（15 步：意图→上下文→记忆→草稿→审计→修订→持久化）。
   * 是 composeChapter 的别名，提供更直观的 API 名称。
   */
  async writeNextChapter(input: WriteNextChapterInput): Promise<ChapterResult> {
    return this.composeChapter(input);
  }

  // ── auditDraft ────────────────────────────────────────────────

  /**
   * 连续性审计：33 维审计 + 9 类 AI 检测。
   * 独立方法，供外部直接调用或与 reviseDraft 组合使用。
   */
  async auditDraft(input: AuditDraftInput): Promise<AuditResult> {
    try {
      // 33 维连续性审计
      const auditReport = await this.#runContinuityAudit(
        input.content,
        input.bookId,
        input.chapterNumber,
        input.genre
      );

      // 9 类 AI 检测
      const aiTrace = await this.#runAIDetection(input.content, input.genre);

      // 合并评分
      const overallScore = Math.round((auditReport.overallScore + (1 - aiTrace) * 100) / 2);
      const overallStatus = overallScore >= 80 ? 'pass' : overallScore >= 60 ? 'warning' : 'fail';

      return {
        success: true,
        bookId: input.bookId,
        chapterNumber: input.chapterNumber,
        overallScore,
        overallStatus,
        issues: auditReport.issues,
        summary: auditReport.summary,
        aiTraceScore: aiTrace,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        bookId: input.bookId,
        chapterNumber: input.chapterNumber,
        overallScore: 0,
        overallStatus: 'fail',
        issues: [],
        summary: `审计失败: ${message}`,
      };
    }
  }

  // ── reviseDraft ───────────────────────────────────────────────

  /**
   * 按审计结果修订章节：调用 RevisionLoop，含 maxRevisionRetries 和降级路径。
   */
  async reviseDraft(input: ReviseDraftInput): Promise<ChapterResult> {
    try {
      const loop = new RevisionLoop({
        provider: this.provider,
        maxRevisionRetries: this.maxRevisionRetries,
        fallbackAction: this.fallbackAction,
      });

      const result = await loop.run({
        content: input.content,
        bookId: input.bookId,
        chapterNumber: input.chapterNumber,
        genre: input.genre,
      });

      const success = result.action === 'accepted';
      const warning =
        result.action === 'accepted_with_warnings'
          ? `修订后仍存在问题，已降级接受: ${result.warnings.join('; ')}`
          : undefined;
      const warningCode =
        result.action === 'accepted_with_warnings' ? 'accept_with_warnings' : undefined;

      return {
        success,
        bookId: input.bookId,
        chapterNumber: input.chapterNumber,
        content: result.content,
        status: 'final',
        warning,
        warningCode,
        error: result.action === 'paused' ? '修订触发降级暂停，需要人工介入' : undefined,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        bookId: input.bookId,
        chapterNumber: input.chapterNumber,
        error: `修订失败: ${message}`,
      };
    }
  }

  // ── mergeChapters / splitChapter ──────────────────────────────

  /**
   * 合并两个相邻章节：委托给 ChapterRestructurer。
   */
  async mergeChapters(input: MergeChaptersInput): Promise<RestructureResult> {
    try {
      const restructurer = new ChapterRestructurer({
        rootDir: this.stateManager.getBookPath(input.bookId).replace(/[^/\\]+$/, ''),
        provider: this.provider,
      });
      return restructurer.mergeChapters(input);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        operation: 'merge',
        bookId: input.bookId,
        resultChapterNumber: input.fromChapter,
        error: `合并章节失败: ${message}`,
      };
    }
  }

  /**
   * 拆分章节：委托给 ChapterRestructurer。
   */
  async splitChapter(input: SplitChapterInput): Promise<RestructureResult> {
    try {
      const restructurer = new ChapterRestructurer({
        rootDir: this.stateManager.getBookPath(input.bookId).replace(/[^/\\]+$/, ''),
        provider: this.provider,
      });
      return restructurer.splitChapter(input);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        operation: 'split',
        bookId: input.bookId,
        resultChapterNumber: input.chapter,
        error: `拆分章节失败: ${message}`,
      };
    }
  }

  // ── Internal: Audit Helpers ───────────────────────────────────

  /**
   * 33 维连续性审计：通过 LLM 对角色一致性、时间线、伏笔推进等维度评分。
   */
  async #runContinuityAudit(
    content: string,
    bookId: string,
    chapterNumber: number,
    genre: string
  ): Promise<{
    overallScore: number;
    overallStatus: string;
    issues: RunnerAuditIssue[];
    summary: string;
  }> {
    const manifest = this.stateStore.loadManifest(bookId);

    const prompt = `你是一位专业的网络小说质量审计师。请对以下章节进行 33 维连续性审计。

## 章节信息
- 章节: 第 ${chapterNumber} 章
- 题材: ${genre}

## 角色设定
${manifest.characters.map((c) => `- ${c.name}(${c.role}): ${Array.isArray(c.traits) ? c.traits.join('、') : c.traits}`).join('\n') || '无角色数据'}

## 活跃伏笔
${
  manifest.hooks
    .filter((h) => ['open', 'progressing'].includes(h.status))
    .map((h) => `- [${h.priority}] ${h.description}`)
    .join('\n') || '无活跃伏笔'
}

## 世界规则
${manifest.worldRules.map((r) => `- [${r.category}] ${r.rule}`).join('\n') || '无世界规则'}

## 章节内容（前 5000 字）
${content.slice(0, 5000)}

请以 JSON 格式输出审计报告：
{
  "overallScore": 0-100的数字,
  "overallStatus": "pass|warning|fail",
  "issues": [{"severity": "blocker|warning|suggestion", "dimension": "审计维度", "description": "问题描述"}],
  "summary": "一句话总结"
}`;

    try {
      const report = await this.provider.generateJSON<{
        overallScore: number;
        overallStatus: string;
        issues: Array<{ severity: string; dimension: string; description: string }>;
        summary: string;
      }>({ prompt, agentName: 'Auditor' });

      return {
        overallScore: report.overallScore ?? 70,
        overallStatus: report.overallStatus ?? 'warning',
        issues: (report.issues ?? []).map((i) => ({
          severity: (i.severity as RunnerAuditIssue['severity']) || 'warning',
          dimension: i.dimension || 'general',
          description: i.description,
        })),
        summary: report.summary || '审计完成',
      };
    } catch {
      return {
        overallScore: 70,
        overallStatus: 'warning',
        issues: [],
        summary: '审计调用失败，使用默认评分',
      };
    }
  }

  /**
   * 9 类 AI 检测：AI 套话、句式单调、元叙事、意象重复等。
   * 返回 AI 痕迹分数（0-1，越低越好）。
   */
  async #runAIDetection(content: string, _genre: string): Promise<number> {
    const prompt = `你是一位 AI 文本检测专家。请检测以下文本中的人工智能生成痕迹。

## 检测维度
1. AI 套话模式（"不可否认"、"值得注意的是"等）
2. 句式单调（句子长度/结构过于一致）
3. 元叙事（作者直接介入评论）
4. 意象重复（相同意象反复出现）
5. 语义重复（同义反复）
6. 逻辑跳跃（缺乏过渡）
7. 情感虚假（情感描写不自然）
8. 描述空洞（缺乏具体细节）
9. 过渡生硬（场景切换不自然）

## 待检测文本
${content.slice(0, 5000)}

请返回 0-1 之间的数字表示 AI 痕迹程度（0=完全自然，1=明显 AI 生成）。只返回数字，不要其他内容。`;

    try {
      const result = await this.provider.generate({ prompt, agentName: 'Auditor' });
      const score = parseFloat(result.text.trim());
      return Number.isFinite(score) ? Math.max(0, Math.min(1, score)) : 0.15;
    } catch {
      return 0.15;
    }
  }

  // ── Internal: Telemetry ───────────────────────────────────────

  #trackUsage(
    bookId: string,
    chapterNumber: number,
    channel: TelemetryChannel,
    usage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined
  ): void {
    if (!usage) return;
    this.telemetryLogger.record(bookId, chapterNumber, channel, usage);
  }

  // ── Internal: Prompts ─────────────────────────────────────────

  #buildDraftPrompt(input: WriteDraftInput): string {
    return `你是一位专业的网络小说作家。请根据以下信息撰写章节内容。

## 基本信息
- **章节**: 第 ${input.chapterNumber} 章 — ${input.title}
- **题材**: ${input.genre}
- **场景描述**: ${input.sceneDescription}
${input.previousChapterContent ? `\n## 上一章内容参考\n${input.previousChapterContent.substring(0, 500)}` : ''}
${(input as WriteDraftInput & { bookContext?: string }).bookContext ? `\n## 书籍上下文\n${(input as WriteDraftInput & { bookContext?: string }).bookContext}` : ''}

## 要求
1. 保持情节连贯性
2. 角色对话自然生动
3. 场景描写具体有画面感
4. 注意段落节奏，张弛有度
5. 保持题材风格统一

请直接输出正文内容。`;
  }

  /**
   * ChapterExecutor 的 generateScene 回调使用的 prompt 构建方法。
   * 注入完整上下文卡片、章节计划、作品简介。
   */
  #buildAgentDraftPrompt(
    input: WriteNextChapterInput,
    plan: ChapterPlan,
    contextText: string,
    brief: string
  ): string {
    const genreStyle = GENRE_WRITER_STYLE_MAP[input.genre] ?? '场景描写具体有画面感，对话自然生动';

    // 防御性取值：plan 的数组字段可能因旧数据或降级路径而不完整
    const characters = Array.isArray(plan.characters) ? plan.characters : [];
    const keyEvents = Array.isArray(plan.keyEvents) ? plan.keyEvents : [];
    const hooks = Array.isArray(plan.hooks) ? plan.hooks : [];
    const worldRules = Array.isArray(plan.worldRules) ? plan.worldRules : [];
    const sceneBreakdown = Array.isArray(plan.sceneBreakdown) ? plan.sceneBreakdown : [];
    const hookActions = Array.isArray(plan.hookActions) ? plan.hookActions : [];

    // 构建场景分解指令（如果有）
    let sceneInstructions = '';
    if (sceneBreakdown.length > 0) {
      sceneInstructions = `
### 场景分解（按此结构写作，每个场景必须写到指定字数）
${sceneBreakdown
  .map(
    (s, i) => `**场景${i + 1}：${s.title}**（约${s.wordCount}字）
  - 内容：${s.description}
  - 出场：${Array.isArray(s.characters) ? s.characters.join('、') || '无特定角色' : '无特定角色'}
  - 调性：${s.mood}`
  )
  .join('\n\n')}`;
    }

    // 构建伏笔动作指令
    let hookInstructions = '';
    if (hookActions.length > 0) {
      const actionLabels: Record<string, string> = {
        plant: '埋设',
        advance: '推进',
        payoff: '回收',
      };
      hookInstructions = `
### 伏笔动作（必须执行）
${hookActions.map((h) => `- [${actionLabels[h.action] ?? h.action}] ${h.description}`).join('\n')}`;
    }

    return `你是一位资深网络小说作家。请根据以下完整信息撰写章节正文。

## 上下文卡片
${contextText}

## 作品简介
${brief}

## 章节计划
- **章节**: 第 ${input.chapterNumber} 章 — ${plan.title}
- **本章意图**: ${plan.intention}
- **目标字数**: ${plan.wordCountTarget} 字（必须达到）
- **出场角色（仅限以下角色，禁止引入任何未列出的角色）**: ${characters.join('、') || '无'}
- **关键事件**:
${keyEvents.map((e) => `  - ${e}`).join('\n') || '  无'}
${hooks.length > 0 ? `- **伏笔（须自然融入情节，不可生硬点明）**:\n${hooks.map((h) => `  - [${h.priority}] ${h.description}`).join('\n')}` : ''}
${worldRules.length > 0 ? `- **世界观设定（正文须严格遵循，不可违反任何规则）**:\n${worldRules.map((r) => `  - ${r}`).join('\n')}` : ''}
- **情感节拍**: ${plan.emotionalBeat}
- **场景过渡**: ${plan.sceneTransition}
${plan.openingHook ? `- **开篇钩子**: ${plan.openingHook}` : ''}
${plan.closingHook ? `- **结尾悬念**: ${plan.closingHook}` : ''}
${plan.characterGrowthBeat ? `- **主角成长点**: ${plan.characterGrowthBeat}` : ''}
${plan.pacingTag ? `- **叙事节奏**: ${plan.pacingTag}` : ''}
${sceneInstructions}
${hookInstructions}

## 用户意图
${input.userIntent}

## 写作要求

### 硬性约束
1. **字数要求**：正文必须达到 ${plan.wordCountTarget} 字。如果内容不足，请增加场景细节、角色心理活动、对话交锋、环境描写等，而非空泛概括
2. **角色约束**：只允许使用"出场角色"列表中的角色。如需路人/龙套，用"小二""士兵"等泛称，不可为其取具名
3. **设定约束**：严格遵守世界观设定中的每一条规则。如有金手指/特殊能力，必须按规则描写其运作方式，不可自由发挥
4. **情节约束**：按照关键事件推进情节，不可跳过或替换
5. **场景约束**：如果上方有"场景分解"，必须按场景顺序写作，每个场景写到指定字数后再进入下一个
6. **伏笔约束**：如果上方有"伏笔动作"，必须在本章正文中执行，但须自然融入，不可生硬点明

### 文风要求
${genreStyle}

### 质量要求
1. 场景描写须有画面感——用感官细节（视觉、听觉、触觉、嗅觉）构建沉浸感
2. 角色对话须符合其身份和性格——不同角色的说话方式应有区分度
3. 叙事节奏张弛有度——紧张场景用短句和动作描写，舒缓场景用长句和心理描写
4. 避免"总结式叙述"——不要用"经过一番努力""在接下来的日子里"等概括，而是写具体场景
5. 开篇须有钩子——用悬念、冲突或画面直接抓住读者，不要缓慢铺陈

请直接输出正文内容，不要输出章节标题或其他格式标记。`;
  }

  /**
   * 根据章节号定位大纲中所属卷/幕，构建卷级上下文。
   * 如果大纲为空或无法定位，回退到 fallback 文本。
   */
  #buildOutlineContext(
    outline: Array<{
      actNumber: number;
      title: string;
      summary: string;
      chapters: Array<{ chapterNumber: number; title: string; summary: string }>;
    }>,
    chapterNumber: number,
    fallback: string,
    bookId: string
  ): string {
    if (!outline || outline.length === 0) return fallback;

    const isLongForm = outline.length > 3;
    const volumeLabel = isLongForm ? '卷' : '幕';

    // 读取书籍元数据中的总章节数和总字数
    const bookPath = this.stateManager.getBookPath(bookId, 'book.json');
    let totalChapters = 0;
    let totalWords = 0;
    if (fs.existsSync(bookPath)) {
      try {
        const bookData = JSON.parse(fs.readFileSync(bookPath, 'utf-8')) as Record<string, unknown>;
        totalChapters = (bookData.targetChapterCount as number) ?? 0;
        totalWords = (bookData.targetWords as number) ?? 0;
      } catch {
        /* ignore */
      }
    }
    const isSuperLong = totalChapters > 100 || totalWords > 1000000;

    // 定位所属卷：找到包含该章节号的卷，或最接近的卷
    let targetAct = outline[0];
    for (const act of outline) {
      const chapterNums = (act.chapters ?? []).map((ch) => ch.chapterNumber);
      if (chapterNums.includes(chapterNumber)) {
        targetAct = act;
        break;
      }
      // 如果章节号在两卷之间，归入前卷
      if (chapterNums.length > 0 && chapterNums[0] <= chapterNumber) {
        targetAct = act;
      }
    }

    const lines: string[] = [];

    // 全书规模信息
    if (isSuperLong) {
      lines.push(`## 全书规模提示`);
      lines.push(
        `本书规划 ${totalChapters > 0 ? totalChapters : '大量'} 章、${totalWords > 0 ? `${totalWords / 10000}万字` : '超百万字'}长篇。当前正在写第 ${chapterNumber} 章。`
      );
      if (isLongForm) {
        lines.push(
          `大纲为多卷结构，每卷约 ${Math.ceil((totalChapters || 1667) / outline.length)} 章。`
        );
      } else {
        lines.push(
          `大纲为三幕概要，每幕实际覆盖约 ${Math.ceil((totalChapters || 1667) / 3)} 章。第 ${chapterNumber} 章处于开篇阶段，应注重铺垫而非快进到高潮。`
        );
      }
      lines.push('');
    }

    // 全书大纲概览
    lines.push(`## 全书${isLongForm ? '多卷' : '三幕'}结构（共 ${outline.length} ${volumeLabel}）`);
    for (const act of outline) {
      const marker = act.actNumber === targetAct.actNumber ? ' ← 当前' : '';
      lines.push(`- 第${act.actNumber}${volumeLabel} ${act.title}${marker}`);
    }
    lines.push('');

    // 当前卷详细信息
    lines.push(`## 当前第${targetAct.actNumber}${volumeLabel}：${targetAct.title}`);
    lines.push(targetAct.summary);
    lines.push('');

    if (targetAct.chapters && targetAct.chapters.length > 0) {
      lines.push(`### 本${volumeLabel}关键章节`);
      // 判断当前章节是否命中某个 beat
      let hitBeat = false;
      for (const ch of targetAct.chapters) {
        const marker = ch.chapterNumber === chapterNumber ? ' ← 本章' : '';
        lines.push(`- 第${ch.chapterNumber}章 ${ch.title}：${ch.summary}${marker}`);
        if (ch.chapterNumber === chapterNumber) hitBeat = true;
      }
      // 如果当前章节不在任何 beat 中，找到最近的前后 beat 提供定位参考
      if (!hitBeat) {
        const beats = targetAct.chapters;
        let prevBeat: (typeof beats)[0] | undefined;
        let nextBeat: (typeof beats)[0] | undefined;
        for (const b of beats) {
          if (b.chapterNumber <= chapterNumber) prevBeat = b;
          if (b.chapterNumber > chapterNumber && !nextBeat) nextBeat = b;
        }
        lines.push('');
        lines.push(`### 本章叙事定位（第 ${chapterNumber} 章不在大纲关键章节中，以下为最近参考）`);
        if (prevBeat) {
          lines.push(
            `- 前一个关键节点：第${prevBeat.chapterNumber}章「${prevBeat.title}」— ${prevBeat.summary}`
          );
        }
        if (nextBeat) {
          lines.push(
            `- 后一个关键节点：第${nextBeat.chapterNumber}章「${nextBeat.title}」— ${nextBeat.summary}`
          );
        }
        if (prevBeat && nextBeat) {
          lines.push(
            `- 当前章节应承前启后：承接前节点余波，为后节点铺垫，同时推进本卷概要中的叙事目标`
          );
        } else if (prevBeat && !nextBeat) {
          lines.push(
            `- 当前章节是本卷最后关键节点之后的延展，应逐步收束本卷线索，为下一卷过渡做准备`
          );
        } else if (!prevBeat && nextBeat) {
          lines.push(`- 当前章节处于本卷开篇，应为即将到来的第一个关键节点做充分铺垫`);
        }
      }
      lines.push('');
    }

    // 前后卷概要（如有）
    const prevAct = outline.find((a) => a.actNumber === targetAct.actNumber - 1);
    const nextAct = outline.find((a) => a.actNumber === targetAct.actNumber + 1);
    if (prevAct) {
      lines.push(`### 上一${volumeLabel}：${prevAct.title}`);
      lines.push(prevAct.summary);
      lines.push('');
    }
    if (nextAct) {
      lines.push(`### 下一${volumeLabel}：${nextAct.title}`);
      lines.push(nextAct.summary);
    }

    return lines.join('\n');
  }

  /**
   * 读取上一章摘要（取章节内容前 300 字作为摘要）
   */
  #readChapterSummary(bookId: string, chapterNumber: number): string {
    const content = this.#readChapterContent(bookId, chapterNumber);
    if (!content) return '';
    return content.substring(0, 300) + (content.length > 300 ? '…' : '');
  }

  /**
   * 读取章节正文内容（去除 frontmatter）
   */
  #readChapterContent(bookId: string, chapterNumber: number): string {
    const filePath = this.stateManager.getChapterFilePath(bookId, chapterNumber);
    if (!fs.existsSync(filePath)) return '';
    const raw = fs.readFileSync(filePath, 'utf-8');
    return stripFrontmatter(raw);
  }

  // ── Internal: Pipeline Steps ──────────────────────────────────

  // PRD-014: 世界规则执行检查
  async #checkWorldRules(
    content: string,
    chapterNumber: number,
    rules: Array<{ id: string; category: string; rule: string; exceptions: string[] }>
  ): Promise<string[]> {
    if (rules.length === 0) return [];

    const prompt = `你是一位世界规则审核员。请检查以下章节内容是否违反了设定的世界规则。

## 世界规则
${rules.map((r) => `- [${r.category}] ${r.rule}`).join('\n')}

## 章节内容（第${chapterNumber}章）
${content.slice(0, 3000)}

请逐条检查规则，返回违规列表（JSON 数组格式），如果没有违规返回空数组 []。
每个违规项格式：{ "ruleId": "规则ID", "violation": "违规描述" }`;

    try {
      const result = await this.provider.generateJSON<Array<{ ruleId: string; violation: string }>>(
        { prompt }
      );
      return result.map((v) => `[世界规则] ${v.violation}`);
    } catch {
      return [];
    }
  }

  async #extractMemory(
    content: string,
    bookId: string,
    chapterNumber: number
  ): Promise<Manifest | null> {
    // 使用全章节内容，分段提取（最多取前 8000 字，覆盖典型 3000 字章节）
    const contentForExtraction =
      content.length > 8000
        ? content.substring(0, 8000) + '\n...(内容过长，已截取前 8000 字)'
        : content;

    const prompt = `你是一位记忆提取师。请从以下章节内容中提取重要事实和新伏笔。

## 章节内容
${contentForExtraction}

请以 JSON 格式输出：
{
  "facts": [
    { "content": "事实内容", "category": "character|world|plot|timeline|resource", "confidence": "high|medium|low" }
  ],
  "newHooks": [],
  "updatedHooks": []
}`;

    try {
      const memoryResult = await this.provider.generateJSON<{
        facts: Array<{ content: string; category: string; confidence: string }>;
        newHooks: unknown[];
        updatedHooks: unknown[];
      }>({ prompt, agentName: 'Planner' });

      const manifest = this.stateStore.loadManifest(bookId);
      const actions = this.#buildMemoryDelta(memoryResult, manifest, chapterNumber);
      if (actions.length === 0) {
        return manifest;
      }

      const updatedManifest = applyRuntimeStateDelta(manifest, {
        actions,
        sourceAgent: 'MemoryExtractor',
        sourceChapter: chapterNumber,
      });
      this.stateStore.saveRuntimeStateSnapshot(bookId, updatedManifest);
      return updatedManifest;
    } catch (error) {
      // 记忆提取失败记录警告但不中断主流程
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(
        `[PipelineRunner] 记忆提取失败（bookId=${bookId}, chapter=${chapterNumber}）: ${msg}`
      );
      return null;
    }
  }

  #buildMemoryDelta(
    memoryResult: {
      facts: Array<{ content: string; category: string; confidence: string }>;
      newHooks: unknown[];
      updatedHooks: unknown[];
    },
    manifest: Manifest,
    chapterNumber: number
  ): Delta['actions'] {
    const now = new Date().toISOString();
    const actions: Delta['actions'] = [];

    memoryResult.facts.forEach((fact, index) => {
      const content = fact.content?.trim();
      if (!content) {
        return;
      }
      // 去重：同一事实在同一章节内视为重复，跳过
      // 同一事实在不同章节出现视为"复述验证"，提升 confidence 而非跳过
      const existingInSameChapter = manifest.facts.some(
        (existingFact) =>
          existingFact.content === content && existingFact.chapterNumber === chapterNumber
      );
      if (existingInSameChapter) {
        return;
      }

      // 如果同一内容在之前章节已存在，提升确认度
      const existingInOtherChapter = manifest.facts.find(
        (existingFact) =>
          existingFact.content === content && existingFact.chapterNumber !== chapterNumber
      );
      let finalConfidence = this.#normalizeFactConfidence(fact.confidence);
      if (existingInOtherChapter && existingInOtherChapter.confidence !== 'high') {
        finalConfidence = 'high'; // 复述验证提升至高可信度
        // 同时更新已有事实的 confidence
        actions.push({
          type: 'update_fact',
          payload: {
            id: existingInOtherChapter.id,
            confidence: 'high',
          },
        });
      }

      actions.push({
        type: 'add_fact',
        payload: {
          id: `fact-${chapterNumber}-${index + 1}`,
          content,
          chapterNumber,
          confidence: finalConfidence,
          category: this.#normalizeFactCategory(fact.category),
          createdAt: now,
        },
      });
    });

    memoryResult.newHooks.forEach((rawHook, index) => {
      const hook = rawHook as Record<string, unknown>;
      const description = String(hook.description ?? '').trim();
      if (!description) {
        return;
      }

      const hookId = String(hook.id ?? `hook-${chapterNumber}-${index + 1}`);
      if (
        manifest.hooks.some(
          (existingHook) => existingHook.id === hookId || existingHook.description === description
        )
      ) {
        return;
      }

      actions.push({
        type: 'add_hook',
        payload: {
          id: hookId,
          description,
          type: this.#normalizeHookType(hook.type),
          status: this.#normalizeHookStatus(hook.status),
          priority: this.#normalizeHookPriority(hook.priority),
          plantedChapter: chapterNumber,
          expectedResolutionMin: this.#toPositiveNumber(hook.expectedResolutionMin),
          expectedResolutionMax: this.#toPositiveNumber(hook.expectedResolutionMax),
          wakeAtChapter: this.#toPositiveNumber(hook.wakeAtChapter),
          relatedCharacters: this.#normalizeStringArray(hook.relatedCharacters),
          relatedChapters: this.#normalizeChapterArray(hook.relatedChapters, chapterNumber),
          payoffDescription:
            typeof hook.payoffDescription === 'string' ? hook.payoffDescription : undefined,
          createdAt: now,
          updatedAt: now,
        },
      });
    });

    memoryResult.updatedHooks.forEach((rawHook) => {
      const hook = rawHook as Record<string, unknown>;
      const hookId = typeof hook.id === 'string' ? hook.id : undefined;
      if (!hookId || !manifest.hooks.some((existingHook) => existingHook.id === hookId)) {
        return;
      }

      actions.push({
        type: 'update_hook',
        payload: {
          id: hookId,
          description:
            typeof hook.description === 'string' ? hook.description.trim() || undefined : undefined,
          status: this.#normalizeHookStatus(hook.status, true),
          priority: this.#normalizeHookPriority(hook.priority, true),
          wakeAtChapter: this.#toPositiveNumber(hook.wakeAtChapter),
          expectedResolutionMin: this.#toPositiveNumber(hook.expectedResolutionMin),
          expectedResolutionMax: this.#toPositiveNumber(hook.expectedResolutionMax),
          payoffDescription:
            typeof hook.payoffDescription === 'string' ? hook.payoffDescription : undefined,
          updatedAt: now,
        },
      });
    });

    return actions.map((action) => ({
      ...action,
      payload: Object.fromEntries(
        Object.entries(action.payload).filter(([, value]) => value !== undefined)
      ),
    }));
  }

  #normalizeFactCategory(category: string): Manifest['facts'][number]['category'] {
    return ['character', 'world', 'plot', 'timeline', 'resource'].includes(category)
      ? (category as Manifest['facts'][number]['category'])
      : 'plot';
  }

  #normalizeFactConfidence(confidence: string): Manifest['facts'][number]['confidence'] {
    return ['high', 'medium', 'low'].includes(confidence)
      ? (confidence as Manifest['facts'][number]['confidence'])
      : 'medium';
  }

  #normalizeHookType(type: unknown): string {
    return typeof type === 'string' && type.trim().length > 0 ? type : 'plot';
  }

  #normalizeHookStatus(
    status: unknown,
    allowUndefined: boolean = false
  ): Manifest['hooks'][number]['status'] | undefined {
    if (typeof status !== 'string') {
      return allowUndefined ? undefined : 'open';
    }
    return ['open', 'progressing', 'deferred', 'dormant', 'resolved', 'abandoned'].includes(status)
      ? (status as Manifest['hooks'][number]['status'])
      : allowUndefined
        ? undefined
        : 'open';
  }

  #normalizeHookPriority(
    priority: unknown,
    allowUndefined: boolean = false
  ): Manifest['hooks'][number]['priority'] | undefined {
    if (typeof priority !== 'string') {
      return allowUndefined ? undefined : 'minor';
    }
    return ['critical', 'major', 'minor'].includes(priority)
      ? (priority as Manifest['hooks'][number]['priority'])
      : allowUndefined
        ? undefined
        : 'minor';
  }

  #normalizeStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter(
      (item): item is string => typeof item === 'string' && item.trim().length > 0
    );
  }

  #normalizeChapterArray(value: unknown, fallbackChapter: number): number[] {
    if (!Array.isArray(value)) {
      return [fallbackChapter];
    }
    const chapters = value.filter(
      (item): item is number => typeof item === 'number' && Number.isInteger(item) && item > 0
    );
    return chapters.length > 0 ? chapters : [fallbackChapter];
  }

  #toPositiveNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
  }

  #findChapterEntry(
    chapters: ChapterIndexEntry[],
    chapterNumber: number
  ): ChapterIndexEntry | undefined {
    return chapters.find((chapter) => {
      const legacyChapter = chapter as ChapterIndexEntry & { chapterNumber?: number };
      return chapter.number === chapterNumber || legacyChapter.chapterNumber === chapterNumber;
    });
  }

  #normalizeChapterEntry(
    chapter: ChapterIndexEntry,
    chapterNumber: number,
    title: string | null,
    wordCount: number
  ): void {
    const legacyChapter = chapter as ChapterIndexEntry & {
      chapterNumber?: number;
      status?: string;
      writtenAt?: string;
      plannedAt?: string;
    };
    chapter.number = chapterNumber;
    chapter.title = title;
    chapter.fileName = chapter.fileName || `chapter-${String(chapterNumber).padStart(4, '0')}.md`;
    chapter.wordCount = Number.isFinite(chapter.wordCount) ? chapter.wordCount : wordCount;
    chapter.createdAt = chapter.createdAt || new Date().toISOString();
    delete legacyChapter.chapterNumber;
    delete legacyChapter.status;
    delete legacyChapter.writtenAt;
    delete legacyChapter.plannedAt;
  }

  /**
   * 原子性持久化章节：使用 .tmp + fs.rename 模式保证写入原子性。
   * 崩溃时不会损坏现有文件。
   */
  #persistChapterAtomic(
    content: string,
    bookId: string,
    chapterNumber: number,
    title: string,
    status: 'draft' | 'final' = 'final',
    metadata?: {
      warning?: string;
      warningCode?: 'accept_with_warnings' | 'context_drift';
    }
  ): void {
    const targetPath = this.stateManager.getChapterFilePath(bookId, chapterNumber);
    const tmpPath = targetPath + '.tmp';

    const sanitizedWarning = metadata?.warning?.replace(/\r?\n/g, ' ').trim();
    const warningBlock = [
      metadata?.warningCode ? `warningCode: ${metadata.warningCode}` : null,
      sanitizedWarning ? `warning: ${sanitizedWarning}` : null,
    ]
      .filter((line): line is string => line !== null)
      .join('\n');

    const chapterMeta = `---
title: ${title}
chapter: ${chapterNumber}
status: ${status}
${warningBlock ? `${warningBlock}\n` : ''}createdAt: ${new Date().toISOString()}
---

`;

    try {
      // Step 1: 写入临时文件
      fs.writeFileSync(tmpPath, chapterMeta + content, 'utf-8');

      // Step 2: 原子替换（fs.rename）
      fs.renameSync(tmpPath, targetPath);
    } catch (error) {
      // 清理临时文件
      if (fs.existsSync(tmpPath)) {
        try {
          fs.unlinkSync(tmpPath);
        } catch {
          /* best effort */
        }
      }
      throw error;
    }
  }

  #updateStateAfterChapter(
    bookId: string,
    chapterNumber: number,
    title: string | null,
    content: string,
    manifestOverride?: Manifest
  ): void {
    // 更新索引
    const index = this.stateManager.readIndex(bookId);
    const existingChapter = this.#findChapterEntry(index.chapters, chapterNumber);
    if (!existingChapter) {
      const paddedChapterNumber = String(chapterNumber).padStart(4, '0');
      index.chapters.push({
        number: chapterNumber,
        title,
        fileName: `chapter-${paddedChapterNumber}.md`,
        wordCount: countChineseWords(content),
        createdAt: new Date().toISOString(),
      });
    } else {
      this.#normalizeChapterEntry(
        existingChapter,
        chapterNumber,
        title,
        countChineseWords(content)
      );
      existingChapter.wordCount = countChineseWords(content);
    }
    index.totalChapters = index.chapters.length;
    index.totalWords = index.chapters.reduce(
      (sum, chapter) => sum + (Number.isFinite(chapter.wordCount) ? chapter.wordCount : 0),
      0
    );
    index.lastUpdated = new Date().toISOString();
    this.stateManager.writeIndex(bookId, index);

    // 更新 manifest（使用传入的 manifestOverride 避免重复 I/O）
    const manifest = manifestOverride ?? this.stateStore.loadManifest(bookId);
    if (chapterNumber > manifest.lastChapterWritten) {
      manifest.lastChapterWritten = chapterNumber;
    }
    this.stateStore.saveRuntimeStateSnapshot(bookId, manifest);

    // 同步刷新投影文件和 state-hash
    const stateDir = this.stateManager.getBookPath(bookId, 'story', 'state');
    try {
      const updatedManifest = this.stateStore.loadManifest(bookId);
      // 构建章节摘要列表用于投影
      const summaries = index.chapters.map((ch) => ({
        chapter: ch.number,
        summary: ch.title ?? '',
        keyEvents: null,
        stateChanges: null,
        created_at: ch.createdAt,
      }));
      ProjectionRenderer.writeProjectionFiles(updatedManifest, stateDir, summaries);
    } catch {
      // 投影刷新失败不影响主流程
    }
  }
}
