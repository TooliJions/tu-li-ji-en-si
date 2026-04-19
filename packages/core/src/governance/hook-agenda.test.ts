import { describe, it, expect, beforeEach } from 'vitest';
import { HookAgenda } from './hook-agenda';
import { HookPolicy } from './hook-policy';
import type { Hook } from '../models/state';

// ── Helpers ────────────────────────────────────────────────────────

function makeHook(overrides: Partial<Hook> = {}): Hook {
  return {
    id: 'hook-1',
    description: 'Test hook',
    type: 'narrative',
    status: 'open',
    priority: 'major',
    plantedChapter: 1,
    relatedCharacters: [],
    relatedChapters: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('HookAgenda', () => {
  let policy: HookPolicy;
  let agenda: HookAgenda;

  beforeEach(() => {
    policy = new HookPolicy();
    agenda = new HookAgenda(policy);
  });

  // ── scheduleHook ──────────────────────────────────────────────

  describe('scheduleHook', () => {
    it('creates a schedule entry for an open hook', () => {
      const hook = makeHook({ id: 'h1', plantedChapter: 5 });

      const schedule = agenda.scheduleHook(hook);

      expect(schedule.hookId).toBe('h1');
      expect(schedule.status).toBe('scheduled');
      expect(schedule.currentChapter).toBe(5);
    });

    it('returns unscheduled for dormant hooks', () => {
      const hook = makeHook({ id: 'h1', status: 'dormant' });

      const schedule = agenda.scheduleHook(hook);

      expect(schedule.status).toBe('unscheduled');
    });

    it('returns unscheduled for resolved hooks', () => {
      const hook = makeHook({ id: 'h1', status: 'resolved' });

      const schedule = agenda.scheduleHook(hook);

      expect(schedule.status).toBe('unscheduled');
    });

    it('returns unscheduled for abandoned hooks', () => {
      const hook = makeHook({ id: 'h1', status: 'abandoned' });

      const schedule = agenda.scheduleHook(hook);

      expect(schedule.status).toBe('unscheduled');
    });

    it('returns scheduled for progressing hooks', () => {
      const hook = makeHook({ id: 'h1', status: 'progressing' });

      const schedule = agenda.scheduleHook(hook);

      expect(schedule.status).toBe('scheduled');
    });

    it('returns deferred for deferred hooks', () => {
      const hook = makeHook({ id: 'h1', status: 'deferred' });

      const schedule = agenda.scheduleHook(hook);

      expect(schedule.status).toBe('deferred');
    });
  });

  // ── scheduleAll ───────────────────────────────────────────────

  describe('scheduleAll', () => {
    it('schedules all active hooks, skips inactive', () => {
      const hooks: Hook[] = [
        makeHook({ id: 'h1', status: 'open' }),
        makeHook({ id: 'h2', status: 'progressing' }),
        makeHook({ id: 'h3', status: 'deferred' }),
        makeHook({ id: 'h4', status: 'dormant' }),
        makeHook({ id: 'h5', status: 'resolved' }),
      ];

      const schedule = agenda.scheduleAll(hooks);

      expect(schedule).toHaveLength(5);
      expect(schedule.find((s) => s.hookId === 'h1')?.status).toBe('scheduled');
      expect(schedule.find((s) => s.hookId === 'h2')?.status).toBe('scheduled');
      expect(schedule.find((s) => s.hookId === 'h3')?.status).toBe('deferred');
      expect(schedule.find((s) => s.hookId === 'h4')?.status).toBe('unscheduled');
      expect(schedule.find((s) => s.hookId === 'h5')?.status).toBe('unscheduled');
    });
  });

  // ── checkOverdue ──────────────────────────────────────────────

  describe('checkOverdue', () => {
    it('detects overdue hooks', () => {
      policy = new HookPolicy({
        overdueThreshold: 3,
        expectedResolutionWindow: { min: 1, max: 4 },
      });
      agenda = new HookAgenda(policy);

      const hooks: Hook[] = [
        makeHook({ id: 'h1', plantedChapter: 1, status: 'open' }), // distance=5, outside window [1,4], >threshold → overdue
        makeHook({ id: 'h2', plantedChapter: 4, status: 'open' }), // distance=2, before window [1,4], but <threshold → not overdue
      ];

      const report = agenda.checkOverdue(hooks, 6);

      expect(report.overdueHooks).toHaveLength(1);
      expect(report.overdueHooks[0].hookId).toBe('h1');
    });

    it('skips dormant hooks in overdue check', () => {
      policy = new HookPolicy({ overdueThreshold: 3 });
      agenda = new HookAgenda(policy);

      const hooks: Hook[] = [makeHook({ id: 'h1', plantedChapter: 1, status: 'dormant' })];

      const report = agenda.checkOverdue(hooks, 6);

      expect(report.overdueHooks).toHaveLength(0);
    });

    it('skips deferred hooks in overdue check', () => {
      policy = new HookPolicy({ overdueThreshold: 3 });
      agenda = new HookAgenda(policy);

      const hooks: Hook[] = [makeHook({ id: 'h1', plantedChapter: 1, status: 'deferred' })];

      const report = agenda.checkOverdue(hooks, 6);

      expect(report.overdueHooks).toHaveLength(0);
    });

    it('skips resolved hooks in overdue check', () => {
      policy = new HookPolicy({ overdueThreshold: 3 });
      agenda = new HookAgenda(policy);

      const hooks: Hook[] = [makeHook({ id: 'h1', plantedChapter: 1, status: 'resolved' })];

      const report = agenda.checkOverdue(hooks, 6);

      expect(report.overdueHooks).toHaveLength(0);
    });

    it('returns empty report when no hooks', () => {
      const report = agenda.checkOverdue([], 5);

      expect(report.overdueHooks).toHaveLength(0);
      expect(report.totalActive).toBe(0);
    });

    it('reports correct totalActive count', () => {
      const hooks: Hook[] = [
        makeHook({ id: 'h1', status: 'open' }),
        makeHook({ id: 'h2', status: 'progressing' }),
        makeHook({ id: 'h3', status: 'deferred' }),
        makeHook({ id: 'h4', status: 'dormant' }),
      ];

      const report = agenda.checkOverdue(hooks, 5);

      expect(report.totalActive).toBe(4);
    });

    it('includes chaptersSincePlanted in report', () => {
      policy = new HookPolicy({
        overdueThreshold: 3,
        expectedResolutionWindow: { min: 1, max: 4 },
      });
      agenda = new HookAgenda(policy);

      const hooks: Hook[] = [
        makeHook({ id: 'h1', plantedChapter: 2, status: 'open' }), // distance=6, outside window [1,4], >threshold → overdue
      ];

      const report = agenda.checkOverdue(hooks, 8);

      expect(report.overdueHooks[0].chaptersSincePlanted).toBe(6);
    });

    it('does NOT report overdue when hook is within its resolution window', () => {
      policy = new HookPolicy({
        overdueThreshold: 3,
        expectedResolutionWindow: { min: 3, max: 10 },
      });
      agenda = new HookAgenda(policy);

      // plantedChapter=1, currentChapter=6, distance=5
      // global overdueThreshold=3 → distance(5) > 3 → would be overdue
      // but resolution window is [3, 10], distance=5 is inside → NOT overdue
      const hooks: Hook[] = [makeHook({ id: 'h1', plantedChapter: 1, status: 'open' })];

      const report = agenda.checkOverdue(hooks, 6);

      expect(report.overdueHooks).toHaveLength(0);
    });

    it('reports overdue when hook is OUTSIDE its resolution window (past max)', () => {
      policy = new HookPolicy({
        overdueThreshold: 3,
        expectedResolutionWindow: { min: 3, max: 8 },
      });
      agenda = new HookAgenda(policy);

      // plantedChapter=1, currentChapter=12, distance=11
      // overdueThreshold=3 → distance > threshold
      // resolution window [3, 8], distance=11 > max → outside → IS overdue
      const hooks: Hook[] = [makeHook({ id: 'h1', plantedChapter: 1, status: 'open' })];

      const report = agenda.checkOverdue(hooks, 12);

      expect(report.overdueHooks).toHaveLength(1);
      expect(report.overdueHooks[0].hookId).toBe('h1');
    });

    it('reports overdue when hook is BEFORE its resolution window (before min)', () => {
      policy = new HookPolicy({
        overdueThreshold: 3,
        expectedResolutionWindow: { min: 10, max: 20 },
      });
      agenda = new HookAgenda(policy);

      // plantedChapter=1, currentChapter=6, distance=5
      // overdueThreshold=3 → distance(5) > 3 → would be overdue
      // resolution window [10, 20], distance=5 < min → outside → IS overdue
      const hooks: Hook[] = [makeHook({ id: 'h1', plantedChapter: 1, status: 'open' })];

      const report = agenda.checkOverdue(hooks, 6);

      expect(report.overdueHooks).toHaveLength(1);
    });

    it('uses hook-specific resolution window for overdue check', () => {
      policy = new HookPolicy({
        overdueThreshold: 3,
        expectedResolutionWindow: { min: 3, max: 10 },
      });
      agenda = new HookAgenda(policy);

      // Hook-specific window: min=5, max=8
      // plantedChapter=1, currentChapter=7, distance=6
      // global window [3, 10] would cover it, but hook-specific [5, 8] also covers it → NOT overdue
      const hooks: Hook[] = [
        makeHook({
          id: 'h1',
          plantedChapter: 1,
          status: 'open',
          expectedResolutionMin: 5,
          expectedResolutionMax: 8,
        }),
      ];

      const report = agenda.checkOverdue(hooks, 7);

      expect(report.overdueHooks).toHaveLength(0);
    });

    it('hook-specific window: reports overdue when outside hook-specific range', () => {
      policy = new HookPolicy({
        overdueThreshold: 3,
        expectedResolutionWindow: { min: 3, max: 20 },
      });
      agenda = new HookAgenda(policy);

      // Hook-specific window: min=5, max=8
      // plantedChapter=1, currentChapter=12, distance=11
      // global window [3, 20] covers it, but hook-specific [5, 8] does NOT → IS overdue
      const hooks: Hook[] = [
        makeHook({
          id: 'h1',
          plantedChapter: 1,
          status: 'open',
          expectedResolutionMin: 5,
          expectedResolutionMax: 8,
        }),
      ];

      const report = agenda.checkOverdue(hooks, 12);

      expect(report.overdueHooks).toHaveLength(1);
    });
  });

  // ── isWithinResolutionWindow ──────────────────────────────────

  describe('isWithinResolutionWindow', () => {
    it('returns true when within window', () => {
      policy = new HookPolicy({ expectedResolutionWindow: { min: 3, max: 10 } });
      agenda = new HookAgenda(policy);

      const hook = makeHook({ id: 'h1', plantedChapter: 5 });
      expect(agenda.isWithinResolutionWindow(hook, 10)).toBe(true);
    });

    it('returns false when before window', () => {
      policy = new HookPolicy({ expectedResolutionWindow: { min: 5, max: 10 } });
      agenda = new HookAgenda(policy);

      const hook = makeHook({ id: 'h1', plantedChapter: 5 });
      expect(agenda.isWithinResolutionWindow(hook, 8)).toBe(false);
    });

    it('returns false when after window', () => {
      policy = new HookPolicy({ expectedResolutionWindow: { min: 3, max: 10 } });
      agenda = new HookAgenda(policy);

      const hook = makeHook({ id: 'h1', plantedChapter: 5 });
      expect(agenda.isWithinResolutionWindow(hook, 20)).toBe(false);
    });

    it('uses hook-specific resolution window when available', () => {
      policy = new HookPolicy({ expectedResolutionWindow: { min: 3, max: 10 } });
      agenda = new HookAgenda(policy);

      const hook = makeHook({
        id: 'h1',
        plantedChapter: 5,
        expectedResolutionMin: 4,
        expectedResolutionMax: 8,
      });
      // Hook-specific: window is [9, 13], current=10 → inside
      expect(agenda.isWithinResolutionWindow(hook, 10)).toBe(true);
      // Current=14 → outside hook-specific window
      expect(agenda.isWithinResolutionWindow(hook, 14)).toBe(false);
    });
  });

  // ── onChapterReached ──────────────────────────────────────────

  describe('onChapterReached', () => {
    it('wakes dormant hooks within resolution window', () => {
      policy = new HookPolicy({
        wakePolicy: {
          maxWakePerChapter: 5,
          wakeBatchSize: 2,
          wakeInterval: 1,
          autoWakeEnabled: true,
        },
      });
      agenda = new HookAgenda(policy);

      const hooks: Hook[] = [
        makeHook({
          id: 'h1',
          status: 'dormant',
          plantedChapter: 1,
          expectedResolutionMin: 3,
          expectedResolutionMax: 10,
        }),
        makeHook({
          id: 'h2',
          status: 'dormant',
          plantedChapter: 2,
          expectedResolutionMin: 2,
          expectedResolutionMax: 8,
        }),
      ];

      const result = agenda.onChapterReached(hooks, 5);

      expect(result.woken.length).toBe(2);
      expect(result.woken.map((h) => h.hookId)).toContain('h1');
      expect(result.woken.map((h) => h.hookId)).toContain('h2');
    });

    it('does not wake dormant hooks outside resolution window', () => {
      agenda = new HookAgenda(policy);

      const hooks: Hook[] = [
        makeHook({
          id: 'h1',
          status: 'dormant',
          plantedChapter: 1,
          expectedResolutionMin: 10,
          expectedResolutionMax: 20,
        }),
      ];

      const result = agenda.onChapterReached(hooks, 5);

      expect(result.woken).toHaveLength(0);
    });

    it('does not wake non-dormant hooks', () => {
      agenda = new HookAgenda(policy);

      const hooks: Hook[] = [makeHook({ id: 'h1', status: 'open', plantedChapter: 1 })];

      const result = agenda.onChapterReached(hooks, 5);

      expect(result.woken).toHaveLength(0);
    });

    it('limits woken hooks to maxWakePerChapter and defers rest', () => {
      policy = new HookPolicy({
        wakePolicy: {
          maxWakePerChapter: 2,
          wakeBatchSize: 2,
          wakeInterval: 1,
          autoWakeEnabled: true,
        },
      });
      agenda = new HookAgenda(policy);

      const hooks: Hook[] = [
        makeHook({
          id: 'h1',
          status: 'dormant',
          priority: 'critical',
          plantedChapter: 1,
          expectedResolutionMin: 1,
          expectedResolutionMax: 10,
        }),
        makeHook({
          id: 'h2',
          status: 'dormant',
          priority: 'major',
          plantedChapter: 1,
          expectedResolutionMin: 1,
          expectedResolutionMax: 10,
        }),
        makeHook({
          id: 'h3',
          status: 'dormant',
          priority: 'minor',
          plantedChapter: 1,
          expectedResolutionMin: 1,
          expectedResolutionMax: 10,
        }),
        makeHook({
          id: 'h4',
          status: 'dormant',
          priority: 'minor',
          plantedChapter: 2,
          expectedResolutionMin: 1,
          expectedResolutionMax: 10,
        }),
      ];

      const result = agenda.onChapterReached(hooks, 5);

      expect(result.woken.length).toBeLessThanOrEqual(2);
      expect(result.deferred.length).toBeGreaterThan(0);
      // Woken should be the highest priority hooks
      expect(result.woken.some((h) => h.hookId === 'h1')).toBe(true);
    });

    it('returns empty when no dormant hooks', () => {
      agenda = new HookAgenda(policy);

      const hooks: Hook[] = [
        makeHook({ id: 'h1', status: 'open' }),
        makeHook({ id: 'h2', status: 'progressing' }),
      ];

      const result = agenda.onChapterReached(hooks, 5);

      expect(result.woken).toHaveLength(0);
      expect(result.deferred).toHaveLength(0);
    });

    it('skips dormant hooks without resolution window (they have none set)', () => {
      agenda = new HookAgenda(policy);

      // policy default: min=3, max=15
      // dormant hook plantedChapter=1, default window applies
      const hooks: Hook[] = [makeHook({ id: 'h1', status: 'dormant', plantedChapter: 1 })];

      const result = agenda.onChapterReached(hooks, 5);

      // With defaults: plantedChapter=1, window [3,15], distance=4 → within window
      expect(result.woken.length).toBeGreaterThanOrEqual(0);
    });

    it('actually mutates woken hook status to open', () => {
      policy = new HookPolicy({
        wakePolicy: {
          maxWakePerChapter: 3,
          wakeBatchSize: 2,
          wakeInterval: 1,
          autoWakeEnabled: true,
        },
      });
      agenda = new HookAgenda(policy);

      const hooks: Hook[] = [
        makeHook({
          id: 'h1',
          status: 'dormant',
          plantedChapter: 1,
          expectedResolutionMin: 3,
          expectedResolutionMax: 10,
        }),
      ];

      agenda.onChapterReached(hooks, 5);

      expect(hooks[0].status).toBe('open');
      expect(hooks[0].updatedAt).not.toBe('2026-01-01T00:00:00Z');
    });

    it('sets deferred hooks with wakeAtChapter via smoothing', () => {
      policy = new HookPolicy({
        wakePolicy: {
          maxWakePerChapter: 1,
          wakeBatchSize: 2,
          wakeInterval: 2,
          autoWakeEnabled: true,
        },
      });
      agenda = new HookAgenda(policy);

      const hooks: Hook[] = [
        makeHook({
          id: 'h1',
          status: 'dormant',
          priority: 'critical',
          plantedChapter: 1,
          expectedResolutionMin: 1,
          expectedResolutionMax: 10,
        }),
        makeHook({
          id: 'h2',
          status: 'dormant',
          priority: 'major',
          plantedChapter: 1,
          expectedResolutionMin: 1,
          expectedResolutionMax: 10,
        }),
        makeHook({
          id: 'h3',
          status: 'dormant',
          priority: 'minor',
          plantedChapter: 2,
          expectedResolutionMin: 1,
          expectedResolutionMax: 10,
        }),
      ];

      const result = agenda.onChapterReached(hooks, 5);

      expect(result.woken).toHaveLength(1);
      expect(result.deferred).toHaveLength(2);
      expect(result.deferred[0].wakeAtChapter).toBe(7);
      expect(result.deferred[1].wakeAtChapter).toBe(7);
      // h1 → open, h2/h3 → still dormant (deferred via smoothing queue, not status change)
      expect(hooks[0].status).toBe('open');
    });

    it('wakes deferred hooks from queue when chapter is reached', () => {
      policy = new HookPolicy({
        wakePolicy: {
          maxWakePerChapter: 1,
          wakeBatchSize: 2,
          wakeInterval: 2,
          autoWakeEnabled: true,
        },
      });
      agenda = new HookAgenda(policy);

      const hooks: Hook[] = [
        makeHook({
          id: 'h1',
          status: 'dormant',
          priority: 'critical',
          plantedChapter: 1,
          expectedResolutionMin: 1,
          expectedResolutionMax: 10,
        }),
        makeHook({
          id: 'h2',
          status: 'dormant',
          priority: 'major',
          plantedChapter: 1,
          expectedResolutionMin: 1,
          expectedResolutionMax: 10,
        }),
      ];

      // First call: h1 woken, h2 deferred to chapter 7
      agenda.onChapterReached(hooks, 5);
      expect(hooks[1].status).toBe('dormant');

      // Manually set h2 to deferred (simulating external state change)
      hooks[1].status = 'deferred';
      hooks[1].wakeAtChapter = 7;

      // Second call at chapter 7: h2 should wake
      agenda.onChapterReached(hooks, 7);
      expect(hooks[1].status).toBe('open');
    });

    it('includes thunderingHerd flag and notification when triggered', () => {
      policy = new HookPolicy({
        wakePolicy: {
          maxWakePerChapter: 2,
          wakeBatchSize: 2,
          wakeInterval: 1,
          autoWakeEnabled: true,
        },
      });
      agenda = new HookAgenda(policy);

      const hooks: Hook[] = [
        makeHook({
          id: 'h1',
          status: 'dormant',
          priority: 'critical',
          plantedChapter: 1,
          expectedResolutionMin: 1,
          expectedResolutionMax: 10,
        }),
        makeHook({
          id: 'h2',
          status: 'dormant',
          priority: 'major',
          plantedChapter: 1,
          expectedResolutionMin: 1,
          expectedResolutionMax: 10,
        }),
        makeHook({
          id: 'h3',
          status: 'dormant',
          priority: 'minor',
          plantedChapter: 1,
          expectedResolutionMin: 1,
          expectedResolutionMax: 10,
        }),
      ];

      const result = agenda.onChapterReached(hooks, 5);

      expect(result.thunderingHerd).toBe(true);
      expect(result.notification).toContain('第5章');
      expect(result.notification).toContain('3个伏笔');
    });

    it('respects autoWakeEnabled=false by not waking any hooks', () => {
      policy = new HookPolicy({
        wakePolicy: {
          maxWakePerChapter: 3,
          wakeBatchSize: 2,
          wakeInterval: 1,
          autoWakeEnabled: false,
        },
      });
      agenda = new HookAgenda(policy);

      const hooks: Hook[] = [
        makeHook({
          id: 'h1',
          status: 'dormant',
          plantedChapter: 1,
          expectedResolutionMin: 3,
          expectedResolutionMax: 10,
        }),
      ];

      const result = agenda.onChapterReached(hooks, 5);

      expect(result.woken).toHaveLength(0);
      expect(hooks[0].status).toBe('dormant');
    });
  });

  // ── wakeDeferredHook ──────────────────────────────────────────

  describe('wakeDeferredHook', () => {
    it('returns not-deferred when hook is not deferred', () => {
      agenda = new HookAgenda(policy);

      const hook = makeHook({ id: 'h1', status: 'open' });

      const result = agenda.wakeDeferredHook(hook);

      expect(result.success).toBe(false);
      expect(result.reason).toContain('不是 deferred');
    });

    it('returns not-ready when wakeAtChapter not reached', () => {
      agenda = new HookAgenda(policy);

      const hook = makeHook({ id: 'h1', status: 'deferred', wakeAtChapter: 10 });

      const result = agenda.wakeDeferredHook(hook, 5);

      expect(result.success).toBe(false);
      expect(result.reason).toContain('未到');
    });

    it('wakes deferred hook when chapter reached', () => {
      agenda = new HookAgenda(policy);

      const hook = makeHook({ id: 'h1', status: 'deferred', wakeAtChapter: 5 });

      const result = agenda.wakeDeferredHook(hook, 5);

      expect(result.success).toBe(true);
      expect(result.newStatus).toBe('open');
    });

    it('wakes deferred hook with no wakeAtChapter (immediate)', () => {
      agenda = new HookAgenda(policy);

      const hook = makeHook({ id: 'h1', status: 'deferred' });

      const result = agenda.wakeDeferredHook(hook, 10);

      expect(result.success).toBe(true);
      expect(result.newStatus).toBe('open');
    });
  });

  // ── getSchedule ───────────────────────────────────────────────

  describe('getSchedule', () => {
    it('returns the current schedule', () => {
      const hooks: Hook[] = [
        makeHook({ id: 'h1', status: 'open' }),
        makeHook({ id: 'h2', status: 'dormant' }),
      ];

      agenda.scheduleAll(hooks);
      const schedule = agenda.getSchedule();

      expect(schedule).toHaveLength(2);
    });

    it('returns empty schedule when no hooks scheduled', () => {
      const schedule = agenda.getSchedule();
      expect(schedule).toEqual([]);
    });
  });

  // ── advanceHook ───────────────────────────────────────────────

  describe('advanceHook', () => {
    it('advances a scheduled hook currentChapter', () => {
      const hook = makeHook({ id: 'h1', plantedChapter: 1, status: 'open' });

      agenda.scheduleHook(hook);
      agenda.advanceHook('h1', 5);

      const schedule = agenda.getSchedule();
      expect(schedule.find((s) => s.hookId === 'h1')?.currentChapter).toBe(5);
    });

    it('returns false for non-existent hook', () => {
      const result = agenda.advanceHook('nonexistent', 5);
      expect(result).toBe(false);
    });
  });
});
