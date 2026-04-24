import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Hono } from 'hono';
import { getStudioRuntimeRootDir, resetStudioCoreBridgeForTests } from '../core-bridge';
import { createAnalyticsRouter } from './analytics';
import { createBookContextMiddleware } from '../context';

function createTestApp() {
  const app = new Hono();
  app.use('/api/books/:bookId/*', createBookContextMiddleware());
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
    JSON.stringify({ id: bookId, title: 'Test Book' }, null, 2)
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
      2
    )
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
      2
    )
  );
}

function addTestChapter(bookId: string, chapterNumber: number, title: string, content: string) {
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
    chapters: Array<{
      number: number;
      title: string | null;
      fileName: string;
      wordCount: number;
      createdAt: string;
    }>;
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

function addAuditReport(bookId: string, chapterNumber: number, passed: number, total: number) {
  const root = getStudioRuntimeRootDir();
  const auditsDir = path.join(root, bookId, 'story', 'state', 'audits');
  const padded = String(chapterNumber).padStart(4, '0');
  fs.mkdirSync(auditsDir, { recursive: true });
  const failed = Math.max(total - passed, 0);

  fs.writeFileSync(
    path.join(auditsDir, `chapter-${padded}.json`),
    JSON.stringify(
      {
        overallStatus: passed === total ? 'passed' : 'failed',
        tiers: {
          blocker: { total, passed, failed },
          warning: { total: 0, passed: 0, failed: 0 },
          suggestion: { total: 0, passed: 0, failed: 0 },
        },
      },
      null,
      2
    )
  );
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
        data: {
          totalWords: number;
          averagePerChapter: number;
          chapters: Array<{ number: number; words: number }>;
        };
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
    function writeTelemetry(
      bookId: string,
      chapterNumber: number,
      channels: Partial<Record<'writer' | 'auditor' | 'planner' | 'composer' | 'reviser', number>>
    ) {
      const root = getStudioRuntimeRootDir();
      const dir = path.join(root, bookId, 'story', 'state', 'telemetry');
      fs.mkdirSync(dir, { recursive: true });
      const padded = String(chapterNumber).padStart(4, '0');
      const allChannels = ['writer', 'auditor', 'planner', 'composer', 'reviser'] as const;
      const fullChannels: Record<
        string,
        { promptTokens: number; completionTokens: number; totalTokens: number; calls: number }
      > = {};
      let total = 0;

      for (const channel of allChannels) {
        const value = channels[channel] ?? 0;
        fullChannels[channel] = {
          promptTokens: Math.floor(value * 0.6),
          completionTokens: Math.floor(value * 0.4),
          totalTokens: value,
          calls: value > 0 ? 1 : 0,
        };
        total += value;
      }

      fs.writeFileSync(
        path.join(dir, `chapter-${padded}.json`),
        JSON.stringify({
          bookId,
          chapterNumber,
          channels: fullChannels,
          totalTokens: total,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      );
    }

    it('returns empty aggregated structure without telemetry files', async () => {
      const res = await app.request('/api/books/book-001/analytics/token-usage');
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        data: {
          totalTokens: number;
          perChannel: {
            writer: number;
            auditor: number;
            planner: number;
            composer: number;
            reviser: number;
          };
          perChapter: Array<{ chapter: number; totalTokens: number }>;
        };
      };
      expect(typeof data.data.totalTokens).toBe('number');
      expect(data.data.totalTokens).toBe(0);
      expect(data.data.perChannel.writer).toBe(0);
      expect(data.data.perChannel.auditor).toBe(0);
      expect(data.data.perChannel.planner).toBe(0);
      expect(data.data.perChannel.composer).toBe(0);
      expect(data.data.perChannel.reviser).toBe(0);
      expect(data.data.perChapter).toEqual([]);
    });

    it('aggregates telemetry files across chapters and channels', async () => {
      writeTelemetry('book-001', 1, { writer: 1000, auditor: 200, planner: 100 });
      writeTelemetry('book-001', 2, { writer: 1500, auditor: 300, reviser: 400 });

      const res = await app.request('/api/books/book-001/analytics/token-usage');
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        data: {
          totalTokens: number;
          perChannel: Record<string, number>;
          perChapter: Array<{
            chapter: number;
            totalTokens: number;
            channels: Record<string, number>;
          }>;
        };
      };

      expect(data.data.totalTokens).toBe(3500);
      expect(data.data.perChannel.writer).toBe(2500);
      expect(data.data.perChannel.auditor).toBe(500);
      expect(data.data.perChannel.planner).toBe(100);
      expect(data.data.perChannel.reviser).toBe(400);
      expect(data.data.perChapter).toHaveLength(2);
      expect(data.data.perChapter[0]).toMatchObject({
        chapter: 1,
        totalTokens: 1300,
      });
      expect(data.data.perChapter[1].channels.reviser).toBe(400);
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
      addTestChapter(
        'book-001',
        1,
        '第一章',
        '林晨坐在教室里，望着窗外的雨幕，心中涌起一阵莫名的感觉。'
      );

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

    it('uses baseline chapters for baseline metrics and latest chapter for current metrics', async () => {
      addTestChapter(
        'book-001',
        1,
        '第一章',
        '林晨推门。桌上摊着一叠厚厚的试卷，边角被雨水泡皱。走廊尽头忽然传来急促脚步声，他下意识把纸页塞进书包最底层。'
      );
      addAuditReport('book-001', 1, 10, 12);
      addTestChapter(
        'book-001',
        2,
        '第二章',
        '苏小雨压低声音提醒他钥匙不见了。林晨没有立刻回答。他只是盯着纸条末尾那串极短的编号，忽然想起昨晚自己漏看的那一页名单。'
      );
      addAuditReport('book-001', 2, 9, 12);
      addTestChapter(
        'book-001',
        3,
        '第三章',
        '档案室的灯很暗。风从窗缝里灌进来。林晨借着那点摇晃的光，终于在名单最末尾看见了那个被反复划掉的名字。'
      );
      addAuditReport('book-001', 3, 11, 12);
      addTestChapter(
        'book-001',
        4,
        '第四章',
        '夜幕降临，华灯初上。岁月如梭，光阴似箭。综上所述，让我们来看看接下来会发生什么。林晨心中涌起一阵莫名的感觉。'
      );
      addAuditReport('book-001', 4, 4, 12);

      const res = await app.request('/api/books/book-001/analytics/quality-baseline');
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        data: {
          baseline: {
            basedOnChapters: number[];
            metrics: { aiTraceScore: number; avgParagraphLength: number };
          };
          current: { aiTraceScore: number; avgParagraphLength: number; alert: boolean };
        };
      };

      expect(data.data.baseline.basedOnChapters).toEqual([1, 2, 3]);
      expect(data.data.baseline.metrics.aiTraceScore).not.toBe(data.data.current.aiTraceScore);
      expect(data.data.baseline.metrics.avgParagraphLength).not.toBe(
        data.data.current.avgParagraphLength
      );
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

    it('evaluates sentence diversity drift using sentence diversity instead of ai trace', async () => {
      addTestChapter(
        'book-001',
        1,
        '第一章',
        '林晨推门。桌上摊着一叠厚厚的试卷，边角被雨水泡皱。走廊尽头忽然传来急促脚步声，他下意识把纸页塞进书包最底层。'
      );
      addTestChapter(
        'book-001',
        2,
        '第二章',
        '苏小雨压低声音提醒他钥匙不见了。林晨没有立刻回答。他只是盯着纸条末尾那串极短的编号，忽然想起昨晚自己漏看的那一页名单。'
      );
      addTestChapter(
        'book-001',
        3,
        '第三章',
        '档案室的灯很暗。风从窗缝里灌进来。林晨借着那点摇晃的光，终于在名单最末尾看见了那个被反复划掉的名字。'
      );
      addTestChapter('book-001', 4, '第四章', '他看着它。他想着它。他念着它。他等着它。');

      const res = await app.request(
        '/api/books/book-001/analytics/baseline-alert?metric=sentenceDiversity&window=2'
      );
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        data: {
          metric: string;
          baseline: number;
          slidingAverage: number;
          triggered: boolean;
          chaptersAnalyzed: number[];
        };
      };

      expect(data.data.metric).toBe('sentenceDiversity');
      expect(data.data.chaptersAnalyzed).toEqual([1, 2, 3, 4]);
      expect(data.data.triggered).toBe(true);
      expect(data.data.slidingAverage).toBeLessThan(data.data.baseline);
    });
  });

  describe('POST /api/books/:bookId/analytics/inspiration-shuffle', () => {
    it('returns available=false when book has no chapters', async () => {
      const res = await app.request('/api/books/book-001/analytics/inspiration-shuffle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        data: { alternatives: unknown[]; available: boolean };
      };
      expect(data.data.available).toBe(false);
      expect(data.data.alternatives.length).toBe(0);
    });

    it('returns 3 alternative rewrites when chapter exists', async () => {
      addTestChapter('book-001', 1, '第一章', '林晨站在雨中，内心波涛汹涌。他终于明白了那个秘密。');

      const res = await app.request('/api/books/book-001/analytics/inspiration-shuffle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        data: {
          alternatives: Array<{
            id: string;
            style: string;
            label: string;
            text: string;
            wordCount: number;
          }>;
          generationTime: number;
          available: boolean;
        };
      };

      expect(data.data.alternatives.length).toBe(3);
      const ids = data.data.alternatives.map((a) => a.id).sort();
      expect(ids).toEqual(['A', 'B', 'C']);
      const styles = data.data.alternatives.map((a) => a.style).sort();
      expect(styles).toEqual(['contemplative', 'emotional', 'fast_paced']);
      expect(data.data.available).toBe(true);
      for (const alt of data.data.alternatives) {
        expect(alt.text.length).toBeGreaterThan(0);
        expect(alt.wordCount).toBeGreaterThan(0);
      }
      expect(typeof data.data.generationTime).toBe('number');
    });

    it('returns 404 when book does not exist', async () => {
      const res = await app.request('/api/books/non-existent/analytics/inspiration-shuffle', {
        method: 'POST',
      });
      expect(res.status).toBe(404);
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
