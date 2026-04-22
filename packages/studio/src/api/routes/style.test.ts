import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { createStyleRouter } from './style';
import { resetStudioCoreBridgeForTests, initializeStudioBookRuntime } from '../core-bridge';

function createTestApp() {
  const app = new Hono();
  app.route('/api/books/:bookId/style', createStyleRouter());
  return app;
}

describe('Style Route', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    resetStudioCoreBridgeForTests();
    initializeStudioBookRuntime({
      id: 'book-001',
      title: '测试小说',
      genre: 'urban',
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

  it('extracts style fingerprint', async () => {
    const res = await app.request('/api/books/book-001/style/fingerprint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        referenceText: '这是一段足够长的参考文本，用于提取文风指纹。',
        genre: '都市',
      }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as { data: { fingerprint: { avgSentenceLength: number } } };
    expect(typeof data.data.fingerprint.avgSentenceLength).toBe('number');
  });

  it('applies style with chapterNumber', async () => {
    const res = await app.request('/api/books/book-001/style/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chapterNumber: 1,
        intensity: 80,
      }),
    });

    // 章节文件不存在时返回 404
    expect(res.status).toBe(404);
  });
});
