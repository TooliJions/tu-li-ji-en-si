import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createBookRouter, resetBookStoreForTests } from './books';
import { createSystemRouter } from './system';
import { getStudioRuntimeRootDir, resetStudioCoreBridgeForTests } from '../core-bridge';

function createTestApp() {
  const app = new Hono();
  app.route('/api/books', createBookRouter());
  app.route('/api/system', createSystemRouter());
  return app;
}

async function createBook(app: ReturnType<typeof createTestApp>) {
  const res = await app.request('/api/books', {
    method: 'POST',
    body: JSON.stringify({ title: '系统测试书', genre: 'urban', targetWords: 60000 }),
    headers: { 'Content-Type': 'application/json' },
  });
  const data = (await res.json()) as { data: { id: string } };
  return data.data.id;
}

describe('System Route', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    app = createTestApp();
    resetBookStoreForTests();
    resetStudioCoreBridgeForTests();
  });

  describe('GET /api/system/doctor', () => {
    it('returns real diagnostic information from runtime state', async () => {
      const bookId = await createBook(app);
      const runtimeRoot = getStudioRuntimeRootDir();
      const bookDir = path.join(runtimeRoot, bookId);

      fs.writeFileSync(
        path.join(bookDir, '.lock'),
        JSON.stringify(
          {
            bookId,
            pid: 999999,
            createdAt: '2026-04-19T00:00:00.000Z',
            operation: 'write-next',
          },
          null,
          2
        ),
        'utf-8'
      );

      fs.writeFileSync(
        path.join(bookDir, 'story', 'state', '.reorg_in_progress'),
        JSON.stringify(
          {
            bookId,
            operation: 'merge',
            startedAt: '2026-04-19T00:00:00.000Z',
            pid: 999999,
          },
          null,
          2
        ),
        'utf-8'
      );

      const res = await app.request('/api/system/doctor');
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        data: {
          issues: Array<{ type: string }>;
          reorgSentinels: Array<{ bookId: string }>;
          qualityBaseline: { status: string; version: number };
          providerHealth: unknown[];
        };
      };
      expect(data.data.issues.some((issue) => issue.type === 'stale_lock')).toBe(true);
      expect(data.data.reorgSentinels.some((sentinel) => sentinel.bookId === bookId)).toBe(true);
      expect(data.data.qualityBaseline.status).toBeDefined();
      expect(typeof data.data.qualityBaseline.version).toBe('number');
      expect(Array.isArray(data.data.providerHealth)).toBe(true);
    });
  });

  describe('POST /api/system/doctor/fix-locks', () => {
    it('fixes zombie locks from runtime', async () => {
      const bookId = await createBook(app);
      const runtimeRoot = getStudioRuntimeRootDir();
      const lockPath = path.join(runtimeRoot, bookId, '.lock');
      fs.writeFileSync(
        lockPath,
        JSON.stringify(
          {
            bookId,
            pid: 999999,
            createdAt: '2026-04-19T00:00:00.000Z',
            operation: 'write-next',
          },
          null,
          2
        ),
        'utf-8'
      );

      const res = await app.request('/api/system/doctor/fix-locks', { method: 'POST' });
      expect(res.status).toBe(200);
      const data = (await res.json()) as { data: { fixed: number; message: string } };
      expect(data.data.fixed).toBeGreaterThan(0);
      expect(data.data.message).toBeDefined();
      expect(fs.existsSync(lockPath)).toBe(false);
    });
  });

  describe('POST /api/system/doctor/reorg-recovery', () => {
    it('recovers from interrupted reorg', async () => {
      const bookId = await createBook(app);
      const runtimeRoot = getStudioRuntimeRootDir();
      const sentinelPath = path.join(runtimeRoot, bookId, 'story', 'state', '.reorg_in_progress');
      fs.writeFileSync(
        sentinelPath,
        JSON.stringify(
          {
            bookId,
            operation: 'merge',
            startedAt: '2026-04-19T00:00:00.000Z',
            pid: 999999,
          },
          null,
          2
        ),
        'utf-8'
      );

      const res = await app.request('/api/system/doctor/reorg-recovery', {
        method: 'POST',
        body: JSON.stringify({ bookId }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        data: { recovered: boolean; bookId: string; restoredChapters: number };
      };
      expect(data.data.recovered).toBe(true);
      expect(data.data.bookId).toBe(bookId);
      expect(data.data.restoredChapters).toBeGreaterThanOrEqual(0);
      expect(fs.existsSync(sentinelPath)).toBe(false);
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
    it('returns state diff with real modified file content', async () => {
      const bookId = await createBook(app);
      const runtimeRoot = getStudioRuntimeRootDir();
      const filePath = path.join(runtimeRoot, bookId, 'story', 'state', 'current_state.md');
      fs.writeFileSync(filePath, '# 当前状态\n\n## 当前焦点\n\n外部篡改', 'utf-8');

      const res = await app.request('/api/system/state-diff');
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        data: {
          file: string;
          changeCount: number;
          changes: Array<{ naturalLanguage: string }>;
          categories: unknown[];
        };
      };
      expect(data.data.file).toBe('current_state');
      expect(data.data.changeCount).toBeGreaterThan(0);
      expect(data.data.changes[0]?.naturalLanguage).toBeTruthy();
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
