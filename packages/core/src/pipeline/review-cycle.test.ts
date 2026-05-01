import { describe, it, expect } from 'vitest';
import { ReviewCycle } from './review-cycle';

describe('ReviewCycle', () => {
  // ── computeOverallScore ─────────────────────────────────────────

  describe('computeOverallScore', () => {
    it('computes equal-weighted score by default', () => {
      const cycle = new ReviewCycle();

      // auditScore=80, aiTrace=0.2 → 80*0.5 + (1-0.2)*100*0.5 = 40 + 40 = 80
      expect(cycle.computeOverallScore(80, 0.2)).toBe(80);
    });

    it('rounds to nearest integer', () => {
      const cycle = new ReviewCycle();

      // auditScore=75, aiTrace=0.15 → 75*0.5 + 85*0.5 = 37.5 + 42.5 = 80
      expect(cycle.computeOverallScore(75, 0.15)).toBe(80);
    });

    it('handles perfect scores', () => {
      const cycle = new ReviewCycle();

      expect(cycle.computeOverallScore(100, 0)).toBe(100);
    });

    it('handles worst scores', () => {
      const cycle = new ReviewCycle();

      // auditScore=0, aiTrace=1 → 0*0.5 + 0*0.5 = 0
      expect(cycle.computeOverallScore(0, 1)).toBe(0);
    });

    it('respects custom aiTraceWeight', () => {
      const cycle = new ReviewCycle({ aiTraceWeight: 0.3 });

      // auditScore=80, aiTrace=0.2 → 80*0.7 + 80*0.3 = 56 + 24 = 80
      expect(cycle.computeOverallScore(80, 0.2)).toBe(80);
    });

    it('with weight=0, ignores ai trace', () => {
      const cycle = new ReviewCycle({ aiTraceWeight: 0 });

      expect(cycle.computeOverallScore(70, 0.9)).toBe(70);
    });

    it('with weight=1, only uses ai trace', () => {
      const cycle = new ReviewCycle({ aiTraceWeight: 1 });

      // (1 - 0.1) * 100 = 90
      expect(cycle.computeOverallScore(50, 0.1)).toBe(90);
    });
  });

  // ── decideStatus ────────────────────────────────────────────────

  describe('decideStatus', () => {
    it('returns pass for score >= 80', () => {
      const cycle = new ReviewCycle();

      expect(cycle.decideStatus(80)).toBe('pass');
      expect(cycle.decideStatus(100)).toBe('pass');
    });

    it('returns warning for score 60-79', () => {
      const cycle = new ReviewCycle();

      expect(cycle.decideStatus(60)).toBe('warning');
      expect(cycle.decideStatus(79)).toBe('warning');
    });

    it('returns fail for score < 60', () => {
      const cycle = new ReviewCycle();

      expect(cycle.decideStatus(59)).toBe('fail');
      expect(cycle.decideStatus(0)).toBe('fail');
    });

    it('respects custom thresholds', () => {
      const cycle = new ReviewCycle({ passThreshold: 90, warningThreshold: 70 });

      expect(cycle.decideStatus(90)).toBe('pass');
      expect(cycle.decideStatus(89)).toBe('warning');
      expect(cycle.decideStatus(70)).toBe('warning');
      expect(cycle.decideStatus(69)).toBe('fail');
    });
  });

  // ── decide ──────────────────────────────────────────────────────

  describe('decide', () => {
    it('returns complete decision object', () => {
      const cycle = new ReviewCycle();

      const result = cycle.decide(80, 0.2);

      expect(result.overallScore).toBe(80);
      expect(result.overallStatus).toBe('pass');
      expect(result.aiTraceScore).toBe(0.2);
    });

    it('correctly identifies warning status', () => {
      const cycle = new ReviewCycle();

      // auditScore=50, aiTrace=0.4 → 50*0.5 + 60*0.5 = 55 → fail
      const result = cycle.decide(50, 0.4);
      expect(result.overallStatus).toBe('fail');
    });
  });

  // ── needsRevision ───────────────────────────────────────────────

  describe('needsRevision', () => {
    it('returns false for pass', () => {
      const cycle = new ReviewCycle();

      expect(
        cycle.needsRevision({ overallScore: 80, overallStatus: 'pass', aiTraceScore: 0 }),
      ).toBe(false);
    });

    it('returns true for warning', () => {
      const cycle = new ReviewCycle();

      expect(
        cycle.needsRevision({ overallScore: 60, overallStatus: 'warning', aiTraceScore: 0 }),
      ).toBe(true);
    });

    it('returns true for fail', () => {
      const cycle = new ReviewCycle();

      expect(
        cycle.needsRevision({ overallScore: 50, overallStatus: 'fail', aiTraceScore: 0 }),
      ).toBe(true);
    });
  });

  // ── buildFallbackResult ─────────────────────────────────────────

  describe('buildFallbackResult', () => {
    it('builds a fail result with error message', () => {
      const result = ReviewCycle.buildFallbackResult('book-1', 3, 'LLM timeout');

      expect(result.success).toBe(false);
      expect(result.bookId).toBe('book-1');
      expect(result.chapterNumber).toBe(3);
      expect(result.overallScore).toBe(0);
      expect(result.overallStatus).toBe('fail');
      expect(result.issues).toEqual([]);
      expect(result.summary).toContain('LLM timeout');
    });
  });
});
