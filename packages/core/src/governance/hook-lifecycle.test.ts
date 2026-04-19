import { describe, it, expect, vi } from 'vitest';
import { HookLifecycle } from './hook-lifecycle';
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

describe('HookLifecycle', () => {
  // ── Transitions from open ─────────────────────────────────────

  describe('transitions from open', () => {
    it('can advance to progressing', () => {
      const lifecycle = new HookLifecycle();
      const hook = makeHook({ id: 'h1', status: 'open' });

      const result = lifecycle.advance(hook);

      expect(result.success).toBe(true);
      expect(hook.status).toBe('progressing');
    });

    it('can defer to deferred', () => {
      const lifecycle = new HookLifecycle();
      const hook = makeHook({ id: 'h1', status: 'open' });

      const result = lifecycle.defer(hook, 'Not the right time');

      expect(result.success).toBe(true);
      expect(hook.status).toBe('deferred');
    });

    it('can set dormant', () => {
      const lifecycle = new HookLifecycle();
      const hook = makeHook({ id: 'h1', status: 'open' });

      const result = lifecycle.setDormant(hook, 'Long-term hook');

      expect(result.success).toBe(true);
      expect(hook.status).toBe('dormant');
    });

    it('can resolve', () => {
      const lifecycle = new HookLifecycle();
      const hook = makeHook({ id: 'h1', status: 'open' });

      const result = lifecycle.resolve(hook, 'Resolved in chapter 5');

      expect(result.success).toBe(true);
      expect(hook.status).toBe('resolved');
    });

    it('can abandon', () => {
      const lifecycle = new HookLifecycle();
      const hook = makeHook({ id: 'h1', status: 'open' });

      const result = lifecycle.abandon(hook, 'No longer relevant');

      expect(result.success).toBe(true);
      expect(hook.status).toBe('abandoned');
    });
  });

  // ── Transitions from progressing ──────────────────────────────

  describe('transitions from progressing', () => {
    it('can defer', () => {
      const lifecycle = new HookLifecycle();
      const hook = makeHook({ id: 'h1', status: 'progressing' });

      const result = lifecycle.defer(hook);

      expect(result.success).toBe(true);
      expect(hook.status).toBe('deferred');
    });

    it('can set dormant', () => {
      const lifecycle = new HookLifecycle();
      const hook = makeHook({ id: 'h1', status: 'progressing' });

      const result = lifecycle.setDormant(hook);

      expect(result.success).toBe(true);
      expect(hook.status).toBe('dormant');
    });

    it('can resolve', () => {
      const lifecycle = new HookLifecycle();
      const hook = makeHook({ id: 'h1', status: 'progressing' });

      const result = lifecycle.resolve(hook);

      expect(result.success).toBe(true);
      expect(hook.status).toBe('resolved');
    });

    it('can abandon', () => {
      const lifecycle = new HookLifecycle();
      const hook = makeHook({ id: 'h1', status: 'progressing' });

      const result = lifecycle.abandon(hook);

      expect(result.success).toBe(true);
      expect(hook.status).toBe('abandoned');
    });

    it('cannot go back to open', () => {
      const lifecycle = new HookLifecycle();
      const hook = makeHook({ id: 'h1', status: 'progressing' });

      const result = lifecycle.wake(hook);

      expect(result.success).toBe(false);
    });
  });

  // ── Transitions from deferred ─────────────────────────────────

  describe('transitions from deferred', () => {
    it('can wake to open', () => {
      const lifecycle = new HookLifecycle();
      const hook = makeHook({ id: 'h1', status: 'deferred' });

      const result = lifecycle.wake(hook, 'Time to act');

      expect(result.success).toBe(true);
      expect(hook.status).toBe('open');
    });

    it('can set dormant', () => {
      const lifecycle = new HookLifecycle();
      const hook = makeHook({ id: 'h1', status: 'deferred' });

      const result = lifecycle.setDormant(hook);

      expect(result.success).toBe(true);
      expect(hook.status).toBe('dormant');
    });

    it('can resolve', () => {
      const lifecycle = new HookLifecycle();
      const hook = makeHook({ id: 'h1', status: 'deferred' });

      const result = lifecycle.resolve(hook);

      expect(result.success).toBe(true);
      expect(hook.status).toBe('resolved');
    });

    it('can abandon', () => {
      const lifecycle = new HookLifecycle();
      const hook = makeHook({ id: 'h1', status: 'deferred' });

      const result = lifecycle.abandon(hook);

      expect(result.success).toBe(true);
      expect(hook.status).toBe('abandoned');
    });
  });

  // ── Transitions from dormant ──────────────────────────────────

  describe('transitions from dormant', () => {
    it('can wake to open', () => {
      const lifecycle = new HookLifecycle();
      const hook = makeHook({ id: 'h1', status: 'dormant' });

      const result = lifecycle.wake(hook, 'Chapter reached');

      expect(result.success).toBe(true);
      expect(hook.status).toBe('open');
    });

    it('can defer', () => {
      const lifecycle = new HookLifecycle();
      const hook = makeHook({ id: 'h1', status: 'dormant' });

      const result = lifecycle.defer(hook);

      expect(result.success).toBe(true);
      expect(hook.status).toBe('deferred');
    });

    it('can resolve', () => {
      const lifecycle = new HookLifecycle();
      const hook = makeHook({ id: 'h1', status: 'dormant' });

      const result = lifecycle.resolve(hook);

      expect(result.success).toBe(true);
      expect(hook.status).toBe('resolved');
    });

    it('can abandon', () => {
      const lifecycle = new HookLifecycle();
      const hook = makeHook({ id: 'h1', status: 'dormant' });

      const result = lifecycle.abandon(hook);

      expect(result.success).toBe(true);
      expect(hook.status).toBe('abandoned');
    });
  });

  // ── Terminal States ───────────────────────────────────────────

  describe('terminal states', () => {
    it('cannot transition from resolved', () => {
      const lifecycle = new HookLifecycle();
      const hook = makeHook({ id: 'h1', status: 'resolved' });

      const result = lifecycle.advance(hook);

      expect(result.success).toBe(false);
    });

    it('cannot transition from abandoned', () => {
      const lifecycle = new HookLifecycle();
      const hook = makeHook({ id: 'h1', status: 'abandoned' });

      const result = lifecycle.wake(hook);

      expect(result.success).toBe(false);
    });
  });

  // ── plantHook ─────────────────────────────────────────────────

  describe('plantHook', () => {
    it('sets status to open', () => {
      const lifecycle = new HookLifecycle();
      const hook = makeHook({ id: 'h1', status: 'resolved' });

      const result = lifecycle.plantHook(hook);

      expect(result.success).toBe(true);
      expect(hook.status).toBe('open');
    });

    it('fails when hook is not in terminal state', () => {
      const lifecycle = new HookLifecycle();
      const hook = makeHook({ id: 'h1', status: 'open' });

      const result = lifecycle.plantHook(hook);

      expect(result.success).toBe(false);
      expect(result.reason).toContain('已处于');
    });
  });

  // ── Invalid Transitions ───────────────────────────────────────

  describe('invalid transitions', () => {
    it('rejects same state transition', () => {
      const lifecycle = new HookLifecycle();
      const hook = makeHook({ id: 'h1', status: 'open' });

      const result = lifecycle.advance(hook);
      expect(result.success).toBe(true);

      // Now try to advance again (progressing → progressing not valid)
      const result2 = lifecycle.advance(hook);
      expect(result2.success).toBe(false);
    });

    it('rejects open → open (same state)', () => {
      const lifecycle = new HookLifecycle();
      const hook = makeHook({ id: 'h1', status: 'open' });

      // There's no direct "set open" method, but we test via wake
      // which transitions to open. From open, this should fail.
      const result = lifecycle.wake(hook);
      expect(result.success).toBe(false);
    });
  });

  // ── Events ────────────────────────────────────────────────────

  describe('events', () => {
    it('fires onPlanted event', () => {
      const onPlanted = vi.fn();
      const lifecycle = new HookLifecycle({ onPlanted });
      const hook = makeHook({ id: 'h1', status: 'resolved' });

      lifecycle.plantHook(hook);

      expect(onPlanted).toHaveBeenCalledWith(hook);
    });

    it('fires onAdvanced event', () => {
      const onAdvanced = vi.fn();
      const lifecycle = new HookLifecycle({ onAdvanced });
      const hook = makeHook({ id: 'h1', status: 'open' });

      lifecycle.advance(hook);

      expect(onAdvanced).toHaveBeenCalledWith(hook, 'open');
    });

    it('fires onDeferred event', () => {
      const onDeferred = vi.fn();
      const lifecycle = new HookLifecycle({ onDeferred });
      const hook = makeHook({ id: 'h1', status: 'open' });

      lifecycle.defer(hook);

      expect(onDeferred).toHaveBeenCalledWith(hook);
    });

    it('fires onDormant event', () => {
      const onDormant = vi.fn();
      const lifecycle = new HookLifecycle({ onDormant });
      const hook = makeHook({ id: 'h1', status: 'open' });

      lifecycle.setDormant(hook);

      expect(onDormant).toHaveBeenCalledWith(hook);
    });

    it('fires onWake event', () => {
      const onWake = vi.fn();
      const lifecycle = new HookLifecycle({ onWake });
      const hook = makeHook({ id: 'h1', status: 'dormant' });

      lifecycle.wake(hook);

      expect(onWake).toHaveBeenCalledWith(hook);
    });

    it('fires onResolved event', () => {
      const onResolved = vi.fn();
      const lifecycle = new HookLifecycle({ onResolved });
      const hook = makeHook({ id: 'h1', status: 'open' });

      lifecycle.resolve(hook);

      expect(onResolved).toHaveBeenCalledWith(hook);
    });

    it('fires onAbandoned event', () => {
      const onAbandoned = vi.fn();
      const lifecycle = new HookLifecycle({ onAbandoned });
      const hook = makeHook({ id: 'h1', status: 'open' });

      lifecycle.abandon(hook);

      expect(onAbandoned).toHaveBeenCalledWith(hook);
    });

    it('does not fire onAdvanced for dormant transition', () => {
      const onAdvanced = vi.fn();
      const lifecycle = new HookLifecycle({ onAdvanced });
      const hook = makeHook({ id: 'h1', status: 'open' });

      lifecycle.setDormant(hook);

      expect(onAdvanced).not.toHaveBeenCalled();
    });

    it('does not fire onAdvanced for resolved transition', () => {
      const onAdvanced = vi.fn();
      const lifecycle = new HookLifecycle({ onAdvanced });
      const hook = makeHook({ id: 'h1', status: 'open' });

      lifecycle.resolve(hook);

      expect(onAdvanced).not.toHaveBeenCalled();
    });
  });

  // ── Queries ───────────────────────────────────────────────────

  describe('queries', () => {
    it('canTransition returns true for valid transitions', () => {
      const lifecycle = new HookLifecycle();

      expect(lifecycle.canTransition('open', 'progressing')).toBe(true);
      expect(lifecycle.canTransition('open', 'deferred')).toBe(true);
      expect(lifecycle.canTransition('open', 'dormant')).toBe(true);
      expect(lifecycle.canTransition('open', 'resolved')).toBe(true);
    });

    it('canTransition returns false for invalid transitions', () => {
      const lifecycle = new HookLifecycle();

      expect(lifecycle.canTransition('resolved', 'open')).toBe(false);
      expect(lifecycle.canTransition('abandoned', 'open')).toBe(false);
      expect(lifecycle.canTransition('progressing', 'open')).toBe(false);
    });

    it('getNextStates returns allowed targets', () => {
      const lifecycle = new HookLifecycle();

      const openNext = lifecycle.getNextStates('open');
      expect(openNext).toContain('progressing');
      expect(openNext).toContain('deferred');
      expect(openNext).toContain('dormant');
      expect(openNext).toContain('resolved');
      expect(openNext).toContain('abandoned');
    });

    it('getNextStates returns empty for terminal states', () => {
      const lifecycle = new HookLifecycle();

      expect(lifecycle.getNextStates('resolved')).toEqual([]);
      expect(lifecycle.getNextStates('abandoned')).toEqual([]);
    });

    it('isTerminal returns true for resolved and abandoned', () => {
      const lifecycle = new HookLifecycle();

      expect(lifecycle.isTerminal('resolved')).toBe(true);
      expect(lifecycle.isTerminal('abandoned')).toBe(true);
    });

    it('isTerminal returns false for active states', () => {
      const lifecycle = new HookLifecycle();

      expect(lifecycle.isTerminal('open')).toBe(false);
      expect(lifecycle.isTerminal('progressing')).toBe(false);
      expect(lifecycle.isTerminal('deferred')).toBe(false);
      expect(lifecycle.isTerminal('dormant')).toBe(false);
    });
  });

  // ── Full Lifecycle Scenarios ──────────────────────────────────

  describe('full lifecycle scenarios', () => {
    it('completes a normal lifecycle: open → progressing → resolved', () => {
      const lifecycle = new HookLifecycle();
      const hook = makeHook({ id: 'h1', status: 'open' });

      lifecycle.advance(hook);
      expect(hook.status).toBe('progressing');

      lifecycle.resolve(hook);
      expect(hook.status).toBe('resolved');
    });

    it('handles deferred cycle: open → deferred → open → resolved', () => {
      const lifecycle = new HookLifecycle();
      const hook = makeHook({ id: 'h1', status: 'open' });

      lifecycle.defer(hook, 'Not now');
      expect(hook.status).toBe('deferred');

      lifecycle.wake(hook, 'Time is right');
      expect(hook.status).toBe('open');

      lifecycle.advance(hook);
      expect(hook.status).toBe('progressing');

      lifecycle.resolve(hook);
      expect(hook.status).toBe('resolved');
    });

    it('handles dormant cycle: open → dormant → wake → resolved', () => {
      const lifecycle = new HookLifecycle();
      const hook = makeHook({ id: 'h1', status: 'open' });

      lifecycle.setDormant(hook, 'Long-term plan');
      expect(hook.status).toBe('dormant');

      lifecycle.wake(hook, 'Chapter reached');
      expect(hook.status).toBe('open');

      lifecycle.advance(hook);
      lifecycle.resolve(hook);
      expect(hook.status).toBe('resolved');
    });

    it('updatedAt is updated on each transition', async () => {
      const lifecycle = new HookLifecycle();
      const hook = makeHook({ id: 'h1', status: 'open', updatedAt: '2026-01-01T00:00:00Z' });

      lifecycle.advance(hook);
      const time1 = hook.updatedAt;

      // Ensure different timestamp
      await new Promise((r) => setTimeout(r, 2));
      lifecycle.defer(hook);
      const time2 = hook.updatedAt;

      expect(time2).not.toBe('2026-01-01T00:00:00Z');
      expect(time2).not.toBe(time1);
    });
  });
});
