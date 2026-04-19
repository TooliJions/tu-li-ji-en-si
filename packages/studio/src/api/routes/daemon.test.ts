import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createDaemonRouter, daemonStates } from './daemon';

function createTestApp() {
  const app = new Hono();
  app.route('/api/books/:bookId/daemon', createDaemonRouter());
  return app;
}

describe('Daemon Route', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    app = createTestApp();
    daemonStates.clear();
  });

  describe('GET /api/books/:bookId/daemon', () => {
    it('returns default idle status', async () => {
      const res = await app.request('/api/books/book-001/daemon');
      expect(res.status).toBe(200);
      const data = (await res.json()) as { data: { status: string; nextChapter: number } };
      expect(data.data.status).toBe('idle');
      expect(data.data.nextChapter).toBe(1);
      expect(data.data.chaptersCompleted).toBe(0);
    });

    it('returns running status after start', async () => {
      await app.request('/api/books/book-001/daemon/start', {
        method: 'POST',
        body: JSON.stringify({ toChapter: 10 }),
        headers: { 'Content-Type': 'application/json' },
      });

      const res = await app.request('/api/books/book-001/daemon');
      expect(res.status).toBe(200);
      const data = (await res.json()) as { data: { status: string; nextChapter: number } };
      expect(data.data.status).toBe('running');
      expect(data.data.nextChapter).toBe(1);
    });
  });

  describe('POST /api/books/:bookId/daemon/start', () => {
    it('starts the daemon with full config', async () => {
      const res = await app.request('/api/books/book-001/daemon/start', {
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
      const res = await app.request('/api/books/book-001/daemon/start', {
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
      const res = await app.request('/api/books/book-001/daemon/start', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid chapter number', async () => {
      const res = await app.request('/api/books/book-001/daemon/start', {
        method: 'POST',
        body: JSON.stringify({ toChapter: -1 }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/books/:bookId/daemon/pause', () => {
    it('pauses a running daemon', async () => {
      await app.request('/api/books/book-001/daemon/start', {
        method: 'POST',
        body: JSON.stringify({ toChapter: 10 }),
        headers: { 'Content-Type': 'application/json' },
      });

      const res = await app.request('/api/books/book-001/daemon/pause', { method: 'POST' });
      expect(res.status).toBe(200);
      const data = (await res.json()) as { data: { status: string } };
      expect(data.data.status).toBe('paused');
    });

    it('pauses an idle daemon', async () => {
      const res = await app.request('/api/books/book-001/daemon/pause', { method: 'POST' });
      expect(res.status).toBe(200);
      const data = (await res.json()) as { data: { status: string } };
      expect(data.data.status).toBe('paused');
    });
  });

  describe('POST /api/books/:bookId/daemon/stop', () => {
    it('stops a running daemon', async () => {
      await app.request('/api/books/book-001/daemon/start', {
        method: 'POST',
        body: JSON.stringify({ toChapter: 10 }),
        headers: { 'Content-Type': 'application/json' },
      });

      const res = await app.request('/api/books/book-001/daemon/stop', { method: 'POST' });
      expect(res.status).toBe(200);
      const data = (await res.json()) as { data: { status: string } };
      expect(data.data.status).toBe('stopped');
    });

    it('stops an idle daemon', async () => {
      const res = await app.request('/api/books/book-001/daemon/stop', { method: 'POST' });
      expect(res.status).toBe(200);
      const data = (await res.json()) as { data: { status: string } };
      expect(data.data.status).toBe('stopped');
    });
  });

  describe('State isolation per book', () => {
    it('maintains separate state for different books', async () => {
      await app.request('/api/books/book-001/daemon/start', {
        method: 'POST',
        body: JSON.stringify({ toChapter: 10, fromChapter: 5 }),
        headers: { 'Content-Type': 'application/json' },
      });

      await app.request('/api/books/book-002/daemon/start', {
        method: 'POST',
        body: JSON.stringify({ toChapter: 20, fromChapter: 15 }),
        headers: { 'Content-Type': 'application/json' },
      });

      const res1 = await app.request('/api/books/book-001/daemon');
      const data1 = (await res1.json()) as { data: { nextChapter: number } };
      expect(data1.data.nextChapter).toBe(5);

      const res2 = await app.request('/api/books/book-002/daemon');
      const data2 = (await res2.json()) as { data: { nextChapter: number } };
      expect(data2.data.nextChapter).toBe(15);
    });
  });
});
