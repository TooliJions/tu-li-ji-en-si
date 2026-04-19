import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createStateRouter } from './state';

function createTestApp() {
  const app = new Hono();
  app.route('/api/books/:bookId/state', createStateRouter());
  return app;
}

describe('State Route', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    app = createTestApp();
  });

  describe('GET /api/books/:bookId/state', () => {
    it('returns truth files list with versionToken', async () => {
      const res = await app.request('/api/books/book-001/state');
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        data: { versionToken: number; files: Array<{ name: string }> };
      };
      expect(data.data.versionToken).toBeDefined();
      expect(data.data.files.length).toBeGreaterThan(0);
      expect(data.data.files[0].name).toBeDefined();
    });
  });

  describe('GET /api/books/:bookId/state/:fileName', () => {
    it('returns a truth file content', async () => {
      const res = await app.request('/api/books/book-001/state/current_state');
      expect(res.status).toBe(200);
      const data = (await res.json()) as { data: { name: string } };
      expect(data.data.name).toBe('current_state');
    });

    it('returns 404 for unknown file', async () => {
      const res = await app.request('/api/books/book-001/state/unknown_file');
      expect(res.status).toBe(404);
      const data = (await res.json()) as { error: { code: string } };
      expect(data.error.code).toBe('FILE_NOT_FOUND');
    });

    it.each([
      'hooks',
      'chapter_summaries',
      'subplot_board',
      'emotional_arcs',
      'character_matrix',
      'manifest',
    ])('returns known file: %s', async (fileName) => {
      const res = await app.request(`/api/books/book-001/state/${fileName}`);
      expect(res.status).toBe(200);
    });
  });

  describe('PUT /api/books/:bookId/state/:fileName', () => {
    it('updates a truth file', async () => {
      const res = await app.request('/api/books/book-001/state/current_state', {
        method: 'PUT',
        body: JSON.stringify({ characters: { update: true } }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        data: { name: string; content: Record<string, unknown>; versionToken: number };
      };
      expect(data.data.name).toBe('current_state');
      expect(data.data.content.characters).toEqual({ update: true });
      expect(data.data.versionToken).toBeDefined();
    });

    it('returns 404 for unknown file', async () => {
      const res = await app.request('/api/books/book-001/state/unknown_file', {
        method: 'PUT',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/books/:bookId/state/projection-status', () => {
    it('returns projection sync status', async () => {
      const res = await app.request('/api/books/book-001/state/projection-status');
      expect(res.status).toBe(200);
      const data = (await res.json()) as { data: { synced: boolean } };
      expect(data.data.synced).toBe(true);
    });
  });

  describe('POST /api/books/:bookId/state/import-markdown', () => {
    it('returns parsed diff and preview', async () => {
      const res = await app.request('/api/books/book-001/state/import-markdown', {
        method: 'POST',
        body: JSON.stringify({ fileName: 'current_state', markdownContent: '# 状态\n内容' }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        data: { parsed: { versionToken: number }; preview: string };
      };
      expect(data.data.parsed.versionToken).toBeDefined();
      expect(data.data.preview).toBeDefined();
    });

    it('returns 400 for missing fileName', async () => {
      const res = await app.request('/api/books/book-001/state/import-markdown', {
        method: 'POST',
        body: JSON.stringify({ markdownContent: '# test' }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 for missing markdownContent', async () => {
      const res = await app.request('/api/books/book-001/state/import-markdown', {
        method: 'POST',
        body: JSON.stringify({ fileName: 'current_state' }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/books/:bookId/state/rollback', () => {
    it('returns rollback confirmation', async () => {
      const res = await app.request('/api/books/book-001/state/rollback', {
        method: 'POST',
        body: JSON.stringify({ targetChapter: 44 }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as { data: { rollback: boolean; targetChapter: number } };
      expect(data.data.rollback).toBe(true);
      expect(data.data.targetChapter).toBe(44);
    });

    it('returns 400 for missing targetChapter', async () => {
      const res = await app.request('/api/books/book-001/state/rollback', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(400);
    });
  });
});
