import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createExportRouter } from './export';
import { createPromptsRouter } from './prompts';
import { createContextRouter } from './context';
import { createBookRouter, resetBookStoreForTests } from './books';
import { resetStudioCoreBridgeForTests } from '../core-bridge';

describe('Export Route', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.route('/api/books/:bookId/export', createExportRouter());
  });

  describe('POST /api/books/:bookId/export/epub', () => {
    it('initiates EPUB export', async () => {
      const res = await app.request('/api/books/book-001/export/epub', {
        method: 'POST',
        body: JSON.stringify({ chapterRange: { from: 1, to: 10 } }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/books/:bookId/export/txt', () => {
    it('initiates TXT export', async () => {
      const res = await app.request('/api/books/book-001/export/txt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(200);
    });
  });
});

describe('Prompts Route', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.route('/api/books/:bookId/prompts', createPromptsRouter());
  });

  describe('GET /api/books/:bookId/prompts', () => {
    it('returns prompt versions', async () => {
      const res = await app.request('/api/books/book-001/prompts');
      expect(res.status).toBe(200);
    });
  });
});

describe('Context Route', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.route('/api/books', createBookRouter());
    app.route('/api/books/:bookId/context', createContextRouter());
    resetBookStoreForTests();
    resetStudioCoreBridgeForTests();
  });

  async function createBook() {
    const res = await app.request('/api/books', {
      method: 'POST',
      body: JSON.stringify({ title: '辅助测试书', genre: 'urban', targetWords: 30000 }),
      headers: { 'Content-Type': 'application/json' },
    });
    const data = (await res.json()) as { data: { id: string } };
    return data.data.id;
  }

  describe('GET /api/books/:bookId/context/:entityName', () => {
    it('returns 404 for entity when runtime has no matching context', async () => {
      const bookId = await createBook();
      const res = await app.request(`/api/books/${bookId}/context/林晨`);
      expect(res.status).toBe(404);
    });

    it('returns 404 for unknown entity', async () => {
      const bookId = await createBook();
      const res = await app.request(`/api/books/${bookId}/context/unknown`);
      expect(res.status).toBe(404);
    });
  });
});
