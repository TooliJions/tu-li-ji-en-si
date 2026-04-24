import * as fs from 'fs';
import type { StateManager } from '../../state/manager';
import type { RuntimeStateStore } from '../../state/runtime-store';
import type { LLMProvider } from '../../llm/provider';
import {
  type ChapterPlan,
  type ChapterPlanResult,
  type ChapterPlanBrief,
  type BatchChapterPlanResult,
} from '../../agents/chapter-planner';
import { agentRegistry } from '../../agents/registry';
import type { Manifest, ChapterPlanStore } from '../../models/state';
import type { PlanChapterInput, PlanChapterResult } from '../types';
import { readChapterSummary, buildOutlineContext } from '../runner-helpers';

export interface PlanOrchestrator {
  planChapter(input: PlanChapterInput): Promise<PlanChapterResult>;
}

export interface PlanOrchestratorDeps {
  provider: LLMProvider;
  stateManager: StateManager;
  stateStore: RuntimeStateStore;
}

export class DefaultPlanOrchestrator implements PlanOrchestrator {
  constructor(private deps: PlanOrchestratorDeps) {}

  async planChapter(input: PlanChapterInput): Promise<PlanChapterResult> {
    const { provider, stateManager, stateStore } = this.deps;

    if (input.chapterNumber < 1) {
      return { success: false, chapterNumber: input.chapterNumber, error: '章节号必须从 1 开始' };
    }

    // 检查书籍是否存在
    if (!stateStore.hasState(input.bookId)) {
      return {
        success: false,
        chapterNumber: input.chapterNumber,
        error: `书籍「${input.bookId}」不存在`,
      };
    }

    // 计算批量规划区间：从当前章节到下一个 beat 的前一章
    const manifest = stateStore.loadManifest(input.bookId);
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
    const chapterPlanner = agentRegistry.create('chapter-planner', provider);
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
    const index = stateManager.readIndex(input.bookId);

    for (const plan of plans) {
      if (!plan || typeof plan !== 'object') continue;
      updatedPlans[String(plan.chapterNumber)] = this.#planToStore(plan, now);
      this.#upsertChapterIndex(index, plan.chapterNumber, plan.title, now);
    }

    // 唤醒当前章节的 dormant hooks
    const updatedHooks = manifest.hooks.map((hook) => {
      if (hook.status === 'dormant' && hook.wakeAtChapter === input.chapterNumber) {
        return { ...hook, status: 'open' as const, updatedAt: now };
      }
      return hook;
    });

    index.totalChapters = index.chapters.length;
    index.totalWords = index.chapters.reduce(
      (sum, ch) => sum + (Number.isFinite(ch.wordCount) ? ch.wordCount : 0),
      0
    );
    index.lastUpdated = now;

    stateStore.saveRuntimeStateSnapshot(input.bookId, {
      ...manifest,
      chapterPlans: updatedPlans,
      hooks: updatedHooks,
    } as Manifest);
    stateManager.writeIndex(input.bookId, index);

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

  // ── Private helpers ───────────────────────────────────────────

  /**
   * 构建规划所需的公共上下文数据
   */
  #buildPlanContext(input: PlanChapterInput, manifest: Manifest) {
    const { stateManager } = this.deps;

    const metaPath = stateManager.getBookPath(input.bookId, 'meta.json');
    const meta = fs.existsSync(metaPath)
      ? (JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as {
          genre: string;
          title: string;
          synopsis: string;
        })
      : { genre: 'unknown', title: '', synopsis: '' };

    const previousChapterSummary =
      manifest.lastChapterWritten > 0
        ? readChapterSummary(input.bookId, manifest.lastChapterWritten, stateManager)
        : '第一章，需要建立世界观和角色介绍';

    const outlineContext = buildOutlineContext(
      manifest.outline ?? [],
      input.chapterNumber,
      input.outlineContext || manifest.currentFocus || '',
      input.bookId,
      stateManager
    );

    const bookDataPath = stateManager.getBookPath(input.bookId, 'book.json');
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
    chapterPlanner: import('../../agents/base').BaseAgent,
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
}
