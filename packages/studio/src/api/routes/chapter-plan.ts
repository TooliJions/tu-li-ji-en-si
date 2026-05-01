import { Hono } from 'hono';
import {
  CreateChapterPlanInputSchema,
  ChapterPlanSchema,
  UpdateChapterPlanPatchSchema,
  DefaultChapterPlanService,
  type ChapterPlanRecord,
} from '@cybernovelist/core';
import { hasStudioBookRuntime } from '../core-bridge';
import { readWorkflowDocument, writeWorkflowDocument } from './workflow-store';

const CHAPTER_PLAN_FILE = 'chapter-plans.json';

interface ChapterPlansDocument {
  plans: ChapterPlanRecord[];
  updatedAt: string;
}

function readPlans(bookId: string): ChapterPlansDocument | null {
  return readWorkflowDocument<ChapterPlansDocument>(bookId, CHAPTER_PLAN_FILE);
}

function writePlans(bookId: string, doc: ChapterPlansDocument): void {
  writeWorkflowDocument(bookId, CHAPTER_PLAN_FILE, doc);
}

export function createChapterPlanRouter(): Hono {
  const router = new Hono();
  const service = new DefaultChapterPlanService();

  // GET /api/books/:bookId/chapter-plans
  router.get('/', (c) => {
    const bookId = c.req.param('bookId');
    if (!bookId) {
      return c.json({ error: { code: 'INVALID_STATE', message: '缺少 bookId' } }, 400);
    }
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const doc = readPlans(bookId);
    return c.json({ data: doc?.plans ?? [], exists: doc !== null });
  });

  // GET /api/books/:bookId/chapter-plans/:chapterNumber
  router.get('/:chapterNumber', (c) => {
    const bookId = c.req.param('bookId');
    const chapterNumber = Number(c.req.param('chapterNumber'));
    if (!bookId || Number.isNaN(chapterNumber)) {
      return c.json({ error: { code: 'INVALID_STATE', message: '参数无效' } }, 400);
    }
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const doc = readPlans(bookId);
    const plan = doc?.plans.find((p) => p.chapterNumber === chapterNumber) ?? null;
    return c.json({ data: plan, exists: plan !== null });
  });

  // POST /api/books/:bookId/chapter-plans
  router.post('/', async (c) => {
    const bookId = c.req.param('bookId');
    if (!bookId) {
      return c.json({ error: { code: 'INVALID_STATE', message: '缺少 bookId' } }, 400);
    }
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const body = await c.req.json().catch(() => ({}));
    const result = CreateChapterPlanInputSchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: result.error.errors[0].message } },
        400,
      );
    }

    const doc = readPlans(bookId) ?? { plans: [], updatedAt: new Date().toISOString() };
    if (doc.plans.some((p) => p.chapterNumber === result.data.chapterNumber)) {
      return c.json(
        {
          error: {
            code: 'ALREADY_EXISTS',
            message: `第 ${result.data.chapterNumber} 章计划已存在`,
          },
        },
        409,
      );
    }

    const plan = service.createPlan(result.data);
    doc.plans.push(plan);
    doc.plans.sort((a, b) => a.chapterNumber - b.chapterNumber);
    doc.updatedAt = new Date().toISOString();
    writePlans(bookId, doc);

    return c.json({ data: plan }, 201);
  });

  // PATCH /api/books/:bookId/chapter-plans/:chapterNumber
  router.patch('/:chapterNumber', async (c) => {
    const bookId = c.req.param('bookId');
    const chapterNumber = Number(c.req.param('chapterNumber'));
    if (!bookId || Number.isNaN(chapterNumber)) {
      return c.json({ error: { code: 'INVALID_STATE', message: '参数无效' } }, 400);
    }
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const doc = readPlans(bookId);
    if (!doc) {
      return c.json({ error: { code: 'NOT_FOUND', message: '当前书籍尚未创建章节计划' } }, 404);
    }

    const index = doc.plans.findIndex((p) => p.chapterNumber === chapterNumber);
    if (index === -1) {
      return c.json(
        { error: { code: 'NOT_FOUND', message: `第 ${chapterNumber} 章计划不存在` } },
        404,
      );
    }

    const body = await c.req.json().catch(() => ({}));
    const result = UpdateChapterPlanPatchSchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: result.error.errors[0].message } },
        400,
      );
    }

    const current = doc.plans[index];
    const updated = ChapterPlanSchema.parse({
      ...current,
      ...result.data,
      updatedAt: new Date().toISOString(),
    });

    doc.plans[index] = updated;
    doc.updatedAt = new Date().toISOString();
    writePlans(bookId, doc);

    return c.json({ data: updated });
  });

  // POST /api/books/:bookId/chapter-plans/:chapterNumber/status
  router.post('/:chapterNumber/status', async (c) => {
    const bookId = c.req.param('bookId');
    const chapterNumber = Number(c.req.param('chapterNumber'));
    if (!bookId || Number.isNaN(chapterNumber)) {
      return c.json({ error: { code: 'INVALID_STATE', message: '参数无效' } }, 400);
    }
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const doc = readPlans(bookId);
    if (!doc) {
      return c.json({ error: { code: 'NOT_FOUND', message: '当前书籍尚未创建章节计划' } }, 404);
    }

    const index = doc.plans.findIndex((p) => p.chapterNumber === chapterNumber);
    if (index === -1) {
      return c.json(
        { error: { code: 'NOT_FOUND', message: `第 ${chapterNumber} 章计划不存在` } },
        404,
      );
    }

    const body = await c.req.json().catch(() => ({}));
    const status = body.status;
    if (!status || !['draft', 'ready', 'writing', 'published'].includes(status)) {
      return c.json({ error: { code: 'INVALID_STATE', message: '无效的状态值' } }, 400);
    }

    const current = doc.plans[index];
    const updated = service.setStatus(current, status);
    doc.plans[index] = updated;
    doc.updatedAt = new Date().toISOString();
    writePlans(bookId, doc);

    return c.json({ data: updated });
  });

  return router;
}
