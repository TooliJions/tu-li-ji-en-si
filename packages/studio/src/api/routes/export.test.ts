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
      expect(res.headers.get('Content-Type')).toBe('application/epub+zip');
    });

    it('accepts chapter range', async () => {
      const res = await app.request('/api/books/book-001/export/epub', {
        method: 'POST',
        body: JSON.stringify({ chapterRange: { from: 1, to: 10 } }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('application/epub+zip');
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
      expect(res.headers.get('Content-Type')).toContain('text/plain');
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
      expect(res.headers.get('Content-Type')).toContain('text/markdown');
    });
  });
});
