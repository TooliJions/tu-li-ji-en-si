import { describe, it, expect } from 'vitest';
import {
  EmotionalArcTracker,
  type EmotionalSnapshot,
  type EmotionArcReport,
  type EmotionBreakAlert,
} from './emotional-arc-tracker';

describe('EmotionalArcTracker', () => {
  const tracker = new EmotionalArcTracker();

  const makeSnapshot = (overrides: Partial<EmotionalSnapshot> = {}): EmotionalSnapshot => ({
    chapterNumber: 1,
    character: '林晨',
    emotions: { joy: 0.7, anger: 0.1, sadness: 0.1, fear: 0.1 },
    timestamp: '2026-04-19T00:00:00.000Z',
    ...overrides,
  });

  it('tracks emotion changes across chapters', () => {
    const snapshots: EmotionalSnapshot[] = [
      makeSnapshot({
        chapterNumber: 1,
        emotions: { joy: 0.7, anger: 0.1, sadness: 0.1, fear: 0.1 },
      }),
      makeSnapshot({
        chapterNumber: 2,
        emotions: { joy: 0.5, anger: 0.2, sadness: 0.2, fear: 0.1 },
      }),
      makeSnapshot({
        chapterNumber: 3,
        emotions: { joy: 0.2, anger: 0.3, sadness: 0.4, fear: 0.1 },
      }),
    ];

    const report: EmotionArcReport = tracker.analyze(snapshots);

    expect(report.characters).toHaveLength(1);
    expect(report.characters[0].name).toBe('林晨');
    expect(report.characters[0].chapters).toHaveLength(3);
    expect(report.characters[0].chapters[0].emotions.joy).toBe(0.7);
    expect(report.characters[0].chapters[2].emotions.sadness).toBe(0.4);
  });

  it('detects emotional arc breaks (sudden shifts)', () => {
    const snapshots: EmotionalSnapshot[] = [
      makeSnapshot({
        chapterNumber: 1,
        emotions: { joy: 0.8, anger: 0.05, sadness: 0.1, fear: 0.05 },
      }),
      makeSnapshot({
        chapterNumber: 2,
        emotions: { joy: 0.1, anger: 0.8, sadness: 0.05, fear: 0.05 },
      }),
    ];

    const report: EmotionArcReport = tracker.analyze(snapshots);

    expect(report.alerts.length).toBeGreaterThanOrEqual(1);
    const breakAlert = report.alerts.find((a) => a.type === 'sudden_shift');
    expect(breakAlert).toBeTruthy();
    expect(breakAlert?.character).toBe('林晨');
    expect(breakAlert?.chapterNumber).toBe(2);
  });

  it('detects flat-line emotions (no variation)', () => {
    const flatEmotions = { joy: 0.5, anger: 0.5, sadness: 0.0, fear: 0.0 };
    const snapshots: EmotionalSnapshot[] = [
      makeSnapshot({ chapterNumber: 1, emotions: flatEmotions }),
      makeSnapshot({ chapterNumber: 2, emotions: flatEmotions }),
      makeSnapshot({ chapterNumber: 3, emotions: flatEmotions }),
      makeSnapshot({ chapterNumber: 4, emotions: flatEmotions }),
      makeSnapshot({ chapterNumber: 5, emotions: flatEmotions }),
    ];

    const report: EmotionArcReport = tracker.analyze(snapshots);

    const flatAlert = report.alerts.find((a) => a.type === 'flat_line');
    expect(flatAlert).toBeTruthy();
    expect(flatAlert?.character).toBe('林晨');
  });

  it('tracks multiple characters independently', () => {
    const snapshots: EmotionalSnapshot[] = [
      makeSnapshot({
        chapterNumber: 1,
        character: '林晨',
        emotions: { joy: 0.8, anger: 0.1, sadness: 0.05, fear: 0.05 },
      }),
      makeSnapshot({
        chapterNumber: 1,
        character: '苏小雨',
        emotions: { joy: 0.2, anger: 0.1, sadness: 0.6, fear: 0.1 },
      }),
      makeSnapshot({
        chapterNumber: 2,
        character: '林晨',
        emotions: { joy: 0.6, anger: 0.2, sadness: 0.1, fear: 0.1 },
      }),
      makeSnapshot({
        chapterNumber: 2,
        character: '苏小雨',
        emotions: { joy: 0.5, anger: 0.1, sadness: 0.3, fear: 0.1 },
      }),
    ];

    const report: EmotionArcReport = tracker.analyze(snapshots);

    expect(report.characters).toHaveLength(2);
    const linchen = report.characters.find((c) => c.name === '林晨')!;
    const xiaoyu = report.characters.find((c) => c.name === '苏小雨')!;
    expect(linchen.chapters).toHaveLength(2);
    expect(xiaoyu.chapters).toHaveLength(2);
  });

  it('returns empty report for no snapshots', () => {
    const report: EmotionArcReport = tracker.analyze([]);
    expect(report.characters).toHaveLength(0);
    expect(report.alerts).toHaveLength(0);
  });

  it('does not alert with sufficient emotional variation', () => {
    const snapshots: EmotionalSnapshot[] = [
      makeSnapshot({
        chapterNumber: 1,
        emotions: { joy: 0.6, anger: 0.1, sadness: 0.2, fear: 0.1 },
      }),
      makeSnapshot({
        chapterNumber: 2,
        emotions: { joy: 0.5, anger: 0.2, sadness: 0.2, fear: 0.1 },
      }),
      makeSnapshot({
        chapterNumber: 3,
        emotions: { joy: 0.4, anger: 0.3, sadness: 0.2, fear: 0.1 },
      }),
    ];

    const report: EmotionArcReport = tracker.analyze(snapshots);

    expect(report.alerts).toHaveLength(0);
  });

  it('detects extreme emotion values', () => {
    const snapshots: EmotionalSnapshot[] = [
      makeSnapshot({
        chapterNumber: 1,
        emotions: { joy: 0.0, anger: 0.95, sadness: 0.03, fear: 0.02 },
      }),
    ];

    const report: EmotionArcReport = tracker.analyze(snapshots);

    const extremeAlert = report.alerts.find((a) => a.type === 'extreme_emotion');
    expect(extremeAlert).toBeTruthy();
    expect(extremeAlert?.character).toBe('林晨');
  });

  it('calculates emotion delta between consecutive chapters', () => {
    const snapshots: EmotionalSnapshot[] = [
      makeSnapshot({
        chapterNumber: 1,
        emotions: { joy: 0.5, anger: 0.3, sadness: 0.1, fear: 0.1 },
      }),
      makeSnapshot({
        chapterNumber: 2,
        emotions: { joy: 0.3, anger: 0.5, sadness: 0.1, fear: 0.1 },
      }),
    ];

    const report: EmotionArcReport = tracker.analyze(snapshots);

    const deltas = report.characters[0].chapters[1].deltas;
    expect(deltas).toBeDefined();
    expect(deltas!.joy).toBe(-0.2);
    expect(deltas!.anger).toBe(0.2);
  });

  it('generates per-chapter emotion summary', () => {
    const snapshots: EmotionalSnapshot[] = [
      makeSnapshot({
        chapterNumber: 1,
        emotions: { joy: 0.8, anger: 0.05, sadness: 0.1, fear: 0.05 },
      }),
    ];

    const report: EmotionArcReport = tracker.analyze(snapshots);
    const chapter = report.characters[0].chapters[0];

    expect(chapter.dominantEmotion).toBe('joy');
    expect(chapter.summary).toBeTruthy();
  });

  it('handles missing emotion keys gracefully', () => {
    const snapshots: EmotionalSnapshot[] = [
      makeSnapshot({ chapterNumber: 1, emotions: { joy: 0.5 } }),
      makeSnapshot({ chapterNumber: 2, emotions: { joy: 0.3, anger: 0.7 } }),
    ];

    const report: EmotionArcReport = tracker.analyze(snapshots);

    expect(report.characters[0].chapters).toHaveLength(2);
    // Missing emotions default to 0
    expect(report.characters[0].chapters[0].emotions.anger).toBe(0);
  });
});
