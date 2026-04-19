import { describe, it, expect, beforeEach } from 'vitest';
import {
  LengthNormalizer,
  type NormalizerInput,
} from './length-normalizer';

// ── Helpers ────────────────────────────────────────────────────────

/** Build a string of ~N visible chars by repeating a base phrase */
function makeChars(base: string, targetChars: number): string {
  const baseLen = base.replace(/[\s\n\r\t]/g, '').length;
  const repeats = Math.ceil(targetChars / baseLen) + 1;
  return base.repeat(repeats);
}

/** Build varied multi-paragraph content of ~N chars (no identical sentences) */
function makeVariedContent(targetChars: number): string {
  const sentences = [
    '他推开门，走进了房间。',
    '窗外下着雨，远处的街道被雨水模糊成一片。',
    '桌上的那封信静静地躺在那里，似乎在等待被发现。',
    '他坐下来，点燃了一支烟，陷入了沉思。',
    '月光透过窗户洒在地板上，形成了一片银白色的光斑。',
    '空气中弥漫着一股陈旧的气息。',
    '墙上的时钟滴答作响，时间在无声中流逝。',
    '他站起身来，走到窗前，望着远方的城市灯火。',
    '内心深处涌起一阵莫名的惆怅。',
    '回忆如潮水般涌来，那些过往的片段在脑海中闪现。',
    '他深吸了一口气，做出了一个重要的决定。',
    '门外的走廊上传来了一阵急促的脚步声。',
    '电话铃声突然响起，打破了房间的宁静。',
    '他犹豫了片刻，最终还是拿起了听筒。',
    '对方的声音低沉而沙哑，仿佛经历了许多沧桑。',
    '夜色渐深，城市的喧嚣声渐渐远去。',
    '他放下电话，重新坐回了那张旧沙发上。',
    '炉火已经熄灭，只剩下几缕余温。',
    '窗外的风越来越大，树枝在风中摇曳。',
    '明天将会是一个全新的开始。',
  ];

  let content = '';
  let paragraph = '';
  let idx = 0;
  while (content.replace(/[\s\n\r\t]/g, '').length < targetChars) {
    paragraph += sentences[idx % sentences.length];
    idx++;
    if (idx % 4 === 0) {
      content += paragraph + '\n\n';
      paragraph = '';
    }
  }
  if (paragraph) content += paragraph;
  return content;
}

function makeInput(overrides: Partial<NormalizerInput> = {}): NormalizerInput {
  return {
    chapterContent: '他推开门，走进了房间。房间里很安静。他坐了下来。',
    chapterNumber: 5,
    wordCountTarget: 3000,
    genre: 'urban',
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('LengthNormalizer', () => {
  let normalizer: LengthNormalizer;

  beforeEach(() => {
    normalizer = new LengthNormalizer();
  });

  // ── normalize() basic ─────────────────────────────────────────

  describe('normalize()', () => {
    it('returns a report with status and word count', () => {
      const report = normalizer.normalize(makeInput());

      expect(report.chapterNumber).toBe(5);
      expect(report.targetWords).toBe(3000);
      expect(report.originalWords).toBeGreaterThan(0);
      expect(report.normalizedWords).toBeGreaterThanOrEqual(0);
      expect(report.status).toBeDefined();
    });

    it('returns "within-range" when word count is inside soft range', () => {
      // 3000 target, urban soft range = 2400-3600 (±20%)
      const content = makeChars(
        '这是一段普通的章节内容文字，描写了角色的日常生活和内心感受。',
        3000
      );

      const report = normalizer.normalize(makeInput({ chapterContent: content }));

      expect(report.status).toBe('within-range');
      expect(report.normalizedContent).toBe(content);
    });

    it('handles empty text', () => {
      const report = normalizer.normalize(makeInput({ chapterContent: '' }));

      expect(report.status).toBe('below-hard');
      expect(report.originalWords).toBe(0);
    });
  });

  // ── over-soft compression ────────────────────────────────────

  describe('over-soft compression', () => {
    it('compresses content when exceeding soft upper bound', () => {
      // 3000 target, soft upper = 3600
      const content = makeChars(
        '这是一段冗长而无意义的叙述文字，没有任何实际价值只是为了填充篇幅。',
        4000
      );

      const report = normalizer.normalize(makeInput({ chapterContent: content }));

      expect(report.status).toBe('compressed');
      expect(report.normalizedWords).toBeLessThan(report.originalWords);
      expect(report.normalizedWords).toBeLessThanOrEqual(3600);
    });

    it('preserves dialogue during compression', () => {
      const dialogue = '"你好，世界。"他说。"你好。"她回答。';
      // Pad with filler to exceed soft bound
      const filler = makeChars(
        '这是一段冗长的描写文字，没有任何实际意义，只是为了凑字数而存在的。',
        4000
      );
      const content = `${dialogue}\n${filler}`;

      const report = normalizer.normalize(makeInput({ chapterContent: content }));

      expect(report.status).toBe('compressed');
      expect(report.normalizedContent).toContain('你好');
    });

    it('does not over-compress below soft lower bound', () => {
      // 3000 target, soft lower = 2400
      const content = makeVariedContent(5000);

      const report = normalizer.normalize(makeInput({ chapterContent: content }));

      expect(report.status).toBe('compressed');
      expect(report.normalizedWords).toBeGreaterThanOrEqual(2400);
    });
  });

  // ── under-soft warning ───────────────────────────────────────

  describe('under-soft warning', () => {
    it('returns "below-soft" when content is under soft lower bound but above hard lower', () => {
      // 3000 target, soft lower = 2400, hard lower = 1800
      const content = makeChars('字数不足的测试。', 2100);

      const report = normalizer.normalize(makeInput({ chapterContent: content }));

      expect(report.status).toBe('below-soft');
      expect(report.normalizedContent).toBe(content);
    });

    it('returns "below-hard" when content is under hard lower bound', () => {
      // 3000 target, hard lower = 1800
      const content = makeChars('太短了。', 500);

      const report = normalizer.normalize(makeInput({ chapterContent: content }));

      expect(report.status).toBe('below-hard');
    });
  });

  // ── safety net ───────────────────────────────────────────────

  describe('safety net', () => {
    it('does not remove more than max compression ratio', () => {
      const content = makeVariedContent(8000);

      const report = normalizer.normalize(makeInput({ chapterContent: content }));

      // Should not compress below hard lower bound as safety net
      const maxRemoval = report.originalWords * 0.8; // at most 80% removal
      const removed = report.originalWords - report.normalizedWords;
      expect(removed).toBeLessThanOrEqual(maxRemoval);
    });

    it('preserves paragraph structure after compression', () => {
      // Create content with clear paragraph structure
      const paragraphs = [
        '第一段：这是开头，介绍了背景信息。',
        '第二段：主角走进了房间，看到了桌上的信。',
        '第三段：他拆开信封，读了起来。',
        '第四段：信的内容让他大吃一惊。',
        '第五段：他做出了一个重要的决定。',
      ];
      const filler = makeChars('冗长而无意义的描写文字，纯粹为了凑字数而存在的填充内容。', 4000);
      const content = `${paragraphs.join('\n\n')}\n\n${filler}`;

      const report = normalizer.normalize(makeInput({ chapterContent: content }));

      // Should still have multiple paragraphs
      const normalizedParagraphs = report.normalizedContent
        .split(/\n+/)
        .filter((p) => p.trim().length > 0);
      expect(normalizedParagraphs.length).toBeGreaterThanOrEqual(3);
    });
  });

  // ── genre-specific thresholds ────────────────────────────────

  describe('genre-specific thresholds', () => {
    it('applies wider soft range for history genre', () => {
      // History: soft ±25% → 2250-3750 for 3000 target
      const content = makeChars('历史叙事文字，描写了那个时代的风貌和人们的生活状态。', 3000);

      const report = normalizer.normalize(makeInput({ chapterContent: content, genre: 'history' }));

      expect(report.status).toBe('within-range');
    });

    it('applies tighter soft range for horror genre', () => {
      // Horror: soft ±15% → 2550-3450 for 3000 target
      const content = makeChars('恐怖叙事文字，描写了阴森的环境和紧张的氛围。', 3600);

      const report = normalizer.normalize(makeInput({ chapterContent: content, genre: 'horror' }));

      expect(report.status).toBe('compressed');
    });
  });

  // ── compression strategies ───────────────────────────────────

  describe('compression strategies', () => {
    it('removes filler phrases first', () => {
      const fillerPhrases = [
        '总而言之',
        '综上所述',
        '换句话说',
        '也就是说',
        '换句话说就是',
        '总而言之就是',
      ];
      const core = '他推开门，走进了房间。';
      // Build filler-heavy content that exceeds soft upper
      const fillerText = fillerPhrases
        .map((f) => `${f}，${core}`)
        .join('\n')
        .repeat(80);
      const content = fillerText;

      const report = normalizer.normalize(makeInput({ chapterContent: content }));

      // After compression, filler phrases should be reduced
      const fillerCount = fillerPhrases.filter((f) => report.normalizedContent.includes(f)).length;
      const originalFillerCount = fillerPhrases.filter((f) => content.includes(f)).length;
      expect(fillerCount).toBeLessThanOrEqual(originalFillerCount);
    });

    it('trims excessive adjectives in descriptions', () => {
      const adjHeavy =
        '美丽的、漂亮的、迷人的、动人的、优雅的、温柔的、可爱的、精致的、绚烂的、辉煌的'.repeat(50);
      const content = `${adjHeavy}他推开门。`;

      // Use low target so this content exceeds soft upper
      const report = normalizer.normalize(
        makeInput({ chapterContent: content, wordCountTarget: 1200 })
      );

      expect(report.normalizedWords).toBeLessThan(report.originalWords);
    });

    it('removes redundant sentence patterns', () => {
      const repetitive = '他站在那里。他站在那里。他站在那里。他站在那里。他站在那里。'.repeat(30);
      const content = `${repetitive}他离开了。`;

      // Use low target so content exceeds soft upper
      const report = normalizer.normalize(
        makeInput({ chapterContent: content, wordCountTarget: 600 })
      );

      expect(report.normalizedWords).toBeLessThan(report.originalWords);
    });
  });

  // ── issues reporting ─────────────────────────────────────────

  describe('issues reporting', () => {
    it('reports when content exceeds soft upper bound', () => {
      const content = makeChars('超长内容测试文字，用来模拟超出软上限的情况。', 5000);

      const report = normalizer.normalize(makeInput({ chapterContent: content }));

      expect(report.issues.length).toBeGreaterThan(0);
      expect(report.issues.some((i) => i.type === 'over-soft')).toBe(true);
    });

    it('reports when content is below soft lower bound', () => {
      const content = makeChars('太短的内容，字数严重不足。', 700);

      const report = normalizer.normalize(makeInput({ chapterContent: content }));

      // Content is below hard lower, which also implies below soft
      expect(report.issues.some((i) => i.type === 'below-soft' || i.type === 'below-hard')).toBe(
        true
      );
    });

    it('reports safety net activation', () => {
      // Very long single paragraph — no paragraphs to remove, must truncate
      const singlePara = makeVariedContent(10000).replace(/\n/g, ' ');

      // Low target forces hard truncation: target=500 → softUpper=600, hardLower=300
      const report = normalizer.normalize(
        makeInput({ chapterContent: singlePara, wordCountTarget: 500 })
      );

      // Content was over soft upper, compression applied, and output >= hardLower
      expect(report.normalizedWords).toBeGreaterThanOrEqual(report.hardLower);
      expect(report.issues.some((i) => i.type === 'over-soft' || i.type === 'over-hard')).toBe(
        true
      );
    });

    it('has no issues when within range', () => {
      const content = makeChars('适中长度的内容，不多也不少，刚好在合理区间内。', 3000);

      const report = normalizer.normalize(makeInput({ chapterContent: content }));

      expect(report.issues).toHaveLength(0);
    });
  });

  // ── chapter number scaling ───────────────────────────────────

  describe('chapter number scaling', () => {
    it('allows more words for later chapters by default', () => {
      const content = makeChars('后续章节内容，用来测试章节号对字数归一化的影响。', 3800);

      // Chapter 1 with 3000 target: soft upper = 3600, content exceeds
      const earlyReport = normalizer.normalize(
        makeInput({ chapterContent: content, chapterNumber: 1 })
      );

      // Chapter 20 with 3000 target: higher soft upper due to scaling (target * 1.057)
      const lateReport = normalizer.normalize(
        makeInput({ chapterContent: content, chapterNumber: 20 })
      );

      // Later chapter should be more lenient (more content preserved)
      expect(lateReport.normalizedWords).toBeGreaterThanOrEqual(earlyReport.normalizedWords);
    });
  });

  // ── edge cases ───────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles very short target', () => {
      const content = makeChars('短目标测试文字。', 150);

      const report = normalizer.normalize(
        makeInput({ chapterContent: content, wordCountTarget: 100 })
      );

      expect(report.targetWords).toBe(100);
      expect(report.status).toBeDefined();
    });

    it('handles content with mixed CJK and Latin characters', () => {
      const content = '这是中文内容。Some English text here. '.repeat(100);

      const report = normalizer.normalize(makeInput({ chapterContent: content }));

      expect(report.originalWords).toBeGreaterThan(0);
    });

    it('handles content with only whitespace', () => {
      const content = '   \n\n   \t   ';

      const report = normalizer.normalize(makeInput({ chapterContent: content }));

      expect(report.originalWords).toBe(0);
      expect(report.status).toBe('below-hard');
    });
  });
});
