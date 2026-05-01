import { Hono } from 'hono';
import * as fs from 'node:fs';
import { hasStudioBookRuntime } from '../../core-bridge';
import {
  readChapterRecord,
  rewriteIndex,
  removeAuditReport,
  getStateManager,
} from './chapter-reader';

export function createDeleterRouter(): Hono {
  const router = new Hono();

  router.delete('/:chapterNumber', (c) => {
    const bookId = c.req.param('bookId')!;
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const chapterNumber = parseInt(c.req.param('chapterNumber')!, 10);
    const chapter = readChapterRecord(bookId, chapterNumber);
    if (!chapter) {
      return c.json({ error: { code: 'CHAPTER_NOT_FOUND', message: '章节不存在' } }, 404);
    }

    const filePath = getStateManager().getChapterFilePath(bookId, chapterNumber);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    rewriteIndex(bookId, (index) => ({
      ...index,
      chapters: index.chapters.filter((ch) => ch.number !== chapterNumber),
    }));

    removeAuditReport(bookId, chapterNumber);

    return c.body(null, 204);
  });

  return router;
}
