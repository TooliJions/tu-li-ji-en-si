import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { QuotaGuard, type QuotaUsageEvent, type QuotaExhaustedEvent } from './quota-guard';

const FIXED_NOW = new Date('2026-04-19T08:30:00.000Z').getTime();

describe('QuotaGuard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Constructor ────────────────────────────────────────────────

  describe('constructor', () => {
    it('initializes with daily limit', () => {
      const g = new QuotaGuard({ dailyLimit: 100_000 });
      expect(g.getUsage().limit).toBe(100_000);
      expect(g.getUsage().used).toBe(0);
    });

    it('accepts warning and critical thresholds', () => {
      const g = new QuotaGuard({
        dailyLimit: 100_000,
        warningThreshold: 0.8,
        criticalThreshold: 0.95,
      });
      expect(g).toBeDefined();
    });

    it('throws on dailyLimit <= 0', () => {
      expect(() => new QuotaGuard({ dailyLimit: 0 })).toThrow();
      expect(() => new QuotaGuard({ dailyLimit: -1 })).toThrow();
    });

    it('throws when warningThreshold > criticalThreshold', () => {
      expect(
        () =>
          new QuotaGuard({
            dailyLimit: 1000,
            warningThreshold: 0.9,
            criticalThreshold: 0.8,
          })
      ).toThrow();
    });

    it('throws when thresholds out of [0,1]', () => {
      expect(() => new QuotaGuard({ dailyLimit: 1000, warningThreshold: 1.5 })).toThrow();
      expect(() => new QuotaGuard({ dailyLimit: 1000, criticalThreshold: -0.1 })).toThrow();
    });
  });

  // ── recordTokens + getUsage ────────────────────────────────────

  describe('recordTokens()', () => {
    it('accumulates input and output tokens', () => {
      const g = new QuotaGuard({ dailyLimit: 10_000 });
      g.recordTokens({ inputTokens: 100, outputTokens: 200 });
      expect(g.getUsage().used).toBe(300);
    });

    it('handles multiple records', () => {
      const g = new QuotaGuard({ dailyLimit: 10_000 });
      g.recordTokens({ inputTokens: 100, outputTokens: 200 });
      g.recordTokens({ inputTokens: 50, outputTokens: 75 });
      expect(g.getUsage().used).toBe(425);
    });

    it('treats missing fields as 0', () => {
      const g = new QuotaGuard({ dailyLimit: 10_000 });
      g.recordTokens({ inputTokens: 100 });
      g.recordTokens({ outputTokens: 50 });
      expect(g.getUsage().used).toBe(150);
    });

    it('rejects negative tokens', () => {
      const g = new QuotaGuard({ dailyLimit: 10_000 });
      expect(() => g.recordTokens({ inputTokens: -1 })).toThrow();
      expect(() => g.recordTokens({ outputTokens: -1 })).toThrow();
    });

    it('computes remaining correctly', () => {
      const g = new QuotaGuard({ dailyLimit: 1000 });
      g.recordTokens({ inputTokens: 300 });
      const usage = g.getUsage();
      expect(usage.remaining).toBe(700);
      expect(usage.percentUsed).toBeCloseTo(0.3, 4);
    });

    it('caps remaining at 0 when overshot', () => {
      const g = new QuotaGuard({ dailyLimit: 1000 });
      g.recordTokens({ inputTokens: 1500 });
      expect(g.getUsage().remaining).toBe(0);
      expect(g.getUsage().percentUsed).toBeGreaterThanOrEqual(1);
    });
  });

  // ── canProceed ─────────────────────────────────────────────────

  describe('canProceed()', () => {
    it('returns true when budget allows', () => {
      const g = new QuotaGuard({ dailyLimit: 1000 });
      g.recordTokens({ inputTokens: 100 });
      expect(g.canProceed(500)).toBe(true);
    });

    it('returns false when estimate would exceed budget', () => {
      const g = new QuotaGuard({ dailyLimit: 1000 });
      g.recordTokens({ inputTokens: 800 });
      expect(g.canProceed(300)).toBe(false);
    });

    it('returns true with no estimate (defaults to 0)', () => {
      const g = new QuotaGuard({ dailyLimit: 1000 });
      g.recordTokens({ inputTokens: 999 });
      expect(g.canProceed()).toBe(true);
    });

    it('returns false once exhausted', () => {
      const g = new QuotaGuard({ dailyLimit: 1000 });
      g.recordTokens({ inputTokens: 1000 });
      expect(g.canProceed(1)).toBe(false);
    });
  });

  // ── isExhausted ────────────────────────────────────────────────

  describe('isExhausted()', () => {
    it('returns false initially', () => {
      const g = new QuotaGuard({ dailyLimit: 1000 });
      expect(g.isExhausted()).toBe(false);
    });

    it('returns true when used == limit', () => {
      const g = new QuotaGuard({ dailyLimit: 1000 });
      g.recordTokens({ inputTokens: 1000 });
      expect(g.isExhausted()).toBe(true);
    });

    it('returns true when used > limit', () => {
      const g = new QuotaGuard({ dailyLimit: 1000 });
      g.recordTokens({ inputTokens: 1500 });
      expect(g.isExhausted()).toBe(true);
    });
  });

  // ── Event listeners ────────────────────────────────────────────

  describe('onExhausted()', () => {
    it('fires synchronously when limit is crossed (acceptance: <1s)', () => {
      const g = new QuotaGuard({ dailyLimit: 1000 });
      const cb = vi.fn();
      g.onExhausted(cb);

      const t0 = Date.now();
      g.recordTokens({ inputTokens: 1200 });
      const elapsed = Date.now() - t0;

      expect(cb).toHaveBeenCalledTimes(1);
      expect(elapsed).toBeLessThan(1000);
    });

    it('fires only once per exhaustion event', () => {
      const g = new QuotaGuard({ dailyLimit: 1000 });
      const cb = vi.fn();
      g.onExhausted(cb);

      g.recordTokens({ inputTokens: 1000 });
      g.recordTokens({ inputTokens: 100 });
      g.recordTokens({ inputTokens: 100 });
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it('does not fire when below limit', () => {
      const g = new QuotaGuard({ dailyLimit: 1000 });
      const cb = vi.fn();
      g.onExhausted(cb);

      g.recordTokens({ inputTokens: 999 });
      expect(cb).not.toHaveBeenCalled();
    });

    it('passes event payload with usage details', () => {
      const g = new QuotaGuard({ dailyLimit: 1000 });
      let captured: QuotaExhaustedEvent | null = null;
      g.onExhausted((e) => {
        captured = e;
      });

      g.recordTokens({ inputTokens: 1100 });

      expect(captured).not.toBeNull();
      const event = captured as unknown as QuotaExhaustedEvent;
      expect(event.used).toBe(1100);
      expect(event.limit).toBe(1000);
      expect(event.timestamp).toBeDefined();
    });

    it('supports multiple subscribers', () => {
      const g = new QuotaGuard({ dailyLimit: 1000 });
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      g.onExhausted(cb1);
      g.onExhausted(cb2);

      g.recordTokens({ inputTokens: 1100 });
      expect(cb1).toHaveBeenCalledTimes(1);
      expect(cb2).toHaveBeenCalledTimes(1);
    });

    it('returns an unsubscribe function', () => {
      const g = new QuotaGuard({ dailyLimit: 1000 });
      const cb = vi.fn();
      const unsubscribe = g.onExhausted(cb);
      unsubscribe();

      g.recordTokens({ inputTokens: 1100 });
      expect(cb).not.toHaveBeenCalled();
    });
  });

  describe('onWarning() / onCritical()', () => {
    it('onWarning fires when crossing warningThreshold (default 0.8)', () => {
      const g = new QuotaGuard({ dailyLimit: 1000 });
      const cb = vi.fn();
      g.onWarning(cb);

      g.recordTokens({ inputTokens: 700 });
      expect(cb).not.toHaveBeenCalled();

      g.recordTokens({ inputTokens: 200 });
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it('onCritical fires when crossing criticalThreshold (default 0.95)', () => {
      const g = new QuotaGuard({ dailyLimit: 1000 });
      const cb = vi.fn();
      g.onCritical(cb);

      g.recordTokens({ inputTokens: 940 });
      expect(cb).not.toHaveBeenCalled();

      g.recordTokens({ inputTokens: 20 });
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it('warning fires only once until reset', () => {
      const g = new QuotaGuard({ dailyLimit: 1000 });
      const cb = vi.fn();
      g.onWarning(cb);

      g.recordTokens({ inputTokens: 850 });
      g.recordTokens({ inputTokens: 50 });
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it('event payload includes percent', () => {
      const g = new QuotaGuard({ dailyLimit: 1000 });
      let captured: QuotaUsageEvent | null = null;
      g.onWarning((e) => {
        captured = e;
      });

      g.recordTokens({ inputTokens: 850 });

      expect(captured).not.toBeNull();
      const event = captured as unknown as QuotaUsageEvent;
      expect(event.percentUsed).toBeGreaterThanOrEqual(0.8);
      expect(event.used).toBe(850);
      expect(event.limit).toBe(1000);
    });

    it('respects custom thresholds', () => {
      const g = new QuotaGuard({
        dailyLimit: 1000,
        warningThreshold: 0.5,
        criticalThreshold: 0.7,
      });
      const warn = vi.fn();
      const crit = vi.fn();
      g.onWarning(warn);
      g.onCritical(crit);

      g.recordTokens({ inputTokens: 600 });
      expect(warn).toHaveBeenCalledTimes(1);
      expect(crit).not.toHaveBeenCalled();

      g.recordTokens({ inputTokens: 150 });
      expect(crit).toHaveBeenCalledTimes(1);
    });
  });

  // ── reset() ────────────────────────────────────────────────────

  describe('reset()', () => {
    it('clears used tokens', () => {
      const g = new QuotaGuard({ dailyLimit: 1000 });
      g.recordTokens({ inputTokens: 500 });
      g.reset();
      expect(g.getUsage().used).toBe(0);
      expect(g.isExhausted()).toBe(false);
    });

    it('re-arms exhausted callback after reset', () => {
      const g = new QuotaGuard({ dailyLimit: 1000 });
      const cb = vi.fn();
      g.onExhausted(cb);

      g.recordTokens({ inputTokens: 1100 });
      expect(cb).toHaveBeenCalledTimes(1);

      g.reset();
      g.recordTokens({ inputTokens: 1100 });
      expect(cb).toHaveBeenCalledTimes(2);
    });

    it('re-arms warning/critical after reset', () => {
      const g = new QuotaGuard({ dailyLimit: 1000 });
      const warn = vi.fn();
      g.onWarning(warn);

      g.recordTokens({ inputTokens: 850 });
      g.reset();
      g.recordTokens({ inputTokens: 850 });
      expect(warn).toHaveBeenCalledTimes(2);
    });
  });

  // ── Auto-reset on UTC date change ──────────────────────────────

  describe('auto-reset across UTC days', () => {
    it('auto-resets when next recordTokens crosses UTC midnight', () => {
      const g = new QuotaGuard({ dailyLimit: 1000 });
      g.recordTokens({ inputTokens: 800 });
      expect(g.getUsage().used).toBe(800);

      // Cross UTC midnight
      vi.setSystemTime(new Date('2026-04-20T00:00:01.000Z'));
      g.recordTokens({ inputTokens: 100 });
      expect(g.getUsage().used).toBe(100);
    });

    it('getUsage() also reflects auto-reset', () => {
      const g = new QuotaGuard({ dailyLimit: 1000 });
      g.recordTokens({ inputTokens: 500 });
      vi.setSystemTime(new Date('2026-04-20T05:00:00.000Z'));
      expect(g.getUsage().used).toBe(0);
    });

    it('does not reset within same UTC day', () => {
      const g = new QuotaGuard({ dailyLimit: 1000 });
      g.recordTokens({ inputTokens: 500 });
      vi.setSystemTime(new Date('2026-04-19T23:59:59.000Z'));
      g.recordTokens({ inputTokens: 100 });
      expect(g.getUsage().used).toBe(600);
    });
  });

  // ── Acceptance ─────────────────────────────────────────────────

  describe('acceptance: 配额耗尽后 1s 内守护进程停止，推送通知', () => {
    it('exhausted callback invoked synchronously on overflow', () => {
      const g = new QuotaGuard({ dailyLimit: 10_000 });
      let stopped = false;
      let notified = false;

      g.onExhausted(() => {
        stopped = true;
        notified = true;
      });

      const t0 = Date.now();
      g.recordTokens({ inputTokens: 6000, outputTokens: 5000 });
      const elapsed = Date.now() - t0;

      expect(stopped).toBe(true);
      expect(notified).toBe(true);
      expect(elapsed).toBeLessThan(1000);
    });

    it('supports separate stop & notify subscribers', () => {
      const g = new QuotaGuard({ dailyLimit: 10_000 });
      const stop = vi.fn();
      const notify = vi.fn();

      g.onExhausted(stop);
      g.onExhausted(notify);

      g.recordTokens({ inputTokens: 11_000 });

      expect(stop).toHaveBeenCalled();
      expect(notify).toHaveBeenCalled();
    });
  });
});
