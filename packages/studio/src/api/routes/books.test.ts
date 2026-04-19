import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createBookRouter, resetBookStoreForTests } from './books';
import { getStudioRuntimeRootDir, resetStudioCoreBridgeForTests } from '../core-bridge';

function createTestApp() {
  const app = new Hono();
  app.use('*', cors());
  app.route('/api/books', createBookRouter());
  return app;
}

describe('Books Route', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    app = createTestApp();
    resetBookStoreForTests();
    resetStudioCoreBridgeForTests();
  });

  describe('GET /api/books', () => {
    it('returns empty list when no books exist', async () => {
      const res = await app.request('/api/books');
      expect(res.status).toBe(200);
      const data = (await res.json()) as { data: unknown[]; total: number };
      expect(data.data).toEqual([]);
      expect(data.total).toBe(0);
    });
  });

  describe('GET /api/books/:bookId', () => {
    it('returns 404 for non-existent book', async () => {
      const res = await app.request('/api/books/nonexistent');
      expect(res.status).toBe(404);
      const data = (await res.json()) as { error: { code: string; message: string } };
      expect(data.error.code).toBe('BOOK_NOT_FOUND');
    });
  });

  describe('POST /api/books', () => {
    it('creates a new book with required fields', async () => {
      const res = await app.request('/api/books', {
        method: 'POST',
        body: JSON.stringify({
          title: '测试小说',
          genre: '都市',
          targetWords: 1000000,
          language: 'zh-CN',
        }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(201);
      const data = (await res.json()) as { data: Record<string, unknown> };
      expect(data.data.title).toBe('测试小说');
      expect(data.data.genre).toBe('都市');
      expect(data.data.id).toBeDefined();
      expect(data.data.targetChapterCount).toBeDefined();

      const bookId = String(data.data.id);
      const runtimeRoot = getStudioRuntimeRootDir();
      expect(fs.existsSync(path.join(runtimeRoot, bookId, 'book.json'))).toBe(true);
      expect(fs.existsSync(path.join(runtimeRoot, bookId, 'meta.json'))).toBe(true);
      expect(fs.existsSync(path.join(runtimeRoot, bookId, 'story', 'state', 'manifest.json'))).toBe(
        true
      );
    });

    it('creates a book with optional brief', async () => {
      const res = await app.request('/api/books', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Brief Test',
          genre: '奇幻',
          targetWords: 500000,
          brief: '这是一段创作简报',
        }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(201);
      const data = (await res.json()) as { data: Record<string, unknown> };
      expect(data.data.title).toBe('Brief Test');
    });

    it('returns 400 for missing title', async () => {
      const res = await app.request('/api/books', {
        method: 'POST',
        body: JSON.stringify({ genre: '都市', targetWords: 1000000 }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 for missing genre', async () => {
      const res = await app.request('/api/books', {
        method: 'POST',
        body: JSON.stringify({ title: 'No Genre', targetWords: 1000000 }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid targetWords', async () => {
      const res = await app.request('/api/books', {
        method: 'POST',
        body: JSON.stringify({ title: 'Bad Words', genre: '都市', targetWords: -1 }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /api/books/:bookId', () => {
    it('updates book fields', async () => {
      // Create first
      await app.request('/api/books', {
        method: 'POST',
        body: JSON.stringify({ title: 'Update Me', genre: '都市', targetWords: 100000 }),
        headers: { 'Content-Type': 'application/json' },
      });

      const books = await app.request('/api/books');
      const booksData = (await books.json()) as { data: Array<{ id: string }> };
      const bookId = booksData.data[0].id;

      // Then update
      const res = await app.request(`/api/books/${bookId}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: 'Updated Title' }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as { data: { title: string } };
      expect(data.data.title).toBe('Updated Title');
    });

    it('returns 404 for non-existent book', async () => {
      const res = await app.request('/api/books/nonexistent', {
        method: 'PATCH',
        body: JSON.stringify({ title: 'Nope' }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/books/:bookId', () => {
    it('deletes an existing book', async () => {
      // Create first
      await app.request('/api/books', {
        method: 'POST',
        body: JSON.stringify({ title: 'Delete Me', genre: '都市', targetWords: 100000 }),
        headers: { 'Content-Type': 'application/json' },
      });

      const books = await app.request('/api/books');
      const booksData = (await books.json()) as { data: Array<{ id: string }> };
      const bookId = booksData.data[0].id;

      // Then delete
      const res = await app.request(`/api/books/${bookId}`, { method: 'DELETE' });
      expect(res.status).toBe(204);

      // Verify gone
      const getRes = await app.request(`/api/books/${bookId}`);
      expect(getRes.status).toBe(404);
    });
  });

  describe('GET /api/books/:bookId/activity', () => {
    it('returns activity list for a book', async () => {
      // Create a book
      await app.request('/api/books', {
        method: 'POST',
        body: JSON.stringify({ title: 'Activity Book', genre: '都市', targetWords: 100000 }),
        headers: { 'Content-Type': 'application/json' },
      });

      const books = await app.request('/api/books');
      const booksData = (await books.json()) as { data: Array<{ id: string }> };
      const bookId = booksData.data[0].id;

      const res = await app.request(`/api/books/${bookId}/activity`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as { data: unknown[] };
      expect(Array.isArray(data.data)).toBe(true);
    });

    it('returns 404 for non-existent book activity', async () => {
      const res = await app.request('/api/books/nonexistent/activity');
      expect(res.status).toBe(404);
    });

    it('accepts limit query parameter', async () => {
      await app.request('/api/books', {
        method: 'POST',
        body: JSON.stringify({ title: 'Limit Book', genre: '都市', targetWords: 100000 }),
        headers: { 'Content-Type': 'application/json' },
      });

      const books = await app.request('/api/books');
      const booksData = (await books.json()) as { data: Array<{ id: string }> };
      const bookId = booksData.data[0].id;

      const res = await app.request(`/api/books/${bookId}/activity?limit=5`);
      expect(res.status).toBe(200);
    });
  });
});
