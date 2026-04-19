import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from './server';

describe('Hono Server', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = createApp();
  });

  describe('GET /api/health', () => {
    it('returns 200 with status ok', async () => {
      const res = await app.request('/api/health');
      expect(res.status).toBe(200);
      const data = (await res.json()) as Record<string, unknown>;
      expect(data.status).toBe('ok');
      expect(data.timestamp).toBeDefined();
    });
  });

  describe('CORS middleware', () => {
    it('adds CORS headers to responses', async () => {
      const res = await app.request('/api/health', {
        method: 'GET',
        headers: { Origin: 'http://localhost:5173' },
      });
      expect(res.headers.get('access-control-allow-origin')).toBe('*');
    });
  });

  describe('prettyJSON middleware', () => {
    it('returns valid JSON from the health endpoint', async () => {
      const res = await app.request('/api/health');
      const text = await res.text();
      // Verify it's valid JSON
      const parsed = JSON.parse(text);
      expect(parsed.status).toBe('ok');
    });
  });

  describe('GET /api/books', () => {
    it('returns empty list by default', async () => {
      const res = await app.request('/api/books');
      expect(res.status).toBe(200);
      const data = (await res.json()) as { data: unknown[]; total: number };
      expect(data.data).toEqual([]);
      expect(data.total).toBe(0);
    });

    it('accepts status query parameter', async () => {
      const res = await app.request('/api/books?status=active');
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/books/:bookId', () => {
    it('returns 404 for non-existent book', async () => {
      const res = await app.request('/api/books/nonexistent');
      expect(res.status).toBe(404);
      const data = (await res.json()) as { error: { code: string } };
      expect(data.error.code).toBe('BOOK_NOT_FOUND');
    });
  });

  describe('Error handling', () => {
    it('returns 404 for unknown routes', async () => {
      const res = await app.request('/api/unknown');
      expect(res.status).toBe(404);
    });
  });
});
