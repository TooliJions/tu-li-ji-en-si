import { Hono } from 'hono';
import {
  CreateWritingSessionInputSchema,
  WritingSessionSchema,
  UpdateWritingSessionPatchSchema,
  DefaultWritingService,
  type WritingSession,
} from '@cybernovelist/core';
import { hasStudioBookRuntime } from '../core-bridge';
import { readWorkflowDocument, writeWorkflowDocument } from './workflow-store';

const WRITING_FILE = 'writing-sessions.json';

interface WritingDocument {
  sessions: WritingSession[];
  updatedAt: string;
}

function readDoc(bookId: string): WritingDocument | null {
  return readWorkflowDocument<WritingDocument>(bookId, WRITING_FILE);
}

function writeDoc(bookId: string, doc: WritingDocument): void {
  writeWorkflowDocument(bookId, WRITING_FILE, doc);
}

export function createWritingRouter(): Hono {
  const router = new Hono();
  const service = new DefaultWritingService();

  // GET /api/books/:bookId/writing
  router.get('/', (c) => {
    const bookId = c.req.param('bookId');
    if (!bookId) {
      return c.json({ error: { code: 'INVALID_STATE', message: '缺少 bookId' } }, 400);
    }
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const doc = readDoc(bookId);
    return c.json({ data: doc?.sessions ?? [], exists: doc !== null });
  });

  // GET /api/books/:bookId/writing/:sessionId
  router.get('/:sessionId', (c) => {
    const bookId = c.req.param('bookId');
    const sessionId = c.req.param('sessionId');
    if (!bookId || !sessionId) {
      return c.json({ error: { code: 'INVALID_STATE', message: '参数无效' } }, 400);
    }
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const doc = readDoc(bookId);
    const session = doc?.sessions.find((s) => s.id === sessionId) ?? null;
    return c.json({ data: session, exists: session !== null });
  });

  // POST /api/books/:bookId/writing
  router.post('/', async (c) => {
    const bookId = c.req.param('bookId');
    if (!bookId) {
      return c.json({ error: { code: 'INVALID_STATE', message: '缺少 bookId' } }, 400);
    }
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const body = await c.req.json().catch(() => ({}));
    const result = CreateWritingSessionInputSchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: result.error.errors[0].message } },
        400,
      );
    }

    const doc = readDoc(bookId) ?? { sessions: [], updatedAt: new Date().toISOString() };
    const session = service.createSession(result.data);
    doc.sessions.push(session);
    doc.updatedAt = new Date().toISOString();
    writeDoc(bookId, doc);

    return c.json({ data: session }, 201);
  });

  // PATCH /api/books/:bookId/writing/:sessionId
  router.patch('/:sessionId', async (c) => {
    const bookId = c.req.param('bookId');
    const sessionId = c.req.param('sessionId');
    if (!bookId || !sessionId) {
      return c.json({ error: { code: 'INVALID_STATE', message: '参数无效' } }, 400);
    }
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const doc = readDoc(bookId);
    if (!doc) {
      return c.json({ error: { code: 'NOT_FOUND', message: '当前书籍尚未创建写作会话' } }, 404);
    }

    const index = doc.sessions.findIndex((s) => s.id === sessionId);
    if (index === -1) {
      return c.json({ error: { code: 'NOT_FOUND', message: '写作会话不存在' } }, 404);
    }

    const body = await c.req.json().catch(() => ({}));
    const result = UpdateWritingSessionPatchSchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: result.error.errors[0].message } },
        400,
      );
    }

    const current = doc.sessions[index];
    const updated = WritingSessionSchema.parse({
      ...current,
      ...result.data,
      updatedAt: new Date().toISOString(),
    });

    doc.sessions[index] = updated;
    doc.updatedAt = new Date().toISOString();
    writeDoc(bookId, doc);

    return c.json({ data: updated });
  });

  // POST /api/books/:bookId/writing/:sessionId/draft
  router.post('/:sessionId/draft', async (c) => {
    const bookId = c.req.param('bookId');
    const sessionId = c.req.param('sessionId');
    if (!bookId || !sessionId) {
      return c.json({ error: { code: 'INVALID_STATE', message: '参数无效' } }, 400);
    }
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const doc = readDoc(bookId);
    if (!doc) {
      return c.json({ error: { code: 'NOT_FOUND', message: '当前书籍尚未创建写作会话' } }, 404);
    }

    const index = doc.sessions.findIndex((s) => s.id === sessionId);
    if (index === -1) {
      return c.json({ error: { code: 'NOT_FOUND', message: '写作会话不存在' } }, 404);
    }

    const body = await c.req.json().catch(() => ({}));
    const draft = typeof body.draft === 'string' ? body.draft : '';

    const current = doc.sessions[index];
    const updated = service.setDraft(current, draft);
    doc.sessions[index] = updated;
    doc.updatedAt = new Date().toISOString();
    writeDoc(bookId, doc);

    return c.json({ data: updated });
  });

  return router;
}
