import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LLMProvider } from '../llm/provider';
import {
  TruthValidation,
  type TruthValidationInput,
  type TruthValidationResult,
  type TruthIssue,
} from './truth-validation';
import type { Manifest, Fact, WorldRule, Character, Hook } from '../models/state';

function createMockProvider(): LLMProvider & {
  generate: ReturnType<typeof vi.fn>;
  generateJSON: ReturnType<typeof vi.fn>;
} {
  return {
    generate: vi.fn(),
    generateJSON: vi.fn(),
  } as unknown as LLMProvider & {
    generate: ReturnType<typeof vi.fn>;
    generateJSON: ReturnType<typeof vi.fn>;
  };
}

describe('TruthValidation', () => {
  let mockProvider: ReturnType<typeof createMockProvider>;
  let validator: TruthValidation;

  beforeEach(() => {
    mockProvider = createMockProvider();
    validator = new TruthValidation({ provider: mockProvider });
  });

  // ── Constructor ─────────────────────────────────────────────

  describe('constructor', () => {
    it('initializes with provider', () => {
      expect(validator).toBeDefined();
    });
  });

  // ── validate() — pass ───────────────────────────────────────

  describe('validate() — pass', () => {
    it('passes when content has no contradictions', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        conflicts: [],
        overallStatus: 'pass',
        summary: '无矛盾',
      });

      const result = await validator.validate({
        content: '林风走进大厅，只见人头攒动。',
        genre: 'xianxia',
        chapterNumber: 6,
        facts: [
          {
            id: 'f1',
            content: '林风是青云门弟子',
            chapterNumber: 1,
            confidence: 'high',
            category: 'character',
            createdAt: '2024-01-01T00:00:00Z',
          } as Fact,
        ],
        worldRules: [
          {
            id: 'w1',
            category: 'magic-system',
            rule: '灵气只能在有灵脉的地方修炼',
            exceptions: [],
            sourceChapter: 1,
          } as WorldRule,
        ],
        characters: [
          {
            id: 'c1',
            name: '林风',
            role: 'protagonist',
            traits: ['勇敢'],
            relationships: {},
            firstAppearance: 1,
          } as Character,
        ],
      });

      expect(result.passed).toBe(true);
      expect(result.conflicts).toHaveLength(0);
    });

    it('passes with warnings for minor issues', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        conflicts: [
          {
            fact: '某事实',
            contradiction: '轻微偏差',
            severity: 'warning',
            suggestion: '注意一致性',
          },
        ],
        overallStatus: 'warning',
        summary: '有小问题',
      });

      const result = await validator.validate({
        content:
          '这是一个足够长的章节内容。林风走进大厅，只见人头攒动，觥筹交错。他微微一怔，心中暗道此地不宜久留。',
        genre: 'xianxia',
        chapterNumber: 6,
        facts: [
          {
            id: 'f1',
            content: '某事实',
            chapterNumber: 1,
            confidence: 'medium',
            category: 'world',
            createdAt: '2024-01-01T00:00:00Z',
          } as Fact,
        ],
        worldRules: [],
        characters: [],
      });

      expect(result.passed).toBe(true);
      expect(result.conflicts).toHaveLength(1);
    });
  });

  // ── validate() — reject ─────────────────────────────────────

  describe('validate() — reject', () => {
    it('rejects when content contradicts established facts', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        conflicts: [
          {
            fact: '林风是青云门弟子',
            contradiction: '文中说林风是天剑宗弟子',
            severity: 'critical',
            suggestion: '修正师门设定',
          },
        ],
        overallStatus: 'fail',
        summary: '存在严重矛盾',
      });

      const result = await validator.validate({
        content: '这是一个足够长的章节内容。林风是天剑宗的弟子，自幼在此修炼。',
        genre: 'xianxia',
        chapterNumber: 6,
        facts: [
          {
            id: 'f1',
            content: '林风是青云门弟子',
            chapterNumber: 1,
            confidence: 'high',
            category: 'character',
            createdAt: '2024-01-01T00:00:00Z',
          } as Fact,
        ],
        worldRules: [],
        characters: [
          {
            id: 'c1',
            name: '林风',
            role: 'protagonist',
            traits: ['勇敢'],
            relationships: {},
            firstAppearance: 1,
          } as Character,
        ],
      });

      expect(result.passed).toBe(false);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].severity).toBe('critical');
    });

    it('rejects when content violates world rules', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        conflicts: [
          {
            fact: '灵气只能在有灵脉的地方修炼',
            contradiction: '文中在无灵脉处修炼',
            severity: 'critical',
            suggestion: '遵守世界规则',
          },
        ],
        overallStatus: 'fail',
        summary: '违反世界规则',
      });

      const result = await validator.validate({
        content: '这是一个足够长的章节内容。林风在荒原上吸收灵气，尽管这里没有任何灵脉。',
        genre: 'xianxia',
        chapterNumber: 6,
        facts: [],
        worldRules: [
          {
            id: 'w1',
            category: 'magic-system',
            rule: '灵气只能在有灵脉的地方修炼',
            exceptions: [],
            sourceChapter: 1,
          } as WorldRule,
        ],
        characters: [],
      });

      expect(result.passed).toBe(false);
    });

    it('rejects when character traits are inconsistent', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        conflicts: [
          {
            fact: '林风',
            contradiction: '文中说林风不会武功',
            severity: 'critical',
            suggestion: '检查角色设定',
          },
        ],
        overallStatus: 'fail',
        summary: '角色矛盾',
      });

      const result = await validator.validate({
        content: '这是一个足够长的章节内容。林风完全不会武功，只是个普通人。',
        genre: 'xianxia',
        chapterNumber: 6,
        facts: [],
        worldRules: [],
        characters: [
          {
            id: 'c1',
            name: '林风',
            role: 'protagonist',
            traits: ['武功高强', '勇敢'],
            relationships: {},
            firstAppearance: 1,
          } as Character,
        ],
      });

      expect(result.passed).toBe(false);
    });
  });

  // ── validate() — error handling ─────────────────────────────

  describe('validate() — error handling', () => {
    it('returns error when LLM call fails', async () => {
      mockProvider.generateJSON.mockRejectedValue(new Error('LLM timeout'));

      const result = await validator.validate({
        content: '这是一个足够长的章节内容。林风走进大厅。',
        genre: 'xianxia',
        chapterNumber: 6,
        facts: [],
        worldRules: [],
        characters: [],
      });

      expect(result.passed).toBe(false);
      expect(result.error).toContain('timeout');
    });

    it('returns error when content is empty', async () => {
      const result = await validator.validate({
        content: '',
        genre: 'xianxia',
        chapterNumber: 6,
        facts: [],
        worldRules: [],
        characters: [],
      });

      expect(result.passed).toBe(false);
      expect(result.error).toContain('内容');
    });

    it('returns error when chapterNumber is invalid', async () => {
      const result = await validator.validate({
        content: '这是一个足够长的章节内容。林风走进大厅。',
        genre: 'xianxia',
        chapterNumber: 0,
        facts: [],
        worldRules: [],
        characters: [],
      });

      expect(result.passed).toBe(false);
      expect(result.error).toContain('章节号');
    });
  });

  // ── validateFromManifest() ──────────────────────────────────

  describe('validateFromManifest()', () => {
    it('extracts data from manifest and validates', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        conflicts: [],
        overallStatus: 'pass',
        summary: '通过',
      });

      const manifest: Manifest = {
        bookId: 'test-book',
        versionToken: 3,
        lastChapterWritten: 5,
        hooks: [
          {
            id: 'h1',
            description: '神秘玉佩',
            type: 'plot',
            status: 'open',
            priority: 'critical',
            plantedChapter: 1,
            relatedCharacters: ['林风'],
            relatedChapters: [1],
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          } as Hook,
        ],
        facts: [
          {
            id: 'f1',
            content: '林风是青云门弟子',
            chapterNumber: 1,
            confidence: 'high',
            category: 'character',
            createdAt: '2024-01-01T00:00:00Z',
          } as Fact,
        ],
        characters: [
          {
            id: 'c1',
            name: '林风',
            role: 'protagonist',
            traits: ['勇敢'],
            relationships: {},
            firstAppearance: 1,
          } as Character,
        ],
        worldRules: [
          {
            id: 'w1',
            category: 'magic-system',
            rule: '灵气只能在有灵脉的地方修炼',
            exceptions: [],
            sourceChapter: 1,
          } as WorldRule,
        ],
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const result = await validator.validateFromManifest({
        content: '这是一个足够长的章节内容。林风在青云门修炼。',
        chapterNumber: 6,
        manifest,
      });

      expect(result.passed).toBe(true);
    });

    it('handles manifest with empty collections', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        conflicts: [],
        overallStatus: 'pass',
        summary: '无数据，通过',
      });

      const manifest: Manifest = {
        bookId: 'empty-book',
        versionToken: 1,
        lastChapterWritten: 0,
        hooks: [],
        facts: [],
        characters: [],
        worldRules: [],
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const result = await validator.validateFromManifest({
        content: '这是一个足够长的章节内容。第一章故事开始。',
        chapterNumber: 1,
        manifest,
      });

      expect(result.passed).toBe(true);
    });
  });

  // ── getValidationSummary() ──────────────────────────────────

  describe('getValidationSummary()', () => {
    it('generates a human-readable summary', () => {
      const result: TruthValidationResult = {
        passed: false,
        conflicts: [
          {
            fact: '林风是青云门弟子',
            contradiction: '文中说林风是天剑宗弟子',
            severity: 'critical',
            suggestion: '修正师门设定',
          },
          {
            fact: '灵气规则',
            contradiction: '违规修炼',
            severity: 'warning',
            suggestion: '注意规则',
          },
        ],
        error: undefined,
      };

      const summary = validator.getValidationSummary(result);

      expect(summary).toContain('未通过');
      expect(summary).toContain('critical');
      expect(summary).toContain('warning');
    });

    it('generates pass summary', () => {
      const result: TruthValidationResult = {
        passed: true,
        conflicts: [],
        error: undefined,
      };

      const summary = validator.getValidationSummary(result);

      expect(summary).toContain('通过');
    });
  });
});
