import { describe, it, expect } from 'vitest';
import { HookAdmission, type AdmissionConfig } from './hook-admission';
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

describe('HookAdmission', () => {
  // ── Defaults ────────────────────────────────────────────────

  describe('defaults', () => {
    it('creates with default config', () => {
      const admission = new HookAdmission();

      // Should not throw
      const result = admission.evaluate(makeHook({ id: 'new' }), []);
      expect(result.admitted).toBe(true);
    });
  });

  // ── Time Proximity ──────────────────────────────────────────

  describe('time proximity', () => {
    it('detects time conflict for close planted chapters', () => {
      const admission = new HookAdmission();

      const newHook = makeHook({ id: 'new', plantedChapter: 3 });
      const existing = makeHook({ id: 'h1', plantedChapter: 1 });

      const result = admission.evaluate(newHook, [existing]);

      expect(result.conflicts.some((c) => c.type === 'time')).toBe(true);
    });

    it('does not flag distant planted chapters', () => {
      const admission = new HookAdmission({ timeProximityThreshold: 5 });

      const newHook = makeHook({ id: 'new', plantedChapter: 20 });
      const existing = makeHook({ id: 'h1', plantedChapter: 1 });

      const result = admission.evaluate(newHook, [existing]);

      expect(result.conflicts.some((c) => c.type === 'time')).toBe(false);
    });

    it('marks same chapter as high severity', () => {
      const admission = new HookAdmission({ timeProximityThreshold: 5 });

      const newHook = makeHook({ id: 'new', plantedChapter: 5 });
      const existing = makeHook({ id: 'h1', plantedChapter: 5 });

      const result = admission.evaluate(newHook, [existing]);

      const timeConflict = result.conflicts.find((c) => c.type === 'time');
      expect(timeConflict?.severity).toBe('high');
    });

    it('can disable time check', () => {
      const admission = new HookAdmission({ enableTimeCheck: false });

      const newHook = makeHook({ id: 'new', plantedChapter: 3 });
      const existing = makeHook({ id: 'h1', plantedChapter: 1 });

      const result = admission.evaluate(newHook, [existing]);

      expect(result.conflicts.some((c) => c.type === 'time')).toBe(false);
    });
  });

  // ── Character Overlap ───────────────────────────────────────

  describe('character overlap', () => {
    it('detects character overlap', () => {
      const admission = new HookAdmission();

      const newHook = makeHook({
        id: 'new',
        relatedCharacters: ['alice', 'bob', 'charlie'],
      });
      const existing = makeHook({
        id: 'h1',
        relatedCharacters: ['alice', 'bob', 'dave'],
      });

      const result = admission.evaluate(newHook, [existing]);

      expect(result.conflicts.some((c) => c.type === 'character')).toBe(true);
    });

    it('does not flag low character overlap', () => {
      const admission = new HookAdmission({ characterOverlapThreshold: 0.8 });

      const newHook = makeHook({
        id: 'new',
        relatedCharacters: ['alice', 'bob', 'charlie', 'dave'],
      });
      const existing = makeHook({
        id: 'h1',
        relatedCharacters: ['eve', 'frank', 'grace', 'heidi'],
      });

      const result = admission.evaluate(newHook, [existing]);

      expect(result.conflicts.some((c) => c.type === 'character')).toBe(false);
    });

    it('skips character check when new hook has no characters', () => {
      const admission = new HookAdmission();

      const newHook = makeHook({ id: 'new', relatedCharacters: [] });
      const existing = makeHook({
        id: 'h1',
        relatedCharacters: ['alice', 'bob'],
      });

      const result = admission.evaluate(newHook, [existing]);

      expect(result.conflicts.some((c) => c.type === 'character')).toBe(false);
    });

    it('skips character check when existing hook has no characters', () => {
      const admission = new HookAdmission();

      const newHook = makeHook({ id: 'new', relatedCharacters: ['alice'] });
      const existing = makeHook({ id: 'h1', relatedCharacters: [] });

      const result = admission.evaluate(newHook, [existing]);

      expect(result.conflicts.some((c) => c.type === 'character')).toBe(false);
    });

    it('can disable character check', () => {
      const admission = new HookAdmission({ enableCharacterCheck: false });

      const newHook = makeHook({
        id: 'new',
        relatedCharacters: ['alice', 'bob'],
      });
      const existing = makeHook({
        id: 'h1',
        relatedCharacters: ['alice', 'bob'],
      });

      const result = admission.evaluate(newHook, [existing]);

      expect(result.conflicts.some((c) => c.type === 'character')).toBe(false);
    });
  });

  // ── Theme Similarity ────────────────────────────────────────

  describe('theme similarity', () => {
    it('detects theme similarity for same type and similar description', () => {
      const admission = new HookAdmission();

      const newHook = makeHook({
        id: 'new',
        type: 'narrative',
        description: 'A mysterious stranger appears in the tavern',
      });
      const existing = makeHook({
        id: 'h1',
        type: 'narrative',
        description: 'A mysterious stranger shows up at the tavern',
      });

      const result = admission.evaluate(newHook, [existing]);

      expect(result.conflicts.some((c) => c.type === 'theme')).toBe(true);
    });

    it('does not flag different themes', () => {
      const admission = new HookAdmission();

      const newHook = makeHook({
        id: 'new',
        type: 'plot',
        description: 'The king declares war on the northern kingdoms',
      });
      const existing = makeHook({
        id: 'h1',
        type: 'character',
        description: 'A mysterious stranger appears in the tavern',
      });

      const result = admission.evaluate(newHook, [existing]);

      expect(result.conflicts.some((c) => c.type === 'theme')).toBe(false);
    });

    it('can disable theme check', () => {
      const admission = new HookAdmission({ enableThemeCheck: false });

      const newHook = makeHook({
        id: 'new',
        description: 'A mysterious stranger appears in the tavern',
      });
      const existing = makeHook({
        id: 'h1',
        description: 'A mysterious stranger shows up at the tavern',
      });

      const result = admission.evaluate(newHook, [existing]);

      expect(result.conflicts.some((c) => c.type === 'theme')).toBe(false);
    });
  });

  // ── Admission Decision ──────────────────────────────────────

  describe('admission decision', () => {
    it('admits when no conflicts', () => {
      const admission = new HookAdmission();

      const newHook = makeHook({
        id: 'new',
        plantedChapter: 20,
        description: 'A dragon attacks the village',
        type: 'plot',
        relatedCharacters: ['dragon'],
      });
      const existing = makeHook({
        id: 'h1',
        plantedChapter: 1,
        description: 'A mysterious stranger appears in the tavern',
        type: 'narrative',
        relatedCharacters: ['alice'],
      });

      const result = admission.evaluate(newHook, [existing]);

      expect(result.admitted).toBe(true);
      expect(result.score).toBe(0);
      expect(result.conflicts).toHaveLength(0);
    });

    it('rejects when high severity conflict exists', () => {
      const admission = new HookAdmission();

      const newHook = makeHook({
        id: 'new',
        plantedChapter: 1,
        description: 'A mysterious stranger appears in the tavern',
      });
      const existing = makeHook({
        id: 'h1',
        plantedChapter: 1,
        description: 'A mysterious stranger appears in the tavern',
      });

      const result = admission.evaluate(newHook, [existing]);

      expect(result.admitted).toBe(false);
      expect(result.score).toBeGreaterThanOrEqual(60);
    });

    it('rejects when multiple medium conflicts accumulate', () => {
      const admission = new HookAdmission();

      const newHook = makeHook({
        id: 'new',
        plantedChapter: 3,
        relatedCharacters: ['alice', 'bob'],
        description: 'A mysterious figure lurks in the shadows',
      });
      const existing: Hook[] = [
        makeHook({
          id: 'h1',
          plantedChapter: 1,
          relatedCharacters: ['alice'],
          description: 'A strange figure walks in the tavern',
        }),
        makeHook({
          id: 'h2',
          plantedChapter: 2,
          relatedCharacters: ['bob'],
          description: 'A shadowy figure waits at night',
        }),
      ];

      const result = admission.evaluate(newHook, existing);

      expect(result.conflicts.length).toBeGreaterThanOrEqual(2);
    });

    it('generates appropriate recommendation for admitted hook', () => {
      const admission = new HookAdmission();

      const result = admission.evaluate(makeHook({ id: 'new' }), []);

      expect(result.recommendation).toContain('可以准入');
    });

    it('generates recommendation with related hook IDs for rejected hook', () => {
      const admission = new HookAdmission();

      const newHook = makeHook({ id: 'new', plantedChapter: 1 });
      const existing = makeHook({ id: 'h1', plantedChapter: 1 });

      const result = admission.evaluate(newHook, [existing]);

      expect(result.recommendation).toContain('h1');
    });
  });

  // ── Multi-Hook Evaluation ───────────────────────────────────

  describe('multi-hook evaluation', () => {
    it('checks against all active hooks', () => {
      const admission = new HookAdmission({ timeProximityThreshold: 5 });

      const newHook = makeHook({ id: 'new', plantedChapter: 3 });
      const existing: Hook[] = [
        makeHook({ id: 'h1', plantedChapter: 1, status: 'open' }),
        makeHook({ id: 'h2', plantedChapter: 4, status: 'progressing' }),
        makeHook({ id: 'h3', plantedChapter: 3, status: 'resolved' }), // should be ignored
      ];

      const result = admission.evaluate(newHook, existing);

      const timeConflicts = result.conflicts.filter((c) => c.type === 'time');
      expect(timeConflicts.length).toBe(2); // h1 and h2
      expect(timeConflicts.every((c) => c.hookId !== 'h3')).toBe(true);
    });

    it('collects conflicts from multiple dimensions', () => {
      const admission = new HookAdmission();

      const newHook = makeHook({
        id: 'new',
        plantedChapter: 1,
        relatedCharacters: ['alice', 'bob'],
        description: 'A mysterious stranger appears in the tavern',
      });
      const existing = makeHook({
        id: 'h1',
        plantedChapter: 1,
        relatedCharacters: ['alice', 'bob'],
        description: 'A mysterious stranger appears in the tavern',
      });

      const result = admission.evaluate(newHook, [existing]);

      expect(result.conflicts.length).toBe(3); // time + character + theme
    });

    it('deduplicates related hook IDs in recommendation', () => {
      const admission = new HookAdmission();

      const newHook = makeHook({ id: 'new', plantedChapter: 1 });
      const existing = makeHook({ id: 'h1', plantedChapter: 1 });

      const result = admission.evaluate(newHook, [existing]);

      // h1 appears in multiple conflict types, but should appear only once in recommendation
      const h1Count = (result.recommendation.match(/h1/g) ?? []).length;
      expect(h1Count).toBe(1);
    });
  });
});
