import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PipelinePersistence } from '@cybernovelist/core';
import { createBookRouter, resetBookStoreForTests } from './books';
import { createChapterRouter } from './chapters';
import { getStudioRuntimeRootDir, resetStudioCoreBridgeForTests } from '../core-bridge';

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

async function seedChapter(bookId: string, chapter: ChapterRecord) {
  const persistence = new PipelinePersistence(getStudioRuntimeRootDir());
  await persistence.persistChapter({
    bookId,
    chapterNumber: chapter.number,
    title: chapter.title ?? `第 ${chapter.number} 章`,
    content: chapter.content,
    status: chapter.status === 'draft' ? 'draft' : 'final',
  });
}

function createTestApp() {
  const app = new Hono();
  app.use('*', cors());
  app.route('/api/books', createBookRouter());
  app.route('/api/books/:bookId/chapters', createChapterRouter());
  return app;
}

async function createBook(app: ReturnType<typeof createTestApp>) {
  const res = await app.request('/api/books', {
    method: 'POST',
    body: JSON.stringify({ title: '章节测试书', genre: 'urban', targetWords: 80000 }),
    headers: { 'Content-Type': 'application/json' },
  });
  const data = (await res.json()) as { data: { id: string } };
  return data.data.id;
}

describe('Chapters Route', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    app = createTestApp();
    resetBookStoreForTests();
    resetStudioCoreBridgeForTests();
  });

  describe('GET /api/books/:bookId/chapters', () => {
    it('returns empty list for book with no chapters', async () => {
      const bookId = await createBook(app);
      const res = await app.request(`/api/books/${bookId}/chapters`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as { data: unknown[]; total: number };
      expect(data.data).toEqual([]);
      expect(data.total).toBe(0);
    });

    it('returns chapters for a book', async () => {
      const bookId = await createBook(app);
      await seedChapter(bookId, {
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

      const res = await app.request(`/api/books/${bookId}/chapters`);
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
      const bookId = await createBook(app);
      await seedChapter(bookId, {
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
      await seedChapter(bookId, {
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

      const res = await app.request(`/api/books/${bookId}/chapters?status=published`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as { data: Array<{ status: string }>; total: number };
      expect(data.total).toBe(1);
      expect(data.data[0].status).toBe('published');
    });
  });

  describe('GET /api/books/:bookId/chapters/:chapterNumber', () => {
    it('returns chapter details', async () => {
      const bookId = await createBook(app);
      await seedChapter(bookId, {
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

      const res = await app.request(`/api/books/${bookId}/chapters/5`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as { data: { number: number; content: string } };
      expect(data.data.number).toBe(5);
      expect(data.data.content).toBe('正文内容');
    });

    it('reads persisted warning metadata for polluted chapters', async () => {
      const bookId = await createBook(app);
      await seedChapter(bookId, {
        number: 3,
        title: '强制通过章',
        content: '存在污染的正文',
        status: 'published',
        wordCount: 7,
        qualityScore: null,
        aiTraceScore: null,
        auditStatus: null,
        auditReport: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const chapterPath = path.join(
        getStudioRuntimeRootDir(),
        bookId,
        'story',
        'chapters',
        'chapter-0003.md'
      );
      const pollutedContent = fs
        .readFileSync(chapterPath, 'utf-8')
        .replace(
          'createdAt:',
          'warningCode: accept_with_warnings\nwarning: 修订次数用尽，已按 accept_with_warnings 降级接受结果\ncreatedAt:'
        );
      fs.writeFileSync(chapterPath, pollutedContent, 'utf-8');

      const res = await app.request(`/api/books/${bookId}/chapters/3`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        data: { warningCode?: string; warning?: string; isPolluted?: boolean };
      };
      expect(data.data.warningCode).toBe('accept_with_warnings');
      expect(data.data.warning).toContain('降级接受结果');
      expect(data.data.isPolluted).toBe(true);
    });

    it('returns 404 for non-existent chapter', async () => {
      const bookId = await createBook(app);
      const res = await app.request(`/api/books/${bookId}/chapters/1`);
      expect(res.status).toBe(404);
      const data = (await res.json()) as { error: { code: string } };
      expect(data.error.code).toBe('CHAPTER_NOT_FOUND');
    });
  });

  describe('PATCH /api/books/:bookId/chapters/:chapterNumber', () => {
    it('updates chapter content', async () => {
      const bookId = await createBook(app);
      await seedChapter(bookId, {
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

      const res = await app.request(`/api/books/${bookId}/chapters/1`, {
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
      const bookId = await createBook(app);
      const res = await app.request(`/api/books/${bookId}/chapters/1`, {
        method: 'PATCH',
        body: JSON.stringify({ content: 'new' }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/books/:bookId/chapters/merge', () => {
    it('merges two chapters', async () => {
      const bookId = await createBook(app);
      await seedChapter(bookId, {
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
      await seedChapter(bookId, {
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

      const res = await app.request(`/api/books/${bookId}/chapters/merge`, {
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
      const bookId = await createBook(app);
      const res = await app.request(`/api/books/${bookId}/chapters/merge`, {
        method: 'POST',
        body: JSON.stringify({ fromChapter: 1, toChapter: 2 }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/books/:bookId/chapters/:chapterNumber/split', () => {
    it('splits a chapter', async () => {
      const bookId = await createBook(app);
      await seedChapter(bookId, {
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

      const res = await app.request(`/api/books/${bookId}/chapters/1/split`, {
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
      const bookId = await createBook(app);
      const res = await app.request(`/api/books/${bookId}/chapters/1/split`, {
        method: 'POST',
        body: JSON.stringify({ splitAtPosition: 5 }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/books/:bookId/chapters/:chapterNumber/rollback', () => {
    it('lists real snapshots for a chapter', async () => {
      const bookId = await createBook(app);
      await seedChapter(bookId, {
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

      await app.request(`/api/books/${bookId}/chapters/1`, {
        method: 'PATCH',
        body: JSON.stringify({ content: 'updated current' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const res = await app.request(`/api/books/${bookId}/chapters/1/snapshots`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        data: Array<{ id: string; chapter: number; label: string; timestamp: string }>;
      };
      expect(data.data.length).toBeGreaterThan(0);
      expect(data.data[0].chapter).toBe(1);
      expect(data.data[0].label).toContain('第1章');
      expect(data.data[0].timestamp).toBeTruthy();
    });

    it('rolls back a chapter', async () => {
      const bookId = await createBook(app);
      await seedChapter(bookId, {
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

      await app.request(`/api/books/${bookId}/chapters/1`, {
        method: 'PATCH',
        body: JSON.stringify({ content: 'updated current' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const snapshots = new PipelinePersistence(getStudioRuntimeRootDir()).listSnapshots(bookId);
      const snapshotId = snapshots
        .slice()
        .sort(
          (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
        )
        .find((snapshot) =>
          fs.existsSync(
            path.join(
              getStudioRuntimeRootDir(),
              bookId,
              'story',
              'state',
              'snapshots',
              snapshot.id,
              'chapter-0001.md'
            )
          )
        )?.id;
      expect(snapshotId).toBeTruthy();

      const res = await app.request(`/api/books/${bookId}/chapters/1/rollback`, {
        method: 'POST',
        body: JSON.stringify({ toSnapshot: snapshotId }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as { data: { number: number; content: string } };
      expect(data.data.number).toBe(1);
      expect(data.data.content).toBe('current');
    });

    it('returns 404 when chapter not found', async () => {
      const bookId = await createBook(app);
      const res = await app.request(`/api/books/${bookId}/chapters/1/rollback`, {
        method: 'POST',
        body: JSON.stringify({ toSnapshot: 'snap-001' }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/books/:bookId/chapters/:chapterNumber/audit', () => {
    it('builds and persists a content-driven audit report for a chapter', async () => {
      const bookId = await createBook(app);
      await seedChapter(bookId, {
        number: 1,
        title: null,
        content:
          '林砚把窗户推开，先听见楼下铁门合拢的回声，再看见雨水沿着台阶慢慢退下去。\n\n他没有急着下结论，只把口袋里的纸条摊平，对照灯下的笔迹，一点点把前后矛盾的地方圈了出来。',
        status: 'published',
        wordCount: 7,
        qualityScore: null,
        aiTraceScore: null,
        auditStatus: null,
        auditReport: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const res = await app.request(`/api/books/${bookId}/chapters/1/audit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        data: {
          overallStatus: string;
          tiers: {
            blocker: { failed: number };
            warning: { failed: number };
            suggestion: { failed: number };
          };
          radarScores: Array<{ dimension: string; score: number }>;
        };
      };
      expect(data.data.overallStatus).toBe('passed');
      expect(data.data.tiers.blocker.failed).toBe(0);
      expect(data.data.radarScores).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ dimension: 'ai_trace' }),
          expect.objectContaining({ dimension: 'coherence' }),
        ])
      );

      const persisted = await app.request(`/api/books/${bookId}/chapters/1/audit-report`);
      const persistedData = (await persisted.json()) as {
        data: { overallStatus: string; radarScores: Array<{ dimension: string; score: number }> };
      };
      expect(persistedData.data.overallStatus).toBe('passed');
      expect(persistedData.data.radarScores).toEqual(data.data.radarScores);
    });

    it('flags high-risk AI patterns instead of returning a fixed pass result', async () => {
      const bookId = await createBook(app);
      await seedChapter(bookId, {
        number: 2,
        title: null,
        content:
          '夜幕降临，华灯初上，霓虹闪烁。首先我们需要明确的是，他心中涌起莫名的感觉。其次，从宏观角度来看，人生就像一场梦。总而言之，这个故事告诉我们要携手共进。',
        status: 'published',
        wordCount: 7,
        qualityScore: null,
        aiTraceScore: null,
        auditStatus: null,
        auditReport: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const res = await app.request(`/api/books/${bookId}/chapters/2/audit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        data: {
          overallStatus: string;
          tiers: {
            blocker: { failed: number; items: Array<{ rule: string; message: string }> };
            warning: { failed: number; items: Array<{ rule: string; message: string }> };
          };
        };
      };
      expect(data.data.overallStatus).toBe('needs_revision');
      expect(data.data.tiers.blocker.failed + data.data.tiers.warning.failed).toBeGreaterThan(0);
      expect(
        [
          ...data.data.tiers.blocker.items.map((item) => item.rule),
          ...data.data.tiers.warning.items.map((item) => item.rule),
        ].length
      ).toBeGreaterThan(0);
    });

    it('returns 404 for non-existent chapter', async () => {
      const bookId = await createBook(app);
      const res = await app.request(`/api/books/${bookId}/chapters/1/audit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/books/:bookId/chapters/:chapterNumber/audit-report', () => {
    it('returns audit report structure when audited', async () => {
      const bookId = await createBook(app);
      await seedChapter(bookId, {
        number: 1,
        title: null,
        content:
          '林砚把伞挂在门口，先看了一眼鞋印里的泥水，再把桌上的旧票据摊开。\n\n他没有急着判断谁在说谎，而是按时间顺序把每一次出入记录重新排了一遍，终于在最不起眼的一栏里看见了缺口。',
        status: 'published',
        wordCount: 7,
        qualityScore: null,
        aiTraceScore: null,
        auditStatus: 'passed',
        auditReport: { overallStatus: 'passed' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await app.request(`/api/books/${bookId}/chapters/1/audit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const res = await app.request(`/api/books/${bookId}/chapters/1/audit-report`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as { data: { overallStatus: string } };
      expect(data.data.overallStatus).toBe('passed');
    });

    it('returns default structure when not audited', async () => {
      const bookId = await createBook(app);
      await seedChapter(bookId, {
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

      const res = await app.request(`/api/books/${bookId}/chapters/1/audit-report`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as { data: { overallStatus: string } };
      expect(data.data.overallStatus).toBe('not_audited');
    });

    it('returns 404 for non-existent chapter', async () => {
      const bookId = await createBook(app);
      const res = await app.request(`/api/books/${bookId}/chapters/1/audit-report`);
      expect(res.status).toBe(404);
    });
  });
});
