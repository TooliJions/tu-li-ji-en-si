import { Hono } from 'hono';
import { z } from 'zod';

const commandSchema = z.object({ message: z.string().min(1) });
const askSchema = z.object({ question: z.string().min(1) });

export function createNaturalAgentRouter(): Hono {
  const router = new Hono();

  // POST /api/books/:bookId/natural-agent/command
  router.post('/command', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const result = commandSchema.safeParse(body);
    if (!result.success) {
      return c.json({ error: { code: 'INVALID_STATE', message: '缺少指令内容' } }, 400);
    }

    return c.json({
      data: {
        actions: [{ type: 'polish', description: `执行指令：${result.data.message}` }],
        rawMessage: result.data.message,
        bookId: c.req.param('bookId'),
      },
    });
  });

  // POST /api/books/:bookId/natural-agent/ask
  router.post('/ask', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const result = askSchema.safeParse(body);
    if (!result.success) {
      return c.json({ error: { code: 'INVALID_STATE', message: '缺少问题' } }, 400);
    }

    return c.json({
      data: {
        answer: `基于当前小说状态，针对「${result.data.question}」的回复内容占位。`,
        rawQuestion: result.data.question,
        bookId: c.req.param('bookId'),
      },
    });
  });

  // GET /api/books/:bookId/natural-agent/history
  router.get('/history', (c) => {
    const limit = parseInt(c.req.query('limit') || '20', 10);
    return c.json({
      data: {
        messages: [],
        total: 0,
        limit,
      },
    });
  });

  return router;
}
