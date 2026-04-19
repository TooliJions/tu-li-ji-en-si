import { Hono } from 'hono';
import { z } from 'zod';

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

export const daemonStates = new Map<string, DaemonState>();

function getDaemonState(bookId: string): DaemonState {
  if (!daemonStates.has(bookId)) {
    daemonStates.set(bookId, {
      status: 'idle',
      nextChapter: 1,
      chaptersCompleted: 0,
      intervalSeconds: 30,
      dailyTokenUsed: 0,
      dailyTokenLimit: 1000000,
      consecutiveFallbacks: 0,
      startedAt: null,
    });
  }
  return daemonStates.get(bookId)!;
}

const startSchema = z.object({
  fromChapter: z.number().int().positive().default(1),
  toChapter: z.number().int().positive(),
  interval: z.number().int().positive().default(30),
  dailyTokenLimit: z.number().int().positive().default(1000000),
});

export function createDaemonRouter(): Hono {
  const router = new Hono();

  // GET /api/books/:bookId/daemon
  router.get('/', (c) => {
    const bookId = c.req.param('bookId')!;
    return c.json({ data: getDaemonState(bookId) });
  });

  // POST /api/books/:bookId/daemon/start
  router.post('/start', async (c) => {
    const bookId = c.req.param('bookId')!;
    const body = await c.req.json().catch(() => ({}));
    const result = startSchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: result.error.errors[0].message } },
        400
      );
    }
    const state = getDaemonState(bookId);
    Object.assign(state, {
      status: 'running',
      nextChapter: result.data.fromChapter,
      intervalSeconds: result.data.interval,
      dailyTokenLimit: result.data.dailyTokenLimit,
      startedAt: new Date().toISOString(),
    });
    return c.json({ data: state });
  });

  // POST /api/books/:bookId/daemon/pause
  router.post('/pause', (c) => {
    const bookId = c.req.param('bookId')!;
    const state = getDaemonState(bookId);
    state.status = 'paused';
    return c.json({ data: state });
  });

  // POST /api/books/:bookId/daemon/stop
  router.post('/stop', (c) => {
    const bookId = c.req.param('bookId')!;
    const state = getDaemonState(bookId);
    state.status = 'stopped';
    return c.json({ data: state });
  });

  return router;
}
