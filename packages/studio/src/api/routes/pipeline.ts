import { Hono } from 'hono';
import { z } from 'zod';
import { readStudioBookRuntime, getStudioPipelineRunner, hasStudioBookRuntime } from '../core-bridge';
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
    progress.status = result.success ? 'completed' : progress.status === 'running' ? 'failed' : progress.status;
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
    const userIntent = result.data.userIntent ?? result.data.customIntent ?? '继续上一章';

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
    const draft = await getStudioPipelineRunner().writeFastDraft({
      bookId,
      chapterNumber: 1,
      title: '快速试写',
      genre: book?.genre ?? 'urban',
      sceneDescription: result.data.customIntent ?? '快速试写当前主线',
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
        userIntent: result.data.userIntent,
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
      sceneDescription: '草稿模式推进主线',
    });

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
