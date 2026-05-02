import { Hono } from 'hono';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { hasStudioBookRuntime, getStudioRuntimeRootDir } from '../../core-bridge';
import {
  readChapterRecord,
  createChapterSnapshot,
  persistChapterRecord,
  rewriteIndex,
  removeAuditReport,
  mergeWarningMeta,
  updateChapterSchema,
  mergeSchema,
  splitSchema,
  rollbackSchema,
  writeAuditReport,
  getStateManager,
  getPersistence,
} from './chapter-reader';
import { buildChapterAuditReport } from './chapter-audit';

export function createWriterRouter(): Hono {
  const router = new Hono();

  router.patch('/:chapterNumber', async (c) => {
    const bookId = c.req.param('bookId')!;
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const chapterNumber = parseInt(c.req.param('chapterNumber')!, 10);
    const chapter = readChapterRecord(bookId, chapterNumber);
    if (!chapter) {
      return c.json({ error: { code: 'CHAPTER_NOT_FOUND', message: '章节不存在' } }, 404);
    }

    const body = await c.req.json().catch(() => ({}));
    const result = updateChapterSchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: result.error.errors[0].message } },
        400,
      );
    }

    createChapterSnapshot(bookId, chapterNumber);

    const nextTitle = result.data.title !== undefined ? result.data.title : chapter.title;
    const nextContent = result.data.content ?? chapter.content;
    const updated = await persistChapterRecord(
      bookId,
      chapterNumber,
      nextTitle,
      nextContent,
      chapter.status,
      {
        warningCode: chapter.warningCode,
        warning: chapter.warning,
      },
    );

    if (result.data.content) {
      removeAuditReport(bookId, chapterNumber);
      updated.auditStatus = null;
      updated.auditReport = null;
    }

    return c.json({ data: updated });
  });

  router.post('/merge', async (c) => {
    const bookId = c.req.param('bookId')!;
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const body = await c.req.json().catch(() => ({}));
    const result = mergeSchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: result.error.errors[0].message } },
        400,
      );
    }

    const { fromChapter, toChapter } = result.data;
    const from = readChapterRecord(bookId, fromChapter);
    const to = readChapterRecord(bookId, toChapter);

    if (!from || !to) {
      return c.json({ error: { code: 'CHAPTER_NOT_FOUND', message: '章节不存在' } }, 400);
    }

    createChapterSnapshot(bookId, fromChapter);
    createChapterSnapshot(bookId, toChapter);

    const merged = await persistChapterRecord(
      bookId,
      toChapter,
      to.title,
      `${from.content}\n\n${to.content}`,
      to.status,
      mergeWarningMeta(from, to),
    );

    rewriteIndex(bookId, (index) => ({
      ...index,
      chapters: index.chapters
        .filter((chapter) => chapter.number !== fromChapter)
        .map((chapter) =>
          chapter.number === toChapter ? { ...chapter, wordCount: merged.wordCount } : chapter,
        ),
    }));

    const fromPath = getStateManager().getChapterFilePath(bookId, fromChapter);
    if (fs.existsSync(fromPath)) {
      fs.unlinkSync(fromPath);
    }
    removeAuditReport(bookId, fromChapter);
    removeAuditReport(bookId, toChapter);

    return c.json({ data: { ...merged, auditStatus: null, auditReport: null } });
  });

  router.post('/:chapterNumber/split', async (c) => {
    const bookId = c.req.param('bookId')!;
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const chapterNumber = parseInt(c.req.param('chapterNumber')!, 10);
    const chapter = readChapterRecord(bookId, chapterNumber);
    if (!chapter) {
      return c.json({ error: { code: 'CHAPTER_NOT_FOUND', message: '章节不存在' } }, 404);
    }

    const body = await c.req.json().catch(() => ({}));
    const result = splitSchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: result.error.errors[0].message } },
        400,
      );
    }

    const newNumber = chapterNumber + 1;
    if (readChapterRecord(bookId, newNumber)) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: '目标拆分章节号已存在，暂不支持自动顺延' } },
        400,
      );
    }

    if (result.data.splitAtPosition >= chapter.content.length) {
      return c.json({ error: { code: 'INVALID_STATE', message: '拆分位置超出章节内容范围' } }, 400);
    }

    const left = chapter.content.slice(0, result.data.splitAtPosition).trim();
    const right = chapter.content.slice(result.data.splitAtPosition).trim();
    if (!left || !right) {
      return c.json({ error: { code: 'INVALID_STATE', message: '拆分后章节内容不能为空' } }, 400);
    }

    createChapterSnapshot(bookId, chapterNumber);

    const updatedCurrent = await persistChapterRecord(
      bookId,
      chapterNumber,
      chapter.title,
      left,
      chapter.status,
      chapter,
    );

    const newChapter = await persistChapterRecord(bookId, newNumber, null, right, 'draft', chapter);
    removeAuditReport(bookId, chapterNumber);
    removeAuditReport(bookId, newNumber);

    return c.json({
      data: [
        { ...updatedCurrent, auditStatus: null, auditReport: null },
        { ...newChapter, title: null, auditStatus: null, auditReport: null },
      ],
    });
  });

  router.post('/:chapterNumber/rollback', async (c) => {
    const bookId = c.req.param('bookId')!;
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const chapterNumber = parseInt(c.req.param('chapterNumber')!, 10);
    const chapter = readChapterRecord(bookId, chapterNumber);
    if (!chapter) {
      return c.json({ error: { code: 'CHAPTER_NOT_FOUND', message: '章节不存在' } }, 404);
    }

    const body = await c.req.json().catch(() => ({}));
    const result = rollbackSchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: result.error.errors[0].message } },
        400,
      );
    }

    const snapshotsRoot = path.join(
      getStudioRuntimeRootDir(),
      bookId,
      'story',
      'state',
      'snapshots',
    );
    const snapshotDir = path.join(snapshotsRoot, result.data.toSnapshot);
    const normalizedSnapshotDir = path.resolve(snapshotDir);
    const normalizedSnapshotsRoot = path.resolve(snapshotsRoot);
    if (!normalizedSnapshotDir.startsWith(normalizedSnapshotsRoot + path.sep)) {
      return c.json({ error: { code: 'INVALID_STATE', message: 'toSnapshot 路径非法' } }, 400);
    }
    const chapterFileName = path.basename(
      getStateManager().getChapterFilePath(bookId, chapterNumber),
    );
    const snapshotChapterPath = path.join(snapshotDir, chapterFileName);

    if (fs.existsSync(snapshotChapterPath)) {
      fs.copyFileSync(
        snapshotChapterPath,
        getStateManager().getChapterFilePath(bookId, chapterNumber),
      );
      void getPersistence().rollbackToSnapshot(bookId, result.data.toSnapshot);
    }

    return c.json({ data: readChapterRecord(bookId, chapterNumber) ?? chapter });
  });

  router.post('/:chapterNumber/audit', async (c) => {
    const bookId = c.req.param('bookId')!;
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const chapterNumber = parseInt(c.req.param('chapterNumber')!, 10);
    const chapter = readChapterRecord(bookId, chapterNumber);
    if (!chapter) {
      return c.json({ error: { code: 'CHAPTER_NOT_FOUND', message: '章节不存在' } }, 404);
    }

    const report = buildChapterAuditReport(chapterNumber, chapter.content);
    writeAuditReport(bookId, chapterNumber, report);

    return c.json({ data: report });
  });

  return router;
}
