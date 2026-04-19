import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  HookAgenda,
  HookGovernance,
  HookPolicy,
  ProjectionRenderer,
  RuntimeStateStore,
  StateManager,
  type Hook,
  type Manifest,
} from '@cybernovelist/core';
import { getStudioRuntimeRootDir, hasStudioBookRuntime } from '../core-bridge';

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

const declareIntentSchema = z.object({
  min: z.number().int().positive().optional(),
  max: z.number().int().positive().optional(),
  setDormant: z.boolean().optional().default(false),
});

const wakeUpSchema = z.object({
  targetStatus: z.enum(['open', 'progressing']).optional().default('open'),
  min: z.number().int().positive().optional(),
  max: z.number().int().positive().optional(),
});

function ensureBookExists(bookId: string) {
  return hasStudioBookRuntime(bookId);
}

function getHooksContext() {
  const manager = new StateManager(getStudioRuntimeRootDir());
  const store = new RuntimeStateStore(manager);
  const policy = new HookPolicy();
  const agenda = new HookAgenda(policy);
  const governance = new HookGovernance(policy, agenda);
  return { manager, store, policy, agenda, governance };
}

function loadManifest(bookId: string): Manifest {
  const { store } = getHooksContext();
  return store.loadManifest(bookId);
}

function saveManifest(bookId: string, manifest: Manifest): Manifest {
  const { manager, store } = getHooksContext();
  store.saveRuntimeStateSnapshot(bookId, manifest);
  const saved = store.loadManifest(bookId);
  ProjectionRenderer.writeProjectionFiles(saved, manager.getBookPath(bookId, 'story', 'state'), []);
  return saved;
}

function currentChapterOf(manifest: Manifest): number {
  const chapterNumbers = manifest.hooks.flatMap((hook) =>
    [hook.plantedChapter, hook.wakeAtChapter].filter((value): value is number => typeof value === 'number')
  );
  return Math.max(1, manifest.lastChapterWritten, ...chapterNumbers);
}

function storyChapterOf(manifest: Manifest): number {
  return Math.max(1, manifest.lastChapterWritten);
}

function findHook(manifest: Manifest, hookId: string): Hook | undefined {
  return manifest.hooks.find((hook) => hook.id === hookId);
}

function toApiHook(hook: Hook, currentChapter: number, governance: HookGovernance) {
  const health = governance.checkHealth([hook], currentChapter);
  return {
    ...hook,
    lastAdvancedChapter: currentChapter,
    expectedResolutionWindow:
      hook.expectedResolutionMin && hook.expectedResolutionMax
        ? { min: hook.expectedResolutionMin, max: hook.expectedResolutionMax }
        : null,
    healthScore: health.healthScore,
  };
}

function buildTimelineSegments(hook: Hook, toChapter: number) {
  if (hook.status === 'resolved' || hook.status === 'abandoned') {
    return [{ fromChapter: hook.plantedChapter, toChapter: hook.plantedChapter, type: hook.status }];
  }

  return [
    {
      fromChapter: hook.plantedChapter,
      toChapter: hook.wakeAtChapter ?? Math.max(toChapter, hook.plantedChapter),
      type: hook.status,
    },
  ];
}

export function createHooksRouter(): Hono {
  const router = new Hono();

  router.get('/', (c) => {
    const bookId = c.req.param('bookId')!;
    if (!ensureBookExists(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const status = c.req.query('status');
    const { governance } = getHooksContext();
    const manifest = loadManifest(bookId);
    const currentChapter = currentChapterOf(manifest);
    let hooks = manifest.hooks.map((hook) => toApiHook(hook, currentChapter, governance));
    if (status) {
      hooks = hooks.filter((hook) => hook.status === status);
    }
    return c.json({ data: hooks, total: hooks.length });
  });

  router.post('/', async (c) => {
    const bookId = c.req.param('bookId')!;
    if (!ensureBookExists(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const body = await c.req.json().catch(() => ({}));
    const result = createHookSchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: result.error.errors[0].message } },
        400
      );
    }

    const { governance } = getHooksContext();
    const manifest = loadManifest(bookId);
    const now = new Date().toISOString();
    const hook: Hook = {
      id: `hook-${randomUUID().slice(0, 8)}`,
      description: result.data.description,
      type: 'narrative',
      status: 'open',
      priority: result.data.priority,
      plantedChapter: result.data.chapter,
      expectedResolutionMin: result.data.expectedResolutionWindow?.min,
      expectedResolutionMax: result.data.expectedResolutionWindow?.max,
      relatedCharacters: [],
      relatedChapters: [result.data.chapter],
      createdAt: now,
      updatedAt: now,
    };

    const admission = governance.evaluateAdmission(hook, manifest.hooks);
    if (!admission.admitted) {
      return c.json(
        { error: { code: 'HOOK_CONFLICT', message: admission.reason ?? '伏笔准入失败' } },
        409
      );
    }

    manifest.hooks.push(hook);
    const saved = saveManifest(bookId, manifest);
    const currentChapter = currentChapterOf(saved);
    return c.json({ data: toApiHook(saved.hooks.at(-1)!, currentChapter, governance) }, 201);
  });

  router.get('/health', (c) => {
    const bookId = c.req.param('bookId')!;
    if (!ensureBookExists(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const { governance } = getHooksContext();
    const manifest = loadManifest(bookId);
    const currentChapter = currentChapterOf(manifest);
    const health = governance.checkHealth(manifest.hooks, currentChapter);

    return c.json({
      data: {
        total: health.totalHooks,
        active: health.byStatus.open + health.byStatus.progressing + health.byStatus.deferred,
        dormant: health.dormantCount,
        resolved: health.byStatus.resolved,
        overdue: health.overdueCount,
        recoveryRate: health.totalHooks > 0 ? health.byStatus.resolved / health.totalHooks : 0,
        overdueList: manifest.hooks
          .filter((hook) => hook.status === 'open' || hook.status === 'progressing')
          .filter((hook) => !governance.checkHealth([hook], currentChapter).warnings.includes('0 个伏笔逾期'))
          .map((hook) => ({
            hookId: hook.id,
            description: hook.description,
            expectedBy: hook.expectedResolutionMax ?? hook.plantedChapter + 10,
            currentChapter,
          })),
      },
    });
  });

  router.get('/timeline', (c) => {
    const bookId = c.req.param('bookId')!;
    if (!ensureBookExists(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const fromChapter = Number.parseInt(c.req.query('fromChapter') || '1', 10);
    const toChapter = Number.parseInt(c.req.query('toChapter') || '100', 10);
    const { policy } = getHooksContext();
    const manifest = loadManifest(bookId);

    const densityHeatmap = Array.from({ length: Math.max(0, toChapter - fromChapter + 1) }, (_, index) => {
      const chapter = fromChapter + index;
      const count = manifest.hooks.filter(
        (hook) => hook.plantedChapter === chapter || hook.wakeAtChapter === chapter
      ).length;
      return { chapter, count };
    });

    const wakeGroups = new Map<number, Hook[]>();
    for (const hook of manifest.hooks) {
      if (!hook.wakeAtChapter) {
        continue;
      }
      const group = wakeGroups.get(hook.wakeAtChapter) ?? [];
      group.push(hook);
      wakeGroups.set(hook.wakeAtChapter, group);
    }

    const thunderingHerdAlerts = Array.from(wakeGroups.entries())
      .filter(([, hooks]) => hooks.length > policy.wakePolicy.maxWakePerChapter)
      .map(([chapter, hooks]) => ({
        chapter,
        count: hooks.length,
        message: `第 ${chapter} 章预计同时唤醒 ${hooks.length} 个伏笔`,
      }));

    return c.json({
      data: {
        chapterRange: { from: fromChapter, to: toChapter },
        densityHeatmap,
        hooks: manifest.hooks.map((hook) => ({
          id: hook.id,
          description: hook.description,
          plantedChapter: hook.plantedChapter,
          status: hook.status,
          segments: buildTimelineSegments(hook, toChapter),
          recurrenceChapter: hook.wakeAtChapter ?? null,
        })),
        thunderingHerdAnimations: thunderingHerdAlerts.map((alert) => ({
          chapter: alert.chapter,
          intensity: alert.count,
        })),
        thunderingHerdAlerts,
      },
    });
  });

  router.get('/wake-schedule', (c) => {
    const bookId = c.req.param('bookId')!;
    if (!ensureBookExists(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const { policy } = getHooksContext();
    const manifest = loadManifest(bookId);
    const currentChapter = storyChapterOf(manifest);

    return c.json({
      data: {
        currentChapter,
        maxWakePerChapter: policy.wakePolicy.maxWakePerChapter,
        pendingWakes: manifest.hooks
          .filter((hook) => hook.status === 'deferred' || hook.status === 'dormant')
          .map((hook) => ({
            hookId: hook.id,
            description: hook.description,
            wakeAtChapter: hook.wakeAtChapter ?? hook.expectedResolutionMin ?? currentChapter,
            status: hook.status,
          })),
      },
    });
  });

  router.patch('/:hookId/intent', async (c) => {
    const bookId = c.req.param('bookId')!;
    if (!ensureBookExists(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const hookId = c.req.param('hookId');
    const body = await c.req.json().catch(() => ({}));
    const result = declareIntentSchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: result.error.errors[0].message } },
        400
      );
    }

    const { governance } = getHooksContext();
    const manifest = loadManifest(bookId);
    const hook = findHook(manifest, hookId);
    if (!hook) {
      return c.json({ error: { code: 'HOOK_NOT_FOUND', message: '伏笔不存在' } }, 404);
    }

    const intent = governance.declareIntent(hook, result.data);
    if (!intent.success) {
      return c.json(
        {
          error: {
            code: intent.reason?.includes('无法标记为休眠') ? 'HOOK_CONFLICT' : 'INVALID_STATE',
            message: intent.reason ?? '意图声明失败',
          },
        },
        intent.reason?.includes('无法标记为休眠') ? 409 : 400
      );
    }

    saveManifest(bookId, manifest);
    return c.json({
      data: {
        hookId,
        success: true,
        status: hook.status,
        expectedResolutionWindow:
          hook.expectedResolutionMin && hook.expectedResolutionMax
            ? { min: hook.expectedResolutionMin, max: hook.expectedResolutionMax }
            : null,
      },
    });
  });

  router.post('/:hookId/wake', async (c) => {
    const bookId = c.req.param('bookId')!;
    if (!ensureBookExists(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const hookId = c.req.param('hookId');
    const body = await c.req.json().catch(() => ({}));
    const result = wakeUpSchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: result.error.errors[0].message } },
        400
      );
    }

    const { governance } = getHooksContext();
    const manifest = loadManifest(bookId);
    const hook = findHook(manifest, hookId);
    if (!hook) {
      return c.json({ error: { code: 'HOOK_NOT_FOUND', message: '伏笔不存在' } }, 404);
    }

    const wakeResult = governance.wakeUp(hook, result.data.targetStatus, {
      min: result.data.min,
      max: result.data.max,
    });
    if (!wakeResult.success) {
      return c.json(
        { error: { code: 'HOOK_CONFLICT', message: wakeResult.reason ?? '唤醒失败' } },
        409
      );
    }

    saveManifest(bookId, manifest);
    return c.json({
      data: {
        hookId,
        success: true,
        newStatus: hook.status,
        expectedResolutionWindow:
          hook.expectedResolutionMin && hook.expectedResolutionMax
            ? { min: hook.expectedResolutionMin, max: hook.expectedResolutionMax }
            : null,
      },
    });
  });

  router.patch('/:hookId', async (c) => {
    const bookId = c.req.param('bookId')!;
    if (!ensureBookExists(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const hookId = c.req.param('hookId');
    const body = await c.req.json().catch(() => ({}));
    const result = updateHookSchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: result.error.errors[0].message } },
        400
      );
    }

    const { governance } = getHooksContext();
    const manifest = loadManifest(bookId);
    const hook = findHook(manifest, hookId);
    if (!hook) {
      return c.json({ error: { code: 'HOOK_NOT_FOUND', message: '伏笔不存在' } }, 404);
    }

    if (result.data.status) {
      hook.status = result.data.status;
    }
    if (result.data.expectedResolutionWindow) {
      hook.expectedResolutionMin = result.data.expectedResolutionWindow.min;
      hook.expectedResolutionMax = result.data.expectedResolutionWindow.max;
    }
    hook.updatedAt = new Date().toISOString();

    const saved = saveManifest(bookId, manifest);
    const updated = findHook(saved, hookId)!;
    return c.json({ data: toApiHook(updated, currentChapterOf(saved), governance) });
  });

  return router;
}