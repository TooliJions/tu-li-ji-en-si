import * as fs from 'fs';
import { StateManager } from '../state/manager';
import { RuntimeStateStore } from '../state/runtime-store';
import { applyRuntimeStateDelta } from '../state/reducer';
import { OpenAICompatibleProvider, LLMProvider, type LLMConfig } from '../llm/provider';
import type { AgentResult } from '../agents/base';
import type { ChapterIndexEntry } from '../models/chapter';
import type { Delta, Manifest } from '../models/state';
import { TelemetryLogger, type TelemetryChannel } from '../telemetry/logger';

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
  summary?: string;
  keyEvents?: string[];
  error?: string;
}

export interface WriteDraftInput {
  bookId: string;
  chapterNumber: number;
  title: string;
  genre: string;
  sceneDescription: string;
  previousChapterContent?: string;
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

    // 保存元数据
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

    // 创建章节索引
    this.stateManager.writeIndex(input.bookId, {
      bookId: input.bookId,
      chapters: [],
      totalChapters: 0,
      totalWords: 0,
      lastUpdated: new Date().toISOString(),
    });

    return { success: true, bookId: input.bookId };
  }

  // ── planChapter ───────────────────────────────────────────────

  /**
   * 规划章节：生成章节大纲和场景规划。
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

    // 获取书籍元数据
    const metaPath = this.stateManager.getBookPath(input.bookId, 'meta.json');
    const genre = fs.existsSync(metaPath)
      ? (JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as { genre: string }).genre
      : 'unknown';

    // 加载当前状态获取上一章摘要
    const manifest = this.stateStore.loadManifest(input.bookId);
    const previousChapterSummary =
      manifest.lastChapterWritten > 0 ? '已有上一章内容' : '第一章，需要建立世界观和角色介绍';

    // 调用 OutlinePlanner
    const outlinePrompt = this.#buildOutlinePrompt(input, genre, previousChapterSummary);
    const outline = await this.provider.generateJSON<{
      chapterNumber: number;
      title: string;
      summary: string;
      keyEvents: string[];
      targetWordCount: number;
      hooks: string[];
    }>({ prompt: outlinePrompt });

    // 调用 ChapterPlanner
    const planPrompt = this.#buildChapterPlanPrompt(input, genre, outline);
    await this.provider.generateJSON<{
      scenes: Array<{ description: string; targetWords: number; mood: string }>;
      characters: string[];
      hooks: string[];
    }>({ prompt: planPrompt });

    // 更新状态：添加章节到索引
    const index = this.stateManager.readIndex(input.bookId);
    const existingChapter = this.#findChapterEntry(index.chapters, outline.chapterNumber);
    if (existingChapter) {
      this.#normalizeChapterEntry(existingChapter, outline.chapterNumber, outline.title, 0);
    } else {
      const paddedChapterNumber = String(outline.chapterNumber).padStart(4, '0');
      index.chapters.push({
        number: outline.chapterNumber,
        title: outline.title,
        fileName: `chapter-${paddedChapterNumber}.md`,
        wordCount: 0,
        createdAt: new Date().toISOString(),
      });
    }
    index.totalChapters = index.chapters.length;
    index.totalWords = index.chapters.reduce(
      (sum, chapter) => sum + (Number.isFinite(chapter.wordCount) ? chapter.wordCount : 0),
      0
    );
    index.lastUpdated = new Date().toISOString();
    this.stateManager.writeIndex(input.bookId, index);

    return {
      success: true,
      chapterNumber: outline.chapterNumber,
      title: outline.title,
      summary: outline.summary,
      keyEvents: outline.keyEvents,
    };
  }

  // ── composeChapter ────────────────────────────────────────────

  /**
   * 组合章节：从规划到草稿到润色到审计到持久化的完整流程。
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
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as { genre: string; title: string };

    // 获取锁
    this.stateManager.acquireBookLock(input.bookId, 'composeChapter');

    try {
      // 1. 生成上下文卡片
      const contextCard = await this.#generateContextCard(input.bookId, input.chapterNumber);
      // planner 频道：generateJSON 暂不返回 usage，传 undefined（不影响流程）
      this.#trackUsage(input.bookId, input.chapterNumber, 'planner', undefined);

      // 2. 意图定向
      const intent = await this.#directIntent(input, meta.genre, contextCard);
      // planner 频道：generateJSON 暂不返回 usage，传 undefined（不影响流程）
      this.#trackUsage(input.bookId, input.chapterNumber, 'planner', undefined);

      // 3. 场景生成（草稿）
      const draft = await this.#generateDraft(input, meta.genre, contextCard, intent);
      this.#trackUsage(input.bookId, input.chapterNumber, 'writer', draft.usage);
      if (!draft.success) {
        return {
          success: false,
          bookId: input.bookId,
          chapterNumber: input.chapterNumber,
          error: draft.error ?? '草稿生成失败',
        };
      }

      // 4. 场景润色
      const polished = await this.#polishScene(draft.content!, meta.genre, input.chapterNumber);
      this.#trackUsage(input.bookId, input.chapterNumber, 'composer', polished.usage);

      // 5. 质量审计 + 修订循环
      const audited = await this.#auditAndRevise(polished.content!, input, meta.genre);
      this.#trackUsage(input.bookId, input.chapterNumber, 'auditor', audited.auditorUsage);
      this.#trackUsage(input.bookId, input.chapterNumber, 'reviser', audited.reviserUsage);

      // 6. 记忆提取
      const manifestAfterMemory = await this.#extractMemory(
        audited.content!,
        input.bookId,
        input.chapterNumber
      );

      // 7. 持久化
      this.#persistChapter(audited.content!, input.bookId, input.chapterNumber, input.title, 'final', {
        warning: audited.warning,
        warningCode: audited.warningCode,
      });

      // 8. 更新状态
      this.#updateStateAfterChapter(
        input.bookId,
        input.chapterNumber,
        input.title,
        audited.content!,
        manifestAfterMemory ?? undefined
      );

      return {
        success: true,
        bookId: input.bookId,
        chapterNumber: input.chapterNumber,
        content: audited.content,
        status: 'final',
        warning: audited.warning,
        warningCode: audited.warningCode,
        usage: audited.usage,
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
      // 生成草稿
      const prompt = this.#buildDraftPrompt(input);
      const result = await this.provider.generate({ prompt });

      // 持久化
      this.#persistChapter(result.text, input.bookId, input.chapterNumber, input.title, 'draft');

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
      const prompt = this.#buildDraftPrompt(input);
      const result = await this.provider.generate({ prompt });

      return {
        success: true,
        bookId: input.bookId,
        chapterNumber: input.chapterNumber,
        content: result.text,
        status: 'draft',
        usage: result.usage,
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

    // 读取草稿内容
    const rawContent = fs.readFileSync(chapterPath, 'utf-8');
    const draftContent = rawContent.includes('---\n')
      ? rawContent.split('---\n').slice(2).join('---\n').trim()
      : rawContent;

    // 获取书籍元数据
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as { genre: string; title: string };

    // 检测版本漂移
    const manifest = this.stateStore.loadManifest(input.bookId);
    const driftWarning =
      manifest.versionToken > 1
        ? `⚠️ 检测到上下文版本变化 (v${manifest.versionToken})，已重新对齐`
        : undefined;

    // 获取锁
    this.stateManager.acquireBookLock(input.bookId, 'upgradeDraft');

    try {
      // 重新生成上下文卡片
      const contextCard = await this.#generateContextCard(input.bookId, input.chapterNumber);

      // 意图定向（如果有用户意图）
      if (input.userIntent) {
        await this.#directIntent(
          {
            bookId: input.bookId,
            chapterNumber: input.chapterNumber,
            title: '',
            genre: meta.genre,
            userIntent: input.userIntent,
          },
          meta.genre,
          contextCard
        );
      }

      // 使用 ScenePolisher 重新润色草稿
      const polished = await this.#polishScene(draftContent, meta.genre, input.chapterNumber);

      // 持久化为正式章节
      const title = meta.title || `第 ${input.chapterNumber} 章`;
      this.#persistChapter(polished.content, input.bookId, input.chapterNumber, title, 'final', {
        warning: driftWarning,
        warningCode: driftWarning ? 'context_drift' : undefined,
      });

      // 更新状态
      this.#updateStateAfterChapter(input.bookId, input.chapterNumber, title, polished.content);

      return {
        success: true,
        bookId: input.bookId,
        chapterNumber: input.chapterNumber,
        content: polished.content,
        status: 'final',
        warning: driftWarning,
        warningCode: driftWarning ? 'context_drift' : undefined,
        usage: polished.usage,
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

  // ── Internal: Telemetry ───────────────────────────────────────

  #trackUsage(
    bookId: string,
    chapterNumber: number,
    channel: TelemetryChannel,
    usage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined,
  ): void {
    if (!usage) return;
    this.telemetryLogger.record(bookId, chapterNumber, channel, usage);
  }

  // ── Internal: Prompts ─────────────────────────────────────────

  #buildOutlinePrompt(
    input: PlanChapterInput,
    genre: string,
    previousChapterSummary: string
  ): string {
    return `你是一位专业的网络小说大纲规划师。请为以下章节生成大纲。

## 基本信息
- **章节**: 第 ${input.chapterNumber} 章
- **题材**: ${genre}
- **规划上下文**: ${input.outlineContext}
- **上一章摘要**: ${previousChapterSummary}

请生成章节大纲，包含以下 JSON 格式：
{
  "chapterNumber": ${input.chapterNumber},
  "title": "章节标题",
  "summary": "章节概要（1-2句话）",
  "keyEvents": ["关键事件1", "关键事件2"],
  "targetWordCount": 3000,
  "hooks": ["涉及的伏笔ID"]
}`;
  }

  #buildChapterPlanPrompt(
    input: PlanChapterInput,
    genre: string,
    outline: { title: string; summary: string; keyEvents: string[] }
  ): string {
    return `你是一位专业的网络小说场景规划师。请根据以下大纲生成场景规划。

## 基本信息
- **章节**: 第 ${input.chapterNumber} 章 — ${outline.title}
- **题材**: ${genre}
- **章节概要**: ${outline.summary}
- **关键事件**: ${outline.keyEvents.join('、')}

请生成场景规划，包含以下 JSON 格式：
{
  "scenes": [
    { "description": "场景描述", "targetWords": 1000, "mood": "氛围" }
  ],
  "characters": ["出场角色"],
  "hooks": ["涉及的伏笔"]
}`;
  }

  #buildDraftPrompt(input: WriteDraftInput): string {
    return `你是一位专业的网络小说作家。请根据以下信息撰写章节内容。

## 基本信息
- **章节**: 第 ${input.chapterNumber} 章 — ${input.title}
- **题材**: ${input.genre}
- **场景描述**: ${input.sceneDescription}
${input.previousChapterContent ? `\n## 上一章内容参考\n${input.previousChapterContent.substring(0, 500)}` : ''}

## 要求
1. 保持情节连贯性
2. 角色对话自然生动
3. 场景描写具体有画面感
4. 注意段落节奏，张弛有度
5. 保持题材风格统一

请直接输出正文内容。`;
  }

  // ── Internal: Pipeline Steps ──────────────────────────────────

  async #generateContextCard(
    bookId: string,
    chapterNumber: number
  ): Promise<Record<string, unknown>> {
    const manifest = this.stateStore.loadManifest(bookId);

    const prompt = `你是一位上下文整理师。请根据当前小说状态生成第 ${chapterNumber} 章的上下文卡片。

## 当前状态
- **已写章节**: ${manifest.lastChapterWritten}
- **角色**: ${manifest.characters.map((c) => c.name).join('、') || '无'}
- **伏笔**: ${manifest.hooks.map((h) => `[${h.priority}] ${h.description}`).join('\n') || '无'}
- **事实**: ${manifest.facts.map((f) => f.content).join('\n') || '无'}
- **世界规则**: ${manifest.worldRules.map((r) => `[${r.category}] ${r.rule}`).join('\n') || '无'}

请以 JSON 格式输出：
{
  "summary": "上一章摘要",
  "activeHooks": ["进行中伏笔"],
  "characterStates": ["角色状态"],
  "locationContext": "当前地点"
}`;

    return this.provider.generateJSON({ prompt });
  }

  async #directIntent(
    input: WriteNextChapterInput,
    genre: string,
    contextCard: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const prompt = `你是一位意图导演。请根据用户意图和上下文，指导第 ${input.chapterNumber} 章的创作方向。

## 用户意图
${input.userIntent}

## 上下文
${JSON.stringify(contextCard, null, 2)}

## 题材
${genre}

请以 JSON 格式输出：
{
  "chapterGoal": "本章目标",
  "keyScenes": ["关键场景"],
  "emotionalArc": "情感弧线",
  "hookProgression": ["伏笔推进"]
}`;

    return this.provider.generateJSON({ prompt });
  }

  async #generateDraft(
    input: WriteNextChapterInput,
    genre: string,
    contextCard: Record<string, unknown>,
    intent: Record<string, unknown>
  ): Promise<{
    success: boolean;
    content?: string;
    usage?: AgentResult['usage'];
    error?: string;
  }> {
    const draftInput: WriteDraftInput = {
      bookId: input.bookId,
      chapterNumber: input.chapterNumber,
      title: input.title,
      genre,
      sceneDescription: (intent as { chapterGoal?: string }).chapterGoal ?? input.userIntent,
      previousChapterContent: input.previousChapterContent,
    };

    const prompt = this.#buildDraftPrompt(draftInput);
    const result = await this.provider.generate({ prompt });

    return { success: true, content: result.text, usage: result.usage };
  }

  async #polishScene(
    content: string,
    genre: string,
    chapterNumber: number
  ): Promise<{ content: string; usage?: AgentResult['usage'] }> {
    const prompt = `你是一位专业的网络小说文字润色师。请对以下章节进行润色。

## 基本信息
- **章节**: 第 ${chapterNumber} 章
- **题材**: ${genre}

## 初稿内容
${content}

## 润色要求
1. 保持原有情节和结构
2. 提升语言流畅性和画面感
3. 角色对话自然生动
4. 删除冗余表达
5. 注意段落节奏

请直接输出润色后的正文。`;

    const result = await this.provider.generate({ prompt });
    return { content: result.text, usage: result.usage };
  }

  async #auditAndRevise(
    chapterContent: string,
    input: WriteNextChapterInput,
    genre: string
  ): Promise<{
    content: string;
    auditorUsage?: { promptTokens: number; completionTokens: number; totalTokens: number };
    reviserUsage?: { promptTokens: number; completionTokens: number; totalTokens: number };
    usage?: AgentResult['usage'];
    warning?: string;
    warningCode?: 'accept_with_warnings';
  }> {
    let currentContent = chapterContent;
    const auditorUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    const reviserUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

    for (let attempt = 0; attempt <= this.maxRevisionRetries; attempt++) {
      const auditResult = await this.#auditChapter(currentContent, genre, input.chapterNumber);
      // auditResult.usage 目前不存在（generateJSON 不返回 usage），guard 会跳过累加
      const auditUsage = (auditResult as unknown as { usage?: AgentResult['usage'] }).usage;
      if (auditUsage) {
        auditorUsage.promptTokens += auditUsage.promptTokens;
        auditorUsage.completionTokens += auditUsage.completionTokens;
        auditorUsage.totalTokens += auditUsage.totalTokens;
      }

      if (auditResult.status === 'pass' || auditResult.issues.length === 0) {
        return {
          content: currentContent,
          auditorUsage,
          reviserUsage,
          usage: {
            promptTokens: auditorUsage.promptTokens + reviserUsage.promptTokens,
            completionTokens: auditorUsage.completionTokens + reviserUsage.completionTokens,
            totalTokens: auditorUsage.totalTokens + reviserUsage.totalTokens,
          },
        };
      }

      if (attempt < this.maxRevisionRetries) {
        // 尝试修订
        const revisePrompt = `请根据以下审计问题修订章节内容：

## 审计问题
${auditResult.issues.map((i: { severity: string; description: string }) => `- [${i.severity}] ${i.description}`).join('\n')}

## 当前内容
${currentContent}

请修订后输出完整正文。`;

        const reviseResult = await this.provider.generate({ prompt: revisePrompt });
        currentContent = reviseResult.text;
        reviserUsage.promptTokens += reviseResult.usage.promptTokens;
        reviserUsage.completionTokens += reviseResult.usage.completionTokens;
        reviserUsage.totalTokens += reviseResult.usage.totalTokens;
      }
    }

    // 用尽重试次数后的降级处理
    if (this.fallbackAction === 'accept_with_warnings') {
      return {
        content: currentContent,
        auditorUsage,
        reviserUsage,
        usage: {
          promptTokens: auditorUsage.promptTokens + reviserUsage.promptTokens,
          completionTokens: auditorUsage.completionTokens + reviserUsage.completionTokens,
          totalTokens: auditorUsage.totalTokens + reviserUsage.totalTokens,
        },
        warning: '修订次数用尽，已按 accept_with_warnings 降级接受结果',
        warningCode: 'accept_with_warnings',
      };
    }

    throw new Error('修订次数用尽，章节质量仍未达标');
  }

  async #auditChapter(
    content: string,
    genre: string,
    chapterNumber: number
  ): Promise<{
    status: 'pass' | 'fail';
    issues: Array<{ severity: string; description: string }>;
    overallScore: number;
    summary: string;
  }> {
    const prompt = `你是一位专业的网络小说质量审计师。请对以下章节进行质量检测。

## 基本信息
- **章节**: 第 ${chapterNumber} 章
- **题材**: ${genre}

## 章节内容
${content.substring(0, 5000)}

## 检测要求
1. 检测逻辑连贯性
2. 检测角色一致性
3. 检测文风问题
4. 检测冗余和重复

请以 JSON 格式输出：
{
  "issues": [
    { "severity": "blocking|warning|suggestion", "description": "问题描述" }
  ],
  "overallScore": 85,
  "status": "pass|fail",
  "summary": "审计总结"
}`;

    return this.provider.generateJSON({ prompt });
  }

  async #extractMemory(
    content: string,
    bookId: string,
    chapterNumber: number
  ): Promise<Manifest | null> {
    const prompt = `你是一位记忆提取师。请从以下章节内容中提取重要事实和新伏笔。

## 章节内容
${content.substring(0, 3000)}

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
      }>({ prompt });

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
    } catch {
      // 记忆提取失败不影响主流程
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
      if (
        manifest.facts.some(
          (existingFact) =>
            existingFact.content === content && existingFact.chapterNumber === chapterNumber
        )
      ) {
        return;
      }
      actions.push({
        type: 'add_fact',
        payload: {
          id: `fact-${chapterNumber}-${index + 1}`,
          content,
          chapterNumber,
          confidence: this.#normalizeFactConfidence(fact.confidence),
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
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
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

  #findChapterEntry(chapters: ChapterIndexEntry[], chapterNumber: number): ChapterIndexEntry | undefined {
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

  #persistChapter(
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
    const filePath = this.stateManager.getChapterFilePath(bookId, chapterNumber);

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

    fs.writeFileSync(filePath, chapterMeta + content, 'utf-8');
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
        wordCount: content.length,
        createdAt: new Date().toISOString(),
      });
    } else {
      this.#normalizeChapterEntry(existingChapter, chapterNumber, title, content.length);
      existingChapter.wordCount = content.length;
    }
    index.totalChapters = index.chapters.length;
    index.totalWords = index.chapters.reduce(
      (sum, chapter) => sum + (Number.isFinite(chapter.wordCount) ? chapter.wordCount : 0),
      0
    );
    index.lastUpdated = new Date().toISOString();
    this.stateManager.writeIndex(bookId, index);

    // 更新 manifest
    const manifest = manifestOverride ?? this.stateStore.loadManifest(bookId);
    if (chapterNumber > manifest.lastChapterWritten) {
      manifest.lastChapterWritten = chapterNumber;
    }
    this.stateStore.saveRuntimeStateSnapshot(bookId, manifest);
  }
}
