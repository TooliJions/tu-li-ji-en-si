import { Hono } from 'hono';
import { z } from 'zod';

const setVersionSchema = z.object({ version: z.enum(['v1', 'v2', 'latest']) });

const PROMPT_VERSIONS = [
  { version: 'v1', label: '初版', date: '2026-03-01' },
  { version: 'v2', label: '增强版', date: '2026-04-01' },
  { version: 'latest', label: '最新版', date: '2026-04-18' },
];

export function createPromptsRouter(): Hono {
  const router = new Hono();

  // GET /api/books/:bookId/prompts
  router.get('/', (c) => {
    return c.json({ data: { versions: PROMPT_VERSIONS, current: 'v2' } });
  });

  // POST /api/books/:bookId/prompts/set
  router.post('/set', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const result = setVersionSchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: result.error.errors[0].message } },
        400
      );
    }
    return c.json({ data: { version: result.data.version, switched: true } });
  });

  // GET /api/books/:bookId/prompts/diff
  router.get('/diff', (c) => {
    const from = c.req.query('from');
    const to = c.req.query('to');
    return c.json({ data: { from, to, diff: '版本差异对比内容...' } });
  });

  return router;
}
