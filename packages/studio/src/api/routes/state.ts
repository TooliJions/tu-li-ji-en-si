import { Hono } from 'hono';
import { z } from 'zod';

const KNOWN_FILES = [
  'current_state',
  'hooks',
  'chapter_summaries',
  'subplot_board',
  'emotional_arcs',
  'character_matrix',
  'manifest',
];

const importMarkdownSchema = z.object({
  fileName: z.string().min(1),
  markdownContent: z.string().min(1),
});

const rollbackSchema = z.object({
  targetChapter: z.number().int().positive(),
});

export function createStateRouter(): Hono {
  const router = new Hono();

  // Static routes must be registered BEFORE dynamic :fileName routes
  // GET /api/books/:bookId/state — list truth files
  router.get('/', (c) => {
    const files = KNOWN_FILES.map((name) => ({
      name,
      updatedAt: new Date().toISOString(),
      size: Math.floor(Math.random() * 4096) + 256,
    }));
    return c.json({ data: { versionToken: Date.now(), files } });
  });

  // GET /api/books/:bookId/state/projection-status
  router.get('/projection-status', (c) => {
    return c.json({
      data: {
        synced: true,
        jsonHash: 'abc123',
        markdownMtime: new Date().toISOString(),
        discrepancies: [],
      },
    });
  });

  // POST /api/books/:bookId/state/import-markdown
  router.post('/import-markdown', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const result = importMarkdownSchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: result.error.errors[0].message } },
        400
      );
    }
    return c.json({
      data: {
        parsed: { versionToken: Date.now(), diff: [] },
        preview: '变更预览摘要',
      },
    });
  });

  // POST /api/books/:bookId/state/rollback
  router.post('/rollback', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const result = rollbackSchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: result.error.errors[0].message } },
        400
      );
    }
    return c.json({ data: { rollback: true, targetChapter: result.data.targetChapter } });
  });

  // Dynamic routes — registered last so static routes take priority
  // GET /api/books/:bookId/state/:fileName
  router.get('/:fileName', (c) => {
    const fileName = c.req.param('fileName');
    if (!KNOWN_FILES.includes(fileName)) {
      return c.json({ error: { code: 'FILE_NOT_FOUND', message: '真相文件不存在' } }, 404);
    }
    return c.json({ data: { name: fileName, content: {}, versionToken: Date.now() } });
  });

  // PUT /api/books/:bookId/state/:fileName
  router.put('/:fileName', async (c) => {
    const fileName = c.req.param('fileName');
    if (!KNOWN_FILES.includes(fileName)) {
      return c.json({ error: { code: 'FILE_NOT_FOUND', message: '真相文件不存在' } }, 404);
    }
    const body = await c.req.json().catch(() => ({}));
    return c.json({ data: { name: fileName, content: body, versionToken: Date.now() } });
  });

  return router;
}
