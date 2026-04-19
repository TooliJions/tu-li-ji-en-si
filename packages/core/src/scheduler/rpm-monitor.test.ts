import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RpmMonitor, type RateLimitHeaders } from './rpm-monitor';

const FIXED_NOW = new Date('2026-04-19T00:00:00.000Z').getTime();

describe('RpmMonitor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Constructor ────────────────────────────────────────────────

  describe('constructor', () => {
    it('initializes with defaults (baseIntervalMs=1000)', () => {
      const m = new RpmMonitor();
      expect(m.getRecommendedInterval()).toBe(1000);
      expect(m.getCurrentRpm()).toBe(0);
      expect(m.isBackoffActive()).toBe(false);
    });

    it('accepts custom config', () => {
      const m = new RpmMonitor({
        baseIntervalMs: 500,
        maxBackoffMs: 60_000,
        windowMs: 30_000,
      });
      expect(m.getRecommendedInterval()).toBe(500);
    });

    it('throws on invalid baseIntervalMs', () => {
      expect(() => new RpmMonitor({ baseIntervalMs: 0 })).toThrow();
      expect(() => new RpmMonitor({ baseIntervalMs: -1 })).toThrow();
    });

    it('throws when maxBackoffMs < baseIntervalMs', () => {
      expect(() => new RpmMonitor({ baseIntervalMs: 5000, maxBackoffMs: 1000 })).toThrow();
    });
  });

  // ── recordRequest + getCurrentRpm ──────────────────────────────

  describe('recordRequest()', () => {
    it('starts at 0 RPM', () => {
      const m = new RpmMonitor();
      expect(m.getCurrentRpm()).toBe(0);
    });

    it('counts requests within sliding window', () => {
      const m = new RpmMonitor({ windowMs: 60_000 });
      m.recordRequest();
      m.recordRequest();
      m.recordRequest();
      expect(m.getCurrentRpm()).toBe(3);
    });

    it('drops requests outside the sliding window', () => {
      const m = new RpmMonitor({ windowMs: 60_000 });
      m.recordRequest();
      m.recordRequest();
      vi.setSystemTime(FIXED_NOW + 70_000);
      m.recordRequest();
      // Only the latest counts
      expect(m.getCurrentRpm()).toBe(1);
    });

    it('accepts explicit timestamp', () => {
      const m = new RpmMonitor({ windowMs: 60_000 });
      m.recordRequest(FIXED_NOW - 30_000);
      m.recordRequest(FIXED_NOW - 10_000);
      expect(m.getCurrentRpm()).toBe(2);
    });
  });

  // ── recordRateLimitError — immediate interval extension ────────

  describe('recordRateLimitError()', () => {
    it('extends interval immediately (within 2s acceptance)', () => {
      const m = new RpmMonitor({ baseIntervalMs: 1000 });
      const before = m.getRecommendedInterval();
      m.recordRateLimitError({});
      const after = m.getRecommendedInterval();
      expect(after).toBeGreaterThan(before);
    });

    it('marks backoff as active', () => {
      const m = new RpmMonitor();
      m.recordRateLimitError({});
      expect(m.isBackoffActive()).toBe(true);
    });

    it('counts 429 occurrences', () => {
      const m = new RpmMonitor();
      expect(m.getRateLimitErrorCount()).toBe(0);
      m.recordRateLimitError({});
      m.recordRateLimitError({});
      expect(m.getRateLimitErrorCount()).toBe(2);
    });

    it('honors X-RateLimit-Reset header (seconds string)', () => {
      const m = new RpmMonitor({ baseIntervalMs: 1000 });
      m.recordRateLimitError({ 'x-ratelimit-reset': '15s' });
      // Backoff should be at least 15s (15000ms)
      expect(m.getRecommendedInterval()).toBeGreaterThanOrEqual(15_000);
    });

    it('honors X-RateLimit-Reset-Requests header', () => {
      const m = new RpmMonitor({ baseIntervalMs: 1000 });
      m.recordRateLimitError({ 'x-ratelimit-reset-requests': '20s' });
      expect(m.getRecommendedInterval()).toBeGreaterThanOrEqual(20_000);
    });

    it('honors Retry-After header (seconds)', () => {
      const m = new RpmMonitor({ baseIntervalMs: 1000 });
      m.recordRateLimitError({ 'retry-after': '10' });
      expect(m.getRecommendedInterval()).toBeGreaterThanOrEqual(10_000);
    });

    it('honors Retry-After header (ISO timestamp)', () => {
      const m = new RpmMonitor({ baseIntervalMs: 1000 });
      const future = new Date(FIXED_NOW + 12_000).toISOString();
      m.recordRateLimitError({ 'retry-after': future });
      expect(m.getRecommendedInterval()).toBeGreaterThanOrEqual(10_000);
    });

    it('honors anthropic-ratelimit-requests-reset header', () => {
      const m = new RpmMonitor({ baseIntervalMs: 1000 });
      m.recordRateLimitError({ 'anthropic-ratelimit-requests-reset': '25s' });
      expect(m.getRecommendedInterval()).toBeGreaterThanOrEqual(25_000);
    });

    it('case-insensitive header lookup', () => {
      const m = new RpmMonitor({ baseIntervalMs: 1000 });
      m.recordRateLimitError({ 'X-RateLimit-Reset': '15s' });
      expect(m.getRecommendedInterval()).toBeGreaterThanOrEqual(15_000);
    });
  });

  // ── Exponential backoff ────────────────────────────────────────

  describe('exponential backoff', () => {
    it('doubles interval on consecutive 429 (no header guidance)', () => {
      const m = new RpmMonitor({ baseIntervalMs: 1000 });
      m.recordRateLimitError({});
      const first = m.getRecommendedInterval();

      m.recordRateLimitError({});
      const second = m.getRecommendedInterval();

      m.recordRateLimitError({});
      const third = m.getRecommendedInterval();

      expect(second).toBeGreaterThanOrEqual(first * 2);
      expect(third).toBeGreaterThanOrEqual(second * 2);
    });

    it('caps backoff at maxBackoffMs (default 300s)', () => {
      const m = new RpmMonitor({ baseIntervalMs: 1000 });
      // Repeated 429s should saturate at 300_000ms
      for (let i = 0; i < 20; i++) {
        m.recordRateLimitError({});
      }
      expect(m.getRecommendedInterval()).toBeLessThanOrEqual(300_000);
      expect(m.getRecommendedInterval()).toBe(300_000);
    });

    it('respects custom maxBackoffMs', () => {
      const m = new RpmMonitor({ baseIntervalMs: 1000, maxBackoffMs: 30_000 });
      for (let i = 0; i < 20; i++) {
        m.recordRateLimitError({});
      }
      expect(m.getRecommendedInterval()).toBeLessThanOrEqual(30_000);
      expect(m.getRecommendedInterval()).toBe(30_000);
    });

    it('uses max of header-suggested and exponential backoff', () => {
      const m = new RpmMonitor({ baseIntervalMs: 1000 });
      m.recordRateLimitError({}); // exponential → 2000
      m.recordRateLimitError({}); // exponential → 4000
      m.recordRateLimitError({ 'retry-after': '60' }); // header → 60_000
      expect(m.getRecommendedInterval()).toBeGreaterThanOrEqual(60_000);
    });
  });

  // ── recordSuccess — reset backoff ──────────────────────────────

  describe('recordSuccess()', () => {
    it('clears backoff and returns to base interval', () => {
      const m = new RpmMonitor({ baseIntervalMs: 1000 });
      m.recordRateLimitError({});
      m.recordRateLimitError({});
      expect(m.isBackoffActive()).toBe(true);

      m.recordSuccess();
      expect(m.isBackoffActive()).toBe(false);
      expect(m.getRecommendedInterval()).toBe(1000);
    });

    it('resets exponential backoff counter', () => {
      const m = new RpmMonitor({ baseIntervalMs: 1000 });
      m.recordRateLimitError({});
      m.recordRateLimitError({});
      m.recordSuccess();

      // Single 429 after reset should be only one doubling, not three
      m.recordRateLimitError({});
      expect(m.getRecommendedInterval()).toBeLessThan(8_000);
    });

    it('does not affect RPM tracking', () => {
      const m = new RpmMonitor();
      m.recordRequest();
      m.recordRequest();
      m.recordSuccess();
      expect(m.getCurrentRpm()).toBe(2);
    });
  });

  // ── Backoff state ──────────────────────────────────────────────

  describe('backoff state', () => {
    it('reports backoff state details', () => {
      const m = new RpmMonitor({ baseIntervalMs: 1000 });
      m.recordRateLimitError({});

      const state = m.getBackoffState();
      expect(state.active).toBe(true);
      expect(state.level).toBe(1);
      expect(state.intervalMs).toBeGreaterThan(1000);
    });

    it('level increments per 429', () => {
      const m = new RpmMonitor();
      m.recordRateLimitError({});
      m.recordRateLimitError({});
      m.recordRateLimitError({});
      expect(m.getBackoffState().level).toBe(3);
    });

    it('reset() clears all state', () => {
      const m = new RpmMonitor({ baseIntervalMs: 1000 });
      m.recordRequest();
      m.recordRequest();
      m.recordRateLimitError({});

      m.reset();
      expect(m.getCurrentRpm()).toBe(0);
      expect(m.isBackoffActive()).toBe(false);
      expect(m.getRateLimitErrorCount()).toBe(0);
      expect(m.getRecommendedInterval()).toBe(1000);
    });
  });

  // ── Backoff expiration ─────────────────────────────────────────

  describe('backoff expiration over time', () => {
    it('backoff naturally relaxes after retry-after window passes', () => {
      const m = new RpmMonitor({ baseIntervalMs: 1000 });
      m.recordRateLimitError({ 'retry-after': '10' });
      expect(m.getRecommendedInterval()).toBeGreaterThanOrEqual(10_000);

      // Advance past the retry-after window
      vi.setSystemTime(FIXED_NOW + 11_000);
      // Without success, interval may still reflect exponential — but the
      // honored header window should have elapsed
      expect(m.getBackoffState().retryAfterMs).toBe(0);
    });
  });

  // ── Acceptance ─────────────────────────────────────────────────

  describe('acceptance: 限流后 2s 内间隔自动延长，退避上限 300s', () => {
    it('extends interval within 2s of 429', () => {
      const m = new RpmMonitor({ baseIntervalMs: 1000 });
      const t0 = Date.now();

      m.recordRateLimitError({ 'retry-after': '5' });

      const elapsed = Date.now() - t0;
      expect(elapsed).toBeLessThan(2000);
      expect(m.getRecommendedInterval()).toBeGreaterThan(1000);
    });

    it('caps backoff at 300s even under repeated 429s', () => {
      const m = new RpmMonitor({ baseIntervalMs: 1000 });
      for (let i = 0; i < 50; i++) {
        m.recordRateLimitError({});
      }
      expect(m.getRecommendedInterval()).toBe(300_000);
    });

    it('honors header even if exponential would exceed 300s', () => {
      const m = new RpmMonitor({ baseIntervalMs: 1000 });
      for (let i = 0; i < 50; i++) {
        m.recordRateLimitError({});
      }
      // Header says wait only 60s but exponential capped at 300s — keep 300s
      m.recordRateLimitError({ 'retry-after': '60' });
      expect(m.getRecommendedInterval()).toBe(300_000);
    });
  });

  // ── Type re-export ─────────────────────────────────────────────

  describe('RateLimitHeaders type', () => {
    it('accepts string and array values', () => {
      const headers: RateLimitHeaders = {
        'retry-after': '5',
        'x-ratelimit-reset': ['10s'],
      };
      const m = new RpmMonitor();
      m.recordRateLimitError(headers);
      expect(m.isBackoffActive()).toBe(true);
    });
  });
});
