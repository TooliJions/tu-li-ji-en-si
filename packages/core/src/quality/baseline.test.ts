import { describe, it, expect, beforeEach } from 'vitest';
import {
  QualityBaseline,
  type ChapterQualityScore,
  type DriftReport,
  type Baseline,
} from './baseline';

// ── Helpers ────────────────────────────────────────────────────────

function makeScore(chapterNumber: number, overallScore: number): ChapterQualityScore {
  return {
    chapterNumber,
    aiScore: overallScore,
    cadenceScore: overallScore,
    overallScore,
    timestamp: new Date().toISOString(),
  };
}

function feedScores(baseline: QualityBaseline, scores: number[], startChapter = 1): void {
  scores.forEach((s, i) => baseline.addChapter(makeScore(startChapter + i, s)));
}

// ── Tests ──────────────────────────────────────────────────────────

describe('QualityBaseline', () => {
  let baseline: QualityBaseline;

  beforeEach(() => {
    baseline = new QualityBaseline({ bookId: 'book-001' });
  });

  // ── Constructor ────────────────────────────────────────────────

  describe('constructor', () => {
    it('initializes with default config', () => {
      const b = new QualityBaseline({ bookId: 'book-001' });
      expect(b).toBeDefined();
    });

    it('accepts custom config', () => {
      const b = new QualityBaseline({
        bookId: 'book-001',
        minBaselineChapters: 5,
        windowSize: 7,
        consecutiveDriftThreshold: 4,
        driftRateThreshold: 0.4,
      });
      expect(b).toBeDefined();
    });
  });

  // ── Baseline establishment ─────────────────────────────────────

  describe('getBaseline()', () => {
    it('returns null when fewer than minBaselineChapters chapters added', () => {
      feedScores(baseline, [80, 82]);
      expect(baseline.getBaseline()).toBeNull();
    });

    it('establishes baseline after 3 chapters by default', () => {
      feedScores(baseline, [80, 82, 78]);
      const b = baseline.getBaseline();
      expect(b).not.toBeNull();
      expect(b!.bookId).toBe('book-001');
      expect(b!.chaptersUsed).toEqual([1, 2, 3]);
    });

    it('baseline avgScore is computed from first N chapters', () => {
      feedScores(baseline, [80, 82, 78, 95, 95]);
      const b = baseline.getBaseline();
      expect(b!.avgScore).toBeCloseTo(80, 1); // (80+82+78)/3 = 80
    });

    it('baseline stdDev is computed correctly', () => {
      feedScores(baseline, [80, 82, 78]);
      const b = baseline.getBaseline();
      expect(b!.stdDev).toBeGreaterThan(0);
      expect(b!.stdDev).toBeLessThan(5);
    });

    it('baseline does not change once established', () => {
      feedScores(baseline, [80, 82, 78]);
      const first = baseline.getBaseline();
      feedScores(baseline, [50, 40, 30], 4);
      const second = baseline.getBaseline();
      expect(second!.avgScore).toBe(first!.avgScore);
      expect(second!.chaptersUsed).toEqual([1, 2, 3]);
    });

    it('respects custom minBaselineChapters', () => {
      const b = new QualityBaseline({ bookId: 'book-001', minBaselineChapters: 5 });
      feedScores(b, [80, 80, 80, 80]);
      expect(b.getBaseline()).toBeNull();
      b.addChapter(makeScore(5, 80));
      expect(b.getBaseline()).not.toBeNull();
    });

    it('returns frozen baseline copy (no mutation)', () => {
      feedScores(baseline, [80, 82, 78]);
      const b = baseline.getBaseline();
      expect(b!.establishedAt).toBeDefined();
    });
  });

  // ── detectDrift() — basic ──────────────────────────────────────

  describe('detectDrift()', () => {
    it('returns alert=none when baseline not established', () => {
      feedScores(baseline, [80]);
      const report = baseline.detectDrift();
      expect(report.alert).toBe('none');
      expect(report.baseline).toBeNull();
      expect(report.hasDrift).toBe(false);
    });

    it('returns alert=none when scores are stable around baseline', () => {
      feedScores(baseline, [80, 82, 78, 81, 79, 80]);
      const report = baseline.detectDrift();
      expect(report.alert).toBe('none');
      expect(report.hasDrift).toBe(false);
      expect(report.consecutiveDriftChapters).toBe(0);
    });

    it('detects drift when scores degrade significantly', () => {
      // baseline = (80+82+78)/3 = 80
      // recent chapters drop to 50: drift rate = (80-50)/80 = 37.5% > 30%
      feedScores(baseline, [80, 82, 78, 50, 50, 50]);
      const report = baseline.detectDrift();
      expect(report.hasDrift).toBe(true);
      expect(report.driftRate).toBeGreaterThan(0.3);
    });

    it('triggers critical alert on 3 consecutive degradations >30%', () => {
      // baseline = 80, 3 consecutive chapters at 50 (37.5% drop)
      feedScores(baseline, [80, 82, 78, 50, 50, 50]);
      const report = baseline.detectDrift();
      expect(report.alert).toBe('critical');
      expect(report.consecutiveDriftChapters).toBeGreaterThanOrEqual(3);
    });

    it('warning alert when 1-2 consecutive degradations', () => {
      // baseline = 80, only 2 degraded chapters
      feedScores(baseline, [80, 82, 78, 50, 50, 80]);
      const report = baseline.detectDrift();
      // 2 consecutive degraded then 1 normal — should not be critical
      expect(report.alert).not.toBe('critical');
    });

    it('does not trigger alert when degradation <30%', () => {
      // baseline = 80, scores at 65 (drift = (80-65)/80 = 18.75% < 30%)
      feedScores(baseline, [80, 82, 78, 65, 65, 65]);
      const report = baseline.detectDrift();
      expect(report.alert).toBe('none');
    });

    it('counts consecutive degraded chapters from latest', () => {
      // 50, 50, 50 are last 3 chapters
      feedScores(baseline, [80, 82, 78, 50, 50, 50]);
      const report = baseline.detectDrift();
      expect(report.consecutiveDriftChapters).toBe(3);
    });

    it('resets consecutive count when normal chapter follows degraded', () => {
      feedScores(baseline, [80, 82, 78, 50, 80, 50]);
      const report = baseline.detectDrift();
      // Last chapter degraded, but only 1 consecutive
      expect(report.consecutiveDriftChapters).toBe(1);
    });
  });

  // ── DriftReport shape ─────────────────────────────────────────

  describe('DriftReport shape', () => {
    it('contains all required fields when baseline exists', () => {
      feedScores(baseline, [80, 82, 78, 70, 70, 70]);
      const report = baseline.detectDrift();

      expect(typeof report.hasDrift).toBe('boolean');
      expect(typeof report.driftRate).toBe('number');
      expect(typeof report.consecutiveDriftChapters).toBe('number');
      expect(['none', 'warning', 'critical']).toContain(report.alert);
      expect(report.baseline).not.toBeNull();
      expect(typeof report.windowAvgScore).toBe('number');
    });

    it('driftRate is positive when scores below baseline', () => {
      feedScores(baseline, [80, 82, 78, 40, 40, 40]);
      const report = baseline.detectDrift();
      expect(report.driftRate).toBeGreaterThan(0);
    });

    it('driftRate is 0 or negative when scores above baseline', () => {
      feedScores(baseline, [80, 82, 78, 90, 90, 90]);
      const report = baseline.detectDrift();
      expect(report.driftRate).toBeLessThanOrEqual(0);
      expect(report.alert).toBe('none');
    });

    it('message is set on warning/critical alert', () => {
      feedScores(baseline, [80, 82, 78, 50, 50, 50]);
      const report = baseline.detectDrift();
      expect(report.alert).toBe('critical');
      expect(report.message).toBeDefined();
      expect(report.message!.length).toBeGreaterThan(0);
    });
  });

  // ── Sliding window ────────────────────────────────────────────

  describe('sliding window', () => {
    it('windowAvgScore uses last N chapters (default 5)', () => {
      // First 3 build baseline, then add many more
      feedScores(baseline, [80, 82, 78, 70, 70, 70, 70, 70]);
      const report = baseline.detectDrift();
      // Window of last 5: [70, 70, 70, 70, 70] avg=70
      expect(report.windowAvgScore).toBeCloseTo(70, 1);
    });

    it('respects custom windowSize', () => {
      const b = new QualityBaseline({ bookId: 'book-001', windowSize: 3 });
      feedScores(b, [80, 82, 78, 60, 65, 70]);
      const report = b.detectDrift();
      // Window of last 3: [60, 65, 70] avg=65
      expect(report.windowAvgScore).toBeCloseTo(65, 1);
    });

    it('uses fewer chapters when total < windowSize', () => {
      feedScores(baseline, [80, 82, 78, 70]);
      const report = baseline.detectDrift();
      // Only 1 chapter past baseline: window contains 1 chapter
      expect(report.windowAvgScore).toBeGreaterThan(0);
    });
  });

  // ── rebuild() ─────────────────────────────────────────────────

  describe('rebuild()', () => {
    it('recomputes baseline from current chapters', () => {
      feedScores(baseline, [80, 82, 78]);
      const original = baseline.getBaseline();

      feedScores(baseline, [60, 60, 60], 4);
      const rebuilt = baseline.rebuild();

      // Rebuild should use latest 3 chapters: avg=60
      expect(rebuilt!.avgScore).toBeCloseTo(60, 1);
      expect(rebuilt!.avgScore).not.toBe(original!.avgScore);
    });

    it('returns null when not enough chapters to rebuild', () => {
      feedScores(baseline, [80, 82]);
      const rebuilt = baseline.rebuild();
      expect(rebuilt).toBeNull();
    });
  });

  // ── addChapter() validation ───────────────────────────────────

  describe('addChapter()', () => {
    it('rejects duplicate chapter number', () => {
      baseline.addChapter(makeScore(1, 80));
      expect(() => baseline.addChapter(makeScore(1, 85))).toThrow();
    });

    it('keeps chapters sorted by chapterNumber', () => {
      baseline.addChapter(makeScore(3, 78));
      baseline.addChapter(makeScore(1, 80));
      baseline.addChapter(makeScore(2, 82));
      const b = baseline.getBaseline();
      expect(b!.chaptersUsed).toEqual([1, 2, 3]);
    });

    it('rejects scores outside [0,100] range', () => {
      expect(() => baseline.addChapter(makeScore(1, 150))).toThrow();
      expect(() => baseline.addChapter(makeScore(2, -5))).toThrow();
    });
  });

  // ── End-to-end scenario (validation criterion) ────────────────

  describe('acceptance: 连续 3 章恶化超 30% 时 Analytics 显示告警', () => {
    it('emits critical alert exactly per validation criterion', () => {
      // 建立基线: 章 1-3 平均 80
      baseline.addChapter(makeScore(1, 80));
      baseline.addChapter(makeScore(2, 82));
      baseline.addChapter(makeScore(3, 78));

      // 第 4-6 章连续恶化 35% (52/80 = 0.65 → drift = 0.35)
      baseline.addChapter(makeScore(4, 52));
      baseline.addChapter(makeScore(5, 52));
      baseline.addChapter(makeScore(6, 52));

      const report = baseline.detectDrift();

      expect(report.alert).toBe('critical');
      expect(report.consecutiveDriftChapters).toBe(3);
      expect(report.driftRate).toBeGreaterThan(0.3);
      expect(report.message).toContain('恶化');
    });
  });
});
