import { Hono } from 'hono';
import { z } from 'zod';
import { DaemonScheduler, DaemonState as CoreDaemonState } from '@cybernovelist/core';
import {
  clearStudioDaemon,
  getStudioDaemon,
  hasStudioBookRuntime,
  readStudioBookRuntime,
  setStudioDaemon,
  getStudioRuntimeRootDir,
} from '../core-bridge';
import { getRequestContext } from '../context';
import { eventHub } from '../sse';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface DaemonState {
  status: 'idle' | 'running' | 'paused' | 'stopped';
  nextChapter: number;
  chaptersCompleted: number;
  intervalSeconds: number;
  dailyTokenUsed: number;
  dailyTokenLimit: number;
  consecutiveFallbacks: number;
  startedAt: string | null;
}

function toApiState(scheduler?: DaemonScheduler): DaemonState {
  if (!scheduler) {
    return {
      status: 'idle',
      nextChapter: 1,
      chaptersCompleted: 0,
      intervalSeconds: 30,
      dailyTokenUsed: 0,
      dailyTokenLimit: 1000000,
      consecutiveFallbacks: 0,
      startedAt: null,
    };
  }

  const status = scheduler.getStatus();
  return {
    status: status.state as DaemonState['status'],
    nextChapter: status.nextChapter ?? 1,
    chaptersCompleted: status.chaptersCompleted,
    intervalSeconds: Math.max(1, Math.round(status.intervalMs / 1000)),
    dailyTokenUsed: status.dailyTokenUsed,
    dailyTokenLimit: status.dailyTokenLimit,
    consecutiveFallbacks: status.consecutiveFallbacks,
    startedAt: status.startedAt ?? null,
  };
}

const startSchema = z.object({
  fromChapter: z.number().int().positive().default(1),
  toChapter: z.number().int().positive(),
  interval: z.number().int().positive().default(30),
  dailyTokenLimit: z.number().int().positive().optional(),
});

function loadQuotaFromConfig(): { dailyTokenQuota: number; quotaAlertThreshold: number } | null {
  const cfgPath = path.join(process.cwd(), 'config.local.json');
  if (!fs.existsSync(cfgPath)) return null;
  try {
    const raw = fs.readFileSync(cfgPath, 'utf-8');
    const parsed = JSON.parse(raw) as {
      quotas?: { dailyTokenQuota?: number; quotaAlertThreshold?: number };
    };
    if (!parsed.quotas) return null;
    return {
      dailyTokenQuota: parsed.quotas.dailyTokenQuota ?? 0,
      quotaAlertThreshold: parsed.quotas.quotaAlertThreshold ?? 0.8,
    };
  } catch {
    return null;
  }
}

export function createDaemonRouter(): Hono {
  const router = new Hono();

  // GET /api/books/:bookId/daemon
  router.get('/', (c) => {
    const bookId = c.req.param('bookId')!;
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }
    return c.json({ data: toApiState(getStudioDaemon(bookId)) });
  });

  // POST /api/books/:bookId/daemon/start
  router.post('/start', async (c) => {
    const bookId = c.req.param('bookId')!;
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const body = await c.req.json().catch(() => ({}));
    const result = startSchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: result.error.errors[0].message } },
        400,
      );
    }

    const intervalMs = result.data.interval * 1000;
    const book = readStudioBookRuntime(bookId);

    // 优先使用配置文件中的配额，请求体中的值可覆盖
    const quotaConfig = loadQuotaFromConfig();
    const configQuota =
      quotaConfig && quotaConfig.dailyTokenQuota > 0 ? quotaConfig.dailyTokenQuota : 1000000;
    const dailyTokenLimit = result.data.dailyTokenLimit ?? configQuota;

    const daemon = new DaemonScheduler({
      bookId,
      rootDir: getStudioRuntimeRootDir(),
      fromChapter: result.data.fromChapter,
      toChapter: result.data.toChapter,
      dailyTokenLimit,
      mode: 'cloud',
      targetRpm: 60000 / intervalMs,
      minIntervalMs: intervalMs,
      maxIntervalMs: intervalMs,
      bookTitle: book?.title,
      genre: book?.genre,
    });

    daemon.on('state_change', (event) => {
      eventHub.sendEvent(bookId, 'daemon_event', {
        type: 'state_change',
        from: event.from,
        to: event.to,
      });

      if (event.to === CoreDaemonState.Idle || event.to === CoreDaemonState.Stopped) {
        clearStudioDaemon(bookId);
      }
    });
    daemon.on('chapter_complete', (event) => {
      eventHub.sendEvent(bookId, 'chapter_complete', event);
    });
    daemon.on('chapter_error', (event) => {
      eventHub.sendEvent(bookId, 'daemon_event', { type: 'chapter_error', ...event });
    });

    setStudioDaemon(bookId, daemon);
    const { runner } = getRequestContext(c);
    daemon.start(runner);

    return c.json({ data: toApiState(daemon) });
  });

  // POST /api/books/:bookId/daemon/pause
  router.post('/pause', (c) => {
    const bookId = c.req.param('bookId')!;
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const daemon = getStudioDaemon(bookId);
    daemon?.pause();
    return c.json({ data: toApiState(daemon) });
  });

  // POST /api/books/:bookId/daemon/stop
  router.post('/stop', (c) => {
    const bookId = c.req.param('bookId')!;
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const daemon = getStudioDaemon(bookId);
    daemon?.stop();
    clearStudioDaemon(bookId);
    return c.json({ data: toApiState(undefined) });
  });

  return router;
}
