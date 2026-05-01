import { describe, it, expect, beforeEach } from 'vitest';
import { IntentDeclaration } from './intent-declaration';
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

describe('IntentDeclaration', () => {
  let intent: IntentDeclaration;

  beforeEach(() => {
    intent = new IntentDeclaration();
  });

  // ── markDormant ───────────────────────────────────────────────

  describe('markDormant', () => {
    it('marks an open hook as dormant', () => {
      const hook = makeHook({ id: 'h1', status: 'open' });

      const result = intent.markDormant(hook);

      expect(result.success).toBe(true);
      expect(result.newStatus).toBe('dormant');
      expect(hook.status).toBe('dormant');
    });

    it('marks a progressing hook as dormant', () => {
      const hook = makeHook({ id: 'h1', status: 'progressing' });

      const result = intent.markDormant(hook);

      expect(result.success).toBe(true);
      expect(hook.status).toBe('dormant');
    });

    it('marks a deferred hook as dormant', () => {
      const hook = makeHook({ id: 'h1', status: 'deferred' });

      const result = intent.markDormant(hook);

      expect(result.success).toBe(true);
      expect(hook.status).toBe('dormant');
    });

    it('rejects marking a resolved hook as dormant', () => {
      const hook = makeHook({ id: 'h1', status: 'resolved' });

      const result = intent.markDormant(hook);

      expect(result.success).toBe(false);
      expect(result.reason).toContain('resolved');
    });

    it('rejects marking an abandoned hook as dormant', () => {
      const hook = makeHook({ id: 'h1', status: 'abandoned' });

      const result = intent.markDormant(hook);

      expect(result.success).toBe(false);
    });

    it('sets expected resolution window when provided', () => {
      const hook = makeHook({ id: 'h1', status: 'open' });

      intent.markDormant(hook, {
        expectedResolutionMin: 10,
        expectedResolutionMax: 30,
      });

      expect(hook.expectedResolutionMin).toBe(10);
      expect(hook.expectedResolutionMax).toBe(30);
    });

    it('updates updatedAt timestamp', () => {
      const hook = makeHook({ id: 'h1', status: 'open', updatedAt: '2026-01-01T00:00:00Z' });

      intent.markDormant(hook);

      expect(hook.updatedAt).not.toBe('2026-01-01T00:00:00Z');
    });
  });

  // ── declareIntent ──────────────────────────────────────────

  describe('declareIntent', () => {
    it('sets expected resolution window without changing status', () => {
      const hook = makeHook({ id: 'h1', status: 'open' });

      const result = intent.declareIntent(hook, { min: 15, max: 40 });

      expect(result.success).toBe(true);
      expect(hook.expectedResolutionMin).toBe(15);
      expect(hook.expectedResolutionMax).toBe(40);
      expect(hook.status).toBe('open');
    });

    it('allows setting window and marking dormant together', () => {
      const hook = makeHook({ id: 'h1', status: 'open' });

      const result = intent.declareIntent(hook, {
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

      const result = intent.declareIntent(hook, { min: 50, max: 20 });

      expect(result.success).toBe(false);
      expect(result.reason).toContain('最小值不能大于最大值');
    });

    it('rejects non-positive min', () => {
      const hook = makeHook({ id: 'h1', status: 'open' });

      const result = intent.declareIntent(hook, { min: 0, max: 10 });

      expect(result.success).toBe(false);
    });

    it('allows resolved/abandoned hooks to only update window (not dormant)', () => {
      const hook = makeHook({ id: 'h1', status: 'resolved' });

      const result = intent.declareIntent(hook, { min: 5, max: 10 });

      expect(result.success).toBe(true);
      expect(hook.expectedResolutionMin).toBe(5);
      expect(hook.status).toBe('resolved');
    });

    it('blocks setting dormant on resolved/abandoned hooks', () => {
      const hook = makeHook({ id: 'h1', status: 'resolved' });

      const result = intent.declareIntent(hook, { min: 5, max: 10, setDormant: true });

      expect(result.success).toBe(false);
      expect(result.reason).toContain('resolved');
    });

    it('updates updatedAt timestamp', () => {
      const hook = makeHook({ id: 'h1', status: 'open', updatedAt: '2026-01-01T00:00:00Z' });

      intent.declareIntent(hook, { min: 10, max: 20 });

      expect(hook.updatedAt).not.toBe('2026-01-01T00:00:00Z');
    });

    it('can update only min value', () => {
      const hook = makeHook({ id: 'h1', status: 'open', expectedResolutionMin: 5 });

      intent.declareIntent(hook, { min: 15 });

      expect(hook.expectedResolutionMin).toBe(15);
    });

    it('can update only max value', () => {
      const hook = makeHook({ id: 'h1', status: 'open', expectedResolutionMax: 10 });

      intent.declareIntent(hook, { max: 25 });

      expect(hook.expectedResolutionMax).toBe(25);
    });
  });

  // ── wakeUp ────────────────────────────────────────────────

  describe('wakeUp', () => {
    it('wakes a dormant hook to open', () => {
      const hook = makeHook({ id: 'h1', status: 'dormant' });

      const result = intent.wakeUp(hook);

      expect(result.success).toBe(true);
      expect(result.newStatus).toBe('open');
      expect(hook.status).toBe('open');
    });

    it('wakes a dormant hook to progressing', () => {
      const hook = makeHook({ id: 'h1', status: 'dormant' });

      const result = intent.wakeUp(hook, 'progressing');

      expect(result.success).toBe(true);
      expect(hook.status).toBe('progressing');
    });

    it('rejects waking a non-dormant hook', () => {
      const hook = makeHook({ id: 'h1', status: 'open' });

      const result = intent.wakeUp(hook);

      expect(result.success).toBe(false);
      expect(result.reason).toContain('休眠');
    });

    it('rejects waking a resolved hook', () => {
      const hook = makeHook({ id: 'h1', status: 'resolved' });

      const result = intent.wakeUp(hook);

      expect(result.success).toBe(false);
    });

    it('updates updatedAt timestamp', () => {
      const hook = makeHook({ id: 'h1', status: 'dormant', updatedAt: '2026-01-01T00:00:00Z' });

      intent.wakeUp(hook);

      expect(hook.updatedAt).not.toBe('2026-01-01T00:00:00Z');
    });

    it('can set expected resolution window on wake', () => {
      const hook = makeHook({ id: 'h1', status: 'dormant' });

      intent.wakeUp(hook, 'open', { min: 10, max: 30 });

      expect(hook.expectedResolutionMin).toBe(10);
      expect(hook.expectedResolutionMax).toBe(30);
      expect(hook.status).toBe('open');
    });
  });
});
