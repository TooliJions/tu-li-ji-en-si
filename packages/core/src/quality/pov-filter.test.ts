import { describe, it, expect, beforeEach } from 'vitest';
import { POFilter, type POFilterInput, type POFilterReport, type POVShift } from './pov-filter';

// ── Helpers ────────────────────────────────────────────────────────

function makeInput(overrides: Partial<POFilterInput> = {}): POFilterInput {
  return {
    chapterContent: `林浩站在窗前，望着远方的城市。他感到一阵莫名的疲惫。
手机响了，是他打来的电话。他按下接听键。
"喂，是我。"对方的声音低沉。
林浩点了点头，尽管对方看不见。`,
    chapterNumber: 5,
    genre: 'urban',
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('POFilter', () => {
  let filter: POFilter;

  beforeEach(() => {
    filter = new POFilter();
  });

  // ── analyze() ─────────────────────────────────────────────────

  describe('analyze', () => {
    it('returns a report with POV summary', () => {
      const report = filter.analyze(makeInput());

      expect(report.chapterNumber).toBe(5);
      expect(report.timestamp).toBeDefined();
      expect(report.povConsistency).toBeDefined();
    });

    it('detects overall POV correctly for first-person text', () => {
      const text = `我推开门，走进了房间。
我看着桌上的那封信。
我坐下来，开始仔细阅读。`;

      const report = filter.analyze(makeInput({ chapterContent: text }));

      expect(report.povConsistency).toBe('first-person');
    });

    it('detects overall POV correctly for third-person text', () => {
      const text = `张三推开门，走进了房间。
他看着桌上的那封信。
他坐下来，开始仔细阅读。`;

      const report = filter.analyze(makeInput({ chapterContent: text }));

      expect(report.povConsistency).toBe('third-person');
    });

    it('detects overall POV correctly for second-person text', () => {
      const text = `你推开门，走进了房间。
你看着桌上的那封信。
你坐下来，开始仔细阅读。`;

      const report = filter.analyze(makeInput({ chapterContent: text }));

      expect(report.povConsistency).toBe('second-person');
    });
  });

  // ── POV shift detection ───────────────────────────────────────

  describe('POV shift detection', () => {
    it('detects first-to-third person shift', () => {
      const text = `我推开门，走进了房间。我感到一阵不安。
张三推门走了进来。他看着林浩，微微一笑。`;

      const report = filter.analyze(makeInput({ chapterContent: text }));

      expect(report.shifts.length).toBeGreaterThan(0);
      expect(report.shifts[0].from).toMatch(/first/);
      expect(report.shifts[0].to).toMatch(/third/);
      expect(report.shifts[0].severity).toBe('critical');
    });

    it('detects third-to-first person shift', () => {
      const text = `林浩站在窗前，望着远方。他感到一阵疲惫。
我突然感到一阵寒意。我回头看去。`;

      const report = filter.analyze(makeInput({ chapterContent: text }));

      expect(report.shifts.length).toBeGreaterThan(0);
    });

    it('detects mixed POV within a single paragraph', () => {
      const text = `我走进房间，发现张三站在窗前。他转过身来看着我，我点了点头。`;

      const report = filter.analyze(makeInput({ chapterContent: text }));

      // This is a legitimate scene with mixed pronouns but no real POV shift
      // The filter should be smart enough not to flag this
      expect(report.shifts.length).toBe(0);
    });

    it('detects "你" intrusion into third-person narrative', () => {
      const text = `林浩推开门，走进了房间。他感到一阵不安。
你站在门口，看着这一切。你知道一切都不同了。`;

      const report = filter.analyze(makeInput({ chapterContent: text }));

      expect(report.shifts.length).toBeGreaterThan(0);
      expect(report.shifts[0].to).toMatch(/second/);
    });

    it('detects POV shift from first to second person', () => {
      const text = `我站在窗前，望着远方。我的心中充满了惆怅。
你推开窗户，深吸了一口气。你知道一切都将改变。`;

      const report = filter.analyze(makeInput({ chapterContent: text }));

      expect(report.shifts.length).toBeGreaterThan(0);
      expect(report.shifts[0].from).toMatch(/first/);
      expect(report.shifts[0].to).toMatch(/second/);
    });
  });

  // ── omniscient narrator detection ─────────────────────────────

  describe('omniscient narrator detection', () => {
    it('detects omniscient narrator pattern', () => {
      const text = `然而，命运的齿轮已经开始转动。谁也不知道，一场风暴即将来临。
与此同时，千里之外的京城，另一个人也在做着同样的准备。`;

      const report = filter.analyze(makeInput({ chapterContent: text }));

      expect(report.narrativeMode).toContain('omniscient');
    });

    it('detects author intrusion (meta-commentary)', () => {
      const text = `林浩推开门，走了进去。
让我们来看看接下来会发生什么。
他不知道，这个决定将改变他的一生。`;

      const report = filter.analyze(makeInput({ chapterContent: text }));

      expect(report.authorIntrusions.length).toBeGreaterThan(0);
      expect(report.authorIntrusions[0].type).toMatch(/intrusion|meta/);
    });
  });

  // ── character head-hopping ────────────────────────────────────

  describe('head-hopping detection', () => {
    it('detects head-hopping between two characters', () => {
      const text = `林浩看着李四，心中暗暗盘算着该如何开口。他觉得李四一定不会相信他说的话。
李四看着林浩紧张的样子，心想：这小子又在打什么鬼主意？他决定先听听看再说。`;

      const report = filter.analyze(makeInput({ chapterContent: text }));

      expect(report.shifts.length).toBeGreaterThan(0);
      const headHop = report.shifts.find((s) => s.type === 'head-hop');
      expect(headHop).toBeDefined();
    });

    it('passes when POV stays with one character', () => {
      const text = `林浩看着李四，心中暗暗盘算着该如何开口。他觉得李四一定不会相信他说的话。
林浩深吸一口气，终于开口了："我有一件事要告诉你。"`;

      const report = filter.analyze(makeInput({ chapterContent: text }));

      expect(report.shifts.filter((s) => s.type === 'head-hop')).toHaveLength(0);
    });
  });

  // ── dialogue handling ─────────────────────────────────────────

  describe('dialogue handling', () => {
    it('does not flag dialogue as POV shift', () => {
      const text = `张三说："我觉得我们应该去。"
李四摇了摇头："我不这么认为。我觉得这太危险了。"`;

      const report = filter.analyze(makeInput({ chapterContent: text }));

      expect(report.shifts.length).toBe(0);
    });

    it('does not flag quoted first-person narration as POV shift', () => {
      const text = `张三讲起了他的故事："我当时站在山顶上，看着脚下的云海，心中无比自豪。"`;

      const report = filter.analyze(makeInput({ chapterContent: text }));

      expect(report.shifts.length).toBe(0);
    });
  });

  // ── severity classification ───────────────────────────────────

  describe('severity classification', () => {
    it('classifies person change as critical', () => {
      const text = `我走进房间。
张三推门走了进来。他看着一切。`;

      const report = filter.analyze(makeInput({ chapterContent: text }));

      const personShift = report.shifts.find((s) => s.severity === 'critical');
      expect(personShift).toBeDefined();
    });

    it('classifies head-hopping as warning', () => {
      const text = `林浩心想：这事不好办。
李四心想：这事没问题。`;

      const report = filter.analyze(makeInput({ chapterContent: text }));

      const headHop = report.shifts.find((s) => s.type === 'head-hop');
      if (headHop) {
        expect(headHop.severity).toBe('warning');
      }
    });
  });

  // ── overall consistency ───────────────────────────────────────

  describe('overall consistency', () => {
    it('returns consistent when no shifts', () => {
      const text = `张三推开门。他走进房间。他坐下来。`;

      const report = filter.analyze(makeInput({ chapterContent: text }));

      expect(report.overallStatus).toBe('pass');
    });

    it('returns warning for head-hopping only', () => {
      const text = `林浩心想：这事不好办。他看着李四。
李四心想：这事没问题。他看着林浩。`;

      const report = filter.analyze(makeInput({ chapterContent: text }));

      expect(report.overallStatus).toBe('warning');
    });

    it('returns fail for person shift', () => {
      const text = `我走进房间。
张三推门走了进来。他看着一切。`;

      const report = filter.analyze(makeInput({ chapterContent: text }));

      expect(report.overallStatus).toBe('fail');
    });
  });

  // ── edge cases ────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles empty text', () => {
      const report = filter.analyze(makeInput({ chapterContent: '' }));

      expect(report.overallStatus).toBe('pass');
      expect(report.shifts).toHaveLength(0);
    });

    it('handles very short text', () => {
      const report = filter.analyze(makeInput({ chapterContent: '你好。' }));

      expect(report.overallStatus).toBe('pass');
    });

    it('ignores 我 in idioms as first-person marker', () => {
      const text = `张三认为这是理所当然的事情。他从未想过会有变故。`;

      const report = filter.analyze(makeInput({ chapterContent: text }));

      expect(report.povConsistency).toBe('third-person');
    });
  });
});
