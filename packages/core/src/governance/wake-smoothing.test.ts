import { describe, it, expect, beforeEach } from 'vitest';
import { WakeSmoothing, type WakeCandidate, type SmoothingResult } from './wake-smoothing';
import { HookPolicy } from './hook-policy';

// ── Helpers ────────────────────────────────────────────────────────

function makeCandidate(overrides: Partial<WakeCandidate> = {}): WakeCandidate {
  return {
    id: 'h1',
    status: 'dormant' as const,
    priority: 'major',
    plantedChapter: 1,
    expectedResolutionMin: 3,
    expectedResolutionMax: 15,
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('WakeSmoothing', () => {
  let policy: HookPolicy;
  let smoothing: WakeSmoothing;

  beforeEach(() => {
    policy = new HookPolicy();
    smoothing = new WakeSmoothing(policy);
  });

  // ── processWakes ──────────────────────────────────────────────

  describe('processWakes', () => {
    it('wakes all candidates when count <= maxWakePerChapter', () => {
      policy = new HookPolicy({
        wakePolicy: {
          maxWakePerChapter: 3,
          wakeBatchSize: 2,
          wakeInterval: 1,
          autoWakeEnabled: true,
        },
      });
      smoothing = new WakeSmoothing(policy);

      const candidates: WakeCandidate[] = [
        makeCandidate({ id: 'h1', priority: 'critical', plantedChapter: 1 }),
        makeCandidate({ id: 'h2', priority: 'major', plantedChapter: 2 }),
      ];

      const result = smoothing.processWakes(candidates, 5);

      expect(result.woken).toHaveLength(2);
      expect(result.woken.map((h) => h.hookId)).toContain('h1');
      expect(result.woken.map((h) => h.hookId)).toContain('h2');
      expect(result.deferred).toHaveLength(0);
      expect(result.thunderingHerd).toBe(false);
    });

    it('triggers thundering herd smoothing when count > maxWakePerChapter', () => {
      policy = new HookPolicy({
        wakePolicy: {
          maxWakePerChapter: 2,
          wakeBatchSize: 2,
          wakeInterval: 1,
          autoWakeEnabled: true,
        },
      });
      smoothing = new WakeSmoothing(policy);

      const candidates: WakeCandidate[] = [
        makeCandidate({ id: 'h1', priority: 'critical', plantedChapter: 1 }),
        makeCandidate({ id: 'h2', priority: 'major', plantedChapter: 1 }),
        makeCandidate({ id: 'h3', priority: 'minor', plantedChapter: 1 }),
        makeCandidate({ id: 'h4', priority: 'minor', plantedChapter: 2 }),
      ];

      const result = smoothing.processWakes(candidates, 5);

      expect(result.thunderingHerd).toBe(true);
      expect(result.woken).toHaveLength(2);
      expect(result.deferred).toHaveLength(2);
    });

    it('prioritizes critical hooks for immediate wake', () => {
      policy = new HookPolicy({
        wakePolicy: {
          maxWakePerChapter: 1,
          wakeBatchSize: 2,
          wakeInterval: 1,
          autoWakeEnabled: true,
        },
      });
      smoothing = new WakeSmoothing(policy);

      const candidates: WakeCandidate[] = [
        makeCandidate({ id: 'h1', priority: 'minor', plantedChapter: 1 }),
        makeCandidate({ id: 'h2', priority: 'critical', plantedChapter: 2 }),
        makeCandidate({ id: 'h3', priority: 'major', plantedChapter: 1 }),
      ];

      const result = smoothing.processWakes(candidates, 5);

      expect(result.woken).toHaveLength(1);
      expect(result.woken[0].hookId).toBe('h2'); // critical first
    });

    it('breaks ties by plantedChapter (earlier first)', () => {
      policy = new HookPolicy({
        wakePolicy: {
          maxWakePerChapter: 1,
          wakeBatchSize: 2,
          wakeInterval: 1,
          autoWakeEnabled: true,
        },
      });
      smoothing = new WakeSmoothing(policy);

      const candidates: WakeCandidate[] = [
        makeCandidate({ id: 'h1', priority: 'major', plantedChapter: 3 }),
        makeCandidate({ id: 'h2', priority: 'major', plantedChapter: 1 }),
      ];

      const result = smoothing.processWakes(candidates, 5);

      expect(result.woken[0].hookId).toBe('h2');
    });

    it('defers remaining hooks with correct wakeAtChapter distribution', () => {
      policy = new HookPolicy({
        wakePolicy: {
          maxWakePerChapter: 1,
          wakeBatchSize: 2,
          wakeInterval: 2,
          autoWakeEnabled: true,
        },
      });
      smoothing = new WakeSmoothing(policy);

      const candidates: WakeCandidate[] = [
        makeCandidate({ id: 'h1', priority: 'critical', plantedChapter: 1 }),
        makeCandidate({ id: 'h2', priority: 'major', plantedChapter: 1 }),
        makeCandidate({ id: 'h3', priority: 'major', plantedChapter: 2 }),
        makeCandidate({ id: 'h4', priority: 'minor', plantedChapter: 1 }),
        makeCandidate({ id: 'h5', priority: 'minor', plantedChapter: 3 }),
      ];

      const result = smoothing.processWakes(candidates, 5);

      expect(result.woken).toHaveLength(1);
      expect(result.deferred).toHaveLength(4);

      // First batch (wakeAtChapter = 5+2=7): h2, h3 (batchSize=2)
      expect(result.deferred[0].wakeAtChapter).toBe(7);
      expect(result.deferred[1].wakeAtChapter).toBe(7);
      // Second batch (wakeAtChapter = 5+4=9): h4, h5
      expect(result.deferred[2].wakeAtChapter).toBe(9);
      expect(result.deferred[3].wakeAtChapter).toBe(9);
    });

    it('returns empty result when no candidates', () => {
      const result = smoothing.processWakes([], 5);

      expect(result.woken).toHaveLength(0);
      expect(result.deferred).toHaveLength(0);
      expect(result.thunderingHerd).toBe(false);
      expect(result.totalCandidates).toBe(0);
    });

    it('includes notification message in result', () => {
      policy = new HookPolicy({
        wakePolicy: {
          maxWakePerChapter: 2,
          wakeBatchSize: 2,
          wakeInterval: 1,
          autoWakeEnabled: true,
        },
      });
      smoothing = new WakeSmoothing(policy);

      const candidates: WakeCandidate[] = [
        makeCandidate({ id: 'h1', priority: 'critical', plantedChapter: 1 }),
        makeCandidate({ id: 'h2', priority: 'major', plantedChapter: 1 }),
        makeCandidate({ id: 'h3', priority: 'minor', plantedChapter: 1 }),
      ];

      const result = smoothing.processWakes(candidates, 5);

      expect(result.notification).toBeDefined();
      expect(result.notification).toContain('第5章');
      expect(result.notification).toContain('3个伏笔');
    });

    it('returns no notification when all candidates woken (no thundering herd)', () => {
      policy = new HookPolicy({
        wakePolicy: {
          maxWakePerChapter: 5,
          wakeBatchSize: 2,
          wakeInterval: 1,
          autoWakeEnabled: true,
        },
      });
      smoothing = new WakeSmoothing(policy);

      const candidates: WakeCandidate[] = [
        makeCandidate({ id: 'h1', priority: 'critical', plantedChapter: 1 }),
        makeCandidate({ id: 'h2', priority: 'major', plantedChapter: 1 }),
      ];

      const result = smoothing.processWakes(candidates, 5);

      expect(result.notification).toBeNull();
    });

    it('handles exactly maxWakePerChapter candidates (boundary)', () => {
      policy = new HookPolicy({
        wakePolicy: {
          maxWakePerChapter: 3,
          wakeBatchSize: 2,
          wakeInterval: 1,
          autoWakeEnabled: true,
        },
      });
      smoothing = new WakeSmoothing(policy);

      const candidates: WakeCandidate[] = [
        makeCandidate({ id: 'h1', priority: 'critical', plantedChapter: 1 }),
        makeCandidate({ id: 'h2', priority: 'major', plantedChapter: 1 }),
        makeCandidate({ id: 'h3', priority: 'minor', plantedChapter: 1 }),
      ];

      const result = smoothing.processWakes(candidates, 5);

      expect(result.woken).toHaveLength(3);
      expect(result.deferred).toHaveLength(0);
      expect(result.thunderingHerd).toBe(false);
    });

    it('respects autoWakeEnabled=false by returning all as pending', () => {
      policy = new HookPolicy({
        wakePolicy: {
          maxWakePerChapter: 3,
          wakeBatchSize: 2,
          wakeInterval: 1,
          autoWakeEnabled: false,
        },
      });
      smoothing = new WakeSmoothing(policy);

      const candidates: WakeCandidate[] = [
        makeCandidate({ id: 'h1', priority: 'critical', plantedChapter: 1 }),
      ];

      const result = smoothing.processWakes(candidates, 5);

      expect(result.woken).toHaveLength(0);
      expect(result.deferred).toHaveLength(0);
      expect(result.pending).toHaveLength(1);
      expect(result.pending[0].hookId).toBe('h1');
    });

    it('correctly calculates batch distribution with larger batchSize', () => {
      policy = new HookPolicy({
        wakePolicy: {
          maxWakePerChapter: 1,
          wakeBatchSize: 3,
          wakeInterval: 2,
          autoWakeEnabled: true,
        },
      });
      smoothing = new WakeSmoothing(policy);

      const candidates: WakeCandidate[] = [
        makeCandidate({ id: 'h1', priority: 'critical', plantedChapter: 1 }),
        makeCandidate({ id: 'h2', priority: 'major', plantedChapter: 1 }),
        makeCandidate({ id: 'h3', priority: 'major', plantedChapter: 2 }),
        makeCandidate({ id: 'h4', priority: 'minor', plantedChapter: 1 }),
      ];

      const result = smoothing.processWakes(candidates, 5);

      expect(result.woken).toHaveLength(1);
      expect(result.deferred).toHaveLength(3);
      // First batch (3 items at chapter 7)
      expect(result.deferred[0].wakeAtChapter).toBe(7);
      expect(result.deferred[1].wakeAtChapter).toBe(7);
      expect(result.deferred[2].wakeAtChapter).toBe(7);
    });
  });

  // ── getPendingWakes ───────────────────────────────────────────

  describe('getPendingWakes', () => {
    it('returns deferred hooks whose wakeAtChapter has been reached', () => {
      smoothing = new WakeSmoothing(policy);

      smoothing.registerDeferred('h1', 5);
      smoothing.registerDeferred('h2', 8);
      smoothing.registerDeferred('h3', 10);

      const pending = smoothing.getPendingWakes(8);

      expect(pending).toHaveLength(2);
      expect(pending.map((h) => h.hookId)).toContain('h1');
      expect(pending.map((h) => h.hookId)).toContain('h2');
    });

    it('returns empty when no deferred hooks are due', () => {
      smoothing = new WakeSmoothing(policy);

      smoothing.registerDeferred('h1', 10);
      smoothing.registerDeferred('h2', 15);

      const pending = smoothing.getPendingWakes(5);

      expect(pending).toHaveLength(0);
    });

    it('removes returned hooks from pending queue', () => {
      smoothing = new WakeSmoothing(policy);

      smoothing.registerDeferred('h1', 5);
      smoothing.registerDeferred('h2', 8);

      const first = smoothing.getPendingWakes(5);
      expect(first).toHaveLength(1);

      const second = smoothing.getPendingWakes(8);
      expect(second).toHaveLength(1);
      expect(second[0].hookId).toBe('h2');

      const third = smoothing.getPendingWakes(10);
      expect(third).toHaveLength(0);
    });

    it('returns empty when queue is empty', () => {
      const pending = smoothing.getPendingWakes(5);
      expect(pending).toHaveLength(0);
    });
  });

  // ── getWakeStats ──────────────────────────────────────────────

  describe('getWakeStats', () => {
    it('returns correct statistics', () => {
      smoothing = new WakeSmoothing(policy);

      smoothing.registerDeferred('h1', 5);
      smoothing.registerDeferred('h2', 8);
      smoothing.registerDeferred('h3', 10);

      const stats = smoothing.getWakeStats(7);

      expect(stats.totalPending).toBe(3);
      expect(stats.dueNow).toBe(1);
      expect(stats.nextWakeChapter).toBe(8);
    });

    it('returns zero stats when queue is empty', () => {
      const stats = smoothing.getWakeStats(5);
      expect(stats.totalPending).toBe(0);
      expect(stats.dueNow).toBe(0);
      expect(stats.nextWakeChapter).toBeNull();
    });
  });
});
