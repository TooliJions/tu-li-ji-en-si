import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  TitleVoiceAuditor,
  type TitleVoiceInput,
  type TitleVoiceOutput,
} from './title-voice-auditor';
import type { LLMProvider } from '../llm/provider';

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

describe('TitleVoiceAuditor', () => {
  let mockProvider: ReturnType<typeof createMockProvider>;
  let auditor: TitleVoiceAuditor;

  beforeEach(() => {
    mockProvider = createMockProvider();
    auditor = new TitleVoiceAuditor(mockProvider);
  });

  // ── Properties ────────────────────────────────────────────

  describe('abstract properties', () => {
    it('has correct agent name', () => {
      expect(auditor.name).toBe('TitleVoiceAuditor');
    });

    it('uses analytical temperature (0.2 for objective auditing)', () => {
      expect(auditor.temperature).toBe(0.2);
    });
  });

  // ── execute() — happy path ────────────────────────────────

  describe('execute()', () => {
    const validInput: TitleVoiceInput = {
      chapterTitle: '拜入仙门',
      chapterContent: '林风踏入青云门，从此踏上修仙之路。',
      bookTitle: '修仙之路',
      chapterNumber: 3,
      genre: 'xianxia',
    };

    it('returns clean audit when title and voice are consistent', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [],
        titleScore: 90,
        voiceConsistency: 'pass',
        overallStatus: 'pass',
        summary: '标题与书名风格一致，作者声音连贯',
      });

      const result = await auditor.execute({
        promptContext: { input: validInput },
      });

      expect(result.success).toBe(true);
      const data = result.data as TitleVoiceOutput;
      expect(data.issues).toHaveLength(0);
      expect(data.overallStatus).toBe('pass');
    });

    it('detects title inconsistency with book theme', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [
          {
            category: 'title-mismatch',
            severity: 'warning',
            description: '章节标题"星际迷航"与仙侠题材不符',
            suggestion: '改为更具仙侠风格的标题',
          },
        ],
        titleScore: 40,
        voiceConsistency: 'pass',
        overallStatus: 'warning',
        summary: '标题与题材风格不符',
      });

      const result = await auditor.execute({
        promptContext: { input: validInput },
      });

      const data = result.data as TitleVoiceOutput;
      expect(data.issues.some((i) => i.category === 'title-mismatch')).toBe(true);
    });

    it('returns title score in output', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [],
        titleScore: 85,
        voiceConsistency: 'pass',
        overallStatus: 'pass',
        summary: '良好',
      });

      const result = await auditor.execute({
        promptContext: { input: validInput },
      });

      const data = result.data as TitleVoiceOutput;
      expect(data.titleScore).toBe(85);
    });

    it('includes voice consistency status in output', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [],
        titleScore: 80,
        voiceConsistency: 'warning',
        overallStatus: 'warning',
        summary: '作者声音有不连贯之处',
      });

      const result = await auditor.execute({
        promptContext: { input: validInput },
      });

      const data = result.data as TitleVoiceOutput;
      expect(data.voiceConsistency).toBe('warning');
    });
  });

  // ── execute() — with previous titles ──────────────────────

  describe('execute() — with previous titles', () => {
    it('checks title style consistency with previous chapters', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [],
        titleScore: 80,
        voiceConsistency: 'pass',
        overallStatus: 'pass',
        summary: '正常',
      });

      await auditor.execute({
        promptContext: {
          input: {
            ...validInput(),
            previousTitles: ['第一章 山村少年', '第二章 青云外门'],
          },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('山村少年');
    });

    it('detects title pattern deviation', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [
          {
            category: 'title-pattern-break',
            severity: 'suggestion',
            description: '标题格式与之前不一致',
            suggestion: '统一格式',
            affected: [],
            suggestionDetail: '',
          },
        ],
        titleScore: 60,
        voiceConsistency: 'pass',
        overallStatus: 'warning',
        summary: '标题格式有变化',
      });

      await auditor.execute({
        promptContext: {
          input: {
            ...validInput(),
            previousTitles: ['第1章 山村少年', '第2章 青云外门'],
          },
        },
      });

      const data = (
        await auditor.execute({
          promptContext: { input: validInput() },
        })
      ).data as TitleVoiceOutput;

      expect(data).toBeTruthy();
    });
  });

  // ── execute() — with author voice reference ───────────────

  describe('execute() — with author voice reference', () => {
    it('includes author voice reference for comparison', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [],
        titleScore: 80,
        voiceConsistency: 'pass',
        overallStatus: 'pass',
        summary: '正常',
      });

      await auditor.execute({
        promptContext: {
          input: {
            ...validInput(),
            authorVoiceReference: '作者风格：简洁明快，善用短句，对话中带有淡淡的武侠气息',
          },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('作者风格');
    });
  });

  // ── execute() — validation ────────────────────────────────

  describe('execute() — validation', () => {
    it('returns error when input is missing', async () => {
      const result = await auditor.execute({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('输入');
    });

    it('returns error when chapter title is missing', async () => {
      const result = await auditor.execute({
        promptContext: {
          input: {
            chapterContent: '内容',
            bookTitle: '书名',
            chapterNumber: 1,
            genre: 'xianxia',
          } as TitleVoiceInput,
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('标题');
    });

    it('returns error when book title is missing', async () => {
      const result = await auditor.execute({
        promptContext: {
          input: {
            chapterTitle: '标题',
            chapterContent: '内容',
            chapterNumber: 1,
            genre: 'xianxia',
          } as TitleVoiceInput,
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('书名');
    });

    it('returns error when genre is missing', async () => {
      const result = await auditor.execute({
        promptContext: {
          input: {
            chapterTitle: '标题',
            chapterContent: '内容',
            bookTitle: '书名',
            chapterNumber: 1,
          } as TitleVoiceInput,
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('题材');
    });
  });

  // ── execute() — genre context ─────────────────────────────

  describe('execute() — genre context', () => {
    it('includes genre-specific title criteria for xianxia', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [],
        titleScore: 80,
        voiceConsistency: 'pass',
        overallStatus: 'pass',
        summary: '正常',
      });

      await auditor.execute({
        promptContext: {
          input: {
            chapterTitle: '拜入仙门',
            chapterContent: '内容',
            bookTitle: '修仙之路',
            chapterNumber: 1,
            genre: 'xianxia',
          },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('仙侠');
    });

    it('includes genre-specific title criteria for sci-fi', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [],
        titleScore: 80,
        voiceConsistency: 'pass',
        overallStatus: 'pass',
        summary: '正常',
      });

      await auditor.execute({
        promptContext: {
          input: {
            chapterTitle: '星际启航',
            chapterContent: '内容',
            bookTitle: '星河',
            chapterNumber: 1,
            genre: 'sci-fi',
          },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('科幻');
    });

    it('handles unknown genre gracefully', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [],
        titleScore: 80,
        voiceConsistency: 'pass',
        overallStatus: 'pass',
        summary: '正常',
      });

      const result = await auditor.execute({
        promptContext: {
          input: {
            chapterTitle: '标题',
            chapterContent: '内容',
            bookTitle: '书名',
            chapterNumber: 1,
            genre: 'litrpg',
          },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('litrpg');
      expect(result.success).toBe(true);
    });
  });

  // ── execute() — LLM errors ────────────────────────────────

  describe('execute() — LLM errors', () => {
    it('returns error when LLM call fails', async () => {
      mockProvider.generateJSON.mockRejectedValue(new Error('API timeout'));

      const result = await auditor.execute({
        promptContext: {
          input: validInput(),
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('API timeout');
    });
  });
});

function validInput(): TitleVoiceInput {
  return {
    chapterTitle: '拜入仙门',
    chapterContent: '林风踏入青云门，从此踏上修仙之路。',
    bookTitle: '修仙之路',
    chapterNumber: 3,
    genre: 'xianxia',
  };
}
