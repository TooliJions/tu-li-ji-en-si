import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  HookPolicy,
  type HookPolicyConfig,
  type WakePolicy,
} from './hook-policy';

// ── Helpers ────────────────────────────────────────────────────────

function makeTempDir(): string {
  return path.join(process.cwd(), 'tmp-test-hook-policy-' + Math.random().toString(36).slice(2, 8));
}

function cleanup(dir: string) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ── Tests ──────────────────────────────────────────────────────────

describe('HookPolicy', () => {
  let rootDir: string;

  beforeEach(() => {
    rootDir = makeTempDir();
    fs.mkdirSync(rootDir, { recursive: true });
  });

  afterEach(() => {
    cleanup(rootDir);
  });

  // ── Defaults ──────────────────────────────────────────────────

  describe('defaults', () => {
    it('creates policy with sensible defaults', () => {
      const policy = new HookPolicy();

      expect(policy.maxActiveHooks).toBe(10);
      expect(policy.overdueThreshold).toBe(5);
      expect(policy.expectedResolutionWindow).toEqual({ min: 3, max: 15 });
    });

    it('uses default WakePolicy values', () => {
      const policy = new HookPolicy();
      const wake = policy.wakePolicy;

      expect(wake.maxWakePerChapter).toBe(3);
      expect(wake.wakeBatchSize).toBe(2);
      expect(wake.wakeInterval).toBe(1);
      expect(wake.autoWakeEnabled).toBe(true);
    });
  });

  // ── Custom Configuration ──────────────────────────────────────

  describe('custom configuration', () => {
    it('accepts custom maxActiveHooks', () => {
      const policy = new HookPolicy({ maxActiveHooks: 20 });
      expect(policy.maxActiveHooks).toBe(20);
    });

    it('accepts custom overdueThreshold', () => {
      const policy = new HookPolicy({ overdueThreshold: 10 });
      expect(policy.overdueThreshold).toBe(10);
    });

    it('accepts custom expectedResolutionWindow', () => {
      const policy = new HookPolicy({
        expectedResolutionWindow: { min: 5, max: 30 },
      });
      expect(policy.expectedResolutionWindow).toEqual({ min: 5, max: 30 });
    });

    it('accepts custom WakePolicy', () => {
      const customWake: WakePolicy = {
        maxWakePerChapter: 5,
        wakeBatchSize: 3,
        wakeInterval: 2,
        autoWakeEnabled: false,
      };
      const policy = new HookPolicy({ wakePolicy: customWake });

      expect(policy.wakePolicy).toEqual(customWake);
    });

    it('merges partial config with defaults', () => {
      const policy = new HookPolicy({ maxActiveHooks: 15 });

      expect(policy.maxActiveHooks).toBe(15);
      expect(policy.overdueThreshold).toBe(5); // default
      expect(policy.wakePolicy.maxWakePerChapter).toBe(3); // default
    });
  });

  // ── Validation ────────────────────────────────────────────────

  describe('validation', () => {
    it('rejects negative maxActiveHooks', () => {
      expect(() => new HookPolicy({ maxActiveHooks: -1 })).toThrow(/maxActiveHooks/);
    });

    it('rejects zero maxActiveHooks', () => {
      expect(() => new HookPolicy({ maxActiveHooks: 0 })).toThrow(/maxActiveHooks/);
    });

    it('rejects negative overdueThreshold', () => {
      expect(() => new HookPolicy({ overdueThreshold: -1 })).toThrow(/overdueThreshold/);
    });

    it('rejects invalid resolution window (min > max)', () => {
      expect(() => new HookPolicy({ expectedResolutionWindow: { min: 20, max: 5 } })).toThrow(
        /expectedResolutionWindow/
      );
    });

    it('rejects negative wake maxWakePerChapter', () => {
      expect(
        () =>
          new HookPolicy({
            wakePolicy: {
              maxWakePerChapter: -1,
              wakeBatchSize: 2,
              wakeInterval: 1,
              autoWakeEnabled: true,
            },
          })
      ).toThrow(/maxWakePerChapter/);
    });

    it('rejects zero wakeBatchSize', () => {
      expect(
        () =>
          new HookPolicy({
            wakePolicy: {
              maxWakePerChapter: 3,
              wakeBatchSize: 0,
              wakeInterval: 1,
              autoWakeEnabled: true,
            },
          })
      ).toThrow(/wakeBatchSize/);
    });

    it('rejects non-positive wakeInterval', () => {
      expect(
        () =>
          new HookPolicy({
            wakePolicy: {
              maxWakePerChapter: 3,
              wakeBatchSize: 2,
              wakeInterval: 0,
              autoWakeEnabled: true,
            },
          })
      ).toThrow(/wakeInterval/);
    });
  });

  // ── Load / Save ───────────────────────────────────────────────

  describe('load / save', () => {
    it('saves policy to JSON file', () => {
      const policy = new HookPolicy({ maxActiveHooks: 15, overdueThreshold: 8 });
      const filePath = path.join(rootDir, 'policy.json');

      policy.save(filePath);

      expect(fs.existsSync(filePath)).toBe(true);
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      expect(parsed.maxActiveHooks).toBe(15);
      expect(parsed.overdueThreshold).toBe(8);
    });

    it('loads policy from JSON file', () => {
      const filePath = path.join(rootDir, 'policy.json');
      const config: HookPolicyConfig = {
        maxActiveHooks: 25,
        overdueThreshold: 10,
        expectedResolutionWindow: { min: 5, max: 20 },
        wakePolicy: {
          maxWakePerChapter: 5,
          wakeBatchSize: 3,
          wakeInterval: 2,
          autoWakeEnabled: false,
        },
      };
      fs.writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf-8');

      const policy = HookPolicy.load(filePath);

      expect(policy.maxActiveHooks).toBe(25);
      expect(policy.overdueThreshold).toBe(10);
      expect(policy.expectedResolutionWindow).toEqual({ min: 5, max: 20 });
      expect(policy.wakePolicy.maxWakePerChapter).toBe(5);
      expect(policy.wakePolicy.wakeBatchSize).toBe(3);
      expect(policy.wakePolicy.wakeInterval).toBe(2);
      expect(policy.wakePolicy.autoWakeEnabled).toBe(false);
    });

    it('throws when loading non-existent file', () => {
      const filePath = path.join(rootDir, 'nonexistent.json');
      expect(() => HookPolicy.load(filePath)).toThrow(/无法读取/);
    });

    it('throws when loading invalid JSON', () => {
      const filePath = path.join(rootDir, 'bad.json');
      fs.writeFileSync(filePath, '{ invalid json }', 'utf-8');

      expect(() => HookPolicy.load(filePath)).toThrow(/格式无效/);
    });

    it('round-trips save and load', () => {
      const policy = new HookPolicy({
        maxActiveHooks: 12,
        overdueThreshold: 7,
        expectedResolutionWindow: { min: 4, max: 18 },
        wakePolicy: {
          maxWakePerChapter: 4,
          wakeBatchSize: 2,
          wakeInterval: 3,
          autoWakeEnabled: true,
        },
      });

      const filePath = path.join(rootDir, 'policy.json');
      policy.save(filePath);

      const loaded = HookPolicy.load(filePath);
      expect(loaded.maxActiveHooks).toBe(12);
      expect(loaded.overdueThreshold).toBe(7);
      expect(loaded.expectedResolutionWindow).toEqual({ min: 4, max: 18 });
      expect(loaded.wakePolicy).toEqual(policy.wakePolicy);
    });
  });

  // ── Behavioral Methods ────────────────────────────────────────

  describe('canAdmitHook', () => {
    it('admits when active count below limit', () => {
      const policy = new HookPolicy({ maxActiveHooks: 5 });
      expect(policy.canAdmitHook({ activeCount: 3 })).toBe(true);
    });

    it('rejects when active count at limit', () => {
      const policy = new HookPolicy({ maxActiveHooks: 5 });
      expect(policy.canAdmitHook({ activeCount: 5 })).toBe(false);
    });

    it('rejects when active count exceeds limit', () => {
      const policy = new HookPolicy({ maxActiveHooks: 5 });
      expect(policy.canAdmitHook({ activeCount: 8 })).toBe(false);
    });
  });

  describe('isOverdue', () => {
    it('marks hook as overdue when chapters exceed threshold', () => {
      const policy = new HookPolicy({ overdueThreshold: 5 });
      expect(policy.isOverdue({ chaptersSincePlanted: 7 })).toBe(true);
    });

    it('does not mark hook as overdue when within threshold', () => {
      const policy = new HookPolicy({ overdueThreshold: 5 });
      expect(policy.isOverdue({ chaptersSincePlanted: 3 })).toBe(false);
    });

    it('is not overdue exactly at threshold', () => {
      const policy = new HookPolicy({ overdueThreshold: 5 });
      expect(policy.isOverdue({ chaptersSincePlanted: 5 })).toBe(false);
    });
  });

  describe('isWithinResolutionWindow', () => {
    it('returns true when chapter is within [min, max]', () => {
      const policy = new HookPolicy({
        expectedResolutionWindow: { min: 3, max: 10 },
      });
      expect(policy.isWithinResolutionWindow({ currentChapter: 5, plantedChapter: 1 })).toBe(true);
    });

    it('returns false when chapter is before min', () => {
      const policy = new HookPolicy({
        expectedResolutionWindow: { min: 5, max: 10 },
      });
      expect(policy.isWithinResolutionWindow({ currentChapter: 3, plantedChapter: 1 })).toBe(false);
    });

    it('returns false when chapter is after max', () => {
      const policy = new HookPolicy({
        expectedResolutionWindow: { min: 3, max: 10 },
      });
      expect(policy.isWithinResolutionWindow({ currentChapter: 15, plantedChapter: 1 })).toBe(
        false
      );
    });

    it('returns true at exact min boundary', () => {
      const policy = new HookPolicy({
        expectedResolutionWindow: { min: 5, max: 10 },
      });
      expect(policy.isWithinResolutionWindow({ currentChapter: 6, plantedChapter: 1 })).toBe(true);
    });

    it('returns true at exact max boundary', () => {
      const policy = new HookPolicy({
        expectedResolutionWindow: { min: 3, max: 10 },
      });
      expect(policy.isWithinResolutionWindow({ currentChapter: 13, plantedChapter: 3 })).toBe(true);
    });
  });

  describe('getWakeCandidates', () => {
    it('returns all dormant hooks when count below maxWakePerChapter', () => {
      const policy = new HookPolicy({
        wakePolicy: {
          maxWakePerChapter: 3,
          wakeBatchSize: 2,
          wakeInterval: 1,
          autoWakeEnabled: true,
        },
      });
      const dormantHooks = [
        { id: 'h1', priority: 'major' as const, plantedChapter: 1 },
        { id: 'h2', priority: 'critical' as const, plantedChapter: 2 },
      ];

      const result = policy.getWakeCandidates(dormantHooks, 5);

      expect(result).toHaveLength(2);
      expect(result.map((h) => h.id)).toContain('h1');
      expect(result.map((h) => h.id)).toContain('h2');
    });

    it('limits candidates to maxWakePerChapter', () => {
      const policy = new HookPolicy({
        wakePolicy: {
          maxWakePerChapter: 2,
          wakeBatchSize: 2,
          wakeInterval: 1,
          autoWakeEnabled: true,
        },
      });
      const dormantHooks = [
        { id: 'h1', priority: 'minor' as const, plantedChapter: 1 },
        { id: 'h2', priority: 'critical' as const, plantedChapter: 2 },
        { id: 'h3', priority: 'major' as const, plantedChapter: 3 },
        { id: 'h4', priority: 'minor' as const, plantedChapter: 4 },
      ];

      const result = policy.getWakeCandidates(dormantHooks, 10);

      expect(result.length).toBeLessThanOrEqual(2);
      // Should prioritize by priority: critical > major > minor
      expect(result[0].priority).toBe('critical');
    });

    it('returns empty array when no dormant hooks', () => {
      const policy = new HookPolicy();
      const result = policy.getWakeCandidates([], 5);
      expect(result).toEqual([]);
    });

    it('sorts by priority then plantedChapter', () => {
      const policy = new HookPolicy({
        wakePolicy: {
          maxWakePerChapter: 10,
          wakeBatchSize: 2,
          wakeInterval: 1,
          autoWakeEnabled: true,
        },
      });
      const dormantHooks = [
        { id: 'h1', priority: 'major' as const, plantedChapter: 5 },
        { id: 'h2', priority: 'critical' as const, plantedChapter: 3 },
        { id: 'h3', priority: 'critical' as const, plantedChapter: 1 },
        { id: 'h4', priority: 'minor' as const, plantedChapter: 2 },
      ];

      const result = policy.getWakeCandidates(dormantHooks, 10);

      expect(result[0].id).toBe('h3'); // critical, earliest
      expect(result[1].id).toBe('h2'); // critical, later
      expect(result[2].id).toBe('h1'); // major
      expect(result[3].id).toBe('h4'); // minor
    });
  });

  // ── getStatus ─────────────────────────────────────────────────

  describe('getStatus', () => {
    it('returns full policy status', () => {
      const policy = new HookPolicy({ maxActiveHooks: 8, overdueThreshold: 6 });
      const status = policy.getStatus();

      expect(status).toEqual({
        maxActiveHooks: 8,
        overdueThreshold: 6,
        expectedResolutionWindow: { min: 3, max: 15 },
        wakePolicy: {
          maxWakePerChapter: 3,
          wakeBatchSize: 2,
          wakeInterval: 1,
          autoWakeEnabled: true,
        },
      });
    });
  });

  // ── Update ────────────────────────────────────────────────────

  describe('update', () => {
    it('updates maxActiveHooks', () => {
      const policy = new HookPolicy();
      policy.update({ maxActiveHooks: 20 });
      expect(policy.maxActiveHooks).toBe(20);
    });

    it('updates wakePolicy partially', () => {
      const policy = new HookPolicy();
      policy.update({ wakePolicy: { maxWakePerChapter: 5 } });
      expect(policy.wakePolicy.maxWakePerChapter).toBe(5);
      expect(policy.wakePolicy.wakeBatchSize).toBe(2); // unchanged
    });

    it('validates on update', () => {
      const policy = new HookPolicy();
      expect(() => policy.update({ maxActiveHooks: -1 })).toThrow();
    });
  });
});
