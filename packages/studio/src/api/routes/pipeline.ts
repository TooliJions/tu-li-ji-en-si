import { Hono } from 'hono';
import { z } from 'zod';
import { hasStudioBookRuntime, readStudioBookRuntime } from '../core-bridge';
import { getRequestContext } from '../context';
import { eventHub } from '../sse';
import { normalizeGenreForAgents } from '../../utils';
import {
  pipelineStore,
  createPipelineEntry,
  markCurrentStage,
  finalizePipeline,
  buildStoryBootstrap,
  mergeIntentWithBookContext,
  mergeOutlineContextWithBookContext,
  buildBookContextFromManifest,
  resolveFastDraftChapterNumber,
} from '../../services/pipeline';

export { pipelineStore } from '../../services/pipeline';

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
      const { runner } = getRequestContext(c);

      markCurrentStage(pipelineId, 'composing');
      const chapterResult = result.data.skipAudit
        ? await runner.writeDraft({
            bookId,
            chapterNumber: result.data.chapterNumber,
            title: `第 ${result.data.chapterNumber} 章`,
            genre: normalizeGenreForAgents(book?.genre),
            sceneDescription: userIntent,
            bookContext: buildBookContextFromManifest(bookId),
          })
        : await runner.composeChapter({
            bookId,
            chapterNumber: result.data.chapterNumber,
            title: `第 ${result.data.chapterNumber} 章`,
            genre: normalizeGenreForAgents(book?.genre),
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
    const draft = await getRequestContext(c).runner.writeFastDraft({
      bookId,
      chapterNumber,
      title: `第 ${chapterNumber} 章`,
      genre: normalizeGenreForAgents(book?.genre),
      sceneDescription: mergeIntentWithBookContext(
        bookId,
        result.data.customIntent,
        '快速试写当前主线'
      ),
      bookContext: buildBookContextFromManifest(bookId),
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
      const chapterResult = await getRequestContext(c).runner.upgradeDraft({
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
    const draft = await getRequestContext(c).runner.writeDraft({
      bookId,
      chapterNumber: result.data.chapterNumber,
      title: `第 ${result.data.chapterNumber} 章`,
      genre: normalizeGenreForAgents(book?.genre),
      sceneDescription: mergeIntentWithBookContext(bookId, undefined, '草稿模式推进主线'),
      bookContext: buildBookContextFromManifest(bookId),
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

    const { runner } = getRequestContext(c);
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

    try {
      const { provider } = getRequestContext(c);
      const bootstrapResult = await buildStoryBootstrap(bookId, chapterNumber, provider);

      if ('error' in bootstrapResult) {
        return c.json({ error: { code: 'BOOTSTRAP_FAILED', message: bootstrapResult.error } }, 400);
      }

      return c.json({ data: bootstrapResult });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[bootstrap-story] unhandled error:', message);
      return c.json({ error: { code: 'INTERNAL_ERROR', message } }, 500);
    }
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
