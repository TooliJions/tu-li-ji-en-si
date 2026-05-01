import { Hono } from 'hono';
import {
  CreateQualityGateResultInputSchema,
  QualityGateResultSchema,
  UpdateQualityGateResultPatchSchema,
  QualityGateRepairActionSchema,
  DefaultQualityService,
  type QualityGateResult,
} from '@cybernovelist/core';
import { hasStudioBookRuntime } from '../core-bridge';
import { readWorkflowDocument, writeWorkflowDocument } from './workflow-store';

const QUALITY_FILE = 'quality-audits.json';

interface QualityDocument {
  audits: QualityGateResult[];
  updatedAt: string;
}

function readDoc(bookId: string): QualityDocument | null {
  return readWorkflowDocument<QualityDocument>(bookId, QUALITY_FILE);
}

function writeDoc(bookId: string, doc: QualityDocument): void {
  writeWorkflowDocument(bookId, QUALITY_FILE, doc);
}

export function createQualityRouter(): Hono {
  const router = new Hono();
  const service = new DefaultQualityService();

  // GET /api/books/:bookId/quality
  router.get('/', (c) => {
    const bookId = c.req.param('bookId');
    if (!bookId) {
      return c.json({ error: { code: 'INVALID_STATE', message: '缺少 bookId' } }, 400);
    }
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const doc = readDoc(bookId);
    return c.json({ data: doc?.audits ?? [], exists: doc !== null });
  });

  // GET /api/books/:bookId/quality/:auditId
  router.get('/:auditId', (c) => {
    const bookId = c.req.param('bookId');
    const auditId = c.req.param('auditId');
    if (!bookId || !auditId) {
      return c.json({ error: { code: 'INVALID_STATE', message: '参数无效' } }, 400);
    }
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const doc = readDoc(bookId);
    const audit = doc?.audits.find((a) => a.id === auditId) ?? null;
    return c.json({ data: audit, exists: audit !== null });
  });

  // POST /api/books/:bookId/quality
  router.post('/', async (c) => {
    const bookId = c.req.param('bookId');
    if (!bookId) {
      return c.json({ error: { code: 'INVALID_STATE', message: '缺少 bookId' } }, 400);
    }
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const body = await c.req.json().catch(() => ({}));
    const result = CreateQualityGateResultInputSchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: result.error.errors[0].message } },
        400,
      );
    }

    const doc = readDoc(bookId) ?? { audits: [], updatedAt: new Date().toISOString() };
    const audit = service.createAudit(result.data);
    doc.audits.push(audit);
    doc.updatedAt = new Date().toISOString();
    writeDoc(bookId, doc);

    return c.json({ data: audit }, 201);
  });

  // PATCH /api/books/:bookId/quality/:auditId
  router.patch('/:auditId', async (c) => {
    const bookId = c.req.param('bookId');
    const auditId = c.req.param('auditId');
    if (!bookId || !auditId) {
      return c.json({ error: { code: 'INVALID_STATE', message: '参数无效' } }, 400);
    }
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const doc = readDoc(bookId);
    if (!doc) {
      return c.json({ error: { code: 'NOT_FOUND', message: '当前书籍尚未创建质量审计' } }, 404);
    }

    const index = doc.audits.findIndex((a) => a.id === auditId);
    if (index === -1) {
      return c.json({ error: { code: 'NOT_FOUND', message: '质量审计不存在' } }, 404);
    }

    const body = await c.req.json().catch(() => ({}));
    const result = UpdateQualityGateResultPatchSchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: result.error.errors[0].message } },
        400,
      );
    }

    const current = doc.audits[index];
    const updated = QualityGateResultSchema.parse({
      ...current,
      ...result.data,
      updatedAt: new Date().toISOString(),
    });

    doc.audits[index] = updated;
    doc.updatedAt = new Date().toISOString();
    writeDoc(bookId, doc);

    return c.json({ data: updated });
  });

  // POST /api/books/:bookId/quality/:auditId/decision
  router.post('/:auditId/decision', async (c) => {
    const bookId = c.req.param('bookId');
    const auditId = c.req.param('auditId');
    if (!bookId || !auditId) {
      return c.json({ error: { code: 'INVALID_STATE', message: '参数无效' } }, 400);
    }
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const doc = readDoc(bookId);
    if (!doc) {
      return c.json({ error: { code: 'NOT_FOUND', message: '当前书籍尚未创建质量审计' } }, 404);
    }

    const index = doc.audits.findIndex((a) => a.id === auditId);
    if (index === -1) {
      return c.json({ error: { code: 'NOT_FOUND', message: '质量审计不存在' } }, 404);
    }

    const body = await c.req.json().catch(() => ({}));
    const decision = body.decision;
    if (!decision || !['pass', 'warning', 'fail', 'pending'].includes(decision)) {
      return c.json({ error: { code: 'INVALID_STATE', message: '无效的决策值' } }, 400);
    }

    const current = doc.audits[index];
    const updated = service.setFinalDecision(current, decision);
    doc.audits[index] = updated;
    doc.updatedAt = new Date().toISOString();
    writeDoc(bookId, doc);

    return c.json({ data: updated });
  });

  // POST /api/books/:bookId/quality/:auditId/repair
  router.post('/:auditId/repair', async (c) => {
    const bookId = c.req.param('bookId');
    const auditId = c.req.param('auditId');
    if (!bookId || !auditId) {
      return c.json({ error: { code: 'INVALID_STATE', message: '参数无效' } }, 400);
    }
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const doc = readDoc(bookId);
    if (!doc) {
      return c.json({ error: { code: 'NOT_FOUND', message: '当前书籍尚未创建质量审计' } }, 404);
    }

    const index = doc.audits.findIndex((a) => a.id === auditId);
    if (index === -1) {
      return c.json({ error: { code: 'NOT_FOUND', message: '质量审计不存在' } }, 404);
    }

    const body = await c.req.json().catch(() => ({}));
    const actionResult = QualityGateRepairActionSchema.safeParse(body);
    if (!actionResult.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: actionResult.error.errors[0].message } },
        400,
      );
    }

    const current = doc.audits[index];
    const updated = service.addRepairAction(current, actionResult.data);
    doc.audits[index] = updated;
    doc.updatedAt = new Date().toISOString();
    writeDoc(bookId, doc);

    return c.json({ data: updated });
  });

  return router;
}
