import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createPromptsRouter } from './prompts';

function createTestApp() {
  const app = new Hono();
  app.route('/api/books/:bookId/prompts', createPromptsRouter());
  return app;
}

describe('Prompts Route', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    app = createTestApp();
  });

  describe('GET /api/books/:bookId/prompts', () => {
    it('returns prompt versions list', async () => {
      const res = await app.request('/api/books/book-001/prompts');
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        data: {
          versions: Array<{ version: string; label: string; date: string }>;
          current: string;
        };
      };
      expect(Array.isArray(data.data.versions)).toBe(true);
      expect(data.data.versions.length).toBeGreaterThan(0);
      expect(data.data.current).toBeDefined();
    });

    it('returns version details with required fields', async () => {
      const res = await app.request('/api/books/book-001/prompts');
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        data: { versions: Array<{ version: string; label: string; date: string }> };
      };
      const first = data.data.versions[0];
      expect(first.version).toBeDefined();
      expect(first.label).toBeDefined();
      expect(first.date).toBeDefined();
    });
  });

  describe('POST /api/books/:bookId/prompts/set', () => {
    it('switches to a valid version', async () => {
      const res = await app.request('/api/books/book-001/prompts/set', {
        method: 'POST',
        body: JSON.stringify({ version: 'v1' }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as { data: { version: string; switched: boolean } };
      expect(data.data.version).toBe('v1');
      expect(data.data.switched).toBe(true);
    });

    it('switches to latest version', async () => {
      const res = await app.request('/api/books/book-001/prompts/set', {
        method: 'POST',
        body: JSON.stringify({ version: 'latest' }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as { data: { version: string } };
      expect(data.data.version).toBe('latest');
    });

    it('returns 400 for invalid version', async () => {
      const res = await app.request('/api/books/book-001/prompts/set', {
        method: 'POST',
        body: JSON.stringify({ version: 'v3' }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(400);
      const data = (await res.json()) as { error: { code: string } };
      expect(data.error.code).toBe('INVALID_STATE');
    });

    it('returns 400 for missing version', async () => {
      const res = await app.request('/api/books/book-001/prompts/set', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/books/:bookId/prompts/diff', () => {
    it('returns version diff with query params', async () => {
      const res = await app.request('/api/books/book-001/prompts/diff?from=v1&to=v2');
      expect(res.status).toBe(200);
      const data = (await res.json()) as { data: { from: string; to: string; diff: string } };
      expect(data.data.from).toBe('v1');
      expect(data.data.to).toBe('v2');
      expect(data.data.diff).toBeDefined();
    });

    it('works without query params', async () => {
      const res = await app.request('/api/books/book-001/prompts/diff');
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        data: { from: string | undefined; to: string | undefined };
      };
      expect(data.data.from).toBeUndefined();
      expect(data.data.to).toBeUndefined();
    });
  });
});
