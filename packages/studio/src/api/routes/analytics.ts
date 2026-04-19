import { Hono } from 'hono';

export function createAnalyticsRouter(): Hono {
  const router = new Hono();

  // GET /api/books/:bookId/analytics/word-count
  router.get('/word-count', (c) => {
    return c.json({
      data: {
        totalWords: 0,
        averagePerChapter: 0,
        chapters: [],
      },
    });
  });

  // GET /api/books/:bookId/analytics/audit-rate
  router.get('/audit-rate', (c) => {
    return c.json({
      data: {
        totalAudits: 0,
        passRate: 0,
        perChapter: [],
      },
    });
  });

  // GET /api/books/:bookId/analytics/token-usage
  router.get('/token-usage', (c) => {
    return c.json({
      data: {
        totalTokens: 0,
        perChapter: {
          writer: 0,
          auditor: 0,
          planner: 0,
          composer: 0,
          reviser: 0,
        },
      },
    });
  });

  // GET /api/books/:bookId/analytics/ai-trace
  router.get('/ai-trace', (c) => {
    return c.json({
      data: {
        trend: [],
        average: 0,
        latest: 0,
      },
    });
  });

  // GET /api/books/:bookId/analytics/quality-baseline
  router.get('/quality-baseline', (c) => {
    return c.json({
      data: {
        baseline: {
          version: 1,
          basedOnChapters: [],
          createdAt: new Date().toISOString(),
          metrics: { aiTraceScore: 0.15, sentenceDiversity: 0.82, avgParagraphLength: 48 },
        },
        current: {
          aiTraceScore: 0.15,
          sentenceDiversity: 0.82,
          avgParagraphLength: 48,
          driftPercentage: 0,
          alert: false,
        },
      },
    });
  });

  // GET /api/books/:bookId/analytics/baseline-alert
  router.get('/baseline-alert', (c) => {
    return c.json({
      data: {
        metric: c.req.query('metric') || 'aiTraceScore',
        baseline: 0.15,
        threshold: 0.2,
        windowSize: parseInt(c.req.query('window') || '3', 10),
        slidingAverage: 0.15,
        chaptersAnalyzed: [],
        triggered: false,
        consecutiveChapters: 0,
        severity: 'ok',
        suggestedAction: null,
        inspirationShuffle: { available: false },
      },
    });
  });

  // POST /api/books/:bookId/analytics/inspiration-shuffle
  router.post('/inspiration-shuffle', async (c) => {
    return c.json({
      data: {
        alternatives: [
          {
            id: 'A',
            style: 'fast_paced',
            label: '快节奏视角',
            text: '占位内容...',
            wordCount: 2800,
            characteristics: ['短句为主', '紧张感拉满'],
          },
        ],
        generationTime: 8.2,
      },
    });
  });

  return router;
}
