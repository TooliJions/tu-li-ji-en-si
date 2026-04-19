import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createExportRouter } from './export';

function createTestApp() {
  const app = new Hono();
  app.route('/api/books/:bookId/export', createExportRouter());
  return app;
}

describe('Export Route', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    app = createTestApp();
  });

  describe('POST /api/books/:bookId/export/epub', () => {
    it('starts EPUB export', async () => {
      const res = await app.request('/api/books/book-001/export/epub', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        data: { format: string; status: string; bookId: string };
      };
      expect(data.data.format).toBe('epub');
      expect(data.data.status).toBe('processing');
      expect(data.data.bookId).toBe('book-001');
    });

    it('accepts chapter range', async () => {
      const res = await app.request('/api/books/book-001/export/epub', {
        method: 'POST',
        body: JSON.stringify({ chapterRange: { from: 1, to: 10 } }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as { data: { format: string } };
      expect(data.data.format).toBe('epub');
    });
  });

  describe('POST /api/books/:bookId/export/txt', () => {
    it('starts TXT export', async () => {
      const res = await app.request('/api/books/book-001/export/txt', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as { data: { format: string; bookId: string } };
      expect(data.data.format).toBe('txt');
      expect(data.data.bookId).toBe('book-001');
    });
  });

  describe('POST /api/books/:bookId/export/markdown', () => {
    it('starts Markdown export', async () => {
      const res = await app.request('/api/books/book-001/export/markdown', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as { data: { format: string; bookId: string } };
      expect(data.data.format).toBe('markdown');
      expect(data.data.bookId).toBe('book-001');
    });
  });
});
