import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { createInspirationRouter } from './inspiration';
import { initializeStudioBookRuntime, resetStudioCoreBridgeForTests } from '../core-bridge';

function createTestApp() {
  const app = new Hono();
  app.route('/api/books/:bookId/inspiration', createInspirationRouter());
  return app;
}

describe('Inspiration Route', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    resetStudioCoreBridgeForTests();
    initializeStudioBookRuntime({
      id: 'book-001',
      title: '测试小说',
      genre: 'xuanhuan',
      targetWords: 30000,
      targetChapterCount: 10,
      targetWordsPerChapter: 3000,
      currentWords: 0,
      chapterCount: 0,
      status: 'active',
      language: 'zh',
      platform: 'qidian',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      fanficMode: null,
      promptVersion: 'v2',
      modelConfig: {
        useGlobalDefaults: true,
        writer: 'DashScope',
        auditor: 'OpenAI',
        planner: 'DashScope',
      },
    });
    app = createTestApp();
  });

  afterEach(() => {
    resetStudioCoreBridgeForTests();
  });

  it('returns empty state before inspiration is created', async () => {
    const res = await app.request('/api/books/book-001/inspiration');
    expect(res.status).toBe(200);
    const data = (await res.json()) as { data: null; exists: boolean };
    expect(data.data).toBeNull();
    expect(data.exists).toBe(false);
  });

  it('creates and reads inspiration seed', async () => {
    const createRes = await app.request('/api/books/book-001/inspiration', {
      method: 'POST',
      body: JSON.stringify({
        sourceText: '宗门天才在外门考核暴露秘密血脉',
        genre: '玄幻',
        theme: '逆袭',
        conflict: '身份暴露',
        tone: '热血',
        constraints: ['升级明确'],
        sourceType: 'manual',
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(createRes.status).toBe(201);

    const getRes = await app.request('/api/books/book-001/inspiration');
    expect(getRes.status).toBe(200);
    const data = (await getRes.json()) as { data: { sourceText: string }; exists: boolean };
    expect(data.exists).toBe(true);
    expect(data.data.sourceText).toBe('宗门天才在外门考核暴露秘密血脉');
  });

  it('updates current inspiration seed', async () => {
    await app.request('/api/books/book-001/inspiration', {
      method: 'POST',
      body: JSON.stringify({
        sourceText: '宗门天才在外门考核暴露秘密血脉',
        genre: '玄幻',
        theme: '逆袭',
        conflict: '身份暴露',
        tone: '热血',
        constraints: ['升级明确'],
        sourceType: 'manual',
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const patchRes = await app.request('/api/books/book-001/inspiration', {
      method: 'PATCH',
      body: JSON.stringify({ tone: '冷峻', constraints: ['伏笔前置'] }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(patchRes.status).toBe(200);
    const data = (await patchRes.json()) as { data: { tone: string; constraints: string[] } };
    expect(data.data.tone).toBe('冷峻');
    expect(data.data.constraints).toEqual(['伏笔前置']);
  });
});
