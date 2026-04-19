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

    it('keeps runtime books visible after in-memory state resets', async () => {
      const createRes = await app.request('/api/books', {
        method: 'POST',
        body: JSON.stringify({ title: 'Persisted Book', genre: '都市', targetWords: 120000 }),
        headers: { 'Content-Type': 'application/json' },
      });
      const created = (await createRes.json()) as { data: { id: string } };

      resetBookStoreForTests();

      const res = await app.request('/api/books');
      expect(res.status).toBe(200);
      const data = (await res.json()) as { data: Array<{ id: string }>; total: number };
      expect(data.total).toBe(1);
      expect(data.data[0]?.id).toBe(created.data.id);
    });
  });

  describe('GET /api/books/:bookId', () => {
    it('returns 404 for non-existent book', async () => {
      const res = await app.request('/api/books/nonexistent');
      expect(res.status).toBe(404);
      const data = (await res.json()) as { error: { code: string; message: string } };
      expect(data.error.code).toBe('BOOK_NOT_FOUND');
    });

    it('reads book details from runtime after in-memory state resets', async () => {
      const createRes = await app.request('/api/books', {
        method: 'POST',
        body: JSON.stringify({ title: 'Runtime Detail', genre: '奇幻', targetWords: 180000 }),
        headers: { 'Content-Type': 'application/json' },
      });
      const created = (await createRes.json()) as { data: { id: string; title: string } };

      resetBookStoreForTests();

      const res = await app.request(`/api/books/${created.data.id}`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as { data: { id: string; title: string } };
      expect(data.data.id).toBe(created.data.id);
      expect(data.data.title).toBe('Runtime Detail');
    });
  });

  describe('POST /api/books', () => {
    it('creates a new book with document-aligned metadata and runtime files', async () => {
      const res = await app.request('/api/books', {
        method: 'POST',
        body: JSON.stringify({
          title: '测试小说',
          genre: '都市',
          language: 'zh-CN',
          platform: 'qidian',
          targetChapterCount: 120,
          targetWordsPerChapter: 3200,
          promptVersion: 'latest',
          modelConfig: {
            useGlobalDefaults: false,
            writer: 'qwen3.6-plus',
            auditor: 'gpt-4o',
            planner: 'qwen3.6-plus',
          },
          brief: '# 创作简报\n\n主角通过高考逆袭人生。',
        }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(201);
      const data = (await res.json()) as { data: Record<string, unknown> };
      expect(data.data.title).toBe('测试小说');
      expect(data.data.genre).toBe('都市');
      expect(data.data.language).toBe('zh-CN');
      expect(data.data.platform).toBe('qidian');
      expect(data.data.promptVersion).toBe('latest');
      expect(data.data.targetChapterCount).toBe(120);
      expect(data.data.targetWordsPerChapter).toBe(3200);
      expect(data.data.targetWords).toBe(384000);
      expect(data.data.modelConfig).toEqual({
        useGlobalDefaults: false,
        writer: 'qwen3.6-plus',
        auditor: 'gpt-4o',
        planner: 'qwen3.6-plus',
      });
      expect(data.data.id).toBeDefined();

      const bookId = String(data.data.id);
      const runtimeRoot = getStudioRuntimeRootDir();
      expect(fs.existsSync(path.join(runtimeRoot, bookId, 'book.json'))).toBe(true);
      expect(fs.existsSync(path.join(runtimeRoot, bookId, 'meta.json'))).toBe(true);
      expect(fs.existsSync(path.join(runtimeRoot, bookId, 'story', 'state', 'manifest.json'))).toBe(
        true
      );

      const meta = JSON.parse(
        fs.readFileSync(path.join(runtimeRoot, bookId, 'meta.json'), 'utf-8')
      ) as Record<string, unknown>;
      expect(meta.language).toBe('zh-CN');
      expect(meta.platform).toBe('qidian');
      expect(meta.promptVersion).toBe('latest');
      expect(meta.synopsis).toBe('# 创作简报\n\n主角通过高考逆袭人生。');
      expect(meta.targetChapterCount).toBe(120);
      expect(meta.targetWordsPerChapter).toBe(3200);
      expect(meta.modelConfig).toEqual({
        useGlobalDefaults: false,
        writer: 'qwen3.6-plus',
        auditor: 'gpt-4o',
        planner: 'qwen3.6-plus',
      });
    });

    it('creates a book with default platform and model settings when omitted', async () => {
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
      expect(data.data.platform).toBe('qidian');
      expect(data.data.promptVersion).toBe('v2');
      expect(data.data.targetWordsPerChapter).toBe(3000);
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
      const data = (await res.json()) as {
        data: Array<{ type: string; timestamp: string; detail: string }>;
      };
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.data.length).toBeGreaterThan(0);
      expect(data.data[0]?.type).toBe('book_created');
      expect(data.data[0]?.timestamp).toBeTruthy();
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
      const data = (await res.json()) as { data: unknown[] };
      expect(data.data.length).toBeLessThanOrEqual(5);
    });
  });
});
