import { describe, it, expect, vi } from 'vitest';
import { SummaryWindowBuilder } from './summary-window-builder';
import type { StateManager } from '../state/manager';
import type { ChapterSummaryRecord } from '../models/state';

function createMockStateManager(options: {
  summaries?: ChapterSummaryRecord[];
  arcSummaries?: Record<string, string>;
}): StateManager {
  const archive = {
    bookId: 'book-001',
    summaries: options.summaries ?? [],
    arcSummaries: options.arcSummaries ?? {},
    lastUpdated: new Date().toISOString(),
  };

  return {
    readChapterSummaries: vi.fn().mockReturnValue(archive),
    getArcSummary: vi.fn((bookId: string, blockKey: string) => {
      return archive.arcSummaries[blockKey] ?? null;
    }),
  } as unknown as StateManager;
}

function makeSummary(chapter: number, brief: string, cliffhanger?: string): ChapterSummaryRecord {
  return {
    chapter,
    briefSummary: brief,
    detailedSummary: `详细：${brief}`,
    keyEvents: ['事件'],
    stateChanges: null,
    emotionalArc: null,
    cliffhanger: cliffhanger ?? null,
    hookImpact: null,
    consistencyScore: 80,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

describe('SummaryWindowBuilder', () => {
  const bookId = 'book-001';

  // ── Edge cases ────────────────────────────────────────────

  describe('edge cases', () => {
    it('returns empty string for chapter 1', () => {
      const sm = createMockStateManager({});
      const result = SummaryWindowBuilder.buildContextWindow(bookId, 1, sm);
      expect(result).toBe('');
    });

    it('returns empty string when no summaries exist', () => {
      const sm = createMockStateManager({ summaries: [] });
      const result = SummaryWindowBuilder.buildContextWindow(bookId, 5, sm);
      expect(result).toBe('');
    });
  });

  // ── Recent window only ────────────────────────────────────

  describe('recent window', () => {
    it('includes only recent chapters within depth', () => {
      const sm = createMockStateManager({
        summaries: [
          makeSummary(1, '开篇'),
          makeSummary(2, '入门', '悬念A'),
          makeSummary(3, '修炼', '悬念B'),
          makeSummary(4, '突破', '悬念C'),
        ],
      });

      const result = SummaryWindowBuilder.buildContextWindow(bookId, 5, sm);
      expect(result).toContain('## 最近章节进展');
      expect(result).toContain('第2章：入门 [钩子：悬念A]');
      expect(result).toContain('第3章：修炼 [钩子：悬念B]');
      expect(result).toContain('第4章：突破 [钩子：悬念C]');
      expect(result).not.toContain('第1章');
    });

    it('does not include chapters >= current chapter', () => {
      const sm = createMockStateManager({
        summaries: [makeSummary(4, '突破'), makeSummary(5, '当前章')],
      });

      const result = SummaryWindowBuilder.buildContextWindow(bookId, 5, sm);
      expect(result).toContain('第4章：突破');
      expect(result).not.toContain('第5章');
    });
  });

  // ── Middle window ─────────────────────────────────────────

  describe('middle window', () => {
    it('includes middle chapters grouped by 3', () => {
      const sm = createMockStateManager({
        summaries: Array.from({ length: 9 }, (_, i) => makeSummary(i + 1, `第${i + 1}章概要`)),
      });

      const result = SummaryWindowBuilder.buildContextWindow(bookId, 10, sm);
      expect(result).toContain('## 最近章节进展');
      // recent: 7,8,9
      expect(result).toContain('第7章');
      expect(result).toContain('第8章');
      expect(result).toContain('第9章');

      expect(result).toContain('## 近期情节线');
      // middle: 1-6 (since recent=3, middleDepth=10, current=10)
      // grouped: [1,2,3], [4,5,6]
      expect(result).toContain('第1-3章');
      expect(result).toContain('第4-6章');
    });

    it('does not overlap with recent window', () => {
      const sm = createMockStateManager({
        summaries: Array.from({ length: 10 }, (_, i) => makeSummary(i + 1, `第${i + 1}章概要`)),
      });

      const result = SummaryWindowBuilder.buildContextWindow(bookId, 10, sm);
      // recent: 7,8,9
      // middle: 1-6 (should NOT include 7)
      const middleSection = result.split('## 近期情节线')[1]?.split('##')[0] ?? '';
      expect(middleSection).not.toContain('第7章');
      expect(middleSection).not.toContain('第8章');
      expect(middleSection).not.toContain('第9章');
    });

    it('respects custom config depths', () => {
      const sm = createMockStateManager({
        summaries: Array.from({ length: 20 }, (_, i) => makeSummary(i + 1, `第${i + 1}章概要`)),
      });

      const result = SummaryWindowBuilder.buildContextWindow(bookId, 20, sm, {
        recentDepth: 2,
        middleDepth: 5,
      });

      // recent: 18,19
      expect(result).toContain('第18章');
      expect(result).toContain('第19章');
      // 17 应在 middle，不在 recent
      expect(result).toContain('第17章');

      // middle: 15-17 (recentDepth=2, middleDepth=5)
      const middleSection = result.split('## 近期情节线')[1]?.split('##')[0] ?? '';
      expect(middleSection).toContain('第15章');
      expect(middleSection).toContain('第16章');
      expect(middleSection).toContain('第17章');
      // should not include 14 or below
      expect(middleSection).not.toContain('第14章');
    });
  });

  // ── Far window (arc summaries) ────────────────────────────

  describe('far window', () => {
    it('includes arc summaries for blocks before middle depth', () => {
      const sm = createMockStateManager({
        summaries: Array.from({ length: 21 }, (_, i) => makeSummary(i + 1, `第${i + 1}章概要`)),
        arcSummaries: {
          '1-10': '第一卷：林风入门修仙，揭开玉佩秘密',
        },
      });

      const result = SummaryWindowBuilder.buildContextWindow(bookId, 22, sm);
      expect(result).toContain('## 前期卷轴概要');
      expect(result).toContain('第一卷：林风入门修仙，揭开玉佩秘密');
    });

    it('skips arc blocks without summaries', () => {
      const sm = createMockStateManager({
        summaries: Array.from({ length: 25 }, (_, i) => makeSummary(i + 1, `第${i + 1}章概要`)),
        arcSummaries: {
          '1-10': '第一卷概要',
          // 11-20 missing
        },
      });

      const result = SummaryWindowBuilder.buildContextWindow(bookId, 26, sm);
      expect(result).toContain('第1-10章概要：第一卷概要');
      expect(result).not.toContain('第11-20章');
    });

    it('does not include far window when middleDepth covers all', () => {
      const sm = createMockStateManager({
        summaries: [makeSummary(1, '开篇'), makeSummary(2, '入门'), makeSummary(3, '修炼')],
      });

      const result = SummaryWindowBuilder.buildContextWindow(bookId, 4, sm);
      expect(result).not.toContain('## 前期卷轴概要');
    });
  });

  // ── Full integration ──────────────────────────────────────

  describe('full integration', () => {
    it('produces all three tiers for a long book', () => {
      const sm = createMockStateManager({
        summaries: Array.from({ length: 30 }, (_, i) =>
          makeSummary(i + 1, `第${i + 1}章概要`, `钩子${i + 1}`),
        ),
        arcSummaries: {
          '1-10': '第一卷概要',
          '11-20': '第二卷概要',
        },
      });

      const result = SummaryWindowBuilder.buildContextWindow(bookId, 31, sm);

      // All three tiers present
      expect(result).toContain('## 最近章节进展');
      expect(result).toContain('## 近期情节线');
      expect(result).toContain('## 前期卷轴概要');

      // Recent: 28,29,30
      expect(result).toContain('第28章');
      expect(result).toContain('第29章');
      expect(result).toContain('第30章');

      // Middle: 21-27 grouped
      expect(result).toContain('第21章');
      expect(result).toContain('第27章');

      // Far: 1-10, 11-20
      expect(result).toContain('第1-10章概要：第一卷概要');
      expect(result).toContain('第11-20章概要：第二卷概要');
    });
  });

  // ── estimateTokenLength ───────────────────────────────────

  describe('estimateTokenLength', () => {
    it('estimates Chinese text', () => {
      const text = '林风修炼三月，触发玉佩。';
      const estimate = SummaryWindowBuilder.estimateTokenLength(text);
      // 12 Chinese chars + 0 words ≈ 6 tokens
      expect(estimate).toBeGreaterThan(0);
    });

    it('estimates mixed Chinese and English', () => {
      const text = '林风 said hello to 青云门';
      const estimate = SummaryWindowBuilder.estimateTokenLength(text);
      expect(estimate).toBeGreaterThan(0);
    });

    it('returns 0 for empty string', () => {
      expect(SummaryWindowBuilder.estimateTokenLength('')).toBe(0);
    });
  });
});
