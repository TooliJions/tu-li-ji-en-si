import { Hono } from 'hono';
import { z } from 'zod';
import {
  CreatePlanningBriefInputSchema,
  DefaultPlanningService,
  PlanningStageStatusSchema,
  type InspirationSeed,
  type PlanningBrief,
} from '@cybernovelist/core';
import { hasStudioBookRuntime } from '../core-bridge';
import { readWorkflowDocument, writeWorkflowDocument } from './workflow-store';

const INSPIRATION_FILE = 'inspiration-seed.json';
const PLANNING_BRIEF_FILE = 'planning-brief.json';

const createPlanningBriefRouteSchema = CreatePlanningBriefInputSchema.omit({ seedId: true });
const updatePlanningBriefRouteSchema = createPlanningBriefRouteSchema.partial().extend({
  status: PlanningStageStatusSchema.optional(),
});

type UpdatePlanningBriefPatch = z.infer<typeof updatePlanningBriefRouteSchema>;

export function createPlanningBriefRouter(): Hono {
  const router = new Hono();
  const service = new DefaultPlanningService();

  router.get('/', (c) => {
    const bookId = c.req.param('bookId');
    if (!bookId) {
      return c.json({ error: { code: 'INVALID_STATE', message: '缺少 bookId' } }, 400);
    }
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const document = readWorkflowDocument<PlanningBrief>(bookId, PLANNING_BRIEF_FILE);
    return c.json({ data: document, exists: document !== null });
  });

  router.post('/', async (c) => {
    const bookId = c.req.param('bookId');
    if (!bookId) {
      return c.json({ error: { code: 'INVALID_STATE', message: '缺少 bookId' } }, 400);
    }
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    if (readWorkflowDocument<PlanningBrief>(bookId, PLANNING_BRIEF_FILE)) {
      return c.json(
        { error: { code: 'STAGE_ALREADY_EXISTS', message: '当前书籍已存在规划简报' } },
        409,
      );
    }

    const seed = readWorkflowDocument<InspirationSeed>(bookId, INSPIRATION_FILE);
    if (!seed) {
      return c.json(
        { error: { code: 'UPSTREAM_REQUIRED', message: '请先完成灵感输入，再创建规划简报' } },
        409,
      );
    }

    const body = await c.req.json().catch(() => ({}));
    const result = createPlanningBriefRouteSchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: result.error.errors[0].message } },
        400,
      );
    }

    const brief = service.createBrief({
      seedId: seed.id,
      ...result.data,
    });
    writeWorkflowDocument(bookId, PLANNING_BRIEF_FILE, brief);
    return c.json({ data: brief }, 201);
  });

  router.patch('/', async (c) => {
    const bookId = c.req.param('bookId');
    if (!bookId) {
      return c.json({ error: { code: 'INVALID_STATE', message: '缺少 bookId' } }, 400);
    }
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const current = readWorkflowDocument<PlanningBrief>(bookId, PLANNING_BRIEF_FILE);
    if (!current) {
      return c.json(
        { error: { code: 'STAGE_NOT_FOUND', message: '当前书籍尚未创建规划简报' } },
        404,
      );
    }

    const body = await c.req.json().catch(() => ({}));
    const result = updatePlanningBriefRouteSchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: result.error.errors[0].message } },
        400,
      );
    }

    const updated = service.updateBrief(current, result.data as UpdatePlanningBriefPatch);
    writeWorkflowDocument(bookId, PLANNING_BRIEF_FILE, updated);
    return c.json({ data: updated });
  });

  return router;
}
