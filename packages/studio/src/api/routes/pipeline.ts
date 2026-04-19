import { Hono } from 'hono';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';

export const pipelineStore = new Map<
  string,
  {
    pipelineId: string;
    status: string;
    stages: string[];
    currentStage: string;
    progress: Record<string, { status: string; elapsedMs: number }>;
    startedAt: string;
  }
>();

const writeNextSchema = z.object({
  chapterNumber: z.number().int().positive(),
  customIntent: z.string().optional(),
  skipAudit: z.boolean().optional().default(false),
});

const fastDraftSchema = z.object({
  customIntent: z.string().optional(),
  wordCount: z.number().int().positive().default(800),
});

const upgradeDraftSchema = z.object({
  draftId: z.string().min(1),
  content: z.string(),
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

export function createPipelineRouter(): Hono {
  const router = new Hono();

  // POST /api/books/:bookId/pipeline/write-next
  router.post('/write-next', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const result = writeNextSchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: result.error.errors[0].message } },
        400
      );
    }
    const pipelineId = createPipelineEntry();
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
    const body = await c.req.json().catch(() => ({}));
    const result = fastDraftSchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: result.error.errors[0].message } },
        400
      );
    }
    return c.json({
      data: {
        content: '【快速草稿】这是一个快速试写的占位内容...',
        wordCount: result.data.wordCount,
        elapsedMs: 12000,
        llmCalls: 1,
        draftId: `draft-temp-${Date.now()}`,
      },
    });
  });

  // POST /api/books/:bookId/pipeline/upgrade-draft
  router.post('/upgrade-draft', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const result = upgradeDraftSchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: result.error.errors[0].message } },
        400
      );
    }
    const pipelineId = createPipelineEntry();
    return c.json({ data: { pipelineId, status: 'running' } }, 202);
  });

  // POST /api/books/:bookId/pipeline/write-draft
  router.post('/write-draft', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const result = writeDraftSchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: result.error.errors[0].message } },
        400
      );
    }
    return c.json({
      data: {
        number: result.data.chapterNumber,
        title: null,
        content: '【草稿模式】跳过审计的草稿内容...',
        status: 'draft',
        wordCount: 2000,
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
