import { Hono } from 'hono';
import { z } from 'zod';

// --- In-memory chapter store ---
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
  createdAt: string;
  updatedAt: string;
}

export const chapterStore = new Map<string, Map<number, ChapterRecord>>();

function getBookChapters(bookId: string): Map<number, ChapterRecord> {
  if (!chapterStore.has(bookId)) {
    chapterStore.set(bookId, new Map());
  }
  return chapterStore.get(bookId)!;
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

export function createChapterRouter(): Hono {
  const router = new Hono();

  // GET /api/books/:bookId/chapters — list chapters
  router.get('/', (c) => {
    const bookId = c.req.param('bookId')!;
    const status = c.req.query('status');
    const chapters = Array.from(getBookChapters(bookId).values());

    let filtered = chapters;
    if (status && status !== 'all') {
      filtered = chapters.filter((ch) => ch.status === status);
    }

    return c.json({ data: filtered, total: filtered.length });
  });

  // GET /api/books/:bookId/chapters/:chapterNumber — get chapter
  router.get('/:chapterNumber', (c) => {
    const bookId = c.req.param('bookId')!;
    const chapterNumber = parseInt(c.req.param('chapterNumber')!, 10);
    const chapter = getBookChapters(bookId).get(chapterNumber);
    if (!chapter) {
      return c.json({ error: { code: 'CHAPTER_NOT_FOUND', message: '章节不存在' } }, 404);
    }
    return c.json({ data: chapter });
  });

  // PATCH /api/books/:bookId/chapters/:chapterNumber — update chapter
  router.patch('/:chapterNumber', async (c) => {
    const bookId = c.req.param('bookId')!;
    const chapterNumber = parseInt(c.req.param('chapterNumber')!, 10);
    const chapter = getBookChapters(bookId).get(chapterNumber);
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

    Object.assign(chapter, result.data, { updatedAt: new Date().toISOString() });
    if (result.data.content) {
      chapter.wordCount = result.data.content.length;
    }
    getBookChapters(bookId).set(chapterNumber, chapter);
    return c.json({ data: chapter });
  });

  // POST /api/books/:bookId/chapters/merge — merge chapters
  router.post('/merge', async (c) => {
    const bookId = c.req.param('bookId')!;
    const body = await c.req.json().catch(() => ({}));
    const result = mergeSchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: result.error.errors[0].message } },
        400
      );
    }

    const { fromChapter, toChapter } = result.data;
    const from = getBookChapters(bookId).get(fromChapter);
    const to = getBookChapters(bookId).get(toChapter);

    if (!from || !to) {
      return c.json({ error: { code: 'CHAPTER_NOT_FOUND', message: '章节不存在' } }, 400);
    }

    // Merge content
    to.content = from.content + '\n\n' + to.content;
    to.wordCount = to.content.length;
    to.updatedAt = new Date().toISOString();
    getBookChapters(bookId).delete(fromChapter);

    return c.json({ data: to });
  });

  // POST /api/books/:bookId/chapters/:chapterNumber/split — split chapter
  router.post('/:chapterNumber/split', async (c) => {
    const bookId = c.req.param('bookId')!;
    const chapterNumber = parseInt(c.req.param('chapterNumber')!, 10);
    const chapter = getBookChapters(bookId).get(chapterNumber);
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

    // Placeholder split — real implementation would split at paragraph boundary
    const newNumber = chapterNumber + 1;
    const newChapter: ChapterRecord = {
      number: newNumber,
      title: null,
      content: chapter.content,
      status: 'draft',
      wordCount: chapter.content.length,
      qualityScore: null,
      aiTraceScore: null,
      auditStatus: null,
      auditReport: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    getBookChapters(bookId).set(newNumber, newChapter);

    return c.json({ data: [chapter, newChapter] });
  });

  // POST /api/books/:bookId/chapters/:chapterNumber/rollback — rollback chapter
  router.post('/:chapterNumber/rollback', async (c) => {
    const bookId = c.req.param('bookId')!;
    const chapterNumber = parseInt(c.req.param('chapterNumber')!, 10);
    const chapter = getBookChapters(bookId).get(chapterNumber);
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

    // Placeholder rollback — real implementation would restore from snapshot
    chapter.updatedAt = new Date().toISOString();
    return c.json({ data: chapter });
  });

  // POST /api/books/:bookId/chapters/:chapterNumber/audit — run audit
  router.post('/:chapterNumber/audit', (c) => {
    const bookId = c.req.param('bookId')!;
    const chapterNumber = parseInt(c.req.param('chapterNumber')!, 10);
    const chapter = getBookChapters(bookId).get(chapterNumber);
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
    chapter.auditReport = report;
    chapter.auditStatus = 'passed';
    return c.json({ data: report });
  });

  // GET /api/books/:bookId/chapters/:chapterNumber/audit-report — get audit report
  router.get('/:chapterNumber/audit-report', (c) => {
    const bookId = c.req.param('bookId')!;
    const chapterNumber = parseInt(c.req.param('chapterNumber')!, 10);
    const chapter = getBookChapters(bookId).get(chapterNumber);
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
