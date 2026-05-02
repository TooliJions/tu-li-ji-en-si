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
  mergeIntentWithBookContext,
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
        400,
      );
    }
    const pipelineId = createPipelineEntry();
    const userIntent = mergeIntentWithBookContext(
      bookId,
      result.data.userIntent ?? result.data.customIntent,
      `推进第 ${result.data.chapterNumber} 章主线`,
    );

    eventHub.sendEvent(bookId, 'pipeline_progress', {
      pipelineId,
      status: 'running',
      currentStage: 'planning',
    });

    void (async () => {
      const book = readStudioBookRuntime(bookId);
      const { runner } = getRequestContext(c);
      const composeInput = {
        bookId,
        chapterNumber: result.data.chapterNumber,
        title: `第 ${result.data.chapterNumber} 章`,
        genre: normalizeGenreForAgents(book?.genre),
        userIntent,
      };

      markCurrentStage(pipelineId, 'composing');
      const chapterResult = result.data.skipAudit
        ? await runner.writeDraft({
            ...composeInput,
            sceneDescription: userIntent,
            bookContext: buildBookContextFromManifest(bookId),
          })
        : await runner.composeChapter(composeInput);

      // if (!result.data.skipAudit && !chapterResult.success) {
      //   console.warn(
      //     `[write-next] Primary provider failed (${chapterResult.error}), falling back to deterministic.`,
      //   );
      //   const fallbackRunner = new PipelineRunner({
      //     rootDir: getStudioRuntimeRootDir(),
      //     provider: new DeterministicProvider(),
      //   });
      //   chapterResult = await fallbackRunner.composeChapter(composeInput);
      // }

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
      202,
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
        400,
      );
    }

    const book = readStudioBookRuntime(bookId);
    const chapterNumber = resolveFastDraftChapterNumber(bookId);
    const draftInput = {
      bookId,
      chapterNumber,
      title: `第 ${chapterNumber} 章`,
      genre: normalizeGenreForAgents(book?.genre),
      sceneDescription: mergeIntentWithBookContext(
        bookId,
        result.data.customIntent,
        '快速试写当前主线',
      ),
      bookContext: buildBookContextFromManifest(bookId),
    };

    const draft = await getRequestContext(c).runner.writeFastDraft(draftInput);
    const isFallback = false;

    // // 如果真实 LLM 调用失败，自动降级到 DeterministicProvider 重试一次
    // if (!draft.success) {
    //   console.warn(
    //     `[fast-draft] Primary provider failed (${draft.error}), falling back to deterministic.`,
    //   );
    //   const fallbackRunner = new PipelineRunner({
    //     rootDir: getStudioRuntimeRootDir(),
    //     provider: new DeterministicProvider(),
    //   });
    //   draft = await fallbackRunner.writeFastDraft(draftInput);
    //   isFallback = true;
    // }

    if (!draft.success) {
      return c.json(
        { error: { code: 'DRAFT_FAILED', message: draft.error ?? '快速试写失败' } },
        400,
      );
    }

    return c.json({
      data: {
        content: draft.content ?? '',
        wordCount: result.data.wordCount,
        elapsedMs: draft.usage?.totalTokens ?? 0,
        llmCalls: 1,
        draftId: `draft-temp-${Date.now()}`,
        ...(isFallback ? { _fallback: true } : {}),
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
        400,
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
        400,
      );
    }

    const book = readStudioBookRuntime(bookId);
    const draftInput = {
      bookId,
      chapterNumber: result.data.chapterNumber,
      title: `第 ${result.data.chapterNumber} 章`,
      genre: normalizeGenreForAgents(book?.genre),
      sceneDescription: mergeIntentWithBookContext(bookId, undefined, '草稿模式推进主线'),
      bookContext: buildBookContextFromManifest(bookId),
    };

    const draft = await getRequestContext(c).runner.writeDraft(draftInput);
    const isFallback = false;

    // // 如果真实 LLM 调用失败，自动降级到 DeterministicProvider 重试一次
    // if (!draft.success) {
    //   console.warn(
    //     `[write-draft] Primary provider failed (${draft.error}), falling back to deterministic.`,
    //   );
    //   const fallbackRunner = new PipelineRunner({
    //     rootDir: getStudioRuntimeRootDir(),
    //     provider: new DeterministicProvider(),
    //   });
    //   draft = await fallbackRunner.writeDraft(draftInput);
    //   isFallback = true;
    // }

    if (!draft.success) {
      return c.json(
        {
          error: {
            code: 'DRAFT_WRITE_FAILED',
            message: draft.error ?? '草稿模式失败',
          },
        },
        400,
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
        ...(isFallback ? { _fallback: true } : {}),
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
