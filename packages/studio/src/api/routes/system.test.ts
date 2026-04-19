import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createSystemRouter } from './system';

function createTestApp() {
  const app = new Hono();
  app.route('/api/system', createSystemRouter());
  return app;
}

describe('System Route', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    app = createTestApp();
  });

  describe('GET /api/system/doctor', () => {
    it('returns diagnostic information with all fields', async () => {
      const res = await app.request('/api/system/doctor');
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        data: {
          issues: unknown[];
          reorgSentinels: unknown[];
          qualityBaseline: { status: string; version: number };
          providerHealth: unknown[];
        };
      };
      expect(Array.isArray(data.data.issues)).toBe(true);
      expect(Array.isArray(data.data.reorgSentinels)).toBe(true);
      expect(data.data.qualityBaseline.status).toBeDefined();
      expect(typeof data.data.qualityBaseline.version).toBe('number');
      expect(Array.isArray(data.data.providerHealth)).toBe(true);
    });
  });

  describe('POST /api/system/doctor/fix-locks', () => {
    it('fixes stale locks', async () => {
      const res = await app.request('/api/system/doctor/fix-locks', { method: 'POST' });
      expect(res.status).toBe(200);
      const data = (await res.json()) as { data: { fixed: number; message: string } };
      expect(typeof data.data.fixed).toBe('number');
      expect(data.data.message).toBeDefined();
    });
  });

  describe('POST /api/system/doctor/reorg-recovery', () => {
    it('recovers from interrupted reorg', async () => {
      const res = await app.request('/api/system/doctor/reorg-recovery', {
        method: 'POST',
        body: JSON.stringify({ bookId: 'book-001' }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as { data: { recovered: boolean; bookId: string } };
      expect(data.data.recovered).toBe(true);
      expect(data.data.bookId).toBe('book-001');
    });

    it('returns 400 for missing bookId', async () => {
      const res = await app.request('/api/system/doctor/reorg-recovery', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(400);
      const data = (await res.json()) as { error: { code: string } };
      expect(data.error.code).toBe('INVALID_STATE');
    });

    it('returns 400 for empty bookId', async () => {
      const res = await app.request('/api/system/doctor/reorg-recovery', {
        method: 'POST',
        body: JSON.stringify({ bookId: '' }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/system/state-diff', () => {
    it('returns state diff with default file', async () => {
      const res = await app.request('/api/system/state-diff');
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        data: { file: string; changeCount: number; changes: unknown[]; categories: unknown[] };
      };
      expect(data.data.file).toBe('current_state');
      expect(data.data.changeCount).toBe(0);
      expect(Array.isArray(data.data.changes)).toBe(true);
      expect(Array.isArray(data.data.categories)).toBe(true);
    });

    it('accepts file query parameter', async () => {
      const res = await app.request('/api/system/state-diff?file=character_matrix');
      expect(res.status).toBe(200);
      const data = (await res.json()) as { data: { file: string } };
      expect(data.data.file).toBe('character_matrix');
    });
  });
});
