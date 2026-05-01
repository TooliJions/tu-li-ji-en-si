import { describe, it, expect } from 'vitest';
import {
  classifySeverity,
  detectClichePhrases,
  detectMonotonousSyntax,
  detectAnalyticalReport,
  detectMetaNarrative,
  detectImageryRepetition,
  detectSemanticRepetition,
  detectLogicGaps,
  detectFalseEmotion,
  detectHollowDescriptions,
} from './ai-detector';

describe('ai-detection-functions', () => {
  // ── classifySeverity ──────────────────────────────────────────

  describe('classifySeverity', () => {
    it('returns none for score <= 15', () => {
      expect(classifySeverity(0)).toBe('none');
      expect(classifySeverity(15)).toBe('none');
    });

    it('returns low for score <= 35', () => {
      expect(classifySeverity(16)).toBe('low');
      expect(classifySeverity(35)).toBe('low');
    });

    it('returns medium for score <= 65', () => {
      expect(classifySeverity(36)).toBe('medium');
      expect(classifySeverity(65)).toBe('medium');
    });

    it('returns high for score > 65', () => {
      expect(classifySeverity(66)).toBe('high');
      expect(classifySeverity(100)).toBe('high');
    });
  });

  // ── detectClichePhrases ───────────────────────────────────────

  describe('detectClichePhrases', () => {
    it('returns zero score for clean text', () => {
      const result = detectClichePhrases('这是一个正常的故事开头，没有套话。');
      expect(result.score).toBe(0);
      expect(result.issues).toHaveLength(0);
    });

    it('detects single cliche pattern', () => {
      const result = detectClichePhrases('夜幕降临，主角开始行动。');
      expect(result.issues.length).toBeGreaterThanOrEqual(1);
      expect(result.score).toBeGreaterThan(0);
    });

    it('increases score with more patterns', () => {
      const text = '岁月如梭，转眼间就到了新的一年。让我们携手共进，为实现梦想而奋斗。';
      const result = detectClichePhrases(text);
      expect(result.issues.length).toBeGreaterThanOrEqual(2);
      expect(result.score).toBeGreaterThan(25);
    });

    it('reaches max score with 4+ pattern hits', () => {
      const text = '夜幕降临，在这个新时代，岁月如梭，心中涌起莫名的感觉。让我们一起携手共进。';
      const result = detectClichePhrases(text);
      expect(result.score).toBe(85);
    });
  });

  // ── detectMonotonousSyntax ────────────────────────────────────

  describe('detectMonotonousSyntax', () => {
    it('returns zero for short text', () => {
      const result = detectMonotonousSyntax('短文本。');
      expect(result.score).toBe(0);
    });

    it('detects repeated sentence starters', () => {
      const text = '他走了过来。他看了看四周。他点了点头。他说道："走吧。"他转过身去。';
      const result = detectMonotonousSyntax(text);
      expect(result.issues.length).toBeGreaterThanOrEqual(1);
    });

    it('detects uniform sentence length', () => {
      const text = '今天天气很好。我去公园散步。看到很多人在跑步。我也加入了他们。运动让人快乐。';
      const result = detectMonotonousSyntax(text);
      expect(result.issues.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── detectAnalyticalReport ─────────────────────────────────────

  describe('detectAnalyticalReport', () => {
    it('returns zero for narrative text', () => {
      const result = detectAnalyticalReport('主角拔剑出鞘，向敌人冲去。');
      expect(result.score).toBe(0);
    });

    it('detects report-style expressions', () => {
      const text =
        '首先我们需要明确的是，这个问题的核心在于资源配置。其次，从宏观角度来看，整体形势严峻。';
      const result = detectAnalyticalReport(text);
      expect(result.issues.length).toBeGreaterThanOrEqual(2);
      expect(result.score).toBeGreaterThan(0);
    });
  });

  // ── detectMetaNarrative ────────────────────────────────────────

  describe('detectMetaNarrative', () => {
    it('returns zero for immersive text', () => {
      const result = detectMetaNarrative('林风一剑刺出，寒光闪烁。');
      expect(result.score).toBe(0);
    });

    it('detects author intrusion', () => {
      const result = detectMetaNarrative('让我们来看看主角接下来会做什么。众所周知，他是个天才。');
      expect(result.issues.length).toBeGreaterThanOrEqual(2);
      expect(result.score).toBeGreaterThan(0);
    });
  });

  // ── detectImageryRepetition ─────────────────────────────────────

  describe('detectImageryRepetition', () => {
    it('returns zero for varied imagery', () => {
      const result = detectImageryRepetition('主角在山谷中修炼，周围是茂密的森林。');
      expect(result.score).toBe(0);
    });

    it('detects repeated imagery keywords', () => {
      const text = '月光洒在月光下的月光里，月色如水，月光皎洁。';
      const result = detectImageryRepetition(text);
      expect(result.issues.length).toBeGreaterThanOrEqual(1);
      expect(result.score).toBeGreaterThan(0);
    });
  });

  // ── detectSemanticRepetition ────────────────────────────────────

  describe('detectSemanticRepetition', () => {
    it('returns zero for diverse vocabulary', () => {
      const result = detectSemanticRepetition('主角修炼突破，境界提升。');
      expect(result.score).toBe(0);
    });

    it('detects synonym clusters', () => {
      const text = '他感到非常高兴，内心充满喜悦和快乐，整个人都很愉悦，异常开心。';
      const result = detectSemanticRepetition(text);
      expect(result.issues.length).toBeGreaterThanOrEqual(1);
      expect(result.score).toBeGreaterThan(0);
    });
  });

  // ── detectLogicGaps ─────────────────────────────────────────────

  describe('detectLogicGaps', () => {
    it('returns zero for well-paced text', () => {
      const text = '主角修炼完毕。他走出洞府，看到阳光明媚。';
      const result = detectLogicGaps(text);
      expect(result.score).toBe(0);
    });

    it('detects rapid event succession', () => {
      const text = '他发现敌人。立刻明白形势危急。于是决定反击。';
      const result = detectLogicGaps(text);
      expect(result.issues.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── detectFalseEmotion ──────────────────────────────────────────

  describe('detectFalseEmotion', () => {
    it('returns zero for shown emotion', () => {
      const result = detectFalseEmotion('他的手微微颤抖，额头渗出细密的汗珠。');
      expect(result.score).toBe(0);
    });

    it('detects emotional cliches', () => {
      const text = '他悲痛欲绝，心如刀绞，泪水止不住地流下。';
      const result = detectFalseEmotion(text);
      expect(result.issues.length).toBeGreaterThanOrEqual(1);
      expect(result.score).toBeGreaterThan(0);
    });

    it('detects emotion word stacking', () => {
      const text = '他感到幸福、快乐、喜悦、激动、忧伤，无比幸福，无比快乐。';
      const result = detectFalseEmotion(text);
      expect(result.score).toBeGreaterThan(0);
    });
  });

  // ── detectHollowDescriptions ────────────────────────────────────

  describe('detectHollowDescriptions', () => {
    it('returns zero for concrete details', () => {
      const result = detectHollowDescriptions('青石板上刻着三道剑痕，深达三寸。');
      expect(result.score).toBe(0);
    });

    it('detects vague descriptions', () => {
      const text = '这里是一个非常非常好看的地方，说不出的感觉，真的太棒了。';
      const result = detectHollowDescriptions(text);
      expect(result.issues.length).toBeGreaterThanOrEqual(2);
      expect(result.score).toBeGreaterThan(0);
    });
  });
});
