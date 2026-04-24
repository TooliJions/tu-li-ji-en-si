import * as fs from 'fs';
import type { LLMProvider } from '../../llm/provider';
import type { StateManager } from '../../state/manager';
import type { RuntimeStateStore } from '../../state/runtime-store';
import { TelemetryLogger, type TelemetryChannel } from '../../telemetry/logger';
import {
  type ContextCardInput,
  type ContextCardOutput,
  type ContextDataSources,
} from '../../agents/context-card';
import { type IntentInput, type IntentOutput } from '../../agents/intent-director';
import { type ChapterExecutionInput, type AgentDependencies } from '../../agents/executor';
import { type ScenePolishInput } from '../../agents/scene-polisher';
import { agentRegistry } from '../../agents/registry';
import type { ChapterPlan } from '../../agents/chapter-planner';
import { RevisionLoop } from '../revision-loop';
import type { WriteNextChapterInput } from '../types';
import {
  buildAgentDraftPrompt,
  readChapterSummary,
  readChapterContent,
  checkWorldRules,
} from '../runner-helpers';

// ─── Interfaces ──────────────────────────────────────────────────

export interface ChapterComposer {
  compose(input: WriteNextChapterInput): Promise<ComposeResult>;
}

export interface ChapterComposerDeps {
  provider: LLMProvider;
  stateManager: StateManager;
  stateStore: RuntimeStateStore;
  telemetryLogger: TelemetryLogger;
  maxRevisionRetries: number;
  fallbackAction: 'accept_with_warnings' | 'pause';
}

export type ComposeResult =
  | {
      success: true;
      content: string;
      warning?: string;
      warningCode?: 'accept_with_warnings' | 'context_drift';
      usageBreakdown: Record<string, UsageEntry>;
    }
  | {
      success: false;
      error: string;
      usageBreakdown?: Record<string, UsageEntry>;
    };

interface UsageEntry {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

// ─── DefaultChapterComposer ──────────────────────────────────────

export class DefaultChapterComposer implements ChapterComposer {
  constructor(private deps: ChapterComposerDeps) {}

  async compose(input: WriteNextChapterInput): Promise<ComposeResult> {
    const {
      provider,
      stateManager,
      stateStore,
      telemetryLogger,
      maxRevisionRetries,
      fallbackAction,
    } = this.deps;

    // 读取书籍元数据
    const metaPath = stateManager.getBookPath(input.bookId, 'meta.json');
    if (!fs.existsSync(metaPath)) {
      return {
        success: false,
        error: `书籍「${input.bookId}」不存在`,
      };
    }
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as {
      genre: string;
      title: string;
      synopsis: string;
    };

    // usage 累积器
    const usageMap = new Map<string, UsageEntry>();

    function trackUsage(
      bookId: string,
      chapterNumber: number,
      channel: TelemetryChannel,
      usage: UsageEntry | undefined
    ): void {
      if (!usage) return;
      telemetryLogger.record(bookId, chapterNumber, channel, usage);
      const existing = usageMap.get(channel);
      if (existing) {
        usageMap.set(channel, {
          promptTokens: existing.promptTokens + usage.promptTokens,
          completionTokens: existing.completionTokens + usage.completionTokens,
          totalTokens: existing.totalTokens + usage.totalTokens,
        });
      } else {
        usageMap.set(channel, { ...usage });
      }
    }

    function buildUsage(): Record<string, UsageEntry> {
      const result: Record<string, UsageEntry> = {};
      for (const [channel, usage] of usageMap.entries()) {
        result[channel] = { ...usage };
      }
      return result;
    }

    try {
      // 缓存 manifest，避免同一次 compose 内重复 I/O
      const manifest = stateStore.loadManifest(input.bookId);

      // 1. ContextCard Agent — 构建上下文卡片
      const contextCardAgent = agentRegistry.create('context-card', provider);
      const contextDataSources: ContextDataSources = {
        getManifest: async () => manifest,
        getPreviousChapterSummary: async (chapterNum: number) => {
          if (chapterNum < 1) return '';
          return readChapterSummary(input.bookId, chapterNum, stateManager);
        },
        getChapterContext: async (chapterNum: number) => {
          return readChapterContent(input.bookId, chapterNum, stateManager);
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
          error: `上下文卡片构建失败: ${contextCardResult.error ?? '未知错误'}`,
        };
      }
      trackUsage(input.bookId, input.chapterNumber, 'planner', contextCardResult.usage);

      const contextCardData = contextCardResult.data;
      if (!contextCardData || typeof contextCardData !== 'object') {
        return {
          success: false,
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
        const intentAgent = agentRegistry.create('intent-director', provider);
        const characterProfiles = manifest.characters.map(
          (c: { name: string; role: string; traits: unknown }) => ({
            name: c.name,
            role: c.role,
            traits: Array.isArray(c.traits)
              ? c.traits
              : typeof c.traits === 'string'
                ? [c.traits]
                : [],
          })
        );

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
            error: `意图定向失败: ${intentResult.error ?? '未知错误'}`,
          };
        }
        trackUsage(input.bookId, input.chapterNumber, 'planner', intentResult.usage);

        const intentData = intentResult.data;
        if (!intentData || typeof intentData !== 'object') {
          return {
            success: false,
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

      // 3. ChapterExecutor Agent — 正文生成
      const executorAgent = agentRegistry.create('chapter-executor', provider);

      const deps: AgentDependencies = {
        buildContext: async (_execInput: ChapterExecutionInput) => contextCard.formattedText,
        generateScene: async (p: ChapterPlan, context: string) => {
          const draftPrompt = buildAgentDraftPrompt(input, p, context, meta.synopsis ?? '');
          const result = await provider.generate({ prompt: draftPrompt, agentName: 'Writer' });
          trackUsage(input.bookId, input.chapterNumber, 'writer', result.usage);
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
          error: `正文生成失败: ${execResult.error ?? '未知错误'}`,
        };
      }

      const draftData = execResult.data;
      if (!draftData || typeof draftData !== 'object' || !('content' in draftData)) {
        return {
          success: false,
          error: '正文生成返回数据格式异常：缺少 content 字段',
        };
      }
      const draftContent = (draftData as { content: string }).content;

      // 4. 世界规则执行检查（PRD-014）
      const ruleViolations = await checkWorldRules(
        draftContent,
        input.chapterNumber,
        worldRules,
        provider
      );

      // 5. ScenePolisher Agent — 场景润色
      const polisher = agentRegistry.create('scene-polisher', provider);
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
      trackUsage(input.bookId, input.chapterNumber, 'composer', polisher.getLastUsage());

      const polishedResultData = polishResult.data;
      const polishedContent =
        polishResult.success &&
        polishedResultData &&
        typeof polishedResultData === 'object' &&
        'polishedContent' in polishedResultData
          ? (polishedResultData as { polishedContent: string }).polishedContent
          : draftContent;

      // 6. 质量审计 + 修订循环
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

          const preReviseResult = await provider.generate({ prompt: preRevisePrompt });
          contentForAudit = preReviseResult.text;
          trackUsage(input.bookId, input.chapterNumber, 'reviser', preReviseResult.usage);
        } catch (err) {
          preRevisionWarning = `世界规则修订失败: ${err instanceof Error ? err.message : String(err)}`;
        }
      }

      const loop = new RevisionLoop({
        provider,
        maxRevisionRetries,
        fallbackAction,
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

        if (revisionResult.usage) {
          trackUsage(input.bookId, input.chapterNumber, 'reviser', revisionResult.usage);
        }

        if (revisionResult.action === 'paused') {
          return {
            success: false,
            error: `修订次数用尽: ${revisionResult.warnings.join('; ')}`,
            usageBreakdown: buildUsage(),
          };
        }

        if (revisionResult.action === 'accepted_with_warnings') {
          auditedWarning = `修订后仍存在问题，已降级接受: ${revisionResult.warnings.join('; ')}`;
          auditedWarningCode = 'accept_with_warnings';
        }
        if (preRevisionWarning) {
          auditedWarning = (auditedWarning ? auditedWarning + '；' : '') + preRevisionWarning;
          auditedWarningCode = auditedWarningCode ?? 'accept_with_warnings';
        }
      } catch (error) {
        auditedWarning = `审计修订失败，使用润色后版本: ${error instanceof Error ? error.message : String(error)}`;
        auditedWarningCode = 'accept_with_warnings';
      }

      return {
        success: true,
        content: auditedContent,
        warning: auditedWarning,
        warningCode: auditedWarningCode,
        usageBreakdown: buildUsage(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `章节创作失败: ${message}`,
      };
    }
  }
}
