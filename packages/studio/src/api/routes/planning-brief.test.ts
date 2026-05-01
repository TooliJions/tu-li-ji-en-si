import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { createInspirationRouter } from './inspiration';
import { createPlanningBriefRouter } from './planning-brief';
import { initializeStudioBookRuntime, resetStudioCoreBridgeForTests } from '../core-bridge';

function createTestApp() {
  const app = new Hono();
  app.route('/api/books/:bookId/inspiration', createInspirationRouter());
  app.route('/api/books/:bookId/planning-brief', createPlanningBriefRouter());
  return app;
}

describe('Planning Brief Route', () => {
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

  it('requires inspiration seed before creating planning brief', async () => {
    const res = await app.request('/api/books/book-001/planning-brief', {
      method: 'POST',
      body: JSON.stringify({
        audience: '男频玄幻读者',
        genreStrategy: '高开高走',
        styleTarget: '爽点密集',
        lengthTarget: '300 万字',
        tabooRules: ['不降智'],
        marketGoals: ['起点连载'],
        creativeConstraints: ['成长线清晰'],
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(409);
    const data = (await res.json()) as { error: { code: string } };
    expect(data.error.code).toBe('UPSTREAM_REQUIRED');
  });

  it('creates and reads planning brief after inspiration is ready', async () => {
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

    const createRes = await app.request('/api/books/book-001/planning-brief', {
      method: 'POST',
      body: JSON.stringify({
        audience: '男频玄幻读者',
        genreStrategy: '高开高走',
        styleTarget: '爽点密集',
        lengthTarget: '300 万字',
        tabooRules: ['不降智'],
        marketGoals: ['起点连载'],
        creativeConstraints: ['成长线清晰'],
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(createRes.status).toBe(201);

    const getRes = await app.request('/api/books/book-001/planning-brief');
    expect(getRes.status).toBe(200);
    const data = (await getRes.json()) as { data: { audience: string; status: string } };
    expect(data.data.audience).toBe('男频玄幻读者');
    expect(data.data.status).toBe('draft');
  });

  it('updates planning brief status', async () => {
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
    await app.request('/api/books/book-001/planning-brief', {
      method: 'POST',
      body: JSON.stringify({
        audience: '男频玄幻读者',
        genreStrategy: '高开高走',
        styleTarget: '爽点密集',
        lengthTarget: '300 万字',
        tabooRules: ['不降智'],
        marketGoals: ['起点连载'],
        creativeConstraints: ['成长线清晰'],
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const patchRes = await app.request('/api/books/book-001/planning-brief', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'ready', styleTarget: '更强压强' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(patchRes.status).toBe(200);
    const data = (await patchRes.json()) as { data: { status: string; styleTarget: string } };
    expect(data.data.status).toBe('ready');
    expect(data.data.styleTarget).toBe('更强压强');
  });
});
