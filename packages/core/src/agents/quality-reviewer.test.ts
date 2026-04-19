import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  QualityReviewer,
  type ReviewInput,
  type ReviewOutput,
  type QualityIssue,
} from './quality-reviewer';
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

describe('QualityReviewer', () => {
  let mockProvider: ReturnType<typeof createMockProvider>;
  let reviewer: QualityReviewer;

  beforeEach(() => {
    mockProvider = createMockProvider();
    reviewer = new QualityReviewer(mockProvider);
  });

  // ── Properties ────────────────────────────────────────────

  describe('abstract properties', () => {
    it('has correct agent name', () => {
      expect(reviewer.name).toBe('QualityReviewer');
    });

    it('uses analytical temperature (0.2 for objective review)', () => {
      expect(reviewer.temperature).toBe(0.2);
    });
  });

  // ── execute() — happy path ────────────────────────────────

  describe('execute()', () => {
    const validInput: ReviewInput = {
      chapterContent: '林风走进大厅，看到了许多人。大厅里很热闹。他感到很惊讶。然后他坐下来吃饭。',
      chapterNumber: 3,
      genre: 'xianxia',
    };

    it('returns review results with issues', async () => {
      const mockIssues: QualityIssue[] = [
        {
          severity: 'warning',
          category: 'repetition',
          description: '重复使用"大厅"',
          suggestion: '可用"殿内"、"堂中"等替换',
          location: { paragraph: 1 },
        },
      ];

      mockProvider.generateJSON.mockResolvedValue({
        issues: mockIssues,
        overallScore: 65,
        summary: '文本存在重复用词问题',
      });

      const result = await reviewer.execute({
        promptContext: { input: validInput },
      });

      expect(result.success).toBe(true);
      const data = result.data as ReviewOutput;
      expect(data.issues).toHaveLength(1);
      expect(data.overallScore).toBe(65);
    });

    it('categorizes issues by severity', async () => {
      const mockIssues: QualityIssue[] = [
        {
          severity: 'critical',
          category: 'consistency',
          description: '角色名字前后不一致',
          suggestion: '统一使用"林风"',
          location: {},
        },
        {
          severity: 'warning',
          category: 'repetition',
          description: '重复用词',
          suggestion: '替换',
          location: {},
        },
        {
          severity: 'suggestion',
          category: 'style',
          description: '可增强画面感',
          suggestion: '添加细节',
          location: {},
        },
      ];

      mockProvider.generateJSON.mockResolvedValue({
        issues: mockIssues,
        overallScore: 50,
        summary: '存在严重一致性问题',
      });

      const result = await reviewer.execute({
        promptContext: { input: validInput },
      });

      const data = result.data as ReviewOutput;
      expect(data.issues.some((i) => i.severity === 'critical')).toBe(true);
      expect(data.issues.some((i) => i.severity === 'warning')).toBe(true);
      expect(data.issues.some((i) => i.severity === 'suggestion')).toBe(true);
    });

    it('includes review summary in output', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [],
        overallScore: 85,
        summary: '整体质量良好',
      });

      const result = await reviewer.execute({
        promptContext: { input: validInput },
      });

      const data = result.data as ReviewOutput;
      expect(data.summary).toBe('整体质量良好');
    });

    it('returns high score when no issues found', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [],
        overallScore: 95,
        summary: '未发现明显问题',
      });

      const result = await reviewer.execute({
        promptContext: { input: validInput },
      });

      const data = result.data as ReviewOutput;
      expect(data.issues).toHaveLength(0);
      expect(data.overallScore).toBe(95);
    });
  });

  // ── execute() — with plan context ─────────────────────────

  describe('execute() — with plan context', () => {
    it('includes chapter plan when provided', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [],
        overallScore: 80,
        summary: '良好',
      });

      await reviewer.execute({
        promptContext: {
          input: {
            ...validInput(),
            chapterPlan: {
              intention: '展现主角坚定意志',
              keyEvents: ['面临困境', '做出决定'],
              emotionalBeat: '紧张→坚定',
            },
          },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('展现主角坚定意志');
    });

    it('includes intent guidance when provided', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [],
        overallScore: 80,
        summary: '良好',
      });

      await reviewer.execute({
        promptContext: {
          input: {
            ...validInput(),
            intentGuidance: '本章需要突出主角的内心独白',
          },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('内心独白');
    });
  });

  // ── execute() — validation ────────────────────────────────

  describe('execute() — validation', () => {
    it('returns error when input is missing', async () => {
      const result = await reviewer.execute({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('输入');
    });

    it('returns error when chapter content is missing', async () => {
      const result = await reviewer.execute({
        promptContext: {
          input: { chapterNumber: 1, genre: 'xianxia' } as ReviewInput,
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('内容');
    });

    it('returns error when chapter content is empty', async () => {
      const result = await reviewer.execute({
        promptContext: {
          input: { chapterContent: '', chapterNumber: 1, genre: 'xianxia' },
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('内容');
    });

    it('returns error when genre is missing', async () => {
      const result = await reviewer.execute({
        promptContext: {
          input: { chapterContent: 'some content', chapterNumber: 1 } as ReviewInput,
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('题材');
    });
  });

  // ── execute() — genre context ─────────────────────────────

  describe('execute() — genre context', () => {
    it('includes genre-specific review criteria for xianxia', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [],
        overallScore: 80,
        summary: '良好',
      });

      await reviewer.execute({
        promptContext: {
          input: { chapterContent: '内容', chapterNumber: 1, genre: 'xianxia' },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('仙侠');
    });

    it('includes genre-specific review criteria for horror', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [],
        overallScore: 80,
        summary: '良好',
      });

      await reviewer.execute({
        promptContext: {
          input: { chapterContent: '内容', chapterNumber: 1, genre: 'horror' },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('悬疑');
    });

    it('handles unknown genre gracefully', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [],
        overallScore: 80,
        summary: '良好',
      });

      const result = await reviewer.execute({
        promptContext: {
          input: { chapterContent: '内容', chapterNumber: 1, genre: 'litrpg' },
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

      const result = await reviewer.execute({
        promptContext: {
          input: validInput(),
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('API timeout');
    });
  });
});

function validInput(): ReviewInput {
  return {
    chapterContent: '林风走进大厅，看到了许多人。大厅里很热闹。他感到很惊讶。然后他坐下来吃饭。',
    chapterNumber: 3,
    genre: 'xianxia',
  };
}
