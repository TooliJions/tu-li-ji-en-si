import { describe, it, expect } from 'vitest';
import { HookArbiter, type ArbiterConfig } from './hook-arbiter';
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

describe('HookArbiter', () => {
  // ── Time Conflicts ────────────────────────────────────────

  describe('time conflicts', () => {
    it('detects conflict for hooks in same chapter', () => {
      const arbiter = new HookArbiter();

      const hooks: Hook[] = [
        makeHook({ id: 'h1', plantedChapter: 5 }),
        makeHook({ id: 'h2', plantedChapter: 5 }),
      ];

      const result = arbiter.arbitrate(hooks);

      expect(result.conflicts.some((c) => c.type === 'time')).toBe(true);
    });

    it('detects conflict for adjacent chapters', () => {
      const arbiter = new HookArbiter({ timeConflictThreshold: 3 });

      const hooks: Hook[] = [
        makeHook({ id: 'h1', plantedChapter: 5 }),
        makeHook({ id: 'h2', plantedChapter: 6 }),
      ];

      const result = arbiter.arbitrate(hooks);

      expect(result.conflicts.some((c) => c.type === 'time')).toBe(true);
    });

    it('does not flag distant chapters', () => {
      const arbiter = new HookArbiter({ timeConflictThreshold: 3 });

      const hooks: Hook[] = [
        makeHook({ id: 'h1', plantedChapter: 1 }),
        makeHook({ id: 'h2', plantedChapter: 10 }),
      ];

      const result = arbiter.arbitrate(hooks);

      expect(result.conflicts.some((c) => c.type === 'time')).toBe(false);
    });

    it('marks same-chapter as high severity', () => {
      const arbiter = new HookArbiter({ timeConflictThreshold: 3 });

      const hooks: Hook[] = [
        makeHook({ id: 'h1', plantedChapter: 5 }),
        makeHook({ id: 'h2', plantedChapter: 5 }),
      ];

      const result = arbiter.arbitrate(hooks);

      const timeConflict = result.conflicts.find((c) => c.type === 'time');
      expect(timeConflict?.severity).toBe('high');
    });
  });

  // ── Character Conflicts ───────────────────────────────────

  describe('character conflicts', () => {
    it('detects character overlap conflict', () => {
      const arbiter = new HookArbiter();

      const hooks: Hook[] = [
        makeHook({ id: 'h1', relatedCharacters: ['alice', 'bob'] }),
        makeHook({ id: 'h2', relatedCharacters: ['alice', 'charlie'] }),
      ];

      const result = arbiter.arbitrate(hooks);

      expect(result.conflicts.some((c) => c.type === 'character')).toBe(true);
    });

    it('does not flag low character overlap', () => {
      const arbiter = new HookArbiter({ characterConflictThreshold: 0.9 });

      const hooks: Hook[] = [
        makeHook({ id: 'h1', relatedCharacters: ['alice', 'bob', 'charlie', 'dave'] }),
        makeHook({ id: 'h2', relatedCharacters: ['alice', 'eve', 'frank', 'grace'] }),
      ];

      const result = arbiter.arbitrate(hooks);

      expect(result.conflicts.some((c) => c.type === 'character')).toBe(false);
    });

    it('skips when no shared characters', () => {
      const arbiter = new HookArbiter();

      const hooks: Hook[] = [
        makeHook({ id: 'h1', relatedCharacters: ['alice'] }),
        makeHook({ id: 'h2', relatedCharacters: ['bob'] }),
      ];

      const result = arbiter.arbitrate(hooks);

      expect(result.conflicts.some((c) => c.type === 'character')).toBe(false);
    });

    it('skips when one hook has no characters', () => {
      const arbiter = new HookArbiter();

      const hooks: Hook[] = [
        makeHook({ id: 'h1', relatedCharacters: [] }),
        makeHook({ id: 'h2', relatedCharacters: ['alice'] }),
      ];

      const result = arbiter.arbitrate(hooks);

      expect(result.conflicts.some((c) => c.type === 'character')).toBe(false);
    });
  });

  // ── Theme Conflicts ───────────────────────────────────────

  describe('theme conflicts', () => {
    it('detects theme similarity conflict', () => {
      const arbiter = new HookArbiter();

      const hooks: Hook[] = [
        makeHook({
          id: 'h1',
          type: 'narrative',
          description: 'A mysterious stranger appears in the tavern',
        }),
        makeHook({
          id: 'h2',
          type: 'narrative',
          description: 'A mysterious stranger appears at the tavern',
        }),
      ];

      const result = arbiter.arbitrate(hooks);

      expect(result.conflicts.some((c) => c.type === 'theme')).toBe(true);
    });

    it('does not flag different themes', () => {
      const arbiter = new HookArbiter();

      const hooks: Hook[] = [
        makeHook({ id: 'h1', type: 'plot', description: 'The king declares war' }),
        makeHook({ id: 'h2', type: 'character', description: 'A mysterious stranger appears' }),
      ];

      const result = arbiter.arbitrate(hooks);

      expect(result.conflicts.some((c) => c.type === 'theme')).toBe(false);
    });
  });

  // ── Resolution ────────────────────────────────────────────

  describe('resolution', () => {
    it('defers lower priority hook', () => {
      const arbiter = new HookArbiter({ timeConflictThreshold: 3 });

      const hooks: Hook[] = [
        makeHook({ id: 'h1', plantedChapter: 5, priority: 'critical' }),
        makeHook({ id: 'h2', plantedChapter: 5, priority: 'minor' }),
      ];

      const result = arbiter.arbitrate(hooks);

      expect(result.resolutions.length).toBeGreaterThan(0);
      expect(result.resolutions.some((r) => r.deferredHookId === 'h2')).toBe(true);
    });

    it('defers later planted hook when same priority', () => {
      const arbiter = new HookArbiter({ timeConflictThreshold: 3 });

      const hooks: Hook[] = [
        makeHook({ id: 'h1', plantedChapter: 3, priority: 'major' }),
        makeHook({ id: 'h2', plantedChapter: 5, priority: 'major' }),
      ];

      const result = arbiter.arbitrate(hooks);

      // h2 planted later, should be deferred
      expect(result.resolutions.some((r) => r.deferredHookId === 'h2')).toBe(true);
    });

    it('action is "defer"', () => {
      const arbiter = new HookArbiter({ timeConflictThreshold: 3 });

      const hooks: Hook[] = [
        makeHook({ id: 'h1', plantedChapter: 5 }),
        makeHook({ id: 'h2', plantedChapter: 5 }),
      ];

      const result = arbiter.arbitrate(hooks);

      expect(result.resolutions.every((r) => r.action === 'defer')).toBe(true);
    });

    it('provides reason with hook IDs and priorities', () => {
      const arbiter = new HookArbiter({ timeConflictThreshold: 3 });

      const hooks: Hook[] = [
        makeHook({ id: 'h1', plantedChapter: 5, priority: 'critical' }),
        makeHook({ id: 'h2', plantedChapter: 5, priority: 'minor' }),
      ];

      const result = arbiter.arbitrate(hooks);

      expect(result.resolutions.some((r) => r.reason.includes('h1'))).toBe(true);
      expect(result.resolutions.some((r) => r.reason.includes('h2'))).toBe(true);
    });
  });

  // ── Status Filtering ──────────────────────────────────────

  describe('status filtering', () => {
    it('only checks active hooks by default', () => {
      const arbiter = new HookArbiter({ timeConflictThreshold: 3 });

      const hooks: Hook[] = [
        makeHook({ id: 'h1', plantedChapter: 5, status: 'open' }),
        makeHook({ id: 'h2', plantedChapter: 5, status: 'dormant' }),
      ];

      const result = arbiter.arbitrate(hooks);

      // dormant hooks should not participate
      expect(result.conflicts).toHaveLength(0);
    });

    it('checks progressing hooks by default', () => {
      const arbiter = new HookArbiter({ timeConflictThreshold: 3 });

      const hooks: Hook[] = [
        makeHook({ id: 'h1', plantedChapter: 5, status: 'open' }),
        makeHook({ id: 'h2', plantedChapter: 5, status: 'progressing' }),
      ];

      const result = arbiter.arbitrate(hooks);

      expect(result.conflicts.length).toBeGreaterThan(0);
    });

    it('ignores resolved hooks', () => {
      const arbiter = new HookArbiter({ timeConflictThreshold: 3 });

      const hooks: Hook[] = [
        makeHook({ id: 'h1', plantedChapter: 5, status: 'open' }),
        makeHook({ id: 'h2', plantedChapter: 5, status: 'resolved' }),
      ];

      const result = arbiter.arbitrate(hooks);

      expect(result.conflicts).toHaveLength(0);
    });

    it('ignores abandoned hooks', () => {
      const arbiter = new HookArbiter({ timeConflictThreshold: 3 });

      const hooks: Hook[] = [
        makeHook({ id: 'h1', plantedChapter: 5, status: 'open' }),
        makeHook({ id: 'h2', plantedChapter: 5, status: 'abandoned' }),
      ];

      const result = arbiter.arbitrate(hooks);

      expect(result.conflicts).toHaveLength(0);
    });
  });

  // ── Multi-Conflict Scenarios ──────────────────────────────

  describe('multi-conflict scenarios', () => {
    it('detects multiple conflict types between two hooks', () => {
      const arbiter = new HookArbiter();

      const hooks: Hook[] = [
        makeHook({
          id: 'h1',
          plantedChapter: 5,
          relatedCharacters: ['alice', 'bob'],
          description: 'A mysterious stranger appears in the tavern',
        }),
        makeHook({
          id: 'h2',
          plantedChapter: 5,
          relatedCharacters: ['alice', 'charlie'],
          description: 'A mysterious stranger appears at the tavern',
        }),
      ];

      const result = arbiter.arbitrate(hooks);

      // Should detect time + character + theme conflicts
      expect(result.conflicts.length).toBe(3);
    });

    it('resolves all conflicts and returns unique deferred IDs', () => {
      const arbiter = new HookArbiter({ timeConflictThreshold: 3 });

      const hooks: Hook[] = [
        makeHook({ id: 'h1', plantedChapter: 5, priority: 'critical' }),
        makeHook({ id: 'h2', plantedChapter: 5, priority: 'minor' }),
        makeHook({ id: 'h3', plantedChapter: 6, priority: 'minor' }),
      ];

      const result = arbiter.arbitrate(hooks);

      expect(result.deferredHookIds.length).toBeLessThanOrEqual(result.resolutions.length);
    });

    it('returns empty result when no hooks', () => {
      const arbiter = new HookArbiter();

      const result = arbiter.arbitrate([]);

      expect(result.conflicts).toHaveLength(0);
      expect(result.resolutions).toHaveLength(0);
      expect(result.deferredHookIds).toHaveLength(0);
    });

    it('returns no conflicts for single hook', () => {
      const arbiter = new HookArbiter();

      const result = arbiter.arbitrate([makeHook({ id: 'h1' })]);

      expect(result.conflicts).toHaveLength(0);
    });
  });

  // ── Custom Config ─────────────────────────────────────────

  describe('custom config', () => {
    it('uses custom thresholds', () => {
      const arbiter = new HookArbiter({
        timeConflictThreshold: 1,
        characterConflictThreshold: 0.9,
        themeConflictThreshold: 0.9,
      });

      const hooks: Hook[] = [
        makeHook({
          id: 'h1',
          plantedChapter: 5,
          relatedCharacters: ['alice'],
          description: 'A mysterious stranger',
        }),
        makeHook({
          id: 'h2',
          plantedChapter: 7,
          relatedCharacters: ['bob'],
          description: 'A different tale',
        }),
      ];

      const result = arbiter.arbitrate(hooks);

      // All distances above thresholds
      expect(result.conflicts).toHaveLength(0);
    });

    it('respects custom active statuses', () => {
      const arbiter = new HookArbiter({
        activeStatuses: ['open'],
        timeConflictThreshold: 3,
      });

      const hooks: Hook[] = [
        makeHook({ id: 'h1', plantedChapter: 5, status: 'open' }),
        makeHook({ id: 'h2', plantedChapter: 5, status: 'progressing' }),
      ];

      const result = arbiter.arbitrate(hooks);

      // progressing not active in this config, so only h1 active → no conflicts
      expect(result.conflicts).toHaveLength(0);
    });
  });
});
