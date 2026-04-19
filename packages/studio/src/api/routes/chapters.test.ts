import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createChapterRouter, chapterStore } from './chapters';

type ChapterRecord = {
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
};

function seedChapter(bookId: string, chapter: ChapterRecord) {
  if (!chapterStore.has(bookId)) {
    chapterStore.set(bookId, new Map());
  }
  chapterStore.get(bookId)!.set(chapter.number, chapter);
}

function createTestApp() {
  const app = new Hono();
  app.use('*', cors());
  app.route('/api/books/:bookId/chapters', createChapterRouter());
  return app;
}

describe('Chapters Route', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    app = createTestApp();
    chapterStore.clear();
  });

  describe('GET /api/books/:bookId/chapters', () => {
    it('returns empty list for book with no chapters', async () => {
      const res = await app.request('/api/books/book-001/chapters');
      expect(res.status).toBe(200);
      const data = (await res.json()) as { data: unknown[]; total: number };
      expect(data.data).toEqual([]);
      expect(data.total).toBe(0);
    });

    it('returns chapters for a book', async () => {
      seedChapter('book-001', {
        number: 1,
        title: '第一章',
        content: '内容',
        status: 'published',
        wordCount: 3000,
        qualityScore: 85,
        aiTraceScore: 0.15,
        auditStatus: 'passed',
        auditReport: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const res = await app.request('/api/books/book-001/chapters');
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        data: Array<{ number: number; title: string }>;
        total: number;
      };
      expect(data.total).toBe(1);
      expect(data.data[0].number).toBe(1);
      expect(data.data[0].title).toBe('第一章');
    });

    it('filters by status query param', async () => {
      seedChapter('book-001', {
        number: 1,
        title: null,
        content: 'draft',
        status: 'draft',
        wordCount: 800,
        qualityScore: null,
        aiTraceScore: null,
        auditStatus: null,
        auditReport: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      seedChapter('book-001', {
        number: 2,
        title: '第二章',
        content: 'published',
        status: 'published',
        wordCount: 3000,
        qualityScore: 85,
        aiTraceScore: 0.15,
        auditStatus: 'passed',
        auditReport: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const res = await app.request('/api/books/book-001/chapters?status=published');
      expect(res.status).toBe(200);
      const data = (await res.json()) as { data: Array<{ status: string }>; total: number };
      expect(data.total).toBe(1);
      expect(data.data[0].status).toBe('published');
    });
  });

  describe('GET /api/books/:bookId/chapters/:chapterNumber', () => {
    it('returns chapter details', async () => {
      seedChapter('book-001', {
        number: 5,
        title: '第五章',
        content: '正文内容',
        status: 'published',
        wordCount: 3200,
        qualityScore: 85,
        aiTraceScore: 0.15,
        auditStatus: 'passed',
        auditReport: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const res = await app.request('/api/books/book-001/chapters/5');
      expect(res.status).toBe(200);
      const data = (await res.json()) as { data: { number: number; content: string } };
      expect(data.data.number).toBe(5);
      expect(data.data.content).toBe('正文内容');
    });

    it('returns 404 for non-existent chapter', async () => {
      const res = await app.request('/api/books/book-001/chapters/1');
      expect(res.status).toBe(404);
      const data = (await res.json()) as { error: { code: string } };
      expect(data.error.code).toBe('CHAPTER_NOT_FOUND');
    });
  });

  describe('PATCH /api/books/:bookId/chapters/:chapterNumber', () => {
    it('updates chapter content', async () => {
      seedChapter('book-001', {
        number: 1,
        title: null,
        content: 'old content',
        status: 'draft',
        wordCount: 11,
        qualityScore: null,
        aiTraceScore: null,
        auditStatus: null,
        auditReport: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const res = await app.request('/api/books/book-001/chapters/1', {
        method: 'PATCH',
        body: JSON.stringify({ content: 'new content', title: 'Updated Title' }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        data: { content: string; title: string; wordCount: number };
      };
      expect(data.data.content).toBe('new content');
      expect(data.data.title).toBe('Updated Title');
      expect(data.data.wordCount).toBe(11); // "new content" length
    });

    it('returns 404 for non-existent chapter', async () => {
      const res = await app.request('/api/books/book-001/chapters/1', {
        method: 'PATCH',
        body: JSON.stringify({ content: 'new' }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/books/:bookId/chapters/merge', () => {
    it('merges two chapters', async () => {
      seedChapter('book-001', {
        number: 1,
        title: '第一章',
        content: '第一章内容',
        status: 'published',
        wordCount: 5,
        qualityScore: null,
        aiTraceScore: null,
        auditStatus: null,
        auditReport: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      seedChapter('book-001', {
        number: 2,
        title: '第二章',
        content: '第二章内容',
        status: 'published',
        wordCount: 5,
        qualityScore: null,
        aiTraceScore: null,
        auditStatus: null,
        auditReport: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const res = await app.request('/api/books/book-001/chapters/merge', {
        method: 'POST',
        body: JSON.stringify({ fromChapter: 1, toChapter: 2 }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as { data: { content: string; wordCount: number } };
      expect(data.data.content).toContain('第一章内容');
      expect(data.data.content).toContain('第二章内容');
    });

    it('returns 400 when source chapters not found', async () => {
      const res = await app.request('/api/books/book-001/chapters/merge', {
        method: 'POST',
        body: JSON.stringify({ fromChapter: 1, toChapter: 2 }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/books/:bookId/chapters/:chapterNumber/split', () => {
    it('splits a chapter', async () => {
      seedChapter('book-001', {
        number: 1,
        title: null,
        content: '第一段落\n\n第二段落',
        status: 'draft',
        wordCount: 12,
        qualityScore: null,
        aiTraceScore: null,
        auditStatus: null,
        auditReport: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const res = await app.request('/api/books/book-001/chapters/1/split', {
        method: 'POST',
        body: JSON.stringify({ splitAtPosition: 5 }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as { data: Array<{ number: number }> };
      expect(data.data.length).toBe(2);
      expect(data.data[0].number).toBe(1);
      expect(data.data[1].number).toBe(2);
    });

    it('returns 404 when chapter not found', async () => {
      const res = await app.request('/api/books/book-001/chapters/1/split', {
        method: 'POST',
        body: JSON.stringify({ splitAtPosition: 5 }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/books/:bookId/chapters/:chapterNumber/rollback', () => {
    it('rolls back a chapter', async () => {
      seedChapter('book-001', {
        number: 1,
        title: null,
        content: 'current',
        status: 'published',
        wordCount: 7,
        qualityScore: null,
        aiTraceScore: null,
        auditStatus: null,
        auditReport: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const res = await app.request('/api/books/book-001/chapters/1/rollback', {
        method: 'POST',
        body: JSON.stringify({ toSnapshot: 'snap-001' }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as { data: { number: number } };
      expect(data.data.number).toBe(1);
    });

    it('returns 404 when chapter not found', async () => {
      const res = await app.request('/api/books/book-001/chapters/1/rollback', {
        method: 'POST',
        body: JSON.stringify({ toSnapshot: 'snap-001' }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/books/:bookId/chapters/:chapterNumber/audit', () => {
    it('returns audit report for a chapter', async () => {
      seedChapter('book-001', {
        number: 1,
        title: null,
        content: 'content',
        status: 'published',
        wordCount: 7,
        qualityScore: null,
        aiTraceScore: null,
        auditStatus: null,
        auditReport: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const res = await app.request('/api/books/book-001/chapters/1/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        data: { overallStatus: string; tiers: Record<string, unknown> };
      };
      expect(data.data.overallStatus).toBe('passed');
      expect(data.data.tiers).toHaveProperty('blocker');
      expect(data.data.tiers).toHaveProperty('warning');
      expect(data.data.tiers).toHaveProperty('suggestion');
    });

    it('returns 404 for non-existent chapter', async () => {
      const res = await app.request('/api/books/book-001/chapters/1/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/books/:bookId/chapters/:chapterNumber/audit-report', () => {
    it('returns audit report structure when audited', async () => {
      seedChapter('book-001', {
        number: 1,
        title: null,
        content: 'content',
        status: 'published',
        wordCount: 7,
        qualityScore: null,
        aiTraceScore: null,
        auditStatus: 'passed',
        auditReport: { overallStatus: 'passed' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const res = await app.request('/api/books/book-001/chapters/1/audit-report');
      expect(res.status).toBe(200);
      const data = (await res.json()) as { data: { overallStatus: string } };
      expect(data.data.overallStatus).toBe('passed');
    });

    it('returns default structure when not audited', async () => {
      seedChapter('book-001', {
        number: 1,
        title: null,
        content: 'content',
        status: 'draft',
        wordCount: 7,
        qualityScore: null,
        aiTraceScore: null,
        auditStatus: null,
        auditReport: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const res = await app.request('/api/books/book-001/chapters/1/audit-report');
      expect(res.status).toBe(200);
      const data = (await res.json()) as { data: { overallStatus: string } };
      expect(data.data.overallStatus).toBe('not_audited');
    });

    it('returns 404 for non-existent chapter', async () => {
      const res = await app.request('/api/books/book-001/chapters/1/audit-report');
      expect(res.status).toBe(404);
    });
  });
});
