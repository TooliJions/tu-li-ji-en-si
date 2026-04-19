import { Hono } from 'hono';
import { z } from 'zod';

const extractSchema = z.object({
  referenceText: z.string().min(1),
  genre: z.string().min(1),
});

const applySchema = z.object({
  fingerprint: z.record(z.unknown()),
  intensity: z.number().min(0).max(100),
});

export function createStyleRouter(): Hono {
  const router = new Hono();

  router.post('/fingerprint', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const result = extractSchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: result.error.errors[0].message } },
        400
      );
    }

    return c.json({
      data: {
        fingerprint: {
          avgSentenceLength: 18,
          dialogueRatio: 0.35,
          descriptionRatio: 0.4,
          actionRatio: 0.25,
          commonPhrases: ['只见', '不禁', '心中', '微微'],
          sentencePatternPreference: '短句为主，多用逗号分隔',
          wordUsageHabit: '偏好具象动词和感官形容词',
          rhetoricTendency: '善用比喻和排比',
          sourceGenre: result.data.genre,
        },
      },
    });
  });

  router.post('/apply', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const result = applySchema.safeParse(body);
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
        intensity: result.data.intensity,
      },
    });
  });

  return router;
}