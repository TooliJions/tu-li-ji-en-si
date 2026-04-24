import * as fs from 'fs';
import * as path from 'path';
import type { StateManager } from '../../state/manager';
import type { RuntimeStateStore } from '../../state/runtime-store';
import type { LLMProvider } from '../../llm/provider';
import type { TelemetryLogger } from '../../telemetry/logger';
import {
  type ContextCardInput,
  type ContextCardOutput,
  type ContextDataSources,
} from '../../agents/context-card';
import { type IntentInput, type IntentOutput } from '../../agents/intent-director';
import { type ScenePolishInput } from '../../agents/scene-polisher';
import { agentRegistry } from '../../agents/registry';
import type { ChapterPlan } from '../../agents/chapter-planner';
import { stripFrontmatter } from '../../utils';
import type { WriteDraftInput, UpgradeDraftInput, ChapterResult } from '../types';
import {
  buildDraftPrompt,
  buildAgentDraftPrompt,
  readChapterSummary,
  readChapterContent,
  persistChapterAtomic,
  updateStateAfterChapter,
  checkWorldRules,
} from '../runner-helpers';

export interface DraftManager {
  writeDraft(input: WriteDraftInput): Promise<ChapterResult>;
  writeFastDraft(input: WriteDraftInput): Promise<ChapterResult>;
  upgradeDraft(input: UpgradeDraftInput): Promise<ChapterResult>;
}

export interface DraftManagerDeps {
  provider: LLMProvider;
  stateManager: StateManager;
  stateStore: RuntimeStateStore;
  telemetryLogger: TelemetryLogger;
}

export class DefaultDraftManager implements DraftManager {
  constructor(private deps: DraftManagerDeps) {}

  async writeDraft(input: WriteDraftInput): Promise<ChapterResult> {
    const { provider, stateManager, stateStore, telemetryLogger } = this.deps;

    if (!stateStore.hasState(input.bookId)) {
      return {
        success: false,
        bookId: input.bookId,
        chapterNumber: input.chapterNumber,
        error: `书籍「${input.bookId}」不存在`,
      };
    }

    stateManager.acquireBookLock(input.bookId, 'writeDraft');

    try {
      const metaPath = stateManager.getBookPath(input.bookId, 'meta.json');
      const meta = fs.existsSync(metaPath)
        ? (JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as {
            genre: string;
            title: string;
            synopsis: string;
          })
        : { genre: input.genre, title: input.title, synopsis: '' };

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

      const prompt = buildAgentDraftPrompt(
        {
          bookId: input.bookId,
          chapterNumber: input.chapterNumber,
          title: input.title,
          genre: input.genre,
          userIntent: input.sceneDescription,
        } as WriteDraftInput & { userIntent: string },
        draftPlan,
        input.bookContext ?? input.previousChapterContent?.substring(0, 500) ?? '',
        meta.synopsis ?? ''
      );
      const result = await provider.generate({ prompt, agentName: 'Writer' });
      if (result.usage) {
        telemetryLogger.record(input.bookId, input.chapterNumber, 'writer', result.usage);
      }

      persistChapterAtomic(
        result.text,
        input.bookId,
        input.chapterNumber,
        input.title,
        'draft',
        undefined,
        stateManager
      );
      updateStateAfterChapter(
        input.bookId,
        input.chapterNumber,
        input.title,
        result.text,
        stateManager,
        stateStore
      );

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
      stateManager.releaseBookLock(input.bookId);
    }
  }

  async writeFastDraft(input: WriteDraftInput): Promise<ChapterResult> {
    const { provider, telemetryLogger } = this.deps;

    try {
      const prompt = buildDraftPrompt(input);
      const draftResult = await provider.generate({ prompt, agentName: 'Writer' });
      if (draftResult.usage) {
        telemetryLogger.record(input.bookId, input.chapterNumber, 'writer', draftResult.usage);
      }

      const polisher = agentRegistry.create('scene-polisher', provider);
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

  async upgradeDraft(input: UpgradeDraftInput): Promise<ChapterResult> {
    const { provider, stateManager, stateStore, telemetryLogger } = this.deps;

    if (input.chapterNumber < 1) {
      return {
        success: false,
        bookId: input.bookId,
        chapterNumber: input.chapterNumber,
        error: '章节号必须从 1 开始',
      };
    }

    const metaPath = stateManager.getBookPath(input.bookId, 'meta.json');
    if (!fs.existsSync(metaPath)) {
      return {
        success: false,
        bookId: input.bookId,
        chapterNumber: input.chapterNumber,
        error: `书籍「${input.bookId}」不存在`,
      };
    }

    const chapterPath = stateManager.getChapterFilePath(input.bookId, input.chapterNumber);
    if (!fs.existsSync(chapterPath)) {
      return {
        success: false,
        bookId: input.bookId,
        chapterNumber: input.chapterNumber,
        error: `第 ${input.chapterNumber} 章草稿不存在`,
      };
    }

    const rawContent = fs.readFileSync(chapterPath, 'utf-8');
    const draftContent = stripFrontmatter(rawContent);

    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as { genre: string; title: string };

    const manifest = stateStore.loadManifest(input.bookId);
    const chaptersAhead = manifest.lastChapterWritten - input.chapterNumber;
    let driftWarning =
      chaptersAhead > 0
        ? `⚠️ 检测到上下文漂移：草稿写作后已写入 ${chaptersAhead} 章新内容，已重新对齐`
        : undefined;

    const truthFilesPath = stateManager.getBookPath(input.bookId, 'story', 'state', 'truths');
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

    stateManager.acquireBookLock(input.bookId, 'upgradeDraft');

    try {
      const contextCardAgent = agentRegistry.create('context-card', provider);
      const contextDataSources: ContextDataSources = {
        getManifest: async () => stateStore.loadManifest(input.bookId),
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
            title: '',
            genre: meta.genre,
          } as ContextCardInput,
          sources: contextDataSources,
        },
      });
      if (contextCardResult.usage) {
        telemetryLogger.record(
          input.bookId,
          input.chapterNumber,
          'planner',
          contextCardResult.usage
        );
      }

      const contextCard =
        contextCardResult.success &&
        contextCardResult.data &&
        typeof contextCardResult.data === 'object'
          ? (contextCardResult.data as ContextCardOutput)
          : null;

      let intentGuidance: string | undefined;
      if (input.userIntent) {
        const intentAgent = agentRegistry.create('intent-director', provider);
        const currentManifest = stateStore.loadManifest(input.bookId);
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
        if (intentResult.usage) {
          telemetryLogger.record(input.bookId, input.chapterNumber, 'planner', intentResult.usage);
        }
      }

      const polisher = agentRegistry.create('scene-polisher', provider);
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
      if (polishResult.usage) {
        telemetryLogger.record(input.bookId, input.chapterNumber, 'composer', polishResult.usage);
      }

      const polishedResultData = polishResult.data;
      const polishedContent =
        polishResult.success &&
        polishedResultData &&
        typeof polishedResultData === 'object' &&
        'polishedContent' in polishedResultData
          ? (polishedResultData as { polishedContent: string }).polishedContent
          : draftContent;

      const ruleViolations = await checkWorldRules(
        polishedContent,
        input.chapterNumber,
        contextCard?.worldRules ?? [],
        provider
      );

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

          const reviseResult = await provider.generate({ prompt: revisePrompt });
          finalContent = reviseResult.text;
          if (reviseResult.usage) {
            telemetryLogger.record(
              input.bookId,
              input.chapterNumber,
              'reviser',
              reviseResult.usage
            );
          }
        } catch (err) {
          finalWarning =
            (finalWarning ? finalWarning + '；' : '') +
            `世界规则修订失败: ${err instanceof Error ? err.message : String(err)}`;
          finalWarningCode = finalWarningCode ?? 'accept_with_warnings';
        }
      }

      const title = meta.title || `第 ${input.chapterNumber} 章`;
      persistChapterAtomic(
        finalContent,
        input.bookId,
        input.chapterNumber,
        title,
        'final',
        {
          warning: finalWarning,
          warningCode: finalWarningCode,
        },
        stateManager
      );
      updateStateAfterChapter(
        input.bookId,
        input.chapterNumber,
        title,
        finalContent,
        stateManager,
        stateStore
      );

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
      stateManager.releaseBookLock(input.bookId);
    }
  }
}
