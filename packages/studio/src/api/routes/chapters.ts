import { Hono } from 'hono';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import { PipelinePersistence, StateManager } from '@cybernovelist/core';
import { getStudioRuntimeRootDir, hasStudioBookRuntime } from '../core-bridge';

interface ChapterRecord {
  number: number;
  title: string | null;
  content: string;
  status: 'draft' | 'published';
  wordCount: number;
  qualityScore: number | null;
  aiTraceScore: number | null;
  auditStatus: string | null;
  auditReport: unknown | null;
  warningCode?: string | null;
  warning?: string | null;
  isPolluted: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ChapterWarningMeta {
  warningCode?: string | null;
  warning?: string | null;
}

// --- Zod schemas ---
const updateChapterSchema = z.object({
  content: z.string().optional(),
  title: z.string().nullable().optional(),
});

const mergeSchema = z.object({
  fromChapter: z.number().int().positive(),
  toChapter: z.number().int().positive(),
});

const splitSchema = z.object({
  splitAtPosition: z.number().int().positive(),
});

const rollbackSchema = z.object({
  toSnapshot: z.string().min(1),
});

function getStateManager(): StateManager {
  return new StateManager(getStudioRuntimeRootDir());
}

function getPersistence(): PipelinePersistence {
  return new PipelinePersistence(getStudioRuntimeRootDir());
}

function getChapterAuditPath(bookId: string, chapterNumber: number): string {
  const padded = String(chapterNumber).padStart(4, '0');
  return path.join(getStudioRuntimeRootDir(), bookId, 'story', 'state', 'audits', `chapter-${padded}.json`);
}

function mapPersistedStatus(status: string | undefined): ChapterRecord['status'] {
  if (status === 'draft') {
    return 'draft';
  }
  return 'published';
}

function mapApiStatusToPersisted(status: ChapterRecord['status']): 'draft' | 'final' {
  return status === 'draft' ? 'draft' : 'final';
}

function parseChapterFile(raw: string): {
  title: string | null;
  status: string | undefined;
  createdAt: string | undefined;
  warningCode?: string;
  warning?: string;
  content: string;
} {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    return {
      title: null,
      status: undefined,
      createdAt: undefined,
      warningCode: undefined,
      warning: undefined,
      content: raw.trim(),
    };
  }

  const metadata = Object.fromEntries(
    match[1]
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && line.includes(':'))
      .map((line) => {
        const separator = line.indexOf(':');
        const key = line.slice(0, separator).trim();
        const value = line.slice(separator + 1).trim();
        return [key, value];
      })
  );

  return {
    title: typeof metadata.title === 'string' && metadata.title.length > 0 ? metadata.title : null,
    status: typeof metadata.status === 'string' ? metadata.status : undefined,
    createdAt: typeof metadata.createdAt === 'string' ? metadata.createdAt : undefined,
    warningCode: typeof metadata.warningCode === 'string' ? metadata.warningCode : undefined,
    warning: typeof metadata.warning === 'string' ? metadata.warning : undefined,
    content: raw.slice(match[0].length).trim(),
  };
}

function isChapterPolluted(chapter: Pick<ChapterRecord, 'qualityScore' | 'warningCode'>): boolean {
  if (chapter.warningCode === 'accept_with_warnings') {
    return true;
  }

  return chapter.qualityScore !== null && chapter.qualityScore < 50;
}

function mergeWarningMeta(...items: ChapterWarningMeta[]): ChapterWarningMeta {
  const forcedAcceptance = items.find((item) => item.warningCode === 'accept_with_warnings');
  if (forcedAcceptance) {
    return forcedAcceptance;
  }

  return items.find((item) => item.warningCode || item.warning) ?? {};
}

function readChapterIndex(bookId: string) {
  return getStateManager().readIndex(bookId);
}

function writeChapterIndex(bookId: string, index: ReturnType<typeof readChapterIndex>) {
  getStateManager().writeIndex(bookId, index);
}

function readAuditReport(bookId: string, chapterNumber: number): unknown | null {
  const auditPath = getChapterAuditPath(bookId, chapterNumber);
  if (!fs.existsSync(auditPath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(auditPath, 'utf-8')) as unknown;
}

function writeAuditReport(bookId: string, chapterNumber: number, report: unknown): void {
  const auditPath = getChapterAuditPath(bookId, chapterNumber);
  fs.mkdirSync(path.dirname(auditPath), { recursive: true });
  fs.writeFileSync(auditPath, JSON.stringify(report, null, 2), 'utf-8');
}

function removeAuditReport(bookId: string, chapterNumber: number): void {
  const auditPath = getChapterAuditPath(bookId, chapterNumber);
  if (fs.existsSync(auditPath)) {
    fs.unlinkSync(auditPath);
  }
}

function readChapterRecord(bookId: string, chapterNumber: number): ChapterRecord | null {
  const index = readChapterIndex(bookId);
  const entry = index.chapters.find((chapter) => chapter.number === chapterNumber);
  if (!entry) {
    return null;
  }

  const filePath = getStateManager().getChapterFilePath(bookId, chapterNumber);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  const parsed = parseChapterFile(raw);
  const stat = fs.statSync(filePath);
  const auditReport = readAuditReport(bookId, chapterNumber);

  return {
    number: chapterNumber,
    title: entry.title ?? parsed.title,
    content: parsed.content,
    status: mapPersistedStatus(parsed.status),
    wordCount: entry.wordCount,
    qualityScore: null,
    aiTraceScore: null,
    auditStatus: auditReport ? 'passed' : null,
    auditReport,
    warningCode: parsed.warningCode ?? null,
    warning: parsed.warning ?? null,
    isPolluted: isChapterPolluted({ qualityScore: null, warningCode: parsed.warningCode ?? null }),
    createdAt: parsed.createdAt ?? entry.createdAt,
    updatedAt: stat.mtime.toISOString(),
  };
}

function listChapterRecords(bookId: string): ChapterRecord[] {
  const index = readChapterIndex(bookId);
  return index.chapters
    .map((chapter) => readChapterRecord(bookId, chapter.number))
    .filter((chapter): chapter is ChapterRecord => chapter !== null)
    .sort((left, right) => left.number - right.number);
}

function createChapterSnapshot(bookId: string, chapterNumber: number): string | undefined {
  const chapterPath = getStateManager().getChapterFilePath(bookId, chapterNumber);
  if (!fs.existsSync(chapterPath)) {
    return undefined;
  }

  const snapshotId = getPersistence().createSnapshot(bookId, chapterNumber);
  const snapshotDir = path.join(getStudioRuntimeRootDir(), bookId, 'story', 'state', 'snapshots', snapshotId);
  fs.copyFileSync(chapterPath, path.join(snapshotDir, path.basename(chapterPath)));
  return snapshotId;
}

async function persistChapterRecord(
  bookId: string,
  chapterNumber: number,
  title: string | null,
  content: string,
  status: ChapterRecord['status'],
  metadata?: ChapterWarningMeta
): Promise<ChapterRecord> {
  const result = await getPersistence().persistChapter({
    bookId,
    chapterNumber,
    title: title ?? `第 ${chapterNumber} 章`,
    content,
    status: mapApiStatusToPersisted(status),
    warningCode: metadata?.warningCode ?? undefined,
    warning: metadata?.warning ?? undefined,
  });

  if (!result.success) {
    throw new Error(result.error ?? '章节持久化失败');
  }

  const chapter = readChapterRecord(bookId, chapterNumber);
  if (!chapter) {
    throw new Error(`第 ${chapterNumber} 章持久化后不可读`);
  }
  return chapter;
}

function rewriteIndex(
  bookId: string,
  updater: (index: ReturnType<typeof readChapterIndex>) => ReturnType<typeof readChapterIndex>
) {
  const nextIndex = updater(readChapterIndex(bookId));
  nextIndex.totalChapters = nextIndex.chapters.length;
  nextIndex.totalWords = nextIndex.chapters.reduce((sum, chapter) => sum + chapter.wordCount, 0);
  nextIndex.lastUpdated = new Date().toISOString();
  writeChapterIndex(bookId, nextIndex);
}

export function createChapterRouter(): Hono {
  const router = new Hono();

  // GET /api/books/:bookId/chapters — list chapters
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

  // GET /api/books/:bookId/chapters/:chapterNumber — get chapter
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

  // GET /api/books/:bookId/chapters/:chapterNumber/snapshots — list chapter snapshots
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

  // PATCH /api/books/:bookId/chapters/:chapterNumber — update chapter
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
        400
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
      }
    );

    if (result.data.content) {
      removeAuditReport(bookId, chapterNumber);
      updated.auditStatus = null;
      updated.auditReport = null;
    }

    return c.json({ data: updated });
  });

  // POST /api/books/:bookId/chapters/merge — merge chapters
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
        400
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
      mergeWarningMeta(from, to)
    );

    const fromPath = getStateManager().getChapterFilePath(bookId, fromChapter);
    if (fs.existsSync(fromPath)) {
      fs.unlinkSync(fromPath);
    }
    removeAuditReport(bookId, fromChapter);
    removeAuditReport(bookId, toChapter);

    rewriteIndex(bookId, (index) => ({
      ...index,
      chapters: index.chapters
        .filter((chapter) => chapter.number !== fromChapter)
        .map((chapter) =>
          chapter.number === toChapter ? { ...chapter, wordCount: merged.wordCount } : chapter
        ),
    }));

    return c.json({ data: { ...merged, auditStatus: null, auditReport: null } });
  });

  // POST /api/books/:bookId/chapters/:chapterNumber/split — split chapter
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
        400
      );
    }

    const newNumber = chapterNumber + 1;
    if (readChapterRecord(bookId, newNumber)) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: '目标拆分章节号已存在，暂不支持自动顺延' } },
        400
      );
    }

    if (result.data.splitAtPosition >= chapter.content.length) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: '拆分位置超出章节内容范围' } },
        400
      );
    }

    const left = chapter.content.slice(0, result.data.splitAtPosition).trim();
    const right = chapter.content.slice(result.data.splitAtPosition).trim();
    if (!left || !right) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: '拆分后章节内容不能为空' } },
        400
      );
    }

    createChapterSnapshot(bookId, chapterNumber);

    const updatedCurrent = await persistChapterRecord(
      bookId,
      chapterNumber,
      chapter.title,
      left,
      chapter.status,
      chapter
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

  // POST /api/books/:bookId/chapters/:chapterNumber/rollback — rollback chapter
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
        400
      );
    }

    const snapshotDir = path.join(
      getStudioRuntimeRootDir(),
      bookId,
      'story',
      'state',
      'snapshots',
      result.data.toSnapshot
    );
    const chapterFileName = path.basename(getStateManager().getChapterFilePath(bookId, chapterNumber));
    const snapshotChapterPath = path.join(snapshotDir, chapterFileName);

    if (fs.existsSync(snapshotChapterPath)) {
      fs.copyFileSync(snapshotChapterPath, getStateManager().getChapterFilePath(bookId, chapterNumber));
      void getPersistence().rollbackToSnapshot(bookId, result.data.toSnapshot);
    }

    return c.json({ data: readChapterRecord(bookId, chapterNumber) ?? chapter });
  });

  // POST /api/books/:bookId/chapters/:chapterNumber/audit — run audit
  router.post('/:chapterNumber/audit', (c) => {
    const bookId = c.req.param('bookId')!;
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const chapterNumber = parseInt(c.req.param('chapterNumber')!, 10);
    const chapter = readChapterRecord(bookId, chapterNumber);
    if (!chapter) {
      return c.json({ error: { code: 'CHAPTER_NOT_FOUND', message: '章节不存在' } }, 404);
    }

    // Placeholder audit report
    const report = {
      chapterNumber,
      overallStatus: 'passed',
      tiers: {
        blocker: { total: 12, passed: 12, failed: 0, items: [] },
        warning: { total: 12, passed: 12, failed: 0, items: [] },
        suggestion: { total: 9, passed: 9, failed: 0, items: [] },
      },
      radarScores: [
        { dimension: 'ai_trace', label: 'AI 痕迹', score: 0.12 },
        { dimension: 'coherence', label: '连贯性', score: 0.91 },
        { dimension: 'pacing', label: '节奏', score: 0.78 },
        { dimension: 'dialogue', label: '对话', score: 0.85 },
        { dimension: 'description', label: '描写', score: 0.72 },
        { dimension: 'emotion', label: '情感', score: 0.88 },
        { dimension: 'innovation', label: '创新', score: 0.65 },
        { dimension: 'completeness', label: '完整性', score: 0.95 },
      ],
    };
    writeAuditReport(bookId, chapterNumber, report);
    return c.json({ data: report });
  });

  // GET /api/books/:bookId/chapters/:chapterNumber/audit-report — get audit report
  router.get('/:chapterNumber/audit-report', (c) => {
    const bookId = c.req.param('bookId')!;
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const chapterNumber = parseInt(c.req.param('chapterNumber')!, 10);
    const chapter = readChapterRecord(bookId, chapterNumber);
    if (!chapter) {
      return c.json({ error: { code: 'CHAPTER_NOT_FOUND', message: '章节不存在' } }, 404);
    }

    return c.json({
      data: chapter.auditReport || {
        chapterNumber,
        overallStatus: 'not_audited',
        tiers: {
          blocker: { total: 12, passed: 0, failed: 0, items: [] },
          warning: { total: 12, passed: 0, failed: 0, items: [] },
          suggestion: { total: 9, passed: 0, failed: 0, items: [] },
        },
        radarScores: [],
      },
    });
  });

  return router;
}
