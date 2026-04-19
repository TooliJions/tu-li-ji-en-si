import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createAnalyticsRouter } from './analytics';

function createTestApp() {
  const app = new Hono();
  app.route('/api/books/:bookId/analytics', createAnalyticsRouter());
  return app;
}

describe('Analytics Route', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    app = createTestApp();
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
        '/api/books/book-001/analytics/baseline-alert?metric=sentenceDiversity&window=5'
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
});
