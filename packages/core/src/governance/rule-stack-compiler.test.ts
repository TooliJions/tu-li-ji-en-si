import { describe, it, expect, beforeEach } from 'vitest';
import { RuleStackCompiler, type RuleStackInput, type CompiledRule } from './rule-stack-compiler';

describe('RuleStackCompiler', () => {
  let compiler: RuleStackCompiler;

  beforeEach(() => {
    compiler = new RuleStackCompiler();
  });

  // ── Constructor ─────────────────────────────────────────────

  describe('constructor', () => {
    it('initializes without config', () => {
      expect(compiler).toBeDefined();
    });
  });

  // ── compile() — default rules ───────────────────────────────

  describe('compile() — defaults', () => {
    it('compiles a rule stack for a given chapter', () => {
      const input: RuleStackInput = {
        bookId: 'test-book',
        genre: 'xianxia',
        chapterNumber: 1,
        versionToken: 1,
      };

      const result = compiler.compile(input);

      expect(result.bookId).toBe('test-book');
      expect(result.chapterNumber).toBe(1);
      expect(result.versionToken).toBe(1);
      expect(result.rules.length).toBeGreaterThan(0);
    });

    it('generates rules for each entity type', () => {
      const input: RuleStackInput = {
        bookId: 'test-book',
        genre: 'xianxia',
        chapterNumber: 5,
        versionToken: 2,
      };

      const result = compiler.compile(input);
      const types = new Set(result.rules.map((r) => r.type));

      expect(types.has('hook')).toBe(true);
      expect(types.has('fact')).toBe(true);
      expect(types.has('character')).toBe(true);
      expect(types.has('world-rule')).toBe(true);
    });
  });

  // ── compile() — custom rules ────────────────────────────────

  describe('compile() — custom rules', () => {
    it('merges custom rules with defaults', () => {
      const customRule = {
        id: 'custom-1',
        type: 'hook',
        matcher: () => true,
        reason: '自定义规则',
      };

      const input: RuleStackInput = {
        bookId: 'test-book',
        genre: 'xianxia',
        chapterNumber: 3,
        versionToken: 1,
        customRules: [customRule],
      };

      const result = compiler.compile(input);
      const customFound = result.rules.some((r) => r.id === 'custom-1');

      expect(customFound).toBe(true);
      expect(result.rules.length).toBeGreaterThan(1);
    });

    it('custom rules are placed at the front of the stack', () => {
      const customRule = {
        id: 'custom-priority',
        type: 'fact',
        matcher: () => true,
        reason: '优先规则',
      };

      const result = compiler.compile({
        bookId: 'test-book',
        genre: 'xianxia',
        chapterNumber: 1,
        versionToken: 1,
        customRules: [customRule],
      });

      expect(result.rules[0].id).toBe('custom-priority');
    });
  });

  // ── compile() — genre context ───────────────────────────────

  describe('compile() — genre context', () => {
    it('generates genre-specific rules for xianxia', () => {
      const result = compiler.compile({
        bookId: 'test-book',
        genre: 'xianxia',
        chapterNumber: 1,
        versionToken: 1,
      });

      // Should have cultivation-related rule
      const reasons = result.rules.map((r) => r.reason).join(' ');
      expect(reasons).toContain('修仙');
    });

    it('generates genre-specific rules for urban', () => {
      const result = compiler.compile({
        bookId: 'test-book',
        genre: 'urban',
        chapterNumber: 1,
        versionToken: 1,
      });

      const reasons = result.rules.map((r) => r.reason).join(' ');
      expect(reasons).toContain('都市');
    });
  });

  // ── generateRuleStackYaml() ─────────────────────────────────

  describe('generateRuleStackYaml()', () => {
    it('generates valid YAML output', () => {
      const result = compiler.compile({
        bookId: 'test-book',
        genre: 'xianxia',
        chapterNumber: 1,
        versionToken: 1,
      });

      const yaml = compiler.generateRuleStackYaml(result);

      expect(yaml).toContain('bookId: test-book');
      expect(yaml).toContain('chapterNumber: 1');
      expect(yaml).toContain('rules:');
      expect(yaml).toContain('- id:');
    });

    it('includes all rules in YAML', () => {
      const result = compiler.compile({
        bookId: 'test-book',
        genre: 'xianxia',
        chapterNumber: 1,
        versionToken: 1,
      });

      const yaml = compiler.generateRuleStackYaml(result);
      const ruleCount = (yaml.match(/- id:/g) || []).length;

      expect(ruleCount).toBe(result.rules.length);
    });
  });

  // ── Validation ──────────────────────────────────────────────

  describe('validation', () => {
    it('returns error when bookId is empty', () => {
      const result = compiler.compile({
        bookId: '',
        genre: 'xianxia',
        chapterNumber: 1,
        versionToken: 1,
      });

      expect(result.error).toBeTruthy();
    });

    it('returns error when chapterNumber is invalid', () => {
      const result = compiler.compile({
        bookId: 'test-book',
        genre: 'xianxia',
        chapterNumber: 0,
        versionToken: 1,
      });

      expect(result.error).toBeTruthy();
    });

    it('returns error when genre is empty', () => {
      const result = compiler.compile({
        bookId: 'test-book',
        genre: '',
        chapterNumber: 1,
        versionToken: 1,
      });

      expect(result.error).toBeTruthy();
    });
  });
});
