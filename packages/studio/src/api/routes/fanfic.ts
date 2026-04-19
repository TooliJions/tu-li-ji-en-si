import { Hono } from 'hono';
import { z } from 'zod';

const initFanficSchema = z.object({
  mode: z.enum(['canon', 'au', 'ooc', 'cp']),
  description: z.string().min(1),
  canonReference: z.string().optional().default(''),
});

export function createFanficRouter(): Hono {
  const router = new Hono();

  router.post('/init', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const result = initFanficSchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: result.error.errors[0].message } },
        400
      );
    }

    return c.json({
      data: {
        success: true,
        bookId: c.req.param('bookId'),
        mode: result.data.mode,
        description: result.data.description,
        canonReference: result.data.canonReference,
      },
    });
  });

  return router;
}