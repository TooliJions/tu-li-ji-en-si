import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SmartInterval, type RateLimitHeaders } from './smart-interval';

describe('SmartInterval', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-19T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Constructor ────────────────────────────────────────────────

  describe('constructor', () => {
    it('defaults to local mode', () => {
      const si = new SmartInterval();
      expect(si.getMode()).toBe('local');
    });

    it('accepts cloud mode with targetRpm', () => {
      const si = new SmartInterval({ mode: 'cloud', targetRpm: 60 });
      expect(si.getMode()).toBe('cloud');
    });

    it('accepts custom min/max interval bounds', () => {
      const si = new SmartInterval({
        mode: 'cloud',
        targetRpm: 60,
        minIntervalMs: 500,
        maxIntervalMs: 30_000,
      });
      expect(si).toBeDefined();
    });

    it('throws when cloud mode missing targetRpm', () => {
      expect(() => new SmartInterval({ mode: 'cloud' })).toThrow(/targetRpm/);
    });

    it('throws when targetRpm <= 0', () => {
      expect(() => new SmartInterval({ mode: 'cloud', targetRpm: 0 })).toThrow();
      expect(() => new SmartInterval({ mode: 'cloud', targetRpm: -1 })).toThrow();
    });
  });

  // ── Local mode ─────────────────────────────────────────────────

  describe('local mode', () => {
    it('getInterval() returns 0', () => {
      const si = new SmartInterval({ mode: 'local' });
      expect(si.getInterval()).toBe(0);
    });

    it('recordResponse() does not change interval', () => {
      const si = new SmartInterval({ mode: 'local' });
      si.recordResponse({ 'x-ratelimit-remaining-requests': '0' });
      expect(si.getInterval()).toBe(0);
    });

    it('recordRequest() does not change interval', () => {
      const si = new SmartInterval({ mode: 'local' });
      si.recordRequest();
      si.recordRequest();
      expect(si.getInterval()).toBe(0);
    });
  });

  // ── Cloud mode — base interval ─────────────────────────────────

  describe('cloud mode base interval', () => {
    it('derives interval from targetRpm (60 RPM → 1000ms)', () => {
      const si = new SmartInterval({ mode: 'cloud', targetRpm: 60 });
      expect(si.getInterval()).toBe(1000);
    });

    it('derives interval for 30 RPM → 2000ms', () => {
      const si = new SmartInterval({ mode: 'cloud', targetRpm: 30 });
      expect(si.getInterval()).toBe(2000);
    });

    it('derives interval for 600 RPM → 100ms', () => {
      const si = new SmartInterval({ mode: 'cloud', targetRpm: 600 });
      expect(si.getInterval()).toBe(100);
    });

    it('respects minIntervalMs floor', () => {
      const si = new SmartInterval({
        mode: 'cloud',
        targetRpm: 6000,
        minIntervalMs: 200,
      });
      expect(si.getInterval()).toBe(200);
    });
  });

  // ── recordResponse — generic OpenAI-style headers ──────────────

  describe('recordResponse() with OpenAI-style headers', () => {
    it('parses x-ratelimit-limit-requests and adjusts to limit', () => {
      const si = new SmartInterval({ mode: 'cloud', targetRpm: 60 });
      // Limit announced as 30 RPM — interval should be at least 2000ms
      si.recordResponse({
        'x-ratelimit-limit-requests': '30',
        'x-ratelimit-remaining-requests': '29',
        'x-ratelimit-reset-requests': '60s',
      });
      expect(si.getInterval()).toBeGreaterThanOrEqual(2000);
    });

    it('slows down when remaining requests are scarce', () => {
      const si = new SmartInterval({ mode: 'cloud', targetRpm: 60 });
      const baseInterval = si.getInterval();
      // Only 1 request left and 30s until reset → must wait ~30s
      si.recordResponse({
        'x-ratelimit-limit-requests': '60',
        'x-ratelimit-remaining-requests': '1',
        'x-ratelimit-reset-requests': '30s',
      });
      expect(si.getInterval()).toBeGreaterThan(baseInterval);
      expect(si.getInterval()).toBeGreaterThanOrEqual(15_000);
    });

    it('returns toward base interval when capacity is plentiful', () => {
      const si = new SmartInterval({ mode: 'cloud', targetRpm: 60 });
      // Tight first response
      si.recordResponse({
        'x-ratelimit-limit-requests': '60',
        'x-ratelimit-remaining-requests': '1',
        'x-ratelimit-reset-requests': '60s',
      });
      const tight = si.getInterval();

      // Then headers indicate capacity restored
      si.recordResponse({
        'x-ratelimit-limit-requests': '60',
        'x-ratelimit-remaining-requests': '59',
        'x-ratelimit-reset-requests': '60s',
      });
      const loose = si.getInterval();
      expect(loose).toBeLessThan(tight);
    });

    it('parses millisecond reset format ("500ms")', () => {
      const si = new SmartInterval({ mode: 'cloud', targetRpm: 60 });
      si.recordResponse({
        'x-ratelimit-limit-requests': '60',
        'x-ratelimit-remaining-requests': '2',
        'x-ratelimit-reset-requests': '500ms',
      });
      // 2 requests in 500ms → ~250ms each, but min targetRpm interval may dominate
      expect(si.getInterval()).toBeGreaterThan(0);
    });

    it('parses ISO timestamp reset format', () => {
      const si = new SmartInterval({ mode: 'cloud', targetRpm: 60 });
      const future = new Date(Date.now() + 10_000).toISOString();
      si.recordResponse({
        'x-ratelimit-limit-requests': '60',
        'x-ratelimit-remaining-requests': '1',
        'x-ratelimit-reset-requests': future,
      });
      // 1 request remaining, 10s until reset → ~10s wait
      expect(si.getInterval()).toBeGreaterThanOrEqual(8_000);
    });

    it('ignores empty/missing headers gracefully', () => {
      const si = new SmartInterval({ mode: 'cloud', targetRpm: 60 });
      const before = si.getInterval();
      si.recordResponse({});
      expect(si.getInterval()).toBe(before);
    });

    it('case-insensitive header lookup', () => {
      const si = new SmartInterval({ mode: 'cloud', targetRpm: 60 });
      si.recordResponse({
        'X-RateLimit-Limit-Requests': '30',
        'X-RateLimit-Remaining-Requests': '29',
        'X-RateLimit-Reset-Requests': '60s',
      });
      expect(si.getInterval()).toBeGreaterThanOrEqual(2000);
    });
  });

  // ── recordResponse — Anthropic-style headers ───────────────────

  describe('recordResponse() with Anthropic-style headers', () => {
    it('parses anthropic-ratelimit-requests-* headers', () => {
      const si = new SmartInterval({ mode: 'cloud', targetRpm: 60 });
      si.recordResponse({
        'anthropic-ratelimit-requests-limit': '30',
        'anthropic-ratelimit-requests-remaining': '5',
        'anthropic-ratelimit-requests-reset': '30s',
      });
      // 5 requests in 30s → 6000ms each
      expect(si.getInterval()).toBeGreaterThanOrEqual(5_000);
    });

    it('uses anthropic headers when openai headers also present', () => {
      const si = new SmartInterval({ mode: 'cloud', targetRpm: 60 });
      si.recordResponse({
        'anthropic-ratelimit-requests-remaining': '10',
        'anthropic-ratelimit-requests-reset': '30s',
        'x-ratelimit-remaining-requests': '60',
      });
      // Anthropic headers (more restrictive) must take precedence
      expect(si.getInterval()).toBeGreaterThanOrEqual(2_500);
    });
  });

  // ── Bounds ─────────────────────────────────────────────────────

  describe('bounds enforcement', () => {
    it('caps interval at maxIntervalMs', () => {
      const si = new SmartInterval({
        mode: 'cloud',
        targetRpm: 60,
        maxIntervalMs: 10_000,
      });
      // Tight headers would suggest 60s wait
      si.recordResponse({
        'x-ratelimit-limit-requests': '60',
        'x-ratelimit-remaining-requests': '1',
        'x-ratelimit-reset-requests': '60s',
      });
      expect(si.getInterval()).toBeLessThanOrEqual(10_000);
    });

    it('floors interval at minIntervalMs', () => {
      const si = new SmartInterval({
        mode: 'cloud',
        targetRpm: 60,
        minIntervalMs: 1_500,
      });
      // Plenty of capacity
      si.recordResponse({
        'x-ratelimit-limit-requests': '6000',
        'x-ratelimit-remaining-requests': '5999',
        'x-ratelimit-reset-requests': '60s',
      });
      expect(si.getInterval()).toBeGreaterThanOrEqual(1_500);
    });

    it('default minIntervalMs is 0 in local mode and >0 in cloud', () => {
      expect(new SmartInterval({ mode: 'local' }).getInterval()).toBe(0);
      expect(new SmartInterval({ mode: 'cloud', targetRpm: 60 }).getInterval()).toBeGreaterThan(0);
    });
  });

  // ── recordRequest tracking ─────────────────────────────────────

  describe('recordRequest()', () => {
    it('tracks request count for diagnostics', () => {
      const si = new SmartInterval({ mode: 'cloud', targetRpm: 60 });
      expect(si.getRequestCount()).toBe(0);
      si.recordRequest();
      si.recordRequest();
      expect(si.getRequestCount()).toBe(2);
    });

    it('reset() clears state and returns to base interval', () => {
      const si = new SmartInterval({ mode: 'cloud', targetRpm: 60 });
      si.recordResponse({
        'x-ratelimit-limit-requests': '60',
        'x-ratelimit-remaining-requests': '1',
        'x-ratelimit-reset-requests': '60s',
      });
      const tight = si.getInterval();
      expect(tight).toBeGreaterThan(1000);

      si.reset();
      expect(si.getInterval()).toBe(1000);
      expect(si.getRequestCount()).toBe(0);
    });
  });

  // ── Acceptance ─────────────────────────────────────────────────

  describe('acceptance: 可正确解析响应头并调整间隔', () => {
    it('local mode: always returns 0', () => {
      const si = new SmartInterval({ mode: 'local' });
      expect(si.getInterval()).toBe(0);
      si.recordResponse({ 'x-ratelimit-remaining-requests': '0' });
      expect(si.getInterval()).toBe(0);
    });

    it('cloud mode: parses headers and adjusts interval to honor remaining capacity', () => {
      const si = new SmartInterval({ mode: 'cloud', targetRpm: 60 });
      const baseline = si.getInterval(); // 1000ms

      const headers: RateLimitHeaders = {
        'x-ratelimit-limit-requests': '60',
        'x-ratelimit-remaining-requests': '5',
        'x-ratelimit-reset-requests': '50s',
      };
      si.recordResponse(headers);

      // 5 requests in 50s → 10000ms each, must be >= baseline
      const adjusted = si.getInterval();
      expect(adjusted).toBeGreaterThan(baseline);
      expect(adjusted).toBeGreaterThanOrEqual(8_000);
    });
  });
});
