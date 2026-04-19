import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ContextGovernor,
  type ContextGovernorInput,
  type ContextGovernorOutput,
  type ContextRule,
} from './context-governor';
import type { Manifest, Hook, Fact, Character, WorldRule } from '../models/state';

describe('ContextGovernor', () => {
  let governor: ContextGovernor;
  let baseManifest: Manifest;

  beforeEach(() => {
    governor = new ContextGovernor();

    baseManifest = {
      bookId: 'test-book',
      versionToken: 3,
      lastChapterWritten: 5,
      currentFocus: '主角修炼',
      hooks: [
        {
          id: 'h1',
          description: '神秘玉佩',
          type: 'plot',
          status: 'open',
          priority: 'critical',
          plantedChapter: 1,
          relatedCharacters: ['林风'],
          relatedChapters: [1, 3],
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        } as Hook,
        {
          id: 'h2',
          description: '旧伤',
          type: 'character',
          status: 'progressing',
          priority: 'major',
          plantedChapter: 2,
          relatedCharacters: ['苏瑶'],
          relatedChapters: [2],
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        } as Hook,
        {
          id: 'h3',
          description: '废弃伏笔',
          type: 'plot',
          status: 'abandoned',
          priority: 'minor',
          plantedChapter: 1,
          relatedCharacters: [],
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
        {
          id: 'f2',
          content: '灵气等级分为练气、筑基、金丹',
          chapterNumber: 1,
          confidence: 'high',
          category: 'world',
          createdAt: '2024-01-01T00:00:00Z',
        } as Fact,
        {
          id: 'f3',
          content: '苏瑶受了内伤',
          chapterNumber: 3,
          confidence: 'medium',
          category: 'character',
          createdAt: '2024-01-01T00:00:00Z',
        } as Fact,
      ],
      characters: [
        {
          id: 'c1',
          name: '林风',
          role: 'protagonist',
          traits: ['勇敢', '聪明'],
          relationships: {},
          firstAppearance: 1,
          lastAppearance: 5,
        } as Character,
        {
          id: 'c2',
          name: '苏瑶',
          role: 'supporting',
          traits: ['温柔'],
          relationships: {},
          firstAppearance: 2,
          lastAppearance: 3,
        } as Character,
        {
          id: 'c3',
          name: '路人甲',
          role: 'minor',
          traits: [],
          relationships: {},
          firstAppearance: 1,
          lastAppearance: 1,
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
        {
          id: 'w2',
          category: 'society',
          rule: '青云门是天剑宗的附庸',
          exceptions: [],
          sourceChapter: 1,
        } as WorldRule,
      ],
      updatedAt: '2024-01-01T00:00:00Z',
    };
  });

  // ── Constructor ─────────────────────────────────────────────

  describe('constructor', () => {
    it('initializes with default config', () => {
      expect(governor).toBeDefined();
    });
  });

  // ── execute() — basic filtering ─────────────────────────────

  describe('execute() — filtering', () => {
    it('filters out abandoned hooks', async () => {
      const input: ContextGovernorInput = {
        bookId: 'test-book',
        chapterNumber: 6,
        manifest: baseManifest,
      };

      const result = await governor.execute(input);

      expect(result.success).toBe(true);
      const data = result.data as ContextGovernorOutput;
      expect(data.filteredHooks.some((h) => h.id === 'h3')).toBe(false);
      expect(data.filteredHooks.some((h) => h.id === 'h1')).toBe(true);
      expect(data.filteredHooks.some((h) => h.id === 'h2')).toBe(true);
    });

    it('includes all active facts', async () => {
      const input: ContextGovernorInput = {
        bookId: 'test-book',
        chapterNumber: 6,
        manifest: baseManifest,
      };

      const result = await governor.execute(input);
      const data = result.data as ContextGovernorOutput;

      expect(data.filteredFacts).toHaveLength(3);
    });

    it('includes all characters', async () => {
      const input: ContextGovernorInput = {
        bookId: 'test-book',
        chapterNumber: 6,
        manifest: baseManifest,
      };

      const result = await governor.execute(input);
      const data = result.data as ContextGovernorOutput;

      expect(data.filteredCharacters).toHaveLength(3);
    });

    it('includes all world rules', async () => {
      const input: ContextGovernorInput = {
        bookId: 'test-book',
        chapterNumber: 6,
        manifest: baseManifest,
      };

      const result = await governor.execute(input);
      const data = result.data as ContextGovernorOutput;

      expect(data.filteredWorldRules).toHaveLength(2);
    });
  });

  // ── execute() — relevance filtering ─────────────────────────

  describe('execute() — relevance', () => {
    it('prioritizes hooks related to current chapter characters', async () => {
      const input: ContextGovernorInput = {
        bookId: 'test-book',
        chapterNumber: 6,
        manifest: baseManifest,
        focusCharacters: ['林风'],
      };

      const result = await governor.execute(input);
      const data = result.data as ContextGovernorOutput;

      // h1 is related to 林风, should be included
      expect(data.filteredHooks.some((h) => h.id === 'h1')).toBe(true);
    });

    it('excludes characters not seen in recent chapters', async () => {
      const input: ContextGovernorInput = {
        bookId: 'test-book',
        chapterNumber: 8,
        manifest: baseManifest,
        relevanceWindow: 5,
      };

      const result = await governor.execute(input);
      const data = result.data as ContextGovernorOutput;

      // 路人甲 lastAppearance: 1, chapterNumber: 8, window: 5 → excluded (8-1=7 > 5)
      expect(data.filteredCharacters.some((c) => c.name === '路人甲')).toBe(false);
      // 林风 lastAppearance: 5 → within window (8-5=3 <= 5)
      expect(data.filteredCharacters.some((c) => c.name === '林风')).toBe(true);
    });

    it('includes all characters when relevanceWindow is 0', async () => {
      const input: ContextGovernorInput = {
        bookId: 'test-book',
        chapterNumber: 20,
        manifest: baseManifest,
        relevanceWindow: 0,
      };

      const result = await governor.execute(input);
      const data = result.data as ContextGovernorOutput;

      expect(data.filteredCharacters).toHaveLength(3);
    });
  });

  // ── execute() — custom rules ────────────────────────────────

  describe('execute() — custom rules', () => {
    it('applies custom rules to filter context', async () => {
      const rules: ContextRule[] = [
        {
          id: 'rule-1',
          type: 'fact',
          condition: 'item.category == "world"',
          priority: 1,
          enabled: true,
          action: 'exclude',
        },
      ];

      const input: ContextGovernorInput = {
        bookId: 'test-book',
        chapterNumber: 6,
        manifest: baseManifest,
        rules,
      };

      const result = await governor.execute(input);
      const data = result.data as ContextGovernorOutput;

      // f2 is world category, should be excluded
      expect(data.filteredFacts.some((f) => f.id === 'f2')).toBe(false);
      // f1 and f3 should remain
      expect(data.filteredFacts).toHaveLength(2);
    });
  });

  // ── execute() — empty manifest ──────────────────────────────

  describe('execute() — empty manifest', () => {
    it('handles empty manifest gracefully', async () => {
      const emptyManifest: Manifest = {
        bookId: 'empty-book',
        versionToken: 1,
        lastChapterWritten: 0,
        hooks: [],
        facts: [],
        characters: [],
        worldRules: [],
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const result = await governor.execute({
        bookId: 'empty-book',
        chapterNumber: 1,
        manifest: emptyManifest,
      });

      expect(result.success).toBe(true);
      const data = result.data as ContextGovernorOutput;
      expect(data.filteredHooks).toEqual([]);
      expect(data.filteredFacts).toEqual([]);
      expect(data.filteredCharacters).toEqual([]);
      expect(data.filteredWorldRules).toEqual([]);
    });
  });

  // ── generateContextJson() ───────────────────────────────────

  describe('generateContextJson()', () => {
    it('generates structured context.json output', async () => {
      const result = await governor.execute({
        bookId: 'test-book',
        chapterNumber: 6,
        manifest: baseManifest,
      });

      const data = result.data as ContextGovernorOutput;
      const json = governor.generateContextJson(data, { bookId: 'test-book', chapterNumber: 6 });

      const parsed = JSON.parse(json);
      expect(parsed.bookId).toBe('test-book');
      expect(parsed.chapterNumber).toBe(6);
      expect(parsed.hooks).toHaveLength(2);
      expect(parsed.facts).toHaveLength(3);
      expect(parsed.characters).toHaveLength(3);
      expect(parsed.worldRules).toHaveLength(2);
    });
  });

  // ── Validation ──────────────────────────────────────────────

  describe('validation', () => {
    it('returns error when manifest is missing', async () => {
      const result = await governor.execute({
        bookId: 'test-book',
        chapterNumber: 6,
        manifest: null as unknown as Manifest,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('manifest');
    });

    it('returns error when chapterNumber is invalid', async () => {
      const result = await governor.execute({
        bookId: 'test-book',
        chapterNumber: 0,
        manifest: baseManifest,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('章节号');
    });
  });

  // ── Custom rule types ───────────────────────────────────────

  describe('custom rule types', () => {
    it('applies include action for hooks', async () => {
      const rules: ContextRule[] = [
        {
          id: 'rule-hook-include',
          type: 'hook',
          condition: 'item.priority == "critical"',
          priority: 1,
          enabled: true,
          action: 'include',
        },
      ];

      const result = await governor.execute({
        bookId: 'test-book',
        chapterNumber: 6,
        manifest: baseManifest,
        rules,
      });

      const data = result.data as ContextGovernorOutput;
      // Only critical hooks should remain
      expect(data.filteredHooks.every((h) => h.priority === 'critical')).toBe(true);
    });

    it('applies exclude action for characters', async () => {
      const rules: ContextRule[] = [
        {
          id: 'rule-char-exclude',
          type: 'character',
          condition: 'item.role == "minor"',
          priority: 1,
          enabled: true,
          action: 'exclude',
        },
      ];

      const result = await governor.execute({
        bookId: 'test-book',
        chapterNumber: 6,
        manifest: baseManifest,
        rules,
      });

      const data = result.data as ContextGovernorOutput;
      expect(data.filteredCharacters.some((c) => c.name === '路人甲')).toBe(false);
    });

    it('applies exclude action for world-rules', async () => {
      const rules: ContextRule[] = [
        {
          id: 'rule-world-exclude',
          type: 'world-rule',
          condition: 'item.category == "society"',
          priority: 1,
          enabled: true,
          action: 'exclude',
        },
      ];

      const result = await governor.execute({
        bookId: 'test-book',
        chapterNumber: 6,
        manifest: baseManifest,
        rules,
      });

      const data = result.data as ContextGovernorOutput;
      expect(data.filteredWorldRules.some((w) => w.category === 'society')).toBe(false);
    });

    it('ignores disabled rules', async () => {
      const rules: ContextRule[] = [
        {
          id: 'rule-disabled',
          type: 'fact',
          condition: 'item.category == "world"',
          priority: 1,
          enabled: false,
          action: 'exclude',
        },
      ];

      const result = await governor.execute({
        bookId: 'test-book',
        chapterNumber: 6,
        manifest: baseManifest,
        rules,
      });

      const data = result.data as ContextGovernorOutput;
      // Disabled rule should not filter anything
      expect(data.filteredFacts).toHaveLength(3);
    });

    it('handles invalid condition gracefully', async () => {
      const rules: ContextRule[] = [
        {
          id: 'rule-invalid',
          type: 'fact',
          condition: 'invalid syntax !!!',
          priority: 1,
          enabled: true,
          action: 'exclude',
        },
      ];

      const result = await governor.execute({
        bookId: 'test-book',
        chapterNumber: 6,
        manifest: baseManifest,
        rules,
      });

      // Should not crash, facts should all be excluded (eval returns false, exclude false = keep)
      expect(result.success).toBe(true);
    });
  });
});
