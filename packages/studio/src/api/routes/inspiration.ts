import { Hono } from 'hono';
import {
  CreateInspirationSeedInputSchema,
  InspirationSeedSchema,
  DefaultInspirationService,
  type InspirationSeed,
} from '@cybernovelist/core';
import { hasStudioBookRuntime } from '../core-bridge';
import { readWorkflowDocument, writeWorkflowDocument } from './workflow-store';

const INSPIRATION_FILE = 'inspiration-seed.json';
const inspirationPatchSchema = CreateInspirationSeedInputSchema.partial();

export function createInspirationRouter(): Hono {
  const router = new Hono();
  const service = new DefaultInspirationService();

  router.get('/', (c) => {
    const bookId = c.req.param('bookId');
    if (!bookId) {
      return c.json({ error: { code: 'INVALID_STATE', message: '缺少 bookId' } }, 400);
    }
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const document = readWorkflowDocument<InspirationSeed>(bookId, INSPIRATION_FILE);
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

    if (readWorkflowDocument<InspirationSeed>(bookId, INSPIRATION_FILE)) {
      return c.json(
        { error: { code: 'STAGE_ALREADY_EXISTS', message: '当前书籍已存在灵感输入结果' } },
        409,
      );
    }

    const body = await c.req.json().catch(() => ({}));
    const result = CreateInspirationSeedInputSchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: result.error.errors[0].message } },
        400,
      );
    }

    const seed = service.createSeed(result.data);
    writeWorkflowDocument(bookId, INSPIRATION_FILE, seed);
    return c.json({ data: seed }, 201);
  });

  router.patch('/', async (c) => {
    const bookId = c.req.param('bookId');
    if (!bookId) {
      return c.json({ error: { code: 'INVALID_STATE', message: '缺少 bookId' } }, 400);
    }
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const current = readWorkflowDocument<InspirationSeed>(bookId, INSPIRATION_FILE);
    if (!current) {
      return c.json(
        { error: { code: 'STAGE_NOT_FOUND', message: '当前书籍尚未创建灵感输入结果' } },
        404,
      );
    }

    const body = await c.req.json().catch(() => ({}));
    const result = inspirationPatchSchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: result.error.errors[0].message } },
        400,
      );
    }

    const patch = result.data;
    const updated = InspirationSeedSchema.parse({
      ...current,
      ...patch,
      sourceText: patch.sourceText?.trim() ?? current.sourceText,
      genre: patch.genre?.trim() || current.genre,
      theme: patch.theme?.trim() || current.theme,
      conflict: patch.conflict?.trim() || current.conflict,
      tone: patch.tone?.trim() || current.tone,
      constraints: patch.constraints
        ? [...new Set(patch.constraints.map((item) => item.trim()).filter(Boolean))]
        : current.constraints,
    });

    writeWorkflowDocument(bookId, INSPIRATION_FILE, updated);
    return c.json({ data: updated });
  });

  return router;
}
