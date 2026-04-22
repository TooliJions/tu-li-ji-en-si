import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { createFanficRouter } from './fanfic';
import { resetStudioCoreBridgeForTests, initializeStudioBookRuntime } from '../core-bridge';

function createTestApp() {
  const app = new Hono();
  app.route('/api/books/:bookId/fanfic', createFanficRouter());
  return app;
}

describe('Fanfic Route', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    resetStudioCoreBridgeForTests();
    initializeStudioBookRuntime({
      id: 'book-001',
      title: '测试小说',
      genre: 'fanfic',
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

  it('initializes fanfic mode', async () => {
    const res = await app.request('/api/books/book-001/fanfic/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'canon',
        description: '遵循原作设定',
        canonReference: 'canon.md',
      }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as { data: { success: boolean; mode: string } };
    expect(data.data.success).toBe(true);
    expect(data.data.mode).toBe('canon');
  });

  it('validates required fields', async () => {
    const res = await app.request('/api/books/book-001/fanfic/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: 'missing mode' }),
    });

    expect(res.status).toBe(400);
  });
});
