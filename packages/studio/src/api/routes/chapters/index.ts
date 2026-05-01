import { Hono } from 'hono';
import { hasStudioBookRuntime } from '../../core-bridge';
import { readChapterRecord, listChapterRecords } from './chapter-reader';
import { readNormalizedAuditReport } from './chapter-audit';
import { createWriterRouter } from './chapter-writer';
import { createDeleterRouter } from './chapter-deleter';
import { getPersistence } from './chapter-reader';

export function createChapterRouter(): Hono {
  const router = new Hono();

  router.get('/', (c) => {
    const bookId = c.req.param('bookId')!;
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const status = c.req.query('status');
    const chapters = listChapterRecords(bookId);

    let filtered = chapters;
    if (status && status !== 'all') {
      filtered = chapters.filter((ch) => ch.status === status);
    }

    return c.json({ data: filtered, total: filtered.length });
  });

  router.get('/:chapterNumber', (c) => {
    const bookId = c.req.param('bookId')!;
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const chapterNumber = parseInt(c.req.param('chapterNumber')!, 10);
    const chapter = readChapterRecord(bookId, chapterNumber);
    if (!chapter) {
      return c.json({ error: { code: 'CHAPTER_NOT_FOUND', message: '章节不存在' } }, 404);
    }
    return c.json({ data: chapter });
  });

  router.get('/:chapterNumber/snapshots', (c) => {
    const bookId = c.req.param('bookId')!;
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const chapterNumber = parseInt(c.req.param('chapterNumber')!, 10);
    const chapter = readChapterRecord(bookId, chapterNumber);
    if (!chapter) {
      return c.json({ error: { code: 'CHAPTER_NOT_FOUND', message: '章节不存在' } }, 404);
    }

    const snapshots = getPersistence()
      .listSnapshots(bookId)
      .filter((snapshot) => snapshot.chapterNumber === chapterNumber)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((snapshot, index) => ({
        id: snapshot.id,
        chapter: snapshot.chapterNumber,
        label: `第${snapshot.chapterNumber}章快照${index === 0 ? '' : ` ${index + 1}`}`,
        timestamp: snapshot.createdAt,
      }));

    return c.json({ data: snapshots });
  });

  router.get('/:chapterNumber/audit-report', async (c) => {
    const bookId = c.req.param('bookId')!;
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const chapterNumber = parseInt(c.req.param('chapterNumber')!, 10);
    const chapter = readChapterRecord(bookId, chapterNumber);
    if (!chapter) {
      return c.json({ error: { code: 'CHAPTER_NOT_FOUND', message: '章节不存在' } }, 404);
    }

    const auditReport = readNormalizedAuditReport(bookId, chapterNumber, chapter.content);
    if (!auditReport) {
      return c.json({ data: { overallStatus: 'not_audited' } });
    }

    return c.json({ data: auditReport });
  });

  const writerRouter = createWriterRouter();
  router.route('/', writerRouter);

  const deleterRouter = createDeleterRouter();
  router.route('/', deleterRouter);

  return router;
}
