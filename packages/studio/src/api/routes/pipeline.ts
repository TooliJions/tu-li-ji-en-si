import { Hono } from 'hono';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import {
  RuntimeStateStore,
  StateManager,
  OutlinePlanner,
  CharacterDesigner,
  ChapterPlanner,
  type Hook,
  type CharacterDesignResult,
  type OutlineResult,
  type ChapterPlanResult,
} from '@cybernovelist/core';
import {
  readStudioBookRuntime,
  updateStudioBookRuntime,
  getStudioPipelineRunner,
  getStudioLLMProvider,
  hasStudioBookRuntime,
  getStudioRuntimeRootDir,
} from '../core-bridge';
import { eventHub } from '../sse';

export const pipelineStore = new Map<
  string,
  {
    pipelineId: string;
    status: string;
    stages: string[];
    currentStage: string;
    progress: Record<string, { status: string; elapsedMs: number }>;
    startedAt: string;
    finishedAt?: string;
    result?: {
      success: boolean;
      chapterNumber: number;
      status?: string;
      persisted?: boolean;
      error?: string;
    };
  }
>();

const writeNextSchema = z.object({
  chapterNumber: z.number().int().positive(),
  customIntent: z.string().optional(),
  userIntent: z.string().optional(),
  skipAudit: z.boolean().optional().default(false),
});

const fastDraftSchema = z.object({
  customIntent: z.string().optional(),
  wordCount: z.number().int().positive().default(800),
});

const upgradeDraftSchema = z.object({
  chapterNumber: z.number().int().positive(),
  userIntent: z.string().optional(),
});

const writeDraftSchema = z.object({
  chapterNumber: z.number().int().positive(),
});

const planChapterSchema = z.object({
  chapterNumber: z.number().int().positive(),
  outlineContext: z.string().optional().default(''),
});

const bootstrapStorySchema = z.object({
  chapterNumber: z.number().int().positive().optional(),
});

function loadBookManifest(bookId: string) {
  const manager = new StateManager(getStudioRuntimeRootDir());
  const store = new RuntimeStateStore(manager);
  return store.loadManifest(bookId);
}

function saveBookManifest(bookId: string, nextManifest: ReturnType<typeof loadBookManifest>) {
  const manager = new StateManager(getStudioRuntimeRootDir());
  const store = new RuntimeStateStore(manager);
  store.saveRuntimeStateSnapshot(bookId, nextManifest);
}

function normalizeGenreForAgents(genre: string | undefined): string {
  const value = (genre ?? '').trim();
  if (value === '都市') return 'urban';
  if (value === '玄幻') return 'fantasy';
  if (value === '科幻') return 'sci-fi';
  if (value === '历史') return 'history';
  if (value === '游戏') return 'game';
  if (value === '悬疑') return 'horror';
  if (value === '同人') return 'fanfic';
  return value || 'urban';
}

function serializeOutline(outline: OutlineResult): string {
  return outline.acts
    .map(
      (act) =>
        `第${act.actNumber}幕 ${act.title}\n${act.summary}\n${act.chapters
          .map((chapter) => `- 第${chapter.chapterNumber}章 ${chapter.title}：${chapter.summary}`)
          .join('\n')}`
    )
    .join('\n\n');
}

function dedupeByKey<T>(items: T[], getKey: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = getKey(item);
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function buildBootstrapPlanningBrief(
  outline: OutlineResult,
  worldBootstrap: {
    centralConflict: string;
    growthArc: string;
  },
  characterDesign: CharacterDesignResult
) {
  const outlineSummary = outline.acts
    .slice(0, 3)
    .map((act) => `${act.title}：${act.summary}`)
    .join('；');
  const characterArcSummary = characterDesign.characters
    .slice(0, 3)
    .map((character) =>
      character.arc?.trim() ? `${character.name}：${character.arc.trim()}` : character.name
    )
    .join('；');

  return [
    outlineSummary ? `主题大纲：${outlineSummary}` : '',
    worldBootstrap.centralConflict?.trim()
      ? `核心矛盾：${worldBootstrap.centralConflict.trim()}`
      : '',
    worldBootstrap.growthArc?.trim() ? `成长主线：${worldBootstrap.growthArc.trim()}` : '',
    characterArcSummary ? `角色成长：${characterArcSummary}` : '',
  ]
    .filter(Boolean)
    .join('；');
}

async function buildStoryBootstrap(bookId: string, chapterNumber: number) {
  const book = readStudioBookRuntime(bookId);
  if (!book?.brief?.trim()) {
    return { error: '缺少创作灵感或创作简报' } as const;
  }

  const provider = getStudioLLMProvider();
  const genre = normalizeGenreForAgents(book.genre);
  const outlineAgent = new OutlinePlanner(provider);
  const outlineResult = await outlineAgent.execute({
    bookId,
    promptContext: {
      brief: {
        title: book.title,
        genre,
        brief: book.brief,
        targetChapters: book.targetChapterCount,
      },
    },
  });

  if (!outlineResult.success || !outlineResult.data) {
    return { error: outlineResult.error ?? '自动大纲规划失败' } as const;
  }

  const outline = outlineResult.data as OutlineResult;
  const outlineText = serializeOutline(outline);
  const worldBootstrap = await provider.generateJSON<{
    currentFocus: string;
    centralConflict: string;
    growthArc: string;
    worldRules: string[];
    hooks: string[];
  }>({
    prompt: [
      '你是一位专业的网络小说世界观构建师。请根据创作灵感生成书籍级规划。',
      `书名：${book.title}`,
      `题材：${genre}`,
      `创作灵感：${book.brief}`,
      '请输出 JSON，包含 currentFocus、centralConflict、growthArc、worldRules、hooks。',
      outlineText,
    ].join('\n\n'),
    temperature: 0.7,
    agentName: 'StoryBootstrapPlanner',
  });

  const characterAgent = new CharacterDesigner(provider);
  const characterResult = await characterAgent.execute({
    bookId,
    promptContext: {
      brief: {
        title: book.title,
        genre,
        brief: book.brief,
        characterCount: 3,
      },
      outline: outlineText,
    },
  });

  if (!characterResult.success || !characterResult.data) {
    return { error: characterResult.error ?? '自动角色设计失败' } as const;
  }

  const characterDesign = characterResult.data as CharacterDesignResult;
  const characterNames = characterDesign.characters.map((character) => character.name);
  const openHooks: Hook[] = dedupeByKey<Hook>(
    (worldBootstrap.hooks ?? []).map((description, index) => ({
      id: `hook-bootstrap-${index + 1}`,
      description,
      type: 'plot' as const,
      status: 'open' as const,
      priority: index === 0 ? ('major' as const) : ('minor' as const),
      plantedChapter: chapterNumber,
      relatedCharacters: characterNames.slice(0, 2),
      relatedChapters: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })),
    (hook) => hook.description
  );

  const chapterPlanner = new ChapterPlanner(provider);
  const chapterPlanResult = await chapterPlanner.execute({
    bookId,
    promptContext: {
      brief: {
        title: book.title,
        genre,
        brief: book.brief,
        chapterNumber,
        wordCountTarget: book.targetWordsPerChapter,
      },
      characters: characterNames,
      outline: outlineText,
      openHooks: openHooks.map((hook) => ({
        description: hook.description,
        type: hook.type,
        status: hook.status,
        priority: hook.priority,
        plantedChapter: hook.plantedChapter,
      })),
    },
  });

  if (!chapterPlanResult.success || !chapterPlanResult.data) {
    return { error: chapterPlanResult.error ?? '自动章节规划失败' } as const;
  }

  const chapterPlan = chapterPlanResult.data as ChapterPlanResult;
  const planningBrief = buildBootstrapPlanningBrief(outline, worldBootstrap, characterDesign);
  const manifest = loadBookManifest(bookId);
  const mergedHooks = dedupeByKey(
    [
      ...manifest.hooks,
      ...openHooks,
      ...(chapterPlan.plan.hooks.map((hook, index) => ({
        id: `hook-plan-${index + 1}-${randomUUID().slice(0, 6)}`,
        description: hook.description,
        type: hook.type || 'plot',
        status: 'open' as const,
        priority: (hook.priority === 'critical' ||
        hook.priority === 'major' ||
        hook.priority === 'minor'
          ? hook.priority
          : 'major') as Hook['priority'],
        plantedChapter: chapterNumber,
        relatedCharacters: chapterPlan.plan.characters,
        relatedChapters: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })) as Hook[]),
    ],
    (hook) => hook.description
  ) as Hook[];

  const nextManifest = {
    ...manifest,
    currentFocus: worldBootstrap.currentFocus,
    worldRules: dedupeByKey(
      [
        ...manifest.worldRules,
        ...(worldBootstrap.worldRules ?? []).map((rule, index) => ({
          id: `rule-bootstrap-${index + 1}`,
          category: 'story',
          rule,
          exceptions: [],
          sourceChapter: chapterNumber,
        })),
      ],
      (rule) => rule.rule
    ),
    characters: dedupeByKey(
      [
        ...manifest.characters,
        ...characterDesign.characters.map((character, index) => ({
          id: `char-bootstrap-${index + 1}`,
          name: character.name,
          role: character.role,
          traits: character.traits,
          relationships: character.relationships,
          arc: character.arc,
          firstAppearance: chapterNumber,
        })),
      ],
      (character) => character.name
    ),
    hooks: mergedHooks,
    updatedAt: new Date().toISOString(),
  };

  saveBookManifest(bookId, nextManifest);

  updateStudioBookRuntime({
    ...book,
    planningBrief,
    updatedAt: new Date().toISOString(),
  });

  return {
    success: true,
    currentFocus: worldBootstrap.currentFocus,
    centralConflict: worldBootstrap.centralConflict,
    growthArc: worldBootstrap.growthArc,
    worldRules: worldBootstrap.worldRules ?? [],
    characters: characterDesign.characters.map((character) => ({
      name: character.name,
      role: character.role,
      arc: character.arc,
      traits: character.traits,
    })),
    hooks: mergedHooks.map((hook) => hook.description),
    chapterPlan: {
      chapterNumber: chapterPlan.plan.chapterNumber,
      title: chapterPlan.plan.title,
      summary: chapterPlan.plan.intention,
      characters: chapterPlan.plan.characters,
      keyEvents: chapterPlan.plan.keyEvents,
      hooks: chapterPlan.plan.hooks.map((hook) => hook.description),
    },
  };
}

function buildBookScopedIntent(bookId: string, fallback: string) {
  const book = readStudioBookRuntime(bookId);
  const manifest = loadBookManifest(bookId);
  const parts = [
    manifest.currentFocus,
    book?.planningBrief,
    book?.brief,
    manifest.worldRules.length > 0
      ? `世界设定：${manifest.worldRules
          .slice(0, 3)
          .map((rule) => rule.rule)
          .join('；')}`
      : '',
    manifest.characters.length > 0
      ? `关键角色：${manifest.characters
          .slice(0, 3)
          .map((character) => character.name)
          .join('、')}`
      : '',
    manifest.hooks.length > 0
      ? `当前伏笔：${manifest.hooks
          .filter((hook) => ['open', 'progressing', 'deferred', 'dormant'].includes(hook.status))
          .slice(0, 2)
          .map((hook) => hook.description)
          .join('；')}`
      : '',
  ].filter((part): part is string => Boolean(part && part.trim()));

  return parts.join('；') || fallback;
}

function mergeIntentWithBookContext(bookId: string, intent: string | undefined, fallback: string) {
  const baseContext = buildBookScopedIntent(bookId, fallback).trim();
  const chapterIntent = intent?.trim() ?? '';

  if (!chapterIntent) {
    return baseContext;
  }

  if (!baseContext) {
    return chapterIntent;
  }

  return `${baseContext}；${chapterIntent}`;
}

function mergeOutlineContextWithBookContext(bookId: string, outlineContext: string | undefined) {
  const baseContext = buildBookScopedIntent(bookId, '').trim();
  const chapterContext = outlineContext?.trim() ?? '';

  if (!chapterContext) {
    return baseContext;
  }

  if (!baseContext) {
    return chapterContext;
  }

  return `${baseContext}\n${chapterContext}`;
}

function resolveFastDraftChapterNumber(bookId: string) {
  const manifest = loadBookManifest(bookId);
  return Math.max(manifest.lastChapterWritten + 1, 1);
}

function createPipelineEntry() {
  const id = `pipeline-${Date.now()}`;
  const stages = ['planning', 'composing', 'writing', 'auditing', 'revising', 'persisting'];
  pipelineStore.set(id, {
    pipelineId: id,
    status: 'running',
    stages,
    currentStage: stages[0],
    progress: Object.fromEntries(
      stages.map((s) => [s, { status: s === stages[0] ? 'running' : 'pending', elapsedMs: 0 }])
    ),
    startedAt: new Date().toISOString(),
  });
  return id;
}

function markCurrentStage(pipelineId: string, stage: string): void {
  const pipeline = pipelineStore.get(pipelineId);
  if (!pipeline) {
    return;
  }

  pipeline.currentStage = stage;
  for (const [name, progress] of Object.entries(pipeline.progress)) {
    if (name === stage) {
      progress.status = 'running';
    } else if (progress.status !== 'completed') {
      progress.status = 'pending';
    }
  }
}

function finalizePipeline(
  pipelineId: string,
  result: {
    success: boolean;
    chapterNumber: number;
    status?: string;
    persisted?: boolean;
    error?: string;
  }
): void {
  const pipeline = pipelineStore.get(pipelineId);
  if (!pipeline) {
    return;
  }

  pipeline.status = result.success ? 'completed' : 'failed';
  pipeline.currentStage = result.success ? 'persisting' : pipeline.currentStage;
  pipeline.finishedAt = new Date().toISOString();
  pipeline.result = result;

  for (const progress of Object.values(pipeline.progress)) {
    progress.status = result.success
      ? 'completed'
      : progress.status === 'running'
        ? 'failed'
        : progress.status;
  }
}

export function createPipelineRouter(): Hono {
  const router = new Hono();

  // POST /api/books/:bookId/pipeline/write-next
  router.post('/write-next', async (c) => {
    const bookId = c.req.param('bookId')!;
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const body = await c.req.json().catch(() => ({}));
    const result = writeNextSchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: result.error.errors[0].message } },
        400
      );
    }
    const pipelineId = createPipelineEntry();
    const userIntent = mergeIntentWithBookContext(
      bookId,
      result.data.userIntent ?? result.data.customIntent,
      `推进第 ${result.data.chapterNumber} 章主线`
    );

    eventHub.sendEvent(bookId, 'pipeline_progress', {
      pipelineId,
      status: 'running',
      currentStage: 'planning',
    });

    void (async () => {
      const book = readStudioBookRuntime(bookId);
      const runner = getStudioPipelineRunner();

      markCurrentStage(pipelineId, 'composing');
      const chapterResult = result.data.skipAudit
        ? await runner.writeDraft({
            bookId,
            chapterNumber: result.data.chapterNumber,
            title: `第 ${result.data.chapterNumber} 章`,
            genre: book?.genre ?? 'urban',
            sceneDescription: userIntent,
          })
        : await runner.composeChapter({
            bookId,
            chapterNumber: result.data.chapterNumber,
            title: `第 ${result.data.chapterNumber} 章`,
            genre: book?.genre ?? 'urban',
            userIntent,
          });

      finalizePipeline(pipelineId, {
        success: chapterResult.success,
        chapterNumber: chapterResult.chapterNumber,
        status: chapterResult.status,
        persisted: chapterResult.persisted,
        error: chapterResult.error,
      });

      eventHub.sendEvent(bookId, 'pipeline_progress', pipelineStore.get(pipelineId));
      if (chapterResult.success) {
        eventHub.sendEvent(bookId, 'chapter_complete', {
          pipelineId,
          chapterNumber: chapterResult.chapterNumber,
          status: chapterResult.status,
        });
      }
    })();

    return c.json(
      {
        data: {
          pipelineId,
          status: 'running',
          stages: ['planning', 'composing', 'writing', 'auditing', 'revising', 'persisting'],
        },
      },
      202
    );
  });

  // POST /api/books/:bookId/pipeline/fast-draft
  router.post('/fast-draft', async (c) => {
    const bookId = c.req.param('bookId')!;
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const body = await c.req.json().catch(() => ({}));
    const result = fastDraftSchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: result.error.errors[0].message } },
        400
      );
    }

    const book = readStudioBookRuntime(bookId);
    const chapterNumber = resolveFastDraftChapterNumber(bookId);
    const draft = await getStudioPipelineRunner().writeFastDraft({
      bookId,
      chapterNumber,
      title: `第 ${chapterNumber} 章`,
      genre: book?.genre ?? 'urban',
      sceneDescription: mergeIntentWithBookContext(
        bookId,
        result.data.customIntent,
        '快速试写当前主线'
      ),
    });

    return c.json({
      data: {
        content: draft.content ?? '',
        wordCount: result.data.wordCount,
        elapsedMs: draft.usage?.totalTokens ?? 0,
        llmCalls: 1,
        draftId: `draft-temp-${Date.now()}`,
      },
    });
  });

  // POST /api/books/:bookId/pipeline/upgrade-draft
  router.post('/upgrade-draft', async (c) => {
    const bookId = c.req.param('bookId')!;
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const body = await c.req.json().catch(() => ({}));
    const result = upgradeDraftSchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: result.error.errors[0].message } },
        400
      );
    }
    const pipelineId = createPipelineEntry();
    eventHub.sendEvent(bookId, 'pipeline_progress', {
      pipelineId,
      status: 'running',
      currentStage: 'planning',
    });

    void (async () => {
      markCurrentStage(pipelineId, 'revising');
      const chapterResult = await getStudioPipelineRunner().upgradeDraft({
        bookId,
        chapterNumber: result.data.chapterNumber,
        userIntent: mergeIntentWithBookContext(bookId, result.data.userIntent, ''),
      });

      finalizePipeline(pipelineId, {
        success: chapterResult.success,
        chapterNumber: chapterResult.chapterNumber,
        status: chapterResult.status,
        persisted: chapterResult.persisted,
        error: chapterResult.error,
      });

      eventHub.sendEvent(bookId, 'pipeline_progress', pipelineStore.get(pipelineId));
      if (chapterResult.success) {
        eventHub.sendEvent(bookId, 'chapter_complete', {
          pipelineId,
          chapterNumber: chapterResult.chapterNumber,
          status: chapterResult.status,
        });
      }
    })();

    return c.json({ data: { pipelineId, status: 'running' } }, 202);
  });

  // POST /api/books/:bookId/pipeline/write-draft
  router.post('/write-draft', async (c) => {
    const bookId = c.req.param('bookId')!;
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const body = await c.req.json().catch(() => ({}));
    const result = writeDraftSchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: result.error.errors[0].message } },
        400
      );
    }

    const book = readStudioBookRuntime(bookId);
    const draft = await getStudioPipelineRunner().writeDraft({
      bookId,
      chapterNumber: result.data.chapterNumber,
      title: `第 ${result.data.chapterNumber} 章`,
      genre: book?.genre ?? 'urban',
      sceneDescription: mergeIntentWithBookContext(bookId, undefined, '草稿模式推进主线'),
    });

    if (!draft.success) {
      return c.json(
        {
          error: {
            code: 'DRAFT_WRITE_FAILED',
            message: draft.error ?? '草稿模式失败',
          },
        },
        500
      );
    }

    return c.json({
      data: {
        number: result.data.chapterNumber,
        title: null,
        content: draft.content ?? '',
        status: draft.status ?? 'draft',
        wordCount: draft.content?.length ?? 0,
        qualityScore: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
  });

  // POST /api/books/:bookId/pipeline/plan-chapter
  router.post('/plan-chapter', async (c) => {
    const bookId = c.req.param('bookId')!;
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const body = await c.req.json().catch(() => ({}));
    const result = planChapterSchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: result.error.errors[0].message } },
        400
      );
    }

    const runner = getStudioPipelineRunner();
    const planResult = await runner.planChapter({
      bookId,
      chapterNumber: result.data.chapterNumber,
      outlineContext: mergeOutlineContextWithBookContext(bookId, result.data.outlineContext),
    });

    if (!planResult.success) {
      return c.json({ error: { code: 'PLAN_FAILED', message: planResult.error } }, 500);
    }

    return c.json({ data: planResult });
  });

  // POST /api/books/:bookId/pipeline/bootstrap-story
  router.post('/bootstrap-story', async (c) => {
    const bookId = c.req.param('bookId')!;
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const body = await c.req.json().catch(() => ({}));
    const result = bootstrapStorySchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: result.error.errors[0].message } },
        400
      );
    }

    const chapterNumber = result.data.chapterNumber ?? resolveFastDraftChapterNumber(bookId);
    const bootstrapResult = await buildStoryBootstrap(bookId, chapterNumber);

    if ('error' in bootstrapResult) {
      return c.json({ error: { code: 'BOOTSTRAP_FAILED', message: bootstrapResult.error } }, 400);
    }

    return c.json({ data: bootstrapResult });
  });

  // GET /api/books/:bookId/pipeline/:pipelineId
  router.get('/:pipelineId', (c) => {
    const pipelineId = c.req.param('pipelineId')!;
    const pipeline = pipelineStore.get(pipelineId);
    if (!pipeline) {
      return c.json({ error: { code: 'PIPELINE_NOT_FOUND', message: '流水线不存在' } }, 404);
    }
    return c.json({ data: pipeline });
  });

  return router;
}
