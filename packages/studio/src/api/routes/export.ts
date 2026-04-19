import { Hono } from 'hono';
import { z } from 'zod';

const exportRangeSchema = z.object({
  chapterRange: z
    .object({ from: z.number().int().positive(), to: z.number().int().positive() })
    .optional(),
});

export function createExportRouter(): Hono {
  const router = new Hono();

  // POST /api/books/:bookId/export/epub
  router.post('/epub', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    exportRangeSchema.safeParse(body);
    return c.json({
      data: { format: 'epub', status: 'processing', bookId: c.req.param('bookId') },
    });
  });

  // POST /api/books/:bookId/export/txt
  router.post('/txt', async (c) => {
    return c.json({ data: { format: 'txt', status: 'processing', bookId: c.req.param('bookId') } });
  });

  // POST /api/books/:bookId/export/markdown
  router.post('/markdown', async (c) => {
    return c.json({
      data: { format: 'markdown', status: 'processing', bookId: c.req.param('bookId') },
    });
  });

  return router;
}
