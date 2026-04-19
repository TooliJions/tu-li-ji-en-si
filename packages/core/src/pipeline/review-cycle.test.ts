import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LLMProvider } from '../llm/provider';
import { ChapterReviewCycle } from './review-cycle';

const LONG_CONTENT =
  '这是一个足够长的章节内容。林风走进大厅，只见人头攒动，觥筹交错。他微微一怔，心中暗道此地不宜久留。于是他转身离开，不再回头。大厅外月光如水，洒在青石板上。';

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

describe('ChapterReviewCycle', () => {
  let mockProvider: ReturnType<typeof createMockProvider>;
  let cycle: ChapterReviewCycle;

  beforeEach(() => {
    mockProvider = createMockProvider();
    cycle = new ChapterReviewCycle({
      provider: mockProvider,
      maxRevisions: 2,
      minAcceptableScore: 60,
    });
  });

  // ── Constructor ─────────────────────────────────────────────

  describe('constructor', () => {
    it('initializes with defaults when config is minimal', () => {
      const minimal = new ChapterReviewCycle({ provider: mockProvider });
      expect(minimal).toBeDefined();
    });

    it('uses custom config values', () => {
      const custom = new ChapterReviewCycle({
        provider: mockProvider,
        maxRevisions: 5,
        minAcceptableScore: 80,
      });
      expect(custom).toBeDefined();
    });
  });

  // ── execute() — pass on first try ───────────────────────────

  describe('execute() — pass', () => {
    it('accepts chapter when audit score meets threshold', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [],
        overallScore: 85,
        overallStatus: 'pass',
        summary: '质量良好',
      });

      const result = await cycle.execute({
        content: LONG_CONTENT,
        genre: 'xianxia',
        chapterNumber: 1,
        bookId: 'test-book',
      });

      expect(result.decision).toBe('accept');
      expect(result.revisionCount).toBe(0);
      expect(result.finalScore).toBe(85);
    });

    it('accepts chapter with warnings when score is above threshold', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [{ severity: 'warning', description: '节奏稍慢' }],
        overallScore: 70,
        overallStatus: 'warning',
        summary: '有小问题',
      });

      const result = await cycle.execute({
        content: LONG_CONTENT,
        genre: 'xianxia',
        chapterNumber: 1,
        bookId: 'test-book',
      });

      expect(result.decision).toBe('accept');
    });
  });

  // ── execute() — revision loop ───────────────────────────────

  describe('execute() — revision', () => {
    it('revises once on first audit failure then passes', async () => {
      mockProvider.generateJSON.mockResolvedValueOnce({
        issues: [{ severity: 'blocking', description: '角色前后矛盾' }],
        overallScore: 40,
        overallStatus: 'fail',
        summary: '需要修订',
      });

      mockProvider.generate.mockResolvedValueOnce({
        text: LONG_CONTENT + '修订版',
        usage: { promptTokens: 200, completionTokens: 100, totalTokens: 300 },
        model: 'test',
      });

      mockProvider.generateJSON.mockResolvedValueOnce({
        issues: [],
        overallScore: 75,
        overallStatus: 'pass',
        summary: '修订通过',
      });

      const result = await cycle.execute({
        content: LONG_CONTENT,
        genre: 'xianxia',
        chapterNumber: 1,
        bookId: 'test-book',
      });

      expect(result.decision).toBe('accept');
      expect(result.revisionCount).toBe(1);
      expect(result.content).toContain('修订版');
    });

    it('revises up to maxRevisions then falls back to accept', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [{ severity: 'blocking', description: '问题' }],
        overallScore: 30,
        overallStatus: 'fail',
        summary: '失败',
      });

      mockProvider.generate.mockResolvedValue({
        text: LONG_CONTENT + '修订',
        usage: { promptTokens: 200, completionTokens: 100, totalTokens: 300 },
        model: 'test',
      });

      const result = await cycle.execute({
        content: LONG_CONTENT,
        genre: 'xianxia',
        chapterNumber: 1,
        bookId: 'test-book',
      });

      expect(result.decision).toBe('accept');
      expect(result.revisionCount).toBeGreaterThan(0);
    });

    it('includes all audit reports in result', async () => {
      mockProvider.generateJSON.mockResolvedValueOnce({
        issues: [{ severity: 'blocking', description: '问题1' }],
        overallScore: 40,
        overallStatus: 'fail',
        summary: '第一轮审计',
      });

      mockProvider.generate.mockResolvedValueOnce({
        text: LONG_CONTENT + '修订',
        usage: { promptTokens: 200, completionTokens: 100, totalTokens: 300 },
        model: 'test',
      });

      mockProvider.generateJSON.mockResolvedValueOnce({
        issues: [],
        overallScore: 75,
        overallStatus: 'pass',
        summary: '第二轮审计',
      });

      const result = await cycle.execute({
        content: LONG_CONTENT,
        genre: 'xianxia',
        chapterNumber: 1,
        bookId: 'test-book',
      });

      expect(result.auditReports).toHaveLength(2);
    });
  });

  // ── execute() — rewrite decision ────────────────────────────

  describe('execute() — rewrite decision', () => {
    it('returns rewrite decision when revision LLM fails', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [{ severity: 'blocking', description: '严重问题' }],
        overallScore: 10,
        overallStatus: 'fail',
        summary: '极差',
      });

      mockProvider.generate.mockRejectedValue(new Error('Revision LLM error'));

      const result = await cycle.execute({
        content: LONG_CONTENT,
        genre: 'xianxia',
        chapterNumber: 1,
        bookId: 'test-book',
      });

      expect(result.decision).toBe('rewrite');
      expect(result.error).toContain('Revision');
    });
  });

  // ── execute() — skip decision ───────────────────────────────

  describe('execute() — skip', () => {
    it('returns skip when content is too short to audit', async () => {
      const result = await cycle.execute({
        content: '短',
        genre: 'xianxia',
        chapterNumber: 1,
        bookId: 'test-book',
      });

      expect(result.decision).toBe('skip');
    });
  });

  // ── execute() — error handling ──────────────────────────────

  describe('execute() — error handling', () => {
    it('returns rewrite when audit fails catastrophically', async () => {
      mockProvider.generateJSON.mockRejectedValue(new Error('LLM crash'));

      const result = await cycle.execute({
        content: LONG_CONTENT,
        genre: 'xianxia',
        chapterNumber: 1,
        bookId: 'test-book',
      });

      expect(result.decision).toBe('rewrite');
      expect(result.error).toContain('LLM crash');
    });
  });

  // ── validate() ──────────────────────────────────────────────

  describe('validate()', () => {
    it('returns true for valid chapter content', () => {
      const result = cycle.validate(LONG_CONTENT);
      expect(result.valid).toBe(true);
    });

    it('returns false for empty content', () => {
      const result = cycle.validate('');
      expect(result.valid).toBe(false);
    });

    it('returns false for too-short content', () => {
      const result = cycle.validate('短句');
      expect(result.valid).toBe(false);
    });

    it('includes reason in validation result', () => {
      const result = cycle.validate('');
      expect(result.reason).toBeTruthy();
    });
  });

  // ── buildReport() ───────────────────────────────────────────

  describe('buildReport()', () => {
    it('builds a structured report from audit results', () => {
      const reports = [
        {
          issues: [{ severity: 'warning', description: '问题1' }],
          overallScore: 70,
          overallStatus: 'warning' as const,
          summary: '第一轮',
        },
        {
          issues: [] as Array<{ severity: string; description: string }>,
          overallScore: 85,
          overallStatus: 'pass' as const,
          summary: '第二轮',
        },
      ];

      const report = cycle.buildReport({
        bookId: 'test-book',
        chapterNumber: 1,
        content: LONG_CONTENT,
        auditReports: reports,
        revisionCount: 1,
        decision: 'accept',
      });

      expect(report.bookId).toBe('test-book');
      expect(report.chapterNumber).toBe(1);
      expect(report.totalIssues).toBe(1);
    });
  });
});
