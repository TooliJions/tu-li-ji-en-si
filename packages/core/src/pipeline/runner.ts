import { StateManager } from '../state/manager';
import { RuntimeStateStore } from '../state/runtime-store';

import { OpenAICompatibleProvider, LLMProvider, type LLMConfig } from '../llm/provider';
import { TelemetryLogger } from '../telemetry/logger';
import { ChapterRestructurer } from './restructurer';
import type { MergeChaptersInput, SplitChapterInput, RestructureResult } from './restructurer';
import { DefaultBookInitializer, type BookInitializer } from './orchestrators/book-initializer';

export { UsageTracker, type UsageEntry, type UsageBreakdown } from './telemetry';
export {
  type PipelineRunnerConfig,
  type InitBookInput,
  type InitBookResult,
  type PlanChapterInput,
  type PlanChapterResult,
  type WriteDraftInput,
  type UpgradeDraftInput,
  type WriteNextChapterInput,
  type ChapterResult,
  type AuditDraftInput,
  type RunnerAuditIssue,
  type AuditResult,
  type ReviseDraftInput,
  MergeChaptersInput,
  SplitChapterInput,
  RestructureResult,
  normalizeHookPlan,
} from './types';

import type {
  PipelineRunnerConfig,
  InitBookInput,
  InitBookResult,
  PlanChapterInput,
  PlanChapterResult,
  WriteDraftInput,
  UpgradeDraftInput,
  WriteNextChapterInput,
  ChapterResult,
  AuditDraftInput,
  AuditResult,
  ReviseDraftInput,
  RunnerAuditIssue,
} from './types';
import { DefaultDraftManager, type DraftManager } from './orchestrators/draft-manager';
import {
  DefaultAuditOrchestrator,
  type AuditOrchestrator,
} from './orchestrators/audit-orchestrator';
import { DefaultPlanOrchestrator, type PlanOrchestrator } from './orchestrators/plan-orchestrator';
import { DefaultChapterComposer, type ChapterComposer } from './orchestrators/chapter-composer';
import { DefaultChapterPersister, type ChapterPersister } from './orchestrators/chapter-persister';
import { UsageTracker } from './telemetry';
import '../agents/auto-register';

// ─── PipelineRunner ─────────────────────────────────────────────

export class PipelineRunner {
  private stateManager: StateManager;
  private stateStore: RuntimeStateStore;
  private provider: LLMProvider;
  private maxRevisionRetries: number;
  private fallbackAction: 'accept_with_warnings' | 'pause';
  private telemetryLogger: TelemetryLogger;
  private draftManager: DraftManager;
  private auditOrchestrator: AuditOrchestrator;
  private planOrchestrator: PlanOrchestrator;
  private chapterComposer: ChapterComposer;
  private chapterPersister: ChapterPersister;
  private bookInitializer: BookInitializer;
  private restructurer: ChapterRestructurer;
  private usageTracker: UsageTracker;

  constructor(config: PipelineRunnerConfig) {
    this.stateManager = new StateManager(config.rootDir);
    this.stateStore = new RuntimeStateStore(this.stateManager);
    if (!config.provider && !config.llmConfig) {
      throw new Error('必须提供 provider 或 llmConfig');
    }
    this.provider = config.provider ?? new OpenAICompatibleProvider(config.llmConfig!);
    this.maxRevisionRetries = config.maxRevisionRetries ?? 2;
    this.fallbackAction = config.fallbackAction ?? 'accept_with_warnings';
    this.telemetryLogger = config.telemetryLogger ?? new TelemetryLogger(config.rootDir);
    this.usageTracker = new UsageTracker(this.telemetryLogger);
    this.draftManager = new DefaultDraftManager({
      provider: this.provider,
      stateManager: this.stateManager,
      stateStore: this.stateStore,
      telemetryLogger: this.telemetryLogger,
    });
    this.auditOrchestrator = new DefaultAuditOrchestrator({
      provider: this.provider,
      stateStore: this.stateStore,
      maxRevisionRetries: this.maxRevisionRetries,
      fallbackAction: this.fallbackAction,
    });
    this.planOrchestrator = new DefaultPlanOrchestrator({
      provider: this.provider,
      stateManager: this.stateManager,
      stateStore: this.stateStore,
    });
    this.chapterComposer = new DefaultChapterComposer({
      provider: this.provider,
      stateManager: this.stateManager,
      stateStore: this.stateStore,
      telemetryLogger: this.telemetryLogger,
      maxRevisionRetries: this.maxRevisionRetries,
      fallbackAction: this.fallbackAction,
    });
    this.chapterPersister = new DefaultChapterPersister({
      stateManager: this.stateManager,
      stateStore: this.stateStore,
      provider: this.provider,
    });
    this.bookInitializer = new DefaultBookInitializer({
      stateManager: this.stateManager,
      stateStore: this.stateStore,
    });
    this.restructurer = new ChapterRestructurer({
      rootDir: config.rootDir,
      provider: this.provider,
    });
  }

  // ── initBook ──────────────────────────────────────────────────

  /**
   * 初始化一本新书：创建目录结构、生成元数据、初始化状态。
   */
  async initBook(input: InitBookInput): Promise<InitBookResult> {
    return this.bookInitializer.initBook(input);
  }

  // ── planChapter ───────────────────────────────────────────────

  /**
   * 规划章节：使用 ChapterPlanner Agent 生成章节写作计划，保存到 manifest。
   */
  async planChapter(input: PlanChapterInput): Promise<PlanChapterResult> {
    return this.planOrchestrator.planChapter(input);
  }

  // ── composeChapter ────────────────────────────────────────────

  /**
   * 组合章节：从规划到草稿到润色到审计到持久化的完整流程。
   * 使用 ContextCard → IntentDirector → ChapterExecutor Agent 链路。
   */
  async composeChapter(input: WriteNextChapterInput): Promise<ChapterResult> {
    // 重置 usage 累积器
    this.usageTracker.clear();

    // 获取锁
    this.stateManager.acquireBookLock(input.bookId, 'composeChapter');

    try {
      const manifest = this.stateStore.loadManifest(input.bookId);

      // 1. 章节创作（ContextCard → Intent → Executor → Polisher → Audit）
      const composeResult = await this.chapterComposer.compose(input);

      if (!composeResult.success) {
        return {
          success: false,
          bookId: input.bookId,
          chapterNumber: input.chapterNumber,
          error: composeResult.error,
          usage: this.usageTracker.merge(composeResult.usageBreakdown),
        };
      }

      // 将 composer 的 usage 合并到 runner 的累积器
      if (composeResult.usageBreakdown) {
        for (const [channel, usage] of Object.entries(composeResult.usageBreakdown)) {
          this.usageTracker.track(
            input.bookId,
            input.chapterNumber,
            channel as import('../telemetry/logger').TelemetryChannel,
            usage
          );
        }
      }

      // 2. 持久化（记忆提取 → 原子写入 → 状态更新）
      await this.chapterPersister.persist({
        bookId: input.bookId,
        chapterNumber: input.chapterNumber,
        title: input.title,
        content: composeResult.content,
        manifest,
        warning: composeResult.warning,
        warningCode: composeResult.warningCode,
      });

      return {
        success: true,
        bookId: input.bookId,
        chapterNumber: input.chapterNumber,
        content: composeResult.content,
        status: 'final',
        warning: composeResult.warning,
        warningCode: composeResult.warningCode,
        persisted: true,
        usage: this.usageTracker.build(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        bookId: input.bookId,
        chapterNumber: input.chapterNumber,
        error: `章节创作失败: ${message}`,
        usage: this.usageTracker.build(),
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
    return this.draftManager.writeDraft(input);
  }

  // ── writeFastDraft ────────────────────────────────────────────

  /**
   * 快速试写：仅调用 ScenePolisher，不持久化。
   */
  async writeFastDraft(input: WriteDraftInput): Promise<ChapterResult> {
    return this.draftManager.writeFastDraft(input);
  }

  // ── upgradeDraft ────────────────────────────────────────────

  /**
   * 草稿转正：检测上下文漂移，重新润色后持久化为正式章节。
   */
  async upgradeDraft(input: UpgradeDraftInput): Promise<ChapterResult> {
    return this.draftManager.upgradeDraft(input);
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
    return this.auditOrchestrator.auditDraft(input);
  }

  // ── reviseDraft ───────────────────────────────────────────────

  /**
   * 按审计结果修订章节：调用 RevisionLoop，含 maxRevisionRetries 和降级路径。
   */
  async reviseDraft(input: ReviseDraftInput): Promise<ChapterResult> {
    return this.auditOrchestrator.reviseDraft(input);
  }

  // ── mergeChapters / splitChapter ──────────────────────────────

  /**
   * 合并两个相邻章节：委托给 ChapterRestructurer。
   */
  async mergeChapters(input: MergeChaptersInput): Promise<RestructureResult> {
    try {
      return this.restructurer.mergeChapters(input);
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
      return this.restructurer.splitChapter(input);
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
}
