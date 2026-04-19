import { describe, it, expect, beforeEach } from 'vitest';
import {
  RepairDecider,
  type AuditIssue,
  type AICategoryResult,
} from './repair-strategy';

// ── Helpers ────────────────────────────────────────────────────────

function makeAuditIssue(overrides: Partial<AuditIssue> = {}): AuditIssue {
  return {
    description: '角色状态不一致',
    tier: 'blocker',
    category: 'character-state',
    suggestion: '修正角色身份描述',
    affectedParagraphs: [0],
    ...overrides,
  };
}

function makeAICategory(overrides: Partial<AICategoryResult> = {}): AICategoryResult {
  return {
    category: 'cliche-phrase',
    score: 50,
    severity: 'medium',
    issues: [{ text: '日新月异的时代' }],
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('RepairDecider', () => {
  let decider: RepairDecider;

  beforeEach(() => {
    decider = new RepairDecider();
  });

  // ── decide() ──────────────────────────────────────────────────

  describe('decide', () => {
    it('returns accept when no issues', () => {
      const decision = decider.decide([], []);

      expect(decision.strategy).toBe('accept');
      expect(decision.reason).toBeDefined();
    });

    it('returns accept when only suggestion-tier audit issues', () => {
      const auditIssues: AuditIssue[] = [
        makeAuditIssue({ tier: 'suggestion', description: '可增加环境描写' }),
      ];

      const decision = decider.decide(auditIssues, []);

      expect(decision.strategy).toBe('accept');
    });
  });

  // ── local-replace ─────────────────────────────────────────────

  describe('local-replace (局部替换)', () => {
    it('chooses local-replace for cliche phrases', () => {
      const aiResults: AICategoryResult[] = [
        makeAICategory({
          category: 'cliche-phrase',
          score: 60,
          severity: 'high',
          issues: [{ text: '日新月异的时代' }],
        }),
      ];

      const decision = decider.decide([], aiResults);

      expect(decision.strategy).toBe('local-replace');
    });

    it('chooses local-replace for semantic repetition', () => {
      const aiResults: AICategoryResult[] = [
        makeAICategory({ category: 'semantic-repetition', score: 55, severity: 'medium' }),
      ];

      const decision = decider.decide([], aiResults);

      expect(decision.strategy).toBe('local-replace');
    });

    it('chooses local-replace for imagery repetition', () => {
      const aiResults: AICategoryResult[] = [
        makeAICategory({ category: 'imagery-repetition', score: 50, severity: 'medium' }),
      ];

      const decision = decider.decide([], aiResults);

      expect(decision.strategy).toBe('local-replace');
    });

    it('chooses local-replace for hollow descriptions', () => {
      const aiResults: AICategoryResult[] = [
        makeAICategory({ category: 'hollow-description', score: 45, severity: 'medium' }),
      ];

      const decision = decider.decide([], aiResults);

      expect(decision.strategy).toBe('local-replace');
    });

    it('chooses local-replace for non-blocking character inconsistency', () => {
      const auditIssues: AuditIssue[] = [
        makeAuditIssue({
          tier: 'warning',
          category: 'character-detail',
          description: '角色称谓前后不一致',
        }),
      ];

      const decision = decider.decide(auditIssues, []);

      expect(decision.strategy).toBe('local-replace');
    });

    it('includes affected text spans in decision for local-replace', () => {
      const aiResults: AICategoryResult[] = [
        makeAICategory({
          category: 'cliche-phrase',
          score: 70,
          severity: 'high',
          issues: [{ text: '日新月异的时代' }, { text: '前所未有的机遇' }],
        }),
      ];

      const decision = decider.decide([], aiResults);

      expect(decision.affectedText.length).toBeGreaterThan(0);
      expect(decision.affectedText[0]).toContain('日新月异');
    });
  });

  // ── paragraph-reorder ─────────────────────────────────────────

  describe('paragraph-reorder (段落重排)', () => {
    it('chooses paragraph-reorder for monotonous syntax', () => {
      const aiResults: AICategoryResult[] = [
        makeAICategory({ category: 'monotonous-syntax', score: 65, severity: 'high' }),
      ];

      const decision = decider.decide([], aiResults);

      expect(decision.strategy).toBe('paragraph-reorder');
    });

    it('chooses paragraph-reorder for analytical report style', () => {
      const aiResults: AICategoryResult[] = [
        makeAICategory({ category: 'analytical-report', score: 70, severity: 'high' }),
      ];

      const decision = decider.decide([], aiResults);

      expect(decision.strategy).toBe('paragraph-reorder');
    });

    it('chooses paragraph-reorder for false emotion stacking', () => {
      const aiResults: AICategoryResult[] = [
        makeAICategory({ category: 'false-emotion', score: 60, severity: 'high' }),
      ];

      const decision = decider.decide([], aiResults);

      expect(decision.strategy).toBe('paragraph-reorder');
    });

    it('chooses paragraph-reorder for pacing issues', () => {
      const auditIssues: AuditIssue[] = [
        makeAuditIssue({
          tier: 'warning',
          category: 'pacing',
          description: '节奏失衡，后半段过于仓促',
        }),
      ];

      const decision = decider.decide(auditIssues, []);

      expect(decision.strategy).toBe('paragraph-reorder');
    });

    it('chooses paragraph-reorder for scene transition issues', () => {
      const auditIssues: AuditIssue[] = [
        makeAuditIssue({
          tier: 'warning',
          category: 'scene-transition',
          description: '场景过渡生硬',
        }),
      ];

      const decision = decider.decide(auditIssues, []);

      expect(decision.strategy).toBe('paragraph-reorder');
    });
  });

  // ── beat-rewrite ──────────────────────────────────────────────

  describe('beat-rewrite (节拍重写)', () => {
    it('chooses beat-rewrite for logic gaps', () => {
      const aiResults: AICategoryResult[] = [
        makeAICategory({ category: 'logic-gap', score: 60, severity: 'high' }),
      ];

      const decision = decider.decide([], aiResults);

      expect(decision.strategy).toBe('beat-rewrite');
    });

    it('chooses beat-rewrite for meta-narrative', () => {
      const aiResults: AICategoryResult[] = [
        makeAICategory({ category: 'meta-narrative', score: 55, severity: 'medium' }),
      ];

      const decision = decider.decide([], aiResults);

      expect(decision.strategy).toBe('beat-rewrite');
    });

    it('chooses beat-rewrite for emotional arc break', () => {
      const auditIssues: AuditIssue[] = [
        makeAuditIssue({ tier: 'warning', category: 'emotional-arc', description: '情感弧线断裂' }),
      ];

      const decision = decider.decide(auditIssues, []);

      expect(decision.strategy).toBe('beat-rewrite');
    });

    it('chooses beat-rewrite for timeline issues', () => {
      const auditIssues: AuditIssue[] = [
        makeAuditIssue({ tier: 'blocker', category: 'timeline', description: '时间线矛盾' }),
      ];

      const decision = decider.decide(auditIssues, []);

      expect(decision.strategy).toBe('beat-rewrite');
    });
  });

  // ── chapter-rewrite ───────────────────────────────────────────

  describe('chapter-rewrite (整章重写)', () => {
    it('chooses chapter-rewrite for multiple blocker issues', () => {
      const auditIssues: AuditIssue[] = [
        makeAuditIssue({
          tier: 'blocker',
          category: 'character-state',
          description: '角色身份矛盾',
        }),
        makeAuditIssue({ tier: 'blocker', category: 'timeline', description: '时间线冲突' }),
        makeAuditIssue({ tier: 'blocker', category: 'pov', description: 'POV 非法切换' }),
      ];

      const decision = decider.decide(auditIssues, []);

      expect(decision.strategy).toBe('chapter-rewrite');
    });

    it('chooses chapter-rewrite when AI score is extremely high', () => {
      const aiResults: AICategoryResult[] = [
        makeAICategory({ category: 'cliche-phrase', score: 90, severity: 'high' }),
        makeAICategory({ category: 'monotonous-syntax', score: 85, severity: 'high' }),
        makeAICategory({ category: 'analytical-report', score: 80, severity: 'high' }),
        makeAICategory({ category: 'meta-narrative', score: 75, severity: 'high' }),
      ];

      const decision = decider.decide([], aiResults);

      expect(decision.strategy).toBe('chapter-rewrite');
    });

    it('chooses chapter-rewrite for outline deviation', () => {
      const auditIssues: AuditIssue[] = [
        makeAuditIssue({
          tier: 'blocker',
          category: 'outline-deviation',
          description: '严重偏离大纲，本章应写战斗却写了日常',
        }),
      ];

      const decision = decider.decide(auditIssues, []);

      expect(decision.strategy).toBe('chapter-rewrite');
    });

    it('chooses chapter-rewrite for too many warning issues', () => {
      const auditIssues: AuditIssue[] = Array.from({ length: 6 }, (_, i) =>
        makeAuditIssue({ tier: 'warning', category: `issue-${i}`, description: `警告问题 ${i}` })
      );

      const decision = decider.decide(auditIssues, []);

      expect(decision.strategy).toBe('chapter-rewrite');
    });
  });

  // ── strategy escalation ───────────────────────────────────────

  describe('strategy escalation', () => {
    it('escalates when mixed audit + AI issues compound', () => {
      const auditIssues: AuditIssue[] = [
        makeAuditIssue({
          tier: 'blocker',
          category: 'character-state',
          description: '角色死亡后仍出场',
        }),
        makeAuditIssue({ tier: 'warning', category: 'pacing', description: '节奏失衡' }),
      ];
      const aiResults: AICategoryResult[] = [
        makeAICategory({ category: 'cliche-phrase', score: 70, severity: 'high' }),
        makeAICategory({ category: 'logic-gap', score: 65, severity: 'high' }),
      ];

      const decision = decider.decide(auditIssues, aiResults);

      // Beat-rewrite (from character-state + logic-gap) beats local-replace (cliche) and paragraph (pacing)
      expect(decision.strategy).toBe('beat-rewrite');
    });

    it('selects highest severity strategy when multiple apply', () => {
      const auditIssues: AuditIssue[] = [
        makeAuditIssue({
          tier: 'warning',
          category: 'character-detail',
          description: '称谓不一致',
        }),
      ];
      const aiResults: AICategoryResult[] = [
        makeAICategory({ category: 'logic-gap', score: 60, severity: 'high' }),
      ];

      const decision = decider.decide(auditIssues, aiResults);

      // Logic gap → beat-rewrite is higher than local-replace
      expect(decision.strategy).toBe('beat-rewrite');
    });
  });

  // ── decision metadata ─────────────────────────────────────────

  describe('decision metadata', () => {
    it('includes estimated token cost', () => {
      const decision = decider.decide(
        [makeAuditIssue({ tier: 'blocker', category: 'timeline', description: '时间线矛盾' })],
        []
      );

      expect(decision.estimatedTokenCost).toBeGreaterThan(0);
    });

    it('includes triggering issues list', () => {
      const aiResults: AICategoryResult[] = [
        makeAICategory({ category: 'cliche-phrase', score: 60, severity: 'high' }),
      ];

      const decision = decider.decide([], aiResults);

      expect(decision.triggeringCategories).toContain('cliche-phrase');
    });

    it('includes reason explanation', () => {
      const decision = decider.decide([], []);

      expect(decision.reason.length).toBeGreaterThan(0);
    });

    it('chapter-rewrite has higher token cost than local-replace', () => {
      const localDecision = decider.decide(
        [],
        [makeAICategory({ category: 'cliche-phrase', score: 50, severity: 'medium' })]
      );
      const chapterDecision = decider.decide(
        [
          makeAuditIssue({
            tier: 'blocker',
            category: 'character-state',
            description: '角色身份矛盾',
          }),
          makeAuditIssue({ tier: 'blocker', category: 'timeline', description: '时间线冲突' }),
          makeAuditIssue({ tier: 'blocker', category: 'pov', description: 'POV 非法切换' }),
        ],
        []
      );

      expect(chapterDecision.estimatedTokenCost).toBeGreaterThan(localDecision.estimatedTokenCost);
    });
  });

  // ── configuration ─────────────────────────────────────────────

  describe('configuration', () => {
    it('respects custom token cost estimates', () => {
      const customDecider = new RepairDecider({
        tokenCosts: {
          'local-replace': 500,
          'paragraph-reorder': 1500,
          'beat-rewrite': 3000,
          'chapter-rewrite': 8000,
        },
      });

      const decision = customDecider.decide(
        [makeAuditIssue({ tier: 'blocker', category: 'timeline', description: '时间线矛盾' })],
        []
      );

      expect(decision.estimatedTokenCost).toBe(3000);
    });
  });
});
