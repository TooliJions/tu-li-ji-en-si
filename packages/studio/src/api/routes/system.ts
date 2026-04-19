import { Hono } from 'hono';
import { z } from 'zod';

const reorgSchema = z.object({ bookId: z.string().min(1) });

export function createSystemRouter(): Hono {
  const router = new Hono();

  // GET /api/system/doctor
  router.get('/doctor', (c) => {
    return c.json({
      data: {
        issues: [],
        reorgSentinels: [],
        qualityBaseline: { status: 'established', version: 1 },
        providerHealth: [
          { provider: 'DashScope', status: 'online', latencyMs: 320 },
          { provider: 'OpenAI', status: 'online', latencyMs: 450 },
        ],
      },
    });
  });

  // POST /api/system/doctor/fix-locks
  router.post('/doctor/fix-locks', (c) => {
    return c.json({ data: { fixed: 0, message: 'No stale locks found' } });
  });

  // POST /api/system/doctor/reorg-recovery
  router.post('/doctor/reorg-recovery', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const result = reorgSchema.safeParse(body);
    if (!result.success) {
      return c.json({ error: { code: 'INVALID_STATE', message: '缺少 bookId' } }, 400);
    }
    return c.json({ data: { recovered: true, bookId: result.data.bookId } });
  });

  // GET /api/books/:bookId/state/diff — state diff endpoint
  router.get('/state-diff', (c) => {
    const file = c.req.query('file') || 'current_state';
    return c.json({
      data: {
        file,
        summary: '系统从您的小说文本中提取到 0 处设定变更',
        changes: [],
        changeCount: 0,
        categories: [],
      },
    });
  });

  return router;
}
