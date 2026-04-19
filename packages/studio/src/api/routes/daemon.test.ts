import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createDaemonRouter } from './daemon';
import { createBookRouter, resetBookStoreForTests } from './books';
import { getStudioRuntimeRootDir, resetStudioCoreBridgeForTests } from '../core-bridge';

function createTestApp() {
  const app = new Hono();
  app.route('/api/books', createBookRouter());
  app.route('/api/books/:bookId/daemon', createDaemonRouter());
  return app;
}

async function createBook(app: ReturnType<typeof createTestApp>) {
  const res = await app.request('/api/books', {
    method: 'POST',
    body: JSON.stringify({ title: '守护测试', genre: 'urban', targetWords: 50000 }),
    headers: { 'Content-Type': 'application/json' },
  });
  const data = (await res.json()) as { data: { id: string } };
  return data.data.id;
}

async function waitForDaemonState(app: ReturnType<typeof createTestApp>, bookId: string, expected: string) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const res = await app.request(`/api/books/${bookId}/daemon`);
    const data = (await res.json()) as { data: { status: string } };
    if (data.data.status === expected) {
      return data.data;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`daemon ${bookId} did not reach ${expected}`);
}

describe('Daemon Route', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    app = createTestApp();
    resetBookStoreForTests();
    resetStudioCoreBridgeForTests();
  });

  describe('GET /api/books/:bookId/daemon', () => {
    it('returns default idle status', async () => {
      const bookId = await createBook(app);
      const res = await app.request(`/api/books/${bookId}/daemon`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        data: { status: string; nextChapter: number; chaptersCompleted: number };
      };
      expect(data.data.status).toBe('idle');
      expect(data.data.nextChapter).toBe(1);
      expect(data.data.chaptersCompleted).toBe(0);
    });

    it('returns running status after start', async () => {
      const bookId = await createBook(app);

      await app.request(`/api/books/${bookId}/daemon/start`, {
        method: 'POST',
        body: JSON.stringify({ toChapter: 10 }),
        headers: { 'Content-Type': 'application/json' },
      });

      const res = await app.request(`/api/books/${bookId}/daemon`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        data: { status: string; nextChapter: number; chaptersCompleted: number };
      };
      expect(data.data.status).toBe('running');
      expect(data.data.nextChapter).toBe(1);
    });
  });

  describe('POST /api/books/:bookId/daemon/start', () => {
    it('starts the daemon with full config', async () => {
      const bookId = await createBook(app);

      const res = await app.request(`/api/books/${bookId}/daemon/start`, {
        method: 'POST',
        body: JSON.stringify({
          fromChapter: 1,
          toChapter: 10,
          interval: 30,
          dailyTokenLimit: 1000000,
        }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        data: { status: string; nextChapter: number; intervalSeconds: number };
      };
      expect(data.data.status).toBe('running');
      expect(data.data.nextChapter).toBe(1);
      expect(data.data.intervalSeconds).toBe(30);
    });

    it('uses default values for optional fields', async () => {
      const bookId = await createBook(app);

      const res = await app.request(`/api/books/${bookId}/daemon/start`, {
        method: 'POST',
        body: JSON.stringify({ toChapter: 5 }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        data: { nextChapter: number; intervalSeconds: number; dailyTokenLimit: number };
      };
      expect(data.data.nextChapter).toBe(1);
      expect(data.data.intervalSeconds).toBe(30);
      expect(data.data.dailyTokenLimit).toBe(1000000);
    });

    it('returns 400 for missing toChapter', async () => {
      const bookId = await createBook(app);

      const res = await app.request(`/api/books/${bookId}/daemon/start`, {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid chapter number', async () => {
      const bookId = await createBook(app);

      const res = await app.request(`/api/books/${bookId}/daemon/start`, {
        method: 'POST',
        body: JSON.stringify({ toChapter: -1 }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(400);
    });

    it('completes a chapter through the real scheduler loop', async () => {
      const bookId = await createBook(app);

      const res = await app.request(`/api/books/${bookId}/daemon/start`, {
        method: 'POST',
        body: JSON.stringify({ fromChapter: 1, toChapter: 1, interval: 1 }),
        headers: { 'Content-Type': 'application/json' },
      });

      expect(res.status).toBe(200);

      const runtimeRoot = getStudioRuntimeRootDir();
      const chapterPath = path.join(runtimeRoot, bookId, 'story', 'chapters', 'chapter-0001.md');
      const manifestPath = path.join(runtimeRoot, bookId, 'story', 'state', 'manifest.json');

      for (let attempt = 0; attempt < 40; attempt++) {
        if (fs.existsSync(chapterPath) && fs.existsSync(manifestPath)) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      expect(fs.existsSync(chapterPath)).toBe(true);
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as {
        lastChapterWritten: number;
      };
      expect(manifest.lastChapterWritten).toBe(1);
    });
  });

  describe('POST /api/books/:bookId/daemon/pause', () => {
    it('pauses a running daemon', async () => {
      const bookId = await createBook(app);

      await app.request(`/api/books/${bookId}/daemon/start`, {
        method: 'POST',
        body: JSON.stringify({ toChapter: 10 }),
        headers: { 'Content-Type': 'application/json' },
      });

      const res = await app.request(`/api/books/${bookId}/daemon/pause`, { method: 'POST' });
      expect(res.status).toBe(200);
      const data = (await res.json()) as { data: { status: string } };
      expect(data.data.status).toBe('paused');
    });

    it('keeps idle daemon unchanged when pausing', async () => {
      const bookId = await createBook(app);
      const res = await app.request(`/api/books/${bookId}/daemon/pause`, { method: 'POST' });
      expect(res.status).toBe(200);
      const data = (await res.json()) as { data: { status: string } };
      expect(data.data.status).toBe('idle');
    });
  });

  describe('POST /api/books/:bookId/daemon/stop', () => {
    it('stops a running daemon', async () => {
      const bookId = await createBook(app);

      await app.request(`/api/books/${bookId}/daemon/start`, {
        method: 'POST',
        body: JSON.stringify({ toChapter: 10 }),
        headers: { 'Content-Type': 'application/json' },
      });

      const res = await app.request(`/api/books/${bookId}/daemon/stop`, { method: 'POST' });
      expect(res.status).toBe(200);
      const data = (await res.json()) as { data: { status: string } };
      expect(data.data.status).toBe('idle');
    });

    it('keeps idle daemon unchanged when stopping', async () => {
      const bookId = await createBook(app);
      const res = await app.request(`/api/books/${bookId}/daemon/stop`, { method: 'POST' });
      expect(res.status).toBe(200);
      const data = (await res.json()) as { data: { status: string } };
      expect(data.data.status).toBe('idle');
    });
  });

  describe('State isolation per book', () => {
    it('maintains separate state for different books', async () => {
      const bookOne = await createBook(app);
      const bookTwo = await createBook(app);

      await app.request(`/api/books/${bookOne}/daemon/start`, {
        method: 'POST',
        body: JSON.stringify({ toChapter: 10, fromChapter: 5 }),
        headers: { 'Content-Type': 'application/json' },
      });

      await app.request(`/api/books/${bookTwo}/daemon/start`, {
        method: 'POST',
        body: JSON.stringify({ toChapter: 20, fromChapter: 15 }),
        headers: { 'Content-Type': 'application/json' },
      });

      const res1 = await app.request(`/api/books/${bookOne}/daemon`);
      const data1 = (await res1.json()) as { data: { nextChapter: number } };
      expect(data1.data.nextChapter).toBe(5);

      const res2 = await app.request(`/api/books/${bookTwo}/daemon`);
      const data2 = (await res2.json()) as { data: { nextChapter: number } };
      expect(data2.data.nextChapter).toBe(15);
    });
  });
});
