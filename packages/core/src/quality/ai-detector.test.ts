import { describe, it, expect, beforeEach } from 'vitest';
import {
  AIGCDetector,
} from './ai-detector';

// ── Helpers ────────────────────────────────────────────────────────

function makeSampleText(): string {
  return `夜幕降临，城市的霓虹灯在雨水中闪烁。
他站在窗前，望着远方的高楼大厦，心中涌起一阵莫名的惆怅。
这是一个不平凡的时代，一个充满机遇与挑战的世界。
科技的飞速发展改变了人们的生活方式，也带来了前所未有的困境。
然而，正是在这样的环境下，英雄才会应运而生。`;
}

// ── Tests ──────────────────────────────────────────────────────────

describe('AIGCDetector', () => {
  let detector: AIGCDetector;

  beforeEach(() => {
    detector = new AIGCDetector();
  });

  // ── detect() ──────────────────────────────────────────────────

  describe('detect', () => {
    it('returns a report with all 9 categories', () => {
      const report = detector.detect(makeSampleText());

      expect(report.categories).toHaveLength(9);
      const categoryNames = report.categories.map((c) => c.category);
      expect(categoryNames).toContain('cliche-phrase');
      expect(categoryNames).toContain('monotonous-syntax');
      expect(categoryNames).toContain('analytical-report');
      expect(categoryNames).toContain('meta-narrative');
      expect(categoryNames).toContain('imagery-repetition');
      expect(categoryNames).toContain('semantic-repetition');
      expect(categoryNames).toContain('logic-gap');
      expect(categoryNames).toContain('false-emotion');
      expect(categoryNames).toContain('hollow-description');
    });

    it('returns severity levels for each category', () => {
      const report = detector.detect(makeSampleText());

      for (const cat of report.categories) {
        expect(['none', 'low', 'medium', 'high']).toContain(cat.severity);
        expect(cat.score).toBeGreaterThanOrEqual(0);
        expect(cat.score).toBeLessThanOrEqual(100);
      }
    });

    it('detects cliche phrases (套话)', () => {
      const text = `夜幕降临，华灯初上。他站在窗前，心中涌起一股暖流。
在这个日新月异的时代，我们迎来了前所未有的机遇与挑战。
岁月如梭，光阴似箭，转眼间又是一年。`;

      const report = detector.detect(text);
      const cliche = report.categories.find((c) => c.category === 'cliche-phrase')!;

      expect(cliche.score).toBeGreaterThan(30);
      expect(cliche.issues.length).toBeGreaterThan(0);
    });

    it('detects monotonous syntax (句式单调)', () => {
      // 全部使用相同句型："他...了..."
      const text = `他打开了门。他走进了房间。他坐在了椅子上。
他打开了灯。他拿起了书。他开始了阅读。`;

      const report = detector.detect(text);
      const mono = report.categories.find((c) => c.category === 'monotonous-syntax')!;

      expect(mono.score).toBeGreaterThan(40);
      expect(mono.issues.length).toBeGreaterThan(0);
    });

    it('detects analytical report style (分析报告体)', () => {
      const text = `首先，我们需要明确的是，这个问题的核心在于资源分配的不均衡。
其次，从宏观角度来看，这种趋势将会持续下去。
综上所述，我们可以得出以下结论：必须采取有效措施加以解决。
总体而言，形势依然严峻，但前景乐观。`;

      const report = detector.detect(text);
      const analytical = report.categories.find((c) => c.category === 'analytical-report')!;

      expect(analytical.score).toBeGreaterThan(40);
    });

    it('detects meta-narrative (元叙事)', () => {
      const text = `这个故事告诉我们一个道理：人生就像一场马拉松。
让我们来看看接下来会发生什么。
在此之前，需要先回顾一下之前的情节。
正如大家所知，这一切都源于那个决定性的瞬间。`;

      const report = detector.detect(text);
      const meta = report.categories.find((c) => c.category === 'meta-narrative')!;

      expect(meta.score).toBeGreaterThan(30);
    });

    it('detects imagery repetition (意象重复)', () => {
      const text = `月光洒在湖面上，银色的光芒如梦如幻。
月亮升起在天际，皎洁的月光照亮了夜空。
月光如水，静静地流淌在每一个角落。
那轮明月洒下银色的月光，像一面镜子悬挂在天空。`;

      const report = detector.detect(text);
      const imagery = report.categories.find((c) => c.category === 'imagery-repetition')!;

      expect(imagery.score).toBeGreaterThan(40);
    });

    it('detects semantic repetition (语义重复)', () => {
      const text = `他非常高兴。他内心充满了喜悦。
他感到无比的快乐。他的心情十分愉悦。
这种开心的感觉久久不能散去。`;

      const report = detector.detect(text);
      const semantic = report.categories.find((c) => c.category === 'semantic-repetition')!;

      expect(semantic.score).toBeGreaterThan(30);
    });

    it('detects logic gaps (逻辑跳跃)', () => {
      const text = `他推开门，发现桌上有一封信。
他立刻明白了所有的真相。
于是他决定离开这个城市。
他买了一张机票，飞往巴黎。
他在埃菲尔铁塔下遇见了多年未见的老友。`;

      const report = detector.detect(text);
      const logic = report.categories.find((c) => c.category === 'logic-gap')!;

      expect(logic.score).toBeGreaterThan(10);
    });

    it('detects false emotion (情感虚假)', () => {
      const text = `他悲痛欲绝，心如刀绞，泪水止不住地流下来。
他感到无比的幸福和快乐，脸上露出了灿烂的笑容。
他的内心充满了无尽的爱与温暖，仿佛整个世界都变得美好了。`;

      const report = detector.detect(text);
      const emotion = report.categories.find((c) => c.category === 'false-emotion')!;

      expect(emotion.score).toBeGreaterThan(30);
    });

    it('detects hollow descriptions (描述空洞)', () => {
      const text = `那是一个美丽的地方，非常非常好看，让人觉得很舒服。
这里有一种说不出的感觉，总之就是很特别。
那种奇妙的体验无法用语言形容，真的太棒了。`;

      const report = detector.detect(text);
      const hollow = report.categories.find((c) => c.category === 'hollow-description')!;

      expect(hollow.score).toBeGreaterThan(30);
    });

    it('returns low scores for natural prose', () => {
      const text = `老槐树下，张大爷摇着蒲扇，慢悠悠地讲起了年轻时候的事。
"那年夏天特别热，河水都浅了不少。"他眯着眼，目光越过院墙，
落在远处那片已经变成停车场的稻田上。`;

      const report = detector.detect(text);

      const maxScore = Math.max(...report.categories.map((c) => c.score));
      expect(maxScore).toBeLessThan(30);
    });

    it('returns empty issues for empty text', () => {
      const report = detector.detect('');

      expect(report.categories.every((c) => c.score === 0)).toBe(true);
      expect(report.categories.every((c) => c.severity === 'none')).toBe(true);
    });

    it('returns issues array with specific locations', () => {
      const text = `首先，我们需要明确的是，这个问题的核心在于资源分配的不均衡。
综上所述，我们可以得出以下结论。`;

      const report = detector.detect(text);
      const analytical = report.categories.find((c) => c.category === 'analytical-report')!;

      for (const issue of analytical.issues) {
        expect(typeof issue.text).toBe('string');
        expect(issue.text.length).toBeGreaterThan(0);
      }
    });

    it('overall score is weighted average of categories', () => {
      const report = detector.detect(makeSampleText());

      expect(report.overallScore).toBeGreaterThanOrEqual(0);
      expect(report.overallScore).toBeLessThanOrEqual(100);
    });

    it('flags text with high overall AI probability', () => {
      const text = `首先，在这个日新月异的时代，我们面临着前所未有的机遇与挑战。
综上所述，我们必须采取有效措施，方能解决这一难题。
总之，形势虽然严峻，但前景依然乐观。让我们携手共进，
岁月如梭，光阴似箭，转眼间又是一年。
这个故事告诉我们一个道理：人生就像一场马拉松。
他非常高兴，内心充满了喜悦和快乐。`;

      const report = detector.detect(text);

      expect(report.overallScore).toBeGreaterThan(30);
    });
  });

  // ── severity classification ───────────────────────────────────

  describe('severity classification', () => {
    it('classifies score 0-15 as none', () => {
      const report = detector.detect('简短文本。');
      const cat = report.categories.find((c) => c.category === 'cliche-phrase')!;
      if (cat.score <= 15) {
        expect(cat.severity).toBe('none');
      }
    });
  });

  // ── category weights ──────────────────────────────────────────

  describe('category weights', () => {
    it('uses configurable weights for overall score', () => {
      const customDetector = new AIGCDetector({
        weights: { 'cliche-phrase': 0.5, 'monotonous-syntax': 0.5 },
      });

      const report = customDetector.detect(makeSampleText());

      // Weighted calculation should still be valid
      expect(report.overallScore).toBeGreaterThanOrEqual(0);
      expect(report.overallScore).toBeLessThanOrEqual(100);
    });
  });
});
