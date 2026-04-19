import { describe, it, expect } from 'vitest';
import {
  PostWriteValidator,
  type ValidationInput,
  type ValidationRule,
} from './post-write-validator';
import type { Manifest } from '../models/state';

// ── Helpers ────────────────────────────────────────────────────────

function makeManifest(overrides: Partial<Manifest> = {}): Manifest {
  return {
    bookId: 'test-book',
    versionToken: 1,
    lastChapterWritten: 4,
    hooks: [],
    facts: [],
    characters: [],
    worldRules: [],
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeInput(overrides: Partial<ValidationInput> = {}): ValidationInput {
  return {
    chapterContent: '他推开门，走进茶馆。张三坐在角落里喝茶。',
    chapterNumber: 5,
    manifest: makeManifest(),
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('PostWriteValidator', () => {
  let validator: PostWriteValidator;

  // ── validate() ────────────────────────────────────────────────

  describe('validate', () => {
    it('returns pass when no validation rules configured', () => {
      validator = new PostWriteValidator({ rules: [] });
      const report = validator.validate(makeInput());

      expect(report.overallStatus).toBe('pass');
      expect(report.issues).toHaveLength(0);
    });

    it('returns validation report with chapter number', () => {
      validator = new PostWriteValidator({ rules: [] });
      const report = validator.validate(makeInput({ chapterNumber: 7 }));

      expect(report.chapterNumber).toBe(7);
      expect(report.timestamp).toBeDefined();
    });
  });

  // ── character-location validation ─────────────────────────────

  describe('character-location rule', () => {
    it('passes when character location is consistent', () => {
      const manifest = makeManifest({
        characters: [
          {
            id: 'zhang-san',
            name: '张三',
            role: 'protagonist',
            traits: ['谨慎'],
            relationships: {},
          },
        ],
        facts: [
          {
            id: 'fact-1',
            content: '张三在茶馆',
            chapterNumber: 4,
            confidence: 'high',
            category: 'character',
            createdAt: '2026-01-01T00:00:00Z',
          },
        ],
      });

      validator = new PostWriteValidator({
        rules: [{ type: 'character-location', severity: 'critical' }],
      });

      const report = validator.validate(
        makeInput({
          chapterContent: '张三坐在茶馆里，端起茶杯喝了一口。',
          chapterNumber: 5,
          manifest,
        })
      );

      expect(report.overallStatus).toBe('pass');
    });

    it('detects character in two locations simultaneously', () => {
      const manifest = makeManifest({
        characters: [
          { id: 'zhang-san', name: '张三', role: 'protagonist', traits: [], relationships: {} },
        ],
        facts: [
          {
            id: 'fact-1',
            content: '张三在京城',
            chapterNumber: 4,
            confidence: 'high',
            category: 'character',
            createdAt: '2026-01-01T00:00:00Z',
          },
        ],
      });

      validator = new PostWriteValidator({
        rules: [{ type: 'character-location', severity: 'critical' }],
      });

      const report = validator.validate(
        makeInput({
          chapterContent: '张三站在京城城楼上，同时又在千里之外的江南水乡漫步。',
          chapterNumber: 5,
          manifest,
        })
      );

      expect(report.overallStatus).toBe('fail');
      expect(report.issues.some((i) => i.rule === 'character-location')).toBe(true);
    });

    it('detects character appearing in distant location without travel', () => {
      const manifest = makeManifest({
        characters: [
          { id: 'zhang-san', name: '张三', role: 'protagonist', traits: [], relationships: {} },
        ],
        facts: [
          {
            id: 'fact-1',
            content: '张三在京城',
            chapterNumber: 4,
            confidence: 'high',
            category: 'character',
            createdAt: '2026-01-01T00:00:00Z',
          },
        ],
      });

      validator = new PostWriteValidator({
        rules: [{ type: 'character-location', severity: 'critical' }],
      });

      const report = validator.validate(
        makeInput({
          chapterContent: '张三突然出现在东海之滨。',
          chapterNumber: 5,
          manifest,
        })
      );

      expect(report.overallStatus).toBe('fail');
      const locIssue = report.issues.find((i) => i.rule === 'character-location');
      expect(locIssue).toBeDefined();
      expect(locIssue?.severity).toBe('critical');
    });

    it('passes when travel transition is present', () => {
      const manifest = makeManifest({
        characters: [
          { id: 'zhang-san', name: '张三', role: 'protagonist', traits: [], relationships: {} },
        ],
        facts: [
          {
            id: 'fact-1',
            content: '张三在京城',
            chapterNumber: 4,
            confidence: 'high',
            category: 'character',
            createdAt: '2026-01-01T00:00:00Z',
          },
        ],
      });

      validator = new PostWriteValidator({
        rules: [{ type: 'character-location', severity: 'critical' }],
      });

      const report = validator.validate(
        makeInput({
          chapterContent: '张三收拾行囊，踏上了南下的旅途。经过三天的跋涉，他终于来到了江南水乡。',
          chapterNumber: 5,
          manifest,
        })
      );

      // Travel narrative detected, should pass
      expect(report.overallStatus).toBe('pass');
    });
  });

  // ── resource-change validation ────────────────────────────────

  describe('resource-change rule', () => {
    it('passes when no resource facts exist', () => {
      const manifest = makeManifest({
        facts: [
          {
            id: 'fact-1',
            content: '今天天气很好',
            chapterNumber: 3,
            confidence: 'high',
            category: 'world',
            createdAt: '2026-01-01T00:00:00Z',
          },
        ],
      });

      validator = new PostWriteValidator({
        rules: [{ type: 'resource-change', severity: 'critical' }],
      });

      const report = validator.validate(makeInput({ manifest }));

      expect(report.overallStatus).toBe('pass');
    });

    it('detects resource increase without source', () => {
      const manifest = makeManifest({
        facts: [
          {
            id: 'fact-res-1',
            content: '张三拥有：灵石 ×100',
            chapterNumber: 4,
            confidence: 'high',
            category: 'resource',
            createdAt: '2026-01-01T00:00:00Z',
          },
        ],
      });

      validator = new PostWriteValidator({
        rules: [{ type: 'resource-change', severity: 'critical' }],
      });

      const report = validator.validate(
        makeInput({
          chapterContent: '张三摸了摸怀里的灵石袋，里面竟然有100000块灵石。',
          chapterNumber: 5,
          manifest,
        })
      );

      expect(report.overallStatus).toBe('fail');
      const resIssue = report.issues.find((i) => i.rule === 'resource-change');
      expect(resIssue).toBeDefined();
    });

    it('passes when resource decrease is consistent', () => {
      const manifest = makeManifest({
        facts: [
          {
            id: 'fact-res-1',
            content: '张三拥有：灵石 ×100',
            chapterNumber: 3,
            confidence: 'high',
            category: 'resource',
            createdAt: '2026-01-01T00:00:00Z',
          },
        ],
      });

      validator = new PostWriteValidator({
        rules: [{ type: 'resource-change', severity: 'critical' }],
      });

      const report = validator.validate(
        makeInput({
          chapterContent: '张三花了十块灵石买了一碗茶。',
          chapterNumber: 5,
          manifest,
        })
      );

      // Spending resources is fine
      expect(report.overallStatus).toBe('pass');
    });
  });

  // ── relationship-state validation ─────────────────────────────

  describe('relationship-state rule', () => {
    it('detects sudden relationship reversal', () => {
      const manifest = makeManifest({
        characters: [
          {
            id: 'zhang-san',
            name: '张三',
            role: 'protagonist',
            traits: [],
            relationships: { 'li-si': '仇敌' },
          },
          {
            id: 'li-si',
            name: '李四',
            role: 'antagonist',
            traits: [],
            relationships: { 'zhang-san': '仇敌' },
          },
        ],
      });

      validator = new PostWriteValidator({
        rules: [{ type: 'relationship-state', severity: 'critical' }],
      });

      const report = validator.validate(
        makeInput({
          chapterContent: '张三是李四最信任的朋友，两人从小一起长大，亲如兄弟。',
          chapterNumber: 5,
          manifest,
        })
      );

      expect(report.overallStatus).toBe('fail');
      const relIssue = report.issues.find((i) => i.rule === 'relationship-state');
      expect(relIssue).toBeDefined();
      expect(relIssue?.severity).toBe('critical');
    });

    it('passes when relationship is consistent', () => {
      const manifest = makeManifest({
        characters: [
          {
            id: 'zhang-san',
            name: '张三',
            role: 'protagonist',
            traits: [],
            relationships: { 'li-si': '好友' },
          },
          {
            id: 'li-si',
            name: '李四',
            role: 'supporting',
            traits: [],
            relationships: { 'zhang-san': '好友' },
          },
        ],
      });

      validator = new PostWriteValidator({
        rules: [{ type: 'relationship-state', severity: 'critical' }],
      });

      const report = validator.validate(
        makeInput({
          chapterContent: '张三和李四一起喝茶聊天，两人谈笑风生。',
          chapterNumber: 5,
          manifest,
        })
      );

      expect(report.overallStatus).toBe('pass');
    });
  });

  // ── character-state validation ────────────────────────────────

  describe('character-state rule', () => {
    it('detects dead character appearing', () => {
      const manifest = makeManifest({
        characters: [
          { id: 'zhang-san', name: '张三', role: 'supporting', traits: [], relationships: {} },
        ],
        facts: [
          {
            id: 'fact-death',
            content: '张三已经死亡',
            chapterNumber: 3,
            confidence: 'high',
            category: 'character',
            createdAt: '2026-01-01T00:00:00Z',
          },
        ],
      });

      validator = new PostWriteValidator({
        rules: [{ type: 'character-state', severity: 'critical' }],
      });

      const report = validator.validate(
        makeInput({
          chapterContent: '张三推门走了进来，向大家打了声招呼。',
          chapterNumber: 5,
          manifest,
        })
      );

      expect(report.overallStatus).toBe('fail');
      const stateIssue = report.issues.find((i) => i.rule === 'character-state');
      expect(stateIssue).toBeDefined();
    });

    it('passes when deceased character appears in flashback', () => {
      const manifest = makeManifest({
        characters: [
          { id: 'zhang-san', name: '张三', role: 'supporting', traits: [], relationships: {} },
        ],
        facts: [
          {
            id: 'fact-death',
            content: '张三已经死亡',
            chapterNumber: 3,
            confidence: 'high',
            category: 'character',
            createdAt: '2026-01-01T00:00:00Z',
          },
        ],
      });

      validator = new PostWriteValidator({
        rules: [{ type: 'character-state', severity: 'critical' }],
      });

      const report = validator.validate(
        makeInput({
          chapterContent: '李四回忆起张三生前的一幕。那是一个阳光明媚的下午，张三推门走了进来。',
          chapterNumber: 5,
          manifest,
        })
      );

      expect(report.overallStatus).toBe('pass');
    });
  });

  // ── world-rule validation ─────────────────────────────────────

  describe('world-rule validation', () => {
    it('detects world rule violation', () => {
      const manifest = makeManifest({
        worldRules: [
          {
            id: 'rule-1',
            category: 'magic-system',
            rule: '灵力修炼必须经过筑基期，不可跳过',
            exceptions: [],
            sourceChapter: 1,
          },
        ],
      });

      validator = new PostWriteValidator({
        rules: [{ type: 'world-rule', severity: 'critical' }],
      });

      const report = validator.validate(
        makeInput({
          chapterContent: '张三直接跳过了筑基期，竟然拥有了金丹期的实力。',
          chapterNumber: 5,
          manifest,
        })
      );

      expect(report.overallStatus).toBe('fail');
      const worldIssue = report.issues.find((i) => i.rule === 'world-rule');
      expect(worldIssue).toBeDefined();
    });

    it('passes when world rule has exception for character', () => {
      const manifest = makeManifest({
        worldRules: [
          {
            id: 'rule-1',
            category: 'magic-system',
            rule: '灵力修炼必须经过筑基期，不可跳过',
            exceptions: ['张三'],
            sourceChapter: 1,
          },
        ],
      });

      validator = new PostWriteValidator({
        rules: [{ type: 'world-rule', severity: 'critical' }],
      });

      const report = validator.validate(
        makeInput({
          chapterContent: '张三直接跳过了筑基期，竟然拥有了金丹期的实力。',
          chapterNumber: 5,
          manifest,
        })
      );

      // Exception exists for 张三
      expect(report.overallStatus).toBe('pass');
    });
  });

  // ── combined rules ────────────────────────────────────────────

  describe('combined rules', () => {
    it('runs all enabled rules and aggregates issues', () => {
      const manifest = makeManifest({
        characters: [
          {
            id: 'zhang-san',
            name: '张三',
            role: 'protagonist',
            traits: [],
            relationships: { 'li-si': '仇敌' },
          },
          {
            id: 'li-si',
            name: '李四',
            role: 'antagonist',
            traits: [],
            relationships: {},
          },
        ],
        facts: [
          {
            id: 'fact-death',
            content: '王五已经死亡',
            chapterNumber: 3,
            confidence: 'high',
            category: 'character',
            createdAt: '2026-01-01T00:00:00Z',
          },
        ],
      });

      validator = new PostWriteValidator({
        rules: [
          { type: 'character-state', severity: 'critical' },
          { type: 'relationship-state', severity: 'critical' },
          { type: 'resource-change', severity: 'warning' },
        ],
      });

      const report = validator.validate(
        makeInput({
          chapterContent: '张三和李四亲如兄弟，两人谈笑风生。这时，已经死去的王五从门外走了进来。',
          chapterNumber: 5,
          manifest,
        })
      );

      expect(report.overallStatus).toBe('fail');
      expect(report.issues.length).toBeGreaterThanOrEqual(2);
    });

    it('returns warning when only warning-severity issues found', () => {
      validator = new PostWriteValidator({
        rules: [{ type: 'resource-change', severity: 'warning' }],
      });

      const manifest = makeManifest({
        facts: [
          {
            id: 'fact-res-1',
            content: '张三拥有：灵石 ×100',
            chapterNumber: 4,
            confidence: 'high',
            category: 'resource',
            createdAt: '2026-01-01T00:00:00Z',
          },
        ],
      });

      const report = validator.validate(
        makeInput({
          chapterContent: '张三摸了摸怀里的灵石袋，里面竟然有100000块灵石。',
          chapterNumber: 5,
          manifest,
        })
      );

      expect(report.overallStatus).toBe('warning');
    });
  });

  // ── validation input validation ───────────────────────────────

  describe('input validation', () => {
    it('rejects empty chapter content', () => {
      validator = new PostWriteValidator({ rules: [] });

      const report = validator.validate(makeInput({ chapterContent: '' }));

      expect(report.overallStatus).toBe('fail');
      expect(report.issues.some((i) => i.description.includes('内容'))).toBe(true);
    });

    it('rejects missing manifest', () => {
      validator = new PostWriteValidator({ rules: [] });

      const report = validator.validate({
        chapterContent: 'some content',
        chapterNumber: 1,
        manifest: undefined as unknown as Manifest,
      });

      expect(report.overallStatus).toBe('fail');
    });
  });

  // ── getRules() ────────────────────────────────────────────────

  describe('getRules', () => {
    it('returns configured rules', () => {
      const rules: ValidationRule[] = [
        { type: 'character-location', severity: 'critical' },
        { type: 'resource-change', severity: 'warning' },
      ];

      validator = new PostWriteValidator({ rules });

      expect(validator.getRules()).toEqual(rules);
    });
  });
});
