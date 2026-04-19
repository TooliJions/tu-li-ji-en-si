import { Hono } from 'hono';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';

interface HookRecord {
  id: string;
  description: string;
  plantedChapter: number;
  status: string;
  priority: string;
  lastAdvancedChapter: number;
  expectedResolutionWindow: { min: number; max: number } | null;
  healthScore: number;
}

export const hooksStore = new Map<string, Map<string, HookRecord>>();

function getBookHooks(bookId: string): Map<string, HookRecord> {
  if (!hooksStore.has(bookId)) {
    hooksStore.set(bookId, new Map());
  }
  return hooksStore.get(bookId)!;
}

const createHookSchema = z.object({
  description: z.string().min(1),
  chapter: z.number().int().positive(),
  priority: z.enum(['critical', 'major', 'minor']),
  expectedResolutionWindow: z.object({ min: z.number(), max: z.number() }).optional(),
});

const updateHookSchema = z.object({
  status: z
    .enum(['open', 'progressing', 'deferred', 'dormant', 'resolved', 'abandoned'])
    .optional(),
  expectedResolutionWindow: z.object({ min: z.number(), max: z.number() }).optional(),
});

// 人工意图声明：设置预期回收窗口，可选择同时标记为休眠
const declareIntentSchema = z.object({
  min: z.number().int().positive().optional(),
  max: z.number().int().positive().optional(),
  setDormant: z.boolean().optional().default(false),
});

// 唤醒休眠伏笔
const wakeUpSchema = z.object({
  targetStatus: z.enum(['open', 'progressing']).optional().default('open'),
  min: z.number().int().positive().optional(),
  max: z.number().int().positive().optional(),
});

export function createHooksRouter(): Hono {
  const router = new Hono();

  // Static routes must be registered BEFORE dynamic :hookId routes

  // GET /api/books/:bookId/hooks — list hooks
  router.get('/', (c) => {
    const bookId = c.req.param('bookId')!;
    const status = c.req.query('status');
    let hooks = Array.from(getBookHooks(bookId).values());
    if (status) {
      hooks = hooks.filter((h) => h.status === status);
    }
    return c.json({ data: hooks, total: hooks.length });
  });

  // POST /api/books/:bookId/hooks — create hook
  router.post('/', async (c) => {
    const bookId = c.req.param('bookId')!;
    const body = await c.req.json().catch(() => ({}));
    const result = createHookSchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: result.error.errors[0].message } },
        400
      );
    }
    const hook: HookRecord = {
      id: `hook-${randomUUID().slice(0, 8)}`,
      description: result.data.description,
      plantedChapter: result.data.chapter,
      status: 'open',
      priority: result.data.priority,
      lastAdvancedChapter: result.data.chapter,
      expectedResolutionWindow: result.data.expectedResolutionWindow ?? null,
      healthScore: 100,
    };
    getBookHooks(bookId).set(hook.id, hook);
    return c.json({ data: hook }, 201);
  });

  // GET /api/books/:bookId/hooks/health
  router.get('/health', (c) => {
    const bookId = c.req.param('bookId')!;
    const hooks = Array.from(getBookHooks(bookId).values());
    const overdue = hooks.filter((h) => h.healthScore < 50);
    return c.json({
      data: {
        total: hooks.length,
        active: hooks.filter((h) => h.status === 'open' || h.status === 'progressing').length,
        dormant: hooks.filter((h) => h.status === 'dormant').length,
        resolved: hooks.filter((h) => h.status === 'resolved').length,
        overdue: overdue.length,
        recoveryRate:
          hooks.length > 0 ? hooks.filter((h) => h.status === 'resolved').length / hooks.length : 0,
        overdueList: overdue.map((h) => ({
          hookId: h.id,
          description: h.description,
          expectedBy: h.expectedResolutionWindow?.max ?? h.plantedChapter + 10,
          currentChapter: h.plantedChapter,
        })),
      },
    });
  });

  // GET /api/books/:bookId/hooks/timeline
  router.get('/timeline', (c) => {
    const bookId = c.req.param('bookId')!;
    const fromChapter = parseInt(c.req.query('fromChapter') || '1', 10);
    const toChapter = parseInt(c.req.query('toChapter') || '100', 10);
    const hooks = Array.from(getBookHooks(bookId).values());
    return c.json({
      data: {
        chapterRange: { from: fromChapter, to: toChapter },
        densityHeatmap: [],
        hooks: hooks.map((h) => ({
          id: h.id,
          description: h.description,
          plantedChapter: h.plantedChapter,
          status: h.status,
          segments: [{ fromChapter: h.plantedChapter, toChapter: toChapter, type: h.status }],
          recurrenceChapter: null,
        })),
        thunderingHerdAnimations: [],
        thunderingHerdAlerts: [],
      },
    });
  });

  // GET /api/books/:bookId/hooks/wake-schedule
  router.get('/wake-schedule', (c) => {
    const bookId = c.req.param('bookId')!;
    return c.json({
      data: {
        currentChapter: 1,
        maxWakePerChapter: 3,
        pendingWakes: [],
      },
    });
  });

  // PATCH /api/books/:bookId/hooks/:hookId/intent — 人工意图声明
  router.patch('/:hookId/intent', async (c) => {
    const bookId = c.req.param('bookId')!;
    const hookId = c.req.param('hookId');
    const hook = getBookHooks(bookId).get(hookId);
    if (!hook) {
      return c.json({ error: { code: 'HOOK_NOT_FOUND', message: '伏笔不存在' } }, 404);
    }

    const body = await c.req.json().catch(() => ({}));
    const result = declareIntentSchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: result.error.errors[0].message } },
        400
      );
    }

    const { min, max, setDormant } = result.data;

    // Validation
    if (min !== undefined && max !== undefined && min > max) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: '预期回收窗口最小值不能大于最大值' } },
        400
      );
    }

    const isTerminal = hook.status === 'resolved' || hook.status === 'abandoned';
    if (isTerminal && setDormant) {
      return c.json(
        { error: { code: 'HOOK_CONFLICT', message: `伏笔状态「${hook.status}」无法标记为休眠` } },
        409
      );
    }

    if (min !== undefined)
      hook.expectedResolutionWindow = { min, max: hook.expectedResolutionWindow?.max ?? min };
    if (max !== undefined) {
      if (hook.expectedResolutionWindow) {
        hook.expectedResolutionWindow = { ...hook.expectedResolutionWindow, max };
      } else {
        hook.expectedResolutionWindow = { min: min ?? max, max };
      }
    }
    if (setDormant && !isTerminal) {
      hook.status = 'dormant';
    }

    return c.json({
      data: {
        hookId,
        success: true,
        status: hook.status,
        expectedResolutionWindow: hook.expectedResolutionWindow,
      },
    });
  });

  // POST /api/books/:bookId/hooks/:hookId/wake — 唤醒休眠伏笔
  router.post('/:hookId/wake', async (c) => {
    const bookId = c.req.param('bookId')!;
    const hookId = c.req.param('hookId');
    const hook = getBookHooks(bookId).get(hookId);
    if (!hook) {
      return c.json({ error: { code: 'HOOK_NOT_FOUND', message: '伏笔不存在' } }, 404);
    }

    if (hook.status !== 'dormant') {
      return c.json(
        {
          error: {
            code: 'HOOK_CONFLICT',
            message: `只有休眠状态的伏笔才能唤醒，当前状态：${hook.status}`,
          },
        },
        409
      );
    }

    const body = await c.req.json().catch(() => ({}));
    const result = wakeUpSchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: result.error.errors[0].message } },
        400
      );
    }

    const { targetStatus, min, max } = result.data;
    hook.status = targetStatus;
    if (min !== undefined || max !== undefined) {
      hook.expectedResolutionWindow = {
        min: min ?? hook.expectedResolutionWindow?.min ?? 1,
        max: max ?? hook.expectedResolutionWindow?.max ?? 10,
      };
    }

    return c.json({
      data: {
        hookId,
        success: true,
        newStatus: hook.status,
        expectedResolutionWindow: hook.expectedResolutionWindow,
      },
    });
  });

  // Dynamic routes — registered last
  // PATCH /api/books/:bookId/hooks/:hookId
  router.patch('/:hookId', async (c) => {
    const bookId = c.req.param('bookId')!;
    const hookId = c.req.param('hookId');
    const hook = getBookHooks(bookId).get(hookId);
    if (!hook) {
      return c.json({ error: { code: 'HOOK_NOT_FOUND', message: '伏笔不存在' } }, 404);
    }
    const body = await c.req.json().catch(() => ({}));
    const result = updateHookSchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: result.error.errors[0].message } },
        400
      );
    }
    Object.assign(hook, result.data);
    return c.json({ data: hook });
  });

  return router;
}
