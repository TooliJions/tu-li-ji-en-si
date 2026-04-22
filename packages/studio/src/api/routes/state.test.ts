import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createBookRouter, resetBookStoreForTests } from './books';
import { createStateRouter } from './state';
import { getStudioRuntimeRootDir, resetStudioCoreBridgeForTests } from '../core-bridge';

function createTestApp() {
  const app = new Hono();
  app.route('/api/books', createBookRouter());
  app.route('/api/books/:bookId/state', createStateRouter());
  return app;
}

async function createBook(app: ReturnType<typeof createTestApp>) {
  const res = await app.request('/api/books', {
    method: 'POST',
    body: JSON.stringify({ title: '状态测试书', genre: 'urban', targetWords: 80000 }),
    headers: { 'Content-Type': 'application/json' },
  });
  const data = (await res.json()) as { data: { id: string } };
  return data.data.id;
}

describe('State Route', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    app = createTestApp();
    resetBookStoreForTests();
    resetStudioCoreBridgeForTests();
  });

  describe('GET /api/books/:bookId/state', () => {
    it('returns truth files list with manifest-backed versionToken', async () => {
      const bookId = await createBook(app);
      const res = await app.request(`/api/books/${bookId}/state`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        data: { versionToken: number; files: Array<{ name: string }> };
      };
      expect(data.data.versionToken).toBe(1);
      expect(data.data.files.map((file) => file.name)).toEqual([
        'chapter_summaries',
        'character_matrix',
        'current_state',
        'emotional_arcs',
        'hooks',
        'manifest',
        'subplot_board',
      ]);
    });
  });

  describe('GET /api/books/:bookId/state/:fileName', () => {
    it('returns a markdown projection from disk', async () => {
      const bookId = await createBook(app);
      const res = await app.request(`/api/books/${bookId}/state/current_state`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as { data: { name: string; content: { markdown: string } } };
      expect(data.data.name).toBe('current_state');
      expect(data.data.content.markdown).toContain('# 当前状态');
    });

    it('returns 404 for unknown file', async () => {
      const bookId = await createBook(app);
      const res = await app.request(`/api/books/${bookId}/state/unknown_file`);
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
      const bookId = await createBook(app);
      const res = await app.request(`/api/books/${bookId}/state/${fileName}`);
      expect(res.status).toBe(200);
    });
  });

  describe('PUT /api/books/:bookId/state/:fileName', () => {
    it('updates a markdown projection on disk', async () => {
      const bookId = await createBook(app);
      const res = await app.request(`/api/books/${bookId}/state/current_state`, {
        method: 'PUT',
        body: JSON.stringify({ content: '{"markdown":"# 当前状态\n\n手动修订"}', versionToken: 1 }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        data: { name: string; content: { markdown: string }; versionToken: number };
      };
      expect(data.data.name).toBe('current_state');
      expect(data.data.content.markdown).toContain('手动修订');
      expect(data.data.versionToken).toBe(2);

      const runtimeRoot = getStudioRuntimeRootDir();
      const filePath = path.join(runtimeRoot, bookId, 'story', 'state', 'current_state.md');
      expect(fs.readFileSync(filePath, 'utf-8')).toContain('手动修订');
    });

    it('updates manifest json on disk', async () => {
      const bookId = await createBook(app);
      const res = await app.request(`/api/books/${bookId}/state/manifest`, {
        method: 'PUT',
        body: JSON.stringify({
          content:
            '{"bookId":"' +
            bookId +
            '","versionToken":9,"lastChapterWritten":3,"hooks":[],"facts":[],"characters":[],"worldRules":[],"updatedAt":"2026-04-19T00:00:00.000Z"}',
          versionToken: 1,
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        data: { content: { lastChapterWritten: number } };
      };
      expect(data.data.content.lastChapterWritten).toBe(3);
    });

    it('returns 404 for unknown file', async () => {
      const bookId = await createBook(app);
      const res = await app.request(`/api/books/${bookId}/state/unknown_file`, {
        method: 'PUT',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/books/:bookId/state/projection-status', () => {
    it('returns projection sync status from real files', async () => {
      const bookId = await createBook(app);
      const res = await app.request(`/api/books/${bookId}/state/projection-status`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        data: { synced: boolean; jsonHash: string; markdownMtime: string; discrepancies: string[] };
      };
      expect(data.data.synced).toBe(true);
      expect(data.data.jsonHash).toMatch(/^[a-f0-9]{64}$/);
      expect(data.data.markdownMtime).toBeTruthy();
      expect(data.data.discrepancies).toEqual([]);
    });

    it('flags manual markdown edits as unsynced', async () => {
      const bookId = await createBook(app);
      const runtimeRoot = getStudioRuntimeRootDir();
      const filePath = path.join(runtimeRoot, bookId, 'story', 'state', 'current_state.md');
      fs.writeFileSync(filePath, '# 当前状态\n\n外部改动', 'utf-8');

      const res = await app.request(`/api/books/${bookId}/state/projection-status`);
      const data = (await res.json()) as { data: { synced: boolean; discrepancies: string[] } };
      expect(data.data.synced).toBe(false);
      expect(data.data.discrepancies.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/books/:bookId/state/import-markdown', () => {
    it('returns parsed diff and preview', async () => {
      const bookId = await createBook(app);
      const res = await app.request(`/api/books/${bookId}/state/import-markdown`, {
        method: 'POST',
        body: JSON.stringify({
          fileName: 'current_state',
          markdownContent: '# 当前状态\n\n## 当前焦点\n\n主角准备直面真相\n',
        }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        data: { parsed: { versionToken: number; diff: string[] }; preview: string };
      };
      expect(data.data.parsed.versionToken).toBeDefined();
      expect(data.data.parsed.diff.length).toBeGreaterThan(0);
      expect(data.data.preview).toBeDefined();

      const manifestPath = path.join(
        getStudioRuntimeRootDir(),
        bookId,
        'story',
        'state',
        'manifest.json'
      );
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as {
        currentFocus?: string;
      };
      expect(manifest.currentFocus).toBe('主角准备直面真相');
    });

    it('returns 400 for missing fileName', async () => {
      const bookId = await createBook(app);
      const res = await app.request(`/api/books/${bookId}/state/import-markdown`, {
        method: 'POST',
        body: JSON.stringify({ markdownContent: '# test' }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 for missing markdownContent', async () => {
      const bookId = await createBook(app);
      const res = await app.request(`/api/books/${bookId}/state/import-markdown`, {
        method: 'POST',
        body: JSON.stringify({ fileName: 'current_state' }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/books/:bookId/state/rollback', () => {
    it('returns rollback confirmation', async () => {
      const bookId = await createBook(app);
      const res = await app.request(`/api/books/${bookId}/state/rollback`, {
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
      const bookId = await createBook(app);
      const res = await app.request(`/api/books/${bookId}/state/rollback`, {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(400);
    });
  });
});
