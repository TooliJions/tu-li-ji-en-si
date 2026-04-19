import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createHooksRouter, hooksStore } from './hooks';

function createTestApp() {
  const app = new Hono();
  app.route('/api/books/:bookId/hooks', createHooksRouter());
  return app;
}

describe('Hooks Route', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    app = createTestApp();
    hooksStore.clear();
  });

  describe('GET /api/books/:bookId/hooks', () => {
    it('returns hooks list', async () => {
      const res = await app.request('/api/books/book-001/hooks');
      expect(res.status).toBe(200);
      const data = (await res.json()) as { data: unknown[] };
      expect(Array.isArray(data.data)).toBe(true);
    });

    it('filters by status', async () => {
      const res = await app.request('/api/books/book-001/hooks?status=open');
      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/books/:bookId/hooks', () => {
    it('creates a hook', async () => {
      const res = await app.request('/api/books/book-001/hooks', {
        method: 'POST',
        body: JSON.stringify({
          description: '新伏笔',
          chapter: 1,
          priority: 'major',
          expectedResolutionWindow: { min: 10, max: 20 },
        }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(201);
      const data = (await res.json()) as {
        data: { id: string; status: string; healthScore: number };
      };
      expect(data.data.id).toBeDefined();
      expect(data.data.status).toBe('open');
      expect(data.data.healthScore).toBe(100);
    });

    it('returns 400 for missing description', async () => {
      const res = await app.request('/api/books/book-001/hooks', {
        method: 'POST',
        body: JSON.stringify({ chapter: 1, priority: 'major' }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid priority', async () => {
      const res = await app.request('/api/books/book-001/hooks', {
        method: 'POST',
        body: JSON.stringify({ description: 'test', chapter: 1, priority: 'invalid' }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /api/books/:bookId/hooks/:hookId', () => {
    it('updates hook status', async () => {
      const createRes = await app.request('/api/books/book-001/hooks', {
        method: 'POST',
        body: JSON.stringify({ description: 'Update Me', chapter: 1, priority: 'major' }),
        headers: { 'Content-Type': 'application/json' },
      });
      const createData = (await createRes.json()) as { data: { id: string } };
      const hookId = createData.data.id;

      const res = await app.request(`/api/books/book-001/hooks/${hookId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'progressing' }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as { data: { status: string } };
      expect(data.data.status).toBe('progressing');
    });

    it('returns 404 for non-existent hook', async () => {
      const res = await app.request('/api/books/book-001/hooks/nonexistent', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'resolved' }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(404);
    });

    it('returns 400 for invalid status', async () => {
      const createRes = await app.request('/api/books/book-001/hooks', {
        method: 'POST',
        body: JSON.stringify({ description: 'Bad Status', chapter: 1, priority: 'minor' }),
        headers: { 'Content-Type': 'application/json' },
      });
      const createData = (await createRes.json()) as { data: { id: string } };
      const hookId = createData.data.id;

      const res = await app.request(`/api/books/book-001/hooks/${hookId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'invalid_status' }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/books/:bookId/hooks/health', () => {
    it('returns hook health', async () => {
      const res = await app.request('/api/books/book-001/hooks/health');
      expect(res.status).toBe(200);
      const data = (await res.json()) as { data: { total: number } };
      expect(typeof data.data.total).toBe('number');
    });
  });

  describe('GET /api/books/:bookId/hooks/timeline', () => {
    it('returns timeline data', async () => {
      const res = await app.request('/api/books/book-001/hooks/timeline');
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/books/:bookId/hooks/wake-schedule', () => {
    it('returns wake schedule', async () => {
      const res = await app.request('/api/books/book-001/hooks/wake-schedule');
      expect(res.status).toBe(200);
    });
  });

  // ── 人工意图声明 ──────────────────────────────────────────

  describe('PATCH /api/books/:bookId/hooks/:hookId/intent', () => {
    it('sets expected resolution window', async () => {
      // Create a hook first
      const createRes = await app.request('/api/books/book-001/hooks', {
        method: 'POST',
        body: JSON.stringify({
          description: '测试伏笔',
          chapter: 1,
          priority: 'major',
        }),
        headers: { 'Content-Type': 'application/json' },
      });
      const createData = (await createRes.json()) as { data: { id: string } };
      const hookId = createData.data.id;

      const res = await app.request(`/api/books/book-001/hooks/${hookId}/intent`, {
        method: 'PATCH',
        body: JSON.stringify({ min: 15, max: 40 }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        data: { success: boolean; expectedResolutionWindow: { min: number; max: number } };
      };
      expect(data.data.success).toBe(true);
      expect(data.data.expectedResolutionWindow.min).toBe(15);
      expect(data.data.expectedResolutionWindow.max).toBe(40);
    });

    it('marks hook as dormant with window', async () => {
      const createRes = await app.request('/api/books/book-001/hooks', {
        method: 'POST',
        body: JSON.stringify({ description: 'Dormant Test', chapter: 1, priority: 'minor' }),
        headers: { 'Content-Type': 'application/json' },
      });
      const createData = (await createRes.json()) as { data: { id: string } };
      const hookId = createData.data.id;

      const res = await app.request(`/api/books/book-001/hooks/${hookId}/intent`, {
        method: 'PATCH',
        body: JSON.stringify({ min: 20, max: 50, setDormant: true }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as { data: { status: string } };
      expect(data.data.status).toBe('dormant');
    });

    it('returns 400 when min > max', async () => {
      const createRes = await app.request('/api/books/book-001/hooks', {
        method: 'POST',
        body: JSON.stringify({ description: 'Bad Window', chapter: 1, priority: 'minor' }),
        headers: { 'Content-Type': 'application/json' },
      });
      const createData = (await createRes.json()) as { data: { id: string } };
      const hookId = createData.data.id;

      const res = await app.request(`/api/books/book-001/hooks/${hookId}/intent`, {
        method: 'PATCH',
        body: JSON.stringify({ min: 50, max: 20 }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(400);
    });

    it('returns 404 for non-existent hook', async () => {
      const res = await app.request('/api/books/book-001/hooks/nonexistent/intent', {
        method: 'PATCH',
        body: JSON.stringify({ min: 10, max: 20 }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(404);
    });

    it('returns 409 when setting dormant on resolved hook', async () => {
      const createRes = await app.request('/api/books/book-001/hooks', {
        method: 'POST',
        body: JSON.stringify({ description: 'Resolved', chapter: 1, priority: 'major' }),
        headers: { 'Content-Type': 'application/json' },
      });
      const createData = (await createRes.json()) as { data: { id: string } };
      const hookId = createData.data.id;

      // First mark as resolved
      await app.request(`/api/books/book-001/hooks/${hookId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'resolved' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const res = await app.request(`/api/books/book-001/hooks/${hookId}/intent`, {
        method: 'PATCH',
        body: JSON.stringify({ min: 10, max: 30, setDormant: true }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(409);
    });
  });

  // ── 唤醒休眠伏笔 ────────────────────────────────────────

  describe('POST /api/books/:bookId/hooks/:hookId/wake', () => {
    it('wakes a dormant hook to open', async () => {
      // Create and mark as dormant
      const createRes = await app.request('/api/books/book-001/hooks', {
        method: 'POST',
        body: JSON.stringify({ description: 'Wake Me', chapter: 1, priority: 'critical' }),
        headers: { 'Content-Type': 'application/json' },
      });
      const createData = (await createRes.json()) as { data: { id: string } };
      const hookId = createData.data.id;

      // Mark dormant
      await app.request(`/api/books/book-001/hooks/${hookId}/intent`, {
        method: 'PATCH',
        body: JSON.stringify({ min: 10, max: 30, setDormant: true }),
        headers: { 'Content-Type': 'application/json' },
      });

      // Wake up
      const res = await app.request(`/api/books/book-001/hooks/${hookId}/wake`, {
        method: 'POST',
        body: JSON.stringify({ targetStatus: 'open' }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as { data: { newStatus: string } };
      expect(data.data.newStatus).toBe('open');
    });

    it('returns 409 for non-dormant hook', async () => {
      const createRes = await app.request('/api/books/book-001/hooks', {
        method: 'POST',
        body: JSON.stringify({ description: 'Not Dormant', chapter: 1, priority: 'minor' }),
        headers: { 'Content-Type': 'application/json' },
      });
      const createData = (await createRes.json()) as { data: { id: string } };
      const hookId = createData.data.id;

      const res = await app.request(`/api/books/book-001/hooks/${hookId}/wake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(409);
    });

    it('returns 404 for non-existent hook', async () => {
      const res = await app.request('/api/books/book-001/hooks/nonexistent/wake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(404);
    });
  });
});
