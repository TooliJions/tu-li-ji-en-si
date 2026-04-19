import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Hono } from 'hono';
import { getStudioRuntimeRootDir, resetStudioCoreBridgeForTests } from '../core-bridge';
import { createAnalyticsRouter } from './analytics';

function createTestApp() {
  const app = new Hono();
  app.route('/api/books/:bookId/analytics', createAnalyticsRouter());
  return app;
}

/**
 * Minimal runtime setup for a test book.
 * Creates only the files needed for analytics endpoints to succeed the book-existence check.
 */
function createTestBookRuntime(bookId: string) {
  const root = getStudioRuntimeRootDir();
  const bookDir = path.join(root, bookId);
  const stateDir = path.join(bookDir, 'story', 'state');
  const chaptersDir = path.join(bookDir, 'story', 'chapters');

  fs.mkdirSync(stateDir, { recursive: true });
  fs.mkdirSync(chaptersDir, { recursive: true });

  // book.json — required by hasStudioBookRuntime
  fs.writeFileSync(
    path.join(bookDir, 'book.json'),
    JSON.stringify({ id: bookId, title: 'Test Book' }, null, 2),
  );

  // index.json — empty chapter list
  fs.writeFileSync(
    path.join(stateDir, 'index.json'),
    JSON.stringify(
      {
        bookId,
        chapters: [],
        totalChapters: 0,
        totalWords: 0,
        lastUpdated: new Date().toISOString(),
      },
      null,
      2,
    ),
  );

  // manifest.json
  fs.writeFileSync(
    path.join(stateDir, 'manifest.json'),
    JSON.stringify(
      {
        bookId,
        versionToken: 1,
        lastChapterWritten: 0,
        hooks: [],
        facts: [],
        characters: [],
        worldRules: [],
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
}

function addTestChapter(
  bookId: string,
  chapterNumber: number,
  title: string,
  content: string,
) {
  const root = getStudioRuntimeRootDir();
  const padded = String(chapterNumber).padStart(4, '0');
  const chaptersDir = path.join(root, bookId, 'story', 'chapters');
  const indexPath = path.join(root, bookId, 'story', 'state', 'index.json');

  // Write chapter file with frontmatter
  const frontmatter = `---\ntitle: ${title}\nstatus: published\n---\n`;
  fs.writeFileSync(path.join(chaptersDir, `chapter-${padded}.md`), frontmatter + content);

  // Update index
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8')) as {
    bookId: string;
    chapters: Array<{ number: number; title: string | null; fileName: string; wordCount: number; createdAt: string }>;
    totalChapters: number;
    totalWords: number;
    lastUpdated: string;
  };
  index.chapters.push({
    number: chapterNumber,
    title,
    fileName: `chapter-${padded}.md`,
    wordCount: content.length,
    createdAt: new Date().toISOString(),
  });
  index.totalChapters = index.chapters.length;
  index.totalWords += content.length;
  index.lastUpdated = new Date().toISOString();
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
}

describe('Analytics Route', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    resetStudioCoreBridgeForTests();
    app = createTestApp();
    createTestBookRuntime('book-001');
  });

  describe('GET /api/books/:bookId/analytics/word-count', () => {
    it('returns word count stats with correct structure', async () => {
      const res = await app.request('/api/books/book-001/analytics/word-count');
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        data: { totalWords: number; averagePerChapter: number; chapters: unknown[] };
      };
      expect(typeof data.data.totalWords).toBe('number');
      expect(typeof data.data.averagePerChapter).toBe('number');
      expect(Array.isArray(data.data.chapters)).toBe(true);
    });

    it('returns real data when chapters exist', async () => {
      addTestChapter('book-001', 1, '第一章', '这是一段测试内容，大约有这么多字数。');
      addTestChapter('book-001', 2, '第二章', '第二章的内容在这里，继续写故事。');

      const res = await app.request('/api/books/book-001/analytics/word-count');
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        data: { totalWords: number; averagePerChapter: number; chapters: Array<{ number: number; words: number }> };
      };
      expect(data.data.totalWords).toBeGreaterThan(0);
      expect(data.data.chapters.length).toBe(2);
      expect(data.data.chapters[0].number).toBe(1);
    });
  });

  describe('GET /api/books/:bookId/analytics/audit-rate', () => {
    it('returns audit rate stats', async () => {
      const res = await app.request('/api/books/book-001/analytics/audit-rate');
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        data: { totalAudits: number; passRate: number; perChapter: unknown[] };
      };
      expect(typeof data.data.totalAudits).toBe('number');
      expect(typeof data.data.passRate).toBe('number');
      expect(Array.isArray(data.data.perChapter)).toBe(true);
    });
  });

  describe('GET /api/books/:bookId/analytics/token-usage', () => {
    it('returns token usage with per-channel breakdown', async () => {
      const res = await app.request('/api/books/book-001/analytics/token-usage');
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        data: {
          totalTokens: number;
          perChapter: {
            writer: number;
            auditor: number;
            planner: number;
            composer: number;
            reviser: number;
          };
        };
      };
      expect(typeof data.data.totalTokens).toBe('number');
      expect(typeof data.data.perChapter.writer).toBe('number');
      expect(typeof data.data.perChapter.auditor).toBe('number');
      expect(typeof data.data.perChapter.planner).toBe('number');
      expect(typeof data.data.perChapter.composer).toBe('number');
      expect(typeof data.data.perChapter.reviser).toBe('number');
    });
  });

  describe('GET /api/books/:bookId/analytics/ai-trace', () => {
    it('returns AI trace with trend, average, and latest', async () => {
      const res = await app.request('/api/books/book-001/analytics/ai-trace');
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        data: { trend: unknown[]; average: number; latest: number };
      };
      expect(Array.isArray(data.data.trend)).toBe(true);
      expect(typeof data.data.average).toBe('number');
      expect(typeof data.data.latest).toBe('number');
    });

    it('detects AI traces from real chapter content', async () => {
      addTestChapter('book-001', 1, '第一章', '林晨坐在教室里，望着窗外的雨幕，心中涌起一阵莫名的感觉。');

      const res = await app.request('/api/books/book-001/analytics/ai-trace');
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        data: { trend: Array<{ chapter: number; score: number }>; average: number; latest: number };
      };
      expect(data.data.trend.length).toBe(1);
      expect(data.data.trend[0].chapter).toBe(1);
      expect(data.data.trend[0].score).toBeGreaterThanOrEqual(0);
      expect(data.data.trend[0].score).toBeLessThanOrEqual(1);
    });
  });

  describe('GET /api/books/:bookId/analytics/quality-baseline', () => {
    it('returns baseline and current metrics', async () => {
      const res = await app.request('/api/books/book-001/analytics/quality-baseline');
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        data: {
          baseline: { version: number; metrics: { aiTraceScore: number } };
          current: { driftPercentage: number; alert: boolean };
        };
      };
      expect(data.data.baseline.version).toBeDefined();
      expect(typeof data.data.baseline.metrics.aiTraceScore).toBe('number');
      expect(typeof data.data.current.driftPercentage).toBe('number');
      expect(typeof data.data.current.alert).toBe('boolean');
    });
  });

  describe('GET /api/books/:bookId/analytics/baseline-alert', () => {
    it('returns default values without query params', async () => {
      const res = await app.request('/api/books/book-001/analytics/baseline-alert');
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        data: { metric: string; windowSize: number; severity: string };
      };
      expect(data.data.metric).toBe('aiTraceScore');
      expect(data.data.windowSize).toBe(3);
      expect(data.data.severity).toBe('ok');
    });

    it('accepts custom metric and window query params', async () => {
      const res = await app.request(
        '/api/books/book-001/analytics/baseline-alert?metric=sentenceDiversity&window=5',
      );
      expect(res.status).toBe(200);
      const data = (await res.json()) as { data: { metric: string; windowSize: number } };
      expect(data.data.metric).toBe('sentenceDiversity');
      expect(data.data.windowSize).toBe(5);
    });
  });

  describe('POST /api/books/:bookId/analytics/inspiration-shuffle', () => {
    it('returns alternative rewrites', async () => {
      const res = await app.request('/api/books/book-001/analytics/inspiration-shuffle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        data: {
          alternatives: Array<{ id: string; style: string; label: string }>;
          generationTime: number;
        };
      };
      expect(Array.isArray(data.data.alternatives)).toBe(true);
      expect(data.data.alternatives.length).toBeGreaterThan(0);
      expect(data.data.alternatives[0].id).toBeDefined();
      expect(data.data.alternatives[0].style).toBeDefined();
      expect(data.data.alternatives[0].label).toBeDefined();
      expect(typeof data.data.generationTime).toBe('number');
    });
  });

  describe('GET /api/books/:bookId/analytics/emotional-arcs', () => {
    it('returns emotional arc data for character timelines', async () => {
      const res = await app.request('/api/books/book-001/analytics/emotional-arcs');
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        data: {
          characters: Array<{ name: string; chapters: Array<{ chapterNumber: number }> }>;
          alerts: Array<{ message: string }>;
        };
      };
      expect(Array.isArray(data.data.characters)).toBe(true);
      expect(Array.isArray(data.data.alerts)).toBe(true);
    });
  });
});
