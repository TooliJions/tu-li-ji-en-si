import { describe, it, expect, beforeEach } from 'vitest';
import {
  CadenceAnalyzer,
  type CadenceInput,
} from './cadence';

// ── Helpers ────────────────────────────────────────────────────────

function makeInput(overrides: Partial<CadenceInput> = {}): CadenceInput {
  return {
    chapterContent: `他推开门，走进了房间。
房间里很暗。
他打开了灯。
灯光照亮了桌上的那封信。
他走过去，拿起信，拆开了信封。
信上写着：如果你看到了这封信，说明我已经不在了。
他把信放下，坐到了椅子上。
窗外下着雨。
雨声很大。
他闭上眼睛，回忆起了过去的事情。`,
    chapterNumber: 5,
    genre: 'urban',
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('CadenceAnalyzer', () => {
  let analyzer: CadenceAnalyzer;

  beforeEach(() => {
    analyzer = new CadenceAnalyzer();
  });

  // ── analyze() ─────────────────────────────────────────────────

  describe('analyze', () => {
    it('returns a complete report', () => {
      const report = analyzer.analyze(makeInput());

      expect(report.chapterNumber).toBe(5);
      expect(report.timestamp).toBeDefined();
      expect(report.paragraphCadence).toBeDefined();
      expect(report.sentenceCadence).toBeDefined();
      expect(report.suggestions).toBeDefined();
      expect(report.overallScore).toBeGreaterThanOrEqual(0);
      expect(report.overallScore).toBeLessThanOrEqual(100);
    });

    it('handles empty text', () => {
      const report = analyzer.analyze(makeInput({ chapterContent: '' }));

      expect(report.overallScore).toBe(0);
      expect(report.suggestions).toHaveLength(0);
    });
  });

  // ── paragraph cadence ─────────────────────────────────────────

  describe('paragraph cadence', () => {
    it('detects uniform paragraph lengths', () => {
      // All paragraphs have exactly the same length
      const text = `这是一句话的长度。
这是二句话的长度。
这是三句话的长度。
这是四句话的长度。`;

      const report = analyzer.analyze(makeInput({ chapterContent: text }));

      expect(report.paragraphCadence.stdDev).toBeLessThan(2);
      expect(report.paragraphCadence.quality).toBe('uniform');
    });

    it('detects good paragraph variation', () => {
      // Mix of short, medium, and long paragraphs
      const text = `短。

这是一段中等长度的段落，包含了更多的内容和描写，让读者能够感受到场景的氛围和角色的情感变化。

他笑了笑。

窗外下起了大雨，雨水顺着玻璃窗滑落下来，远处的街道被雨水模糊成一片朦胧的色彩。路上的行人匆忙地奔跑着，寻找避雨的场所。整个世界都被雨水笼罩在一片灰蒙蒙的氛围中。

他叹了口气。`;

      const report = analyzer.analyze(makeInput({ chapterContent: text }));

      expect(report.paragraphCadence.stdDev).toBeGreaterThan(5);
      expect(report.paragraphCadence.quality).toBe('good');
    });

    it('detects extreme paragraph length imbalance', () => {
      // One extremely long paragraph with tiny ones
      const text = `短。
短。
短。
这是一段非常非常长的段落，包含了大量的内容。它不断地描述着各种细节，从环境到人物，从心理到行动，从过去到未来，从宏观到微观，无所不包。这种写法会让读者感到疲劳，因为信息量过大且缺乏节奏变化。而且这种段落通常缺乏留白，让读者的眼睛和大脑都得不到休息。`;

      const report = analyzer.analyze(makeInput({ chapterContent: text }));

      expect(report.paragraphCadence.quality).toBe('poor');
    });

    it('detects monotonous short paragraphs', () => {
      // All very short paragraphs
      const text = `他来了。
他走了。
他笑了。
他哭了。
他怒了。
他静了。`;

      const report = analyzer.analyze(makeInput({ chapterContent: text }));

      expect(report.paragraphCadence.stdDev).toBeLessThan(2);
      expect(report.suggestions.some((s) => s.type.includes('paragraph'))).toBe(true);
    });
  });

  // ── sentence cadence ──────────────────────────────────────────

  describe('sentence cadence', () => {
    it('detects uniform sentence lengths', () => {
      // All sentences have the same length
      const text = `他打开了门。他走进了房间。他坐了下来。他打开了灯。他拿起了书。`;

      const report = analyzer.analyze(makeInput({ chapterContent: text }));

      expect(report.sentenceCadence.stdDev).toBeLessThan(2);
      expect(report.sentenceCadence.quality).toBe('uniform');
    });

    it('detects good sentence variation', () => {
      const text = `他推开门。房间里一片漆黑，只有窗外的月光勉强勾勒出家具的轮廓。他屏住呼吸。`;
      const report = analyzer.analyze(makeInput({ chapterContent: text }));

      expect(report.sentenceCadence.quality).toBe('good');
    });

    it('penalizes extremely long sentences', () => {
      // One very long sentence
      const text = `这是一个非常长的句子，它包含了大量的修饰语和从句，不断地扩展着，不断地延伸着，似乎永远没有尽头，让读者在阅读过程中感到疲惫和不耐烦，因为人的注意力和理解能力是有限的，过长的句子会超出认知负荷。他很累。`;

      const report = analyzer.analyze(makeInput({ chapterContent: text }));

      expect(report.sentenceCadence.maxLen).toBeGreaterThan(50);
    });

    it('reports sentence length statistics', () => {
      const report = analyzer.analyze(makeInput());

      expect(report.sentenceCadence.avgLen).toBeGreaterThan(0);
      expect(report.sentenceCadence.minLen).toBeGreaterThanOrEqual(0);
      expect(report.sentenceCadence.maxLen).toBeGreaterThan(0);
      expect(report.sentenceCadence.stdDev).toBeGreaterThanOrEqual(0);
    });
  });

  // ── pacing patterns ───────────────────────────────────────────

  describe('pacing patterns', () => {
    it('detects short-paragraph acceleration (tension building)', () => {
      // Paragraphs getting progressively shorter = tension building
      const text = `他站在门外，深吸了一口气，然后推开了那扇沉重的木门。
房间里坐满了人，所有人的目光都集中在他身上。
他开始说话。
声音很小。
但很坚定。`;

      const report = analyzer.analyze(makeInput({ chapterContent: text }));

      expect(report.paragraphCadence.trend).toBeDefined();
    });

    it('identifies dialogue ratio', () => {
      const text = `"你好。"他说。
"你好。"她回答。
"最近怎么样？"
"还好。"
"有什么新消息吗？"
"没什么特别的。"`;

      const report = analyzer.analyze(makeInput({ chapterContent: text }));

      expect(report.dialogueRatio).toBeGreaterThan(0.5);
    });
  });

  // ── suggestions ───────────────────────────────────────────────

  describe('suggestions', () => {
    it('suggests variation for uniform paragraphs', () => {
      const text = `他来了。他走了。他笑了。他哭了。`;

      const report = analyzer.analyze(makeInput({ chapterContent: text }));

      expect(report.suggestions.length).toBeGreaterThan(0);
    });

    it('suggests shortening for very long paragraphs', () => {
      const longParagraph = '这是一个非常长的段落。'.repeat(20);

      const report = analyzer.analyze(makeInput({ chapterContent: longParagraph }));

      expect(report.suggestions.some((s) => s.type === 'paragraph-too-long')).toBe(true);
    });

    it('suggests breaking long sentences', () => {
      const longSentence =
        '这是一个非常长的句子，它包含了大量的修饰语和从句，不断地扩展着，似乎永远没有尽头，让读者在阅读过程中感到疲惫和不耐烦，因为人的注意力是有限的。';

      const report = analyzer.analyze(makeInput({ chapterContent: longSentence }));

      expect(report.suggestions.some((s) => s.type === 'sentence-too-long')).toBe(true);
    });

    it('returns empty suggestions for well-paced text', () => {
      const text = `他推开门。
房间里很安静。
月光透过窗户洒在地板上，形成了一片银白色的光斑。
他走过去，拉开了抽屉。
里面有一封信。`;

      const report = analyzer.analyze(makeInput({ chapterContent: text }));

      // Well-paced text should have few or no suggestions
      expect(report.suggestions.length).toBeLessThan(3);
    });
  });

  // ── genre-specific analysis ───────────────────────────────────

  describe('genre-specific analysis', () => {
    it('adjusts expectations for horror genre (shorter paragraphs)', () => {
      const text = `门开了。
没人。
只有风。
他走了进去。
门关上了。`;

      const report = analyzer.analyze(makeInput({ chapterContent: text, genre: 'horror' }));

      expect(report).toBeDefined();
      expect(report.overallScore).toBeGreaterThanOrEqual(0);
    });

    it('analyzes romance pacing', () => {
      const text = `她看着他，心中涌起一阵温暖。
他的笑容是那么熟悉，仿佛时间从未流逝。
"好久不见。"她轻声说。
他点了点头，眼中闪过一丝复杂的情绪。`;

      const report = analyzer.analyze(makeInput({ chapterContent: text, genre: 'romance' }));

      expect(report).toBeDefined();
    });
  });

  // ── score computation ─────────────────────────────────────────

  describe('score computation', () => {
    it('higher score for varied pacing', () => {
      const varied = `短。
这是一段中等长度的描写，包含了一些细节和情感的描述。
他走。
窗外的雨越下越大，整个世界都被笼罩在一片灰蒙蒙的雨幕之中。路上的行人匆匆忙忙地赶路，没有人停下来欣赏这雨中的风景。远处的山峦若隐若现，仿佛一幅淡雅的水墨画。
他笑了。`;

      const uniform = `短句一句。短句二句。短句三句。短句四句。短句五句。`;

      const variedReport = analyzer.analyze(makeInput({ chapterContent: varied }));
      const uniformReport = analyzer.analyze(makeInput({ chapterContent: uniform }));

      expect(variedReport.overallScore).toBeGreaterThan(uniformReport.overallScore);
    });
  });
});
