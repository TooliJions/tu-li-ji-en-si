import { beforeEach, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { createStyleRouter } from './style';

function createTestApp() {
  const app = new Hono();
  app.route('/api/books/:bookId/style', createStyleRouter());
  return app;
}

describe('Style Route', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    app = createTestApp();
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

  it('applies style imitation config', async () => {
    const res = await app.request('/api/books/book-001/style/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fingerprint: { avgSentenceLength: 18 },
        intensity: 80,
      }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as { data: { success: boolean } };
    expect(data.data.success).toBe(true);
  });
});