import { describe, it, expect, beforeEach } from 'vitest';
import { HookGovernance } from './hook-governance';
import { HookPolicy } from './hook-policy';
import { HookAgenda } from './hook-agenda';
import type { Hook } from '../models/state';

// ── Helpers ────────────────────────────────────────────────────────

function makeHook(overrides: Partial<Hook> = {}): Hook {
  return {
    id: 'hook-1',
    description: 'A mysterious stranger appears in the tavern',
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

describe('HookGovernance', () => {
  let policy: HookPolicy;
  let agenda: HookAgenda;
  let governance: HookGovernance;

  beforeEach(() => {
    policy = new HookPolicy();
    agenda = new HookAgenda(policy);
    governance = new HookGovernance(policy, agenda);
  });

  // ── evaluateAdmission ─────────────────────────────────────────

  describe('evaluateAdmission', () => {
    it('admits a new hook when under limit', () => {
      const newHook = makeHook({
        id: 'new-1',
        description: 'Something completely different happens here',
      });
      const existing: Hook[] = [
        makeHook({ id: 'h1', status: 'open' }),
        makeHook({ id: 'h2', status: 'open' }),
      ];

      const result = governance.evaluateAdmission(newHook, existing);

      expect(result.admitted).toBe(true);
    });

    it('rejects when active count at limit', () => {
      policy = new HookPolicy({ maxActiveHooks: 2 });
      governance = new HookGovernance(policy);

      const newHook = makeHook({ id: 'new-1' });
      const existing: Hook[] = [
        makeHook({ id: 'h1', status: 'open' }),
        makeHook({ id: 'h2', status: 'open' }),
      ];

      const result = governance.evaluateAdmission(newHook, existing);

      expect(result.admitted).toBe(false);
      expect(result.reason).toContain('上限');
    });

    it('does not count dormant hooks toward active limit', () => {
      policy = new HookPolicy({ maxActiveHooks: 2 });
      governance = new HookGovernance(policy);

      const newHook = makeHook({ id: 'new-1' });
      const existing: Hook[] = [
        makeHook({ id: 'h1', status: 'dormant' }),
        makeHook({ id: 'h2', status: 'dormant' }),
      ];

      const result = governance.evaluateAdmission(newHook, existing);

      expect(result.admitted).toBe(true);
    });

    it('does not count resolved hooks toward active limit', () => {
      policy = new HookPolicy({ maxActiveHooks: 1 });
      governance = new HookGovernance(policy);

      const newHook = makeHook({ id: 'new-1' });
      const existing: Hook[] = [makeHook({ id: 'h1', status: 'resolved' })];

      const result = governance.evaluateAdmission(newHook, existing);

      expect(result.admitted).toBe(true);
    });

    it('rejects when description highly similar to existing hook', () => {
      const newHook = makeHook({
        id: 'new-1',
        description: 'A mysterious stranger appears in the tavern tonight',
      });
      const existing: Hook[] = [
        makeHook({
          id: 'h1',
          status: 'open',
          description: 'A mysterious stranger appears in the tavern',
        }),
      ];

      const result = governance.evaluateAdmission(newHook, existing);

      expect(result.admitted).toBe(false);
      expect(result.relatedHookIds).toContain('h1');
    });

    it('admits when description is different', () => {
      const newHook = makeHook({
        id: 'new-1',
        description: 'The king declares war on the northern kingdoms',
      });
      const existing: Hook[] = [
        makeHook({
          id: 'h1',
          status: 'open',
          description: 'A mysterious stranger appears in the tavern',
        }),
      ];

      const result = governance.evaluateAdmission(newHook, existing);

      expect(result.admitted).toBe(true);
    });
  });

  // ── validatePayoff ────────────────────────────────────────────

  describe('validatePayoff', () => {
    it('validates a proper payoff', () => {
      const hook = makeHook({
        id: 'h1',
        status: 'open',
        plantedChapter: 1,
        expectedResolutionMin: 3,
        expectedResolutionMax: 10,
        payoffDescription: 'The stranger reveals his true identity',
      });

      const result = governance.validatePayoff(hook, 6);

      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
      expect(result.qualityScore).toBe(100);
    });

    it('invalidates payoff outside resolution window', () => {
      const hook = makeHook({
        id: 'h1',
        status: 'open',
        plantedChapter: 1,
        expectedResolutionMin: 5,
        expectedResolutionMax: 10,
        payoffDescription: 'The stranger reveals his true identity',
      });

      const result = governance.validatePayoff(hook, 3);

      expect(result.valid).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
    });

    it('invalidates payoff without description', () => {
      const hook = makeHook({
        id: 'h1',
        status: 'open',
        payoffDescription: '',
      });

      const result = governance.validatePayoff(hook, 5);

      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.includes('payoffDescription'))).toBe(true);
    });

    it('invalidates payoff for resolved hook', () => {
      const hook = makeHook({
        id: 'h1',
        status: 'resolved',
        payoffDescription: 'Done',
      });

      const result = governance.validatePayoff(hook, 5);

      expect(result.valid).toBe(false);
    });

    it('reduces score per issue', () => {
      const hook = makeHook({
        id: 'h1',
        status: 'resolved',
        expectedResolutionMin: 10,
        expectedResolutionMax: 20,
      });

      const result = governance.validatePayoff(hook, 5);

      expect(result.qualityScore).toBeLessThan(100);
    });
  });

  // ── checkHealth ───────────────────────────────────────────────

  describe('checkHealth', () => {
    it('reports correct status distribution', () => {
      const hooks: Hook[] = [
        makeHook({ id: 'h1', status: 'open' }),
        makeHook({ id: 'h2', status: 'progressing' }),
        makeHook({ id: 'h3', status: 'deferred' }),
        makeHook({ id: 'h4', status: 'dormant' }),
        makeHook({ id: 'h5', status: 'resolved' }),
      ];

      const report = governance.checkHealth(hooks, 5);

      expect(report.totalHooks).toBe(5);
      expect(report.byStatus.open).toBe(1);
      expect(report.byStatus.progressing).toBe(1);
      expect(report.byStatus.deferred).toBe(1);
      expect(report.byStatus.dormant).toBe(1);
      expect(report.byStatus.resolved).toBe(1);
    });

    it('detects overdue hooks', () => {
      policy = new HookPolicy({
        overdueThreshold: 2,
        expectedResolutionWindow: { min: 1, max: 4 },
      });
      governance = new HookGovernance(policy);

      const hooks: Hook[] = [
        makeHook({ id: 'h1', status: 'open', plantedChapter: 1 }), // 8-1=7 > 2, outside window [1,4] → overdue
        makeHook({ id: 'h2', status: 'open', plantedChapter: 7 }), // 8-7=1 ≤ 2 → not overdue
      ];

      const report = governance.checkHealth(hooks, 8);

      expect(report.overdueCount).toBe(1);
    });

    it('generates warnings for overdue hooks', () => {
      policy = new HookPolicy({
        overdueThreshold: 1,
        expectedResolutionWindow: { min: 1, max: 2 },
      });
      governance = new HookGovernance(policy);

      const hooks: Hook[] = [
        makeHook({ id: 'h1', status: 'open', plantedChapter: 1 }), // distance=4, outside window [1,2], >threshold → overdue
      ];

      const report = governance.checkHealth(hooks, 5);

      expect(report.warnings.some((w) => w.includes('逾期'))).toBe(true);
    });

    it('generates warnings when at active limit', () => {
      policy = new HookPolicy({ maxActiveHooks: 2 });
      governance = new HookGovernance(policy);

      const hooks: Hook[] = [
        makeHook({ id: 'h1', status: 'open' }),
        makeHook({ id: 'h2', status: 'open' }),
      ];

      const report = governance.checkHealth(hooks, 5);

      expect(report.warnings.some((w) => w.includes('上限'))).toBe(true);
    });

    it('generates warnings for many dormant hooks', () => {
      const hooks: Hook[] = Array.from({ length: 6 }, (_, i) =>
        makeHook({ id: `h${i}`, status: 'dormant' })
      );

      const report = governance.checkHealth(hooks, 5);

      expect(report.warnings.some((w) => w.includes('休眠'))).toBe(true);
    });

    it('health score is 0-100', () => {
      const hooks: Hook[] = [makeHook({ id: 'h1', status: 'open' })];

      const report = governance.checkHealth(hooks, 5);

      expect(report.healthScore).toBeGreaterThanOrEqual(0);
      expect(report.healthScore).toBeLessThanOrEqual(100);
    });

    it('health score penalizes high overdue ratio', () => {
      policy = new HookPolicy({
        overdueThreshold: 1,
        expectedResolutionWindow: { min: 1, max: 5 },
      });
      governance = new HookGovernance(policy);

      const hooks: Hook[] = [
        makeHook({ id: 'h1', status: 'open', plantedChapter: 1 }), // distance=9, outside window → overdue
        makeHook({ id: 'h2', status: 'open', plantedChapter: 1 }), // distance=9, outside window → overdue
        makeHook({ id: 'h3', status: 'open', plantedChapter: 1 }), // distance=9, outside window → overdue
        makeHook({ id: 'h4', status: 'resolved' }),
      ];

      const report = governance.checkHealth(hooks, 10);

      // 3 out of 4 are overdue → high ratio
      expect(report.healthScore).toBeLessThan(80);
    });

    it('reports empty hooks gracefully', () => {
      const report = governance.checkHealth([], 5);

      expect(report.totalHooks).toBe(0);
      expect(report.healthScore).toBeGreaterThanOrEqual(0);
    });

    it('counts hooks in resolution window', () => {
      policy = new HookPolicy({ expectedResolutionWindow: { min: 3, max: 10 } });
      governance = new HookGovernance(policy);

      const hooks: Hook[] = [
        makeHook({ id: 'h1', status: 'open', plantedChapter: 1 }), // distance=4, window [3,10] → in
        makeHook({ id: 'h2', status: 'open', plantedChapter: 5 }), // distance=0, window [3,10] → out
      ];

      const report = governance.checkHealth(hooks, 5);

      expect(report.inResolutionWindow).toBe(1);
    });
  });

  // ── markDormant ───────────────────────────────────────────────

  describe('markDormant', () => {
    it('marks an open hook as dormant', () => {
      const hook = makeHook({ id: 'h1', status: 'open' });

      const result = governance.markDormant(hook);

      expect(result.success).toBe(true);
      expect(result.newStatus).toBe('dormant');
      expect(hook.status).toBe('dormant');
    });

    it('marks a progressing hook as dormant', () => {
      const hook = makeHook({ id: 'h1', status: 'progressing' });

      const result = governance.markDormant(hook);

      expect(result.success).toBe(true);
      expect(hook.status).toBe('dormant');
    });

    it('marks a deferred hook as dormant', () => {
      const hook = makeHook({ id: 'h1', status: 'deferred' });

      const result = governance.markDormant(hook);

      expect(result.success).toBe(true);
      expect(hook.status).toBe('dormant');
    });

    it('rejects marking a resolved hook as dormant', () => {
      const hook = makeHook({ id: 'h1', status: 'resolved' });

      const result = governance.markDormant(hook);

      expect(result.success).toBe(false);
      expect(result.reason).toContain('resolved');
    });

    it('rejects marking an abandoned hook as dormant', () => {
      const hook = makeHook({ id: 'h1', status: 'abandoned' });

      const result = governance.markDormant(hook);

      expect(result.success).toBe(false);
    });

    it('sets expected resolution window when provided', () => {
      const hook = makeHook({ id: 'h1', status: 'open' });

      governance.markDormant(hook, {
        expectedResolutionMin: 10,
        expectedResolutionMax: 30,
      });

      expect(hook.expectedResolutionMin).toBe(10);
      expect(hook.expectedResolutionMax).toBe(30);
    });

    it('updates updatedAt timestamp', () => {
      const hook = makeHook({ id: 'h1', status: 'open', updatedAt: '2026-01-01T00:00:00Z' });

      governance.markDormant(hook);

      expect(hook.updatedAt).not.toBe('2026-01-01T00:00:00Z');
    });
  });

  // ── declareIntent ──────────────────────────────────────────

  describe('declareIntent', () => {
    it('sets expected resolution window without changing status', () => {
      const hook = makeHook({ id: 'h1', status: 'open' });

      const result = governance.declareIntent(hook, { min: 15, max: 40 });

      expect(result.success).toBe(true);
      expect(hook.expectedResolutionMin).toBe(15);
      expect(hook.expectedResolutionMax).toBe(40);
      expect(hook.status).toBe('open');
    });

    it('allows setting window and marking dormant together', () => {
      const hook = makeHook({ id: 'h1', status: 'open' });

      const result = governance.declareIntent(hook, {
        min: 20,
        max: 50,
        setDormant: true,
      });

      expect(result.success).toBe(true);
      expect(hook.status).toBe('dormant');
      expect(hook.expectedResolutionMin).toBe(20);
      expect(hook.expectedResolutionMax).toBe(50);
    });

    it('rejects min > max', () => {
      const hook = makeHook({ id: 'h1', status: 'open' });

      const result = governance.declareIntent(hook, { min: 50, max: 20 });

      expect(result.success).toBe(false);
      expect(result.reason).toContain('最小值不能大于最大值');
    });

    it('rejects non-positive min', () => {
      const hook = makeHook({ id: 'h1', status: 'open' });

      const result = governance.declareIntent(hook, { min: 0, max: 10 });

      expect(result.success).toBe(false);
    });

    it('allows resolved/abandoned hooks to only update window (not dormant)', () => {
      const hook = makeHook({ id: 'h1', status: 'resolved' });

      const result = governance.declareIntent(hook, { min: 5, max: 10 });

      expect(result.success).toBe(true);
      expect(hook.expectedResolutionMin).toBe(5);
      expect(hook.status).toBe('resolved');
    });

    it('updates updatedAt timestamp', () => {
      const hook = makeHook({ id: 'h1', status: 'open', updatedAt: '2026-01-01T00:00:00Z' });

      governance.declareIntent(hook, { min: 10, max: 20 });

      expect(hook.updatedAt).not.toBe('2026-01-01T00:00:00Z');
    });

    it('can update only min value', () => {
      const hook = makeHook({ id: 'h1', status: 'open', expectedResolutionMin: 5 });

      governance.declareIntent(hook, { min: 15 });

      expect(hook.expectedResolutionMin).toBe(15);
    });

    it('can update only max value', () => {
      const hook = makeHook({ id: 'h1', status: 'open', expectedResolutionMax: 10 });

      governance.declareIntent(hook, { max: 25 });

      expect(hook.expectedResolutionMax).toBe(25);
    });
  });

  // ── wakeUp ────────────────────────────────────────────────

  describe('wakeUp', () => {
    it('wakes a dormant hook to open', () => {
      const hook = makeHook({ id: 'h1', status: 'dormant' });

      const result = governance.wakeUp(hook);

      expect(result.success).toBe(true);
      expect(result.newStatus).toBe('open');
      expect(hook.status).toBe('open');
    });

    it('wakes a dormant hook to progressing', () => {
      const hook = makeHook({ id: 'h1', status: 'dormant' });

      const result = governance.wakeUp(hook, 'progressing');

      expect(result.success).toBe(true);
      expect(hook.status).toBe('progressing');
    });

    it('rejects waking a non-dormant hook', () => {
      const hook = makeHook({ id: 'h1', status: 'open' });

      const result = governance.wakeUp(hook);

      expect(result.success).toBe(false);
      expect(result.reason).toContain('休眠');
    });

    it('rejects waking a resolved hook', () => {
      const hook = makeHook({ id: 'h1', status: 'resolved' });

      const result = governance.wakeUp(hook);

      expect(result.success).toBe(false);
    });

    it('updates updatedAt timestamp', () => {
      const hook = makeHook({ id: 'h1', status: 'dormant', updatedAt: '2026-01-01T00:00:00Z' });

      governance.wakeUp(hook);

      expect(hook.updatedAt).not.toBe('2026-01-01T00:00:00Z');
    });

    it('can set expected resolution window on wake', () => {
      const hook = makeHook({ id: 'h1', status: 'dormant' });

      governance.wakeUp(hook, 'open', { min: 10, max: 30 });

      expect(hook.expectedResolutionMin).toBe(10);
      expect(hook.expectedResolutionMax).toBe(30);
      expect(hook.status).toBe('open');
    });
  });

  // ── Constructor with no agenda ────────────────────────────────

  describe('constructor', () => {
    it('creates default agenda when not provided', () => {
      governance = new HookGovernance(policy);

      const hooks: Hook[] = [makeHook({ id: 'h1', status: 'open' })];

      const report = governance.checkHealth(hooks, 5);
      expect(report.totalHooks).toBe(1);
    });
  });
});
