import { describe, it, expect, beforeEach } from 'vitest';
import {
  CrossChapterRepetitionDetector,
  type CrossChapterInput,
  type CrossChapterRepetitionReport,
  type RepetitionMatch,
} from './cross-chapter-repetition';

// ── Helpers ────────────────────────────────────────────────────────

function makeChapter(content: string, chapterNumber: number) {
  return { content, chapterNumber };
}

const SAMPLE_PREV_CH1 = `他推开那扇沉重的铁门，走进了昏暗的房间。
房间里弥漫着一股陈旧的气息，空气中夹杂着淡淡的霉味。
桌上放着一盏油灯，灯光摇曳不定，映照出墙上斑驳的影子。
他在椅子上坐了下来，翻开了那本厚厚的日记。`;

const SAMPLE_PREV_CH2 = `清晨的阳光透过窗帘的缝隙照了进来，将整个房间分成了明与暗两个世界。
她轻手轻脚地走进厨房，不想打扰还在睡觉的家人。
咖啡机发出轻微的嗡嗡声，香气渐渐弥漫开来。
她端着咖啡站在窗前，望着外面安静的街道。`;

const UNIQUE_CONTENT = `山顶的积雪在阳光下闪闪发光，远处的村庄笼罩在晨雾之中。
猎人背着弓箭穿越密林，脚下的枯叶发出细微的响声。
溪水潺潺流过石缝，在阳光下泛起粼粼波光。
一只鹿突然从灌木丛中跳出，随即消失在林间的阴影里。`;

// ── Tests ──────────────────────────────────────────────────────────

describe('CrossChapterRepetitionDetector', () => {
  let detector: CrossChapterRepetitionDetector;

  beforeEach(() => {
    detector = new CrossChapterRepetitionDetector();
  });

  // ── detect() basics ───────────────────────────────────────────

  describe('detect', () => {
    it('returns a complete report', () => {
      const input: CrossChapterInput = {
        currentChapter: makeChapter(SAMPLE_PREV_CH1, 3),
        previousChapters: [makeChapter(SAMPLE_PREV_CH2, 2)],
      };
      const report = detector.detect(input);

      expect(report.chapterNumber).toBe(3);
      expect(report.timestamp).toBeDefined();
      expect(report.totalNgrams).toBeGreaterThan(0);
      expect(Array.isArray(report.repeatedPhrases)).toBe(true);
      expect(report.repetitionRate).toBeGreaterThanOrEqual(0);
      expect(report.repetitionRate).toBeLessThanOrEqual(100);
      expect(['none', 'low', 'medium', 'high']).toContain(report.severity);
    });

    it('returns severity=none and empty repeatedPhrases for fully unique content', () => {
      const input: CrossChapterInput = {
        currentChapter: makeChapter(UNIQUE_CONTENT, 5),
        previousChapters: [makeChapter(SAMPLE_PREV_CH1, 3), makeChapter(SAMPLE_PREV_CH2, 4)],
      };
      const report = detector.detect(input);

      expect(report.repeatedPhrases).toHaveLength(0);
      expect(report.severity).toBe('none');
      expect(report.repetitionRate).toBe(0);
    });

    it('detects repeated phrases when current chapter copies previous content', () => {
      const copiedContent = SAMPLE_PREV_CH1; // identical copy
      const input: CrossChapterInput = {
        currentChapter: makeChapter(copiedContent, 4),
        previousChapters: [makeChapter(SAMPLE_PREV_CH1, 3)],
      };
      const report = detector.detect(input);

      expect(report.repeatedPhrases.length).toBeGreaterThan(0);
      expect(report.repetitionRate).toBeGreaterThan(50);
      expect(['medium', 'high']).toContain(report.severity);
    });

    it('detects partial phrase repetition', () => {
      const partialRepeat = `他推开那扇沉重的铁门，走进了昏暗的房间。
全新的内容开始出现在这里，与前面的章节完全不同。
全新的描写让读者感到耳目一新，充满了新鲜感。`;

      const input: CrossChapterInput = {
        currentChapter: makeChapter(partialRepeat, 3),
        previousChapters: [makeChapter(SAMPLE_PREV_CH1, 2)],
      };
      const report = detector.detect(input);

      expect(report.repeatedPhrases.length).toBeGreaterThan(0);
      expect(report.repetitionRate).toBeGreaterThan(0);
      expect(report.repetitionRate).toBeLessThan(100);
    });

    it('works with empty previousChapters', () => {
      const input: CrossChapterInput = {
        currentChapter: makeChapter(SAMPLE_PREV_CH1, 1),
        previousChapters: [],
      };
      const report = detector.detect(input);

      expect(report.repeatedPhrases).toHaveLength(0);
      expect(report.severity).toBe('none');
    });

    it('handles empty current chapter content', () => {
      const input: CrossChapterInput = {
        currentChapter: makeChapter('', 3),
        previousChapters: [makeChapter(SAMPLE_PREV_CH1, 2)],
      };
      const report = detector.detect(input);

      expect(report.totalNgrams).toBe(0);
      expect(report.repeatedPhrases).toHaveLength(0);
      expect(report.severity).toBe('none');
    });

    it('handles content shorter than ngram size', () => {
      const input: CrossChapterInput = {
        currentChapter: makeChapter('短文本', 3),
        previousChapters: [makeChapter(SAMPLE_PREV_CH1, 2)],
      };
      const report = detector.detect(input);

      expect(report.totalNgrams).toBe(0);
      expect(report.repeatedPhrases).toHaveLength(0);
    });
  });

  // ── ngram extraction ──────────────────────────────────────────

  describe('ngram extraction', () => {
    it('uses 6-character ngrams by default', () => {
      const input: CrossChapterInput = {
        currentChapter: makeChapter('他推开那扇沉重的铁门走进了房间', 2),
        previousChapters: [],
      };
      const report = detector.detect(input);
      // "他推开那扇沉重的铁门走进了房间" = 15 chars → 15-6+1 = 10 ngrams
      expect(report.totalNgrams).toBe(10);
    });

    it('respects custom ngramSize', () => {
      const input: CrossChapterInput = {
        currentChapter: makeChapter('他推开那扇沉重的铁门走进了房间', 2),
        previousChapters: [],
        ngramSize: 4,
      };
      const report = detector.detect(input);
      // 15 chars → 15-4+1 = 12 ngrams
      expect(report.totalNgrams).toBe(12);
    });

    it('strips punctuation and whitespace before computing ngrams', () => {
      const withPunct = `他推开门，走进了房间。\n灯很亮。`;
      const noPunct = `他推开门走进了房间灯很亮`;

      const inputWith: CrossChapterInput = {
        currentChapter: makeChapter(withPunct, 2),
        previousChapters: [],
      };
      const inputNo: CrossChapterInput = {
        currentChapter: makeChapter(noPunct, 2),
        previousChapters: [],
      };

      const reportWith = detector.detect(inputWith);
      const reportNo = detector.detect(inputNo);

      expect(reportWith.totalNgrams).toBe(reportNo.totalNgrams);
    });
  });

  // ── RepetitionMatch shape ─────────────────────────────────────

  describe('RepetitionMatch shape', () => {
    it('each match contains phrase, currentPositions, and previousOccurrences', () => {
      const repeatedPhrase = '他推开那扇沉重的铁门';
      const currentContent = `${repeatedPhrase}，走进了新的房间。这是新内容，与之前完全不同的描述。`;
      const prevContent = `${repeatedPhrase}，走进了旧的房间。那里的布置十分简陋，家具都很陈旧。`;

      const input: CrossChapterInput = {
        currentChapter: makeChapter(currentContent, 3),
        previousChapters: [makeChapter(prevContent, 2)],
      };
      const report = detector.detect(input);

      expect(report.repeatedPhrases.length).toBeGreaterThan(0);

      const match = report.repeatedPhrases[0];
      expect(typeof match.phrase).toBe('string');
      expect(match.phrase.length).toBeGreaterThanOrEqual(6);
      expect(Array.isArray(match.currentPositions)).toBe(true);
      expect(match.currentPositions.length).toBeGreaterThan(0);
      expect(Array.isArray(match.previousOccurrences)).toBe(true);
      expect(match.previousOccurrences.length).toBeGreaterThan(0);

      const occ = match.previousOccurrences[0];
      expect(typeof occ.chapterNumber).toBe('number');
      expect(Array.isArray(occ.positions)).toBe(true);
    });

    it('records which previous chapter the phrase came from', () => {
      const sharedPhrase = '窗外下起了大雨雨水顺着玻璃';
      const currentContent = `${sharedPhrase}流了下来，今天的天气真的很糟糕。这是全新的故事情节内容。`;
      const ch1Content = `${sharedPhrase}流了下来，他静静地站在窗前沉思。这里是第一章的内容。`;
      const ch2Content = `今天天气晴朗，阳光明媚，没有任何雨水的踪迹。完全不同的内容在这里。`;

      const input: CrossChapterInput = {
        currentChapter: makeChapter(currentContent, 4),
        previousChapters: [makeChapter(ch1Content, 1), makeChapter(ch2Content, 2)],
      };
      const report = detector.detect(input);

      const matchWithCh1 = report.repeatedPhrases.find((m) =>
        m.previousOccurrences.some((o) => o.chapterNumber === 1)
      );
      expect(matchWithCh1).toBeDefined();
    });
  });

  // ── severity thresholds ───────────────────────────────────────

  describe('severity thresholds', () => {
    it('severity is none when repetitionRate is 0', () => {
      const input: CrossChapterInput = {
        currentChapter: makeChapter(UNIQUE_CONTENT, 5),
        previousChapters: [makeChapter(SAMPLE_PREV_CH1, 3)],
      };
      const report = detector.detect(input);
      expect(report.severity).toBe('none');
    });

    it('severity escalates with repetition rate', () => {
      // Exact duplicate → should be high severity
      const input: CrossChapterInput = {
        currentChapter: makeChapter(SAMPLE_PREV_CH1, 3),
        previousChapters: [makeChapter(SAMPLE_PREV_CH1, 2)],
      };
      const report = detector.detect(input);
      expect(['medium', 'high']).toContain(report.severity);
    });
  });

  // ── deduplication ─────────────────────────────────────────────

  describe('deduplication', () => {
    it('does not double-report the same phrase from the same chapter', () => {
      // Phrase appears many times in both chapters
      const repeating = '他推开那扇沉重的铁门'.repeat(5);

      const input: CrossChapterInput = {
        currentChapter: makeChapter(repeating + '全新独特的内容从这里开始', 3),
        previousChapters: [makeChapter(repeating + '旧章节里有完全不同的结尾', 2)],
      };
      const report = detector.detect(input);

      const phrases = report.repeatedPhrases.map((m) => m.phrase);
      const uniquePhrases = new Set(phrases);
      expect(phrases.length).toBe(uniquePhrases.size);
    });
  });

  // ── multi-chapter comparison ──────────────────────────────────

  describe('multi-chapter comparison', () => {
    it('compares against all provided previous chapters', () => {
      const sharedWithCh1 = '他推开那扇沉重的铁门走进了房间';
      const sharedWithCh2 = '清晨的阳光透过窗帘缝隙照进来';

      const currentContent = `${sharedWithCh1}，发现了新的线索。${sharedWithCh2}，一切都显得那么平静。`;
      const ch1Content = `${sharedWithCh1}，却发现里面空无一人，地板上留下了脚印。`;
      const ch2Content = `${sharedWithCh2}，他揉了揉眼睛，试图回忆昨天发生的事情。`;

      const input: CrossChapterInput = {
        currentChapter: makeChapter(currentContent, 5),
        previousChapters: [makeChapter(ch1Content, 1), makeChapter(ch2Content, 2)],
      };
      const report = detector.detect(input);

      const chaptersReferenced = new Set(
        report.repeatedPhrases.flatMap((m) => m.previousOccurrences.map((o) => o.chapterNumber))
      );
      expect(chaptersReferenced.has(1)).toBe(true);
      expect(chaptersReferenced.has(2)).toBe(true);
    });
  });
});
