import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  StyleAuditor,
  type StyleAuditInput,
  type StyleAuditOutput,
  type StyleIssue,
} from './style-auditor';
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

describe('StyleAuditor', () => {
  let mockProvider: ReturnType<typeof createMockProvider>;
  let auditor: StyleAuditor;

  beforeEach(() => {
    mockProvider = createMockProvider();
    auditor = new StyleAuditor(mockProvider);
  });

  // ── Properties ────────────────────────────────────────────

  describe('abstract properties', () => {
    it('has correct agent name', () => {
      expect(auditor.name).toBe('StyleAuditor');
    });

    it('uses analytical temperature (0.2 for objective style auditing)', () => {
      expect(auditor.temperature).toBe(0.2);
    });
  });

  // ── execute() — happy path ────────────────────────────────

  describe('execute()', () => {
    const validInput: StyleAuditInput = {
      chapterContent: '林风说道："我知道了。"李长老说："好的，你退下吧。"苏瑶说："好的。"',
      chapterNumber: 3,
      genre: 'xianxia',
    };

    it('returns style audit results with issues', async () => {
      const mockIssues: StyleIssue[] = [
        {
          category: 'dialogue-uniformity',
          severity: 'warning',
          description: '多个角色使用相同的说话方式',
          affected: ['林风', '李长老', '苏瑶'],
          suggestion: '为每个角色赋予独特的说话风格',
        },
      ];

      mockProvider.generateJSON.mockResolvedValue({
        issues: mockIssues,
        styleConsistency: {
          dialogueConsistency: 'warning',
          narrativeTone: 'pass',
          sentenceVariety: 'pass',
        },
        overallStatus: 'warning',
        summary: '发现角色对话风格缺乏区分度',
      });

      const result = await auditor.execute({
        promptContext: { input: validInput },
      });

      expect(result.success).toBe(true);
      const data = result.data as StyleAuditOutput;
      expect(data.issues).toHaveLength(1);
      expect(data.overallStatus).toBe('warning');
    });

    it('returns pass status when style is consistent', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [],
        styleConsistency: {
          dialogueConsistency: 'pass',
          narrativeTone: 'pass',
          sentenceVariety: 'pass',
        },
        overallStatus: 'pass',
        summary: '文风一致，未发现问题',
      });

      const result = await auditor.execute({
        promptContext: { input: validInput },
      });

      const data = result.data as StyleAuditOutput;
      expect(data.issues).toHaveLength(0);
      expect(data.overallStatus).toBe('pass');
    });

    it('includes style consistency metrics in output', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [],
        styleConsistency: {
          dialogueConsistency: 'pass',
          narrativeTone: 'warning',
          sentenceVariety: 'pass',
        },
        overallStatus: 'warning',
        summary: '叙述语调有不一致之处',
      });

      const result = await auditor.execute({
        promptContext: { input: validInput },
      });

      const data = result.data as StyleAuditOutput;
      expect(data.styleConsistency.dialogueConsistency).toBe('pass');
      expect(data.styleConsistency.narrativeTone).toBe('warning');
    });
  });

  // ── execute() — with style reference ──────────────────────

  describe('execute() — with style reference', () => {
    it('includes reference style for comparison', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [],
        styleConsistency: {
          dialogueConsistency: 'pass',
          narrativeTone: 'pass',
          sentenceVariety: 'pass',
        },
        overallStatus: 'pass',
        summary: '正常',
      });

      await auditor.execute({
        promptContext: {
          input: {
            ...validInput(),
            referenceStyle: '古朴雅致的仙侠文风，角色对话使用半文半白的语言',
          },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('古朴雅致');
    });

    it('includes character voice profiles for dialogue checking', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [],
        styleConsistency: {
          dialogueConsistency: 'pass',
          narrativeTone: 'pass',
          sentenceVariety: 'pass',
        },
        overallStatus: 'pass',
        summary: '正常',
      });

      await auditor.execute({
        promptContext: {
          input: {
            ...validInput(),
            characterVoices: [
              { name: '林风', voice: '简洁直接，偶尔带幽默' },
              { name: '李长老', voice: '威严庄重，言辞精炼' },
            ],
          },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('林风');
      expect(callArgs.prompt).toContain('威严庄重');
    });
  });

  // ── execute() — issue categories ──────────────────────────

  describe('execute() — issue categories', () => {
    it('detects dialogue uniformity issues', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [
          {
            category: 'dialogue-uniformity',
            severity: 'warning',
            description: '对话无区分度',
            affected: [],
            suggestion: '调整',
          },
        ],
        styleConsistency: {
          dialogueConsistency: 'warning',
          narrativeTone: 'pass',
          sentenceVariety: 'pass',
        },
        overallStatus: 'warning',
        summary: '对话缺乏区分度',
      });

      const result = await auditor.execute({
        promptContext: { input: validInput() },
      });

      const data = result.data as StyleAuditOutput;
      expect(data.issues.some((i) => i.category === 'dialogue-uniformity')).toBe(true);
    });

    it('detects tone shift issues', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [
          {
            category: 'tone-shift',
            severity: 'warning',
            description: '叙述语调突变',
            affected: [],
            suggestion: '调整过渡',
          },
        ],
        styleConsistency: {
          dialogueConsistency: 'pass',
          narrativeTone: 'warning',
          sentenceVariety: 'pass',
        },
        overallStatus: 'warning',
        summary: '发现语调突变',
      });

      const result = await auditor.execute({
        promptContext: { input: validInput() },
      });

      const data = result.data as StyleAuditOutput;
      expect(data.issues.some((i) => i.category === 'tone-shift')).toBe(true);
    });

    it('detects sentence monotony issues', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [
          {
            category: 'sentence-monotony',
            severity: 'suggestion',
            description: '句式单调',
            affected: [],
            suggestion: '增加变化',
          },
        ],
        styleConsistency: {
          dialogueConsistency: 'pass',
          narrativeTone: 'pass',
          sentenceVariety: 'warning',
        },
        overallStatus: 'warning',
        summary: '句式缺乏变化',
      });

      const result = await auditor.execute({
        promptContext: { input: validInput() },
      });

      const data = result.data as StyleAuditOutput;
      expect(data.issues.some((i) => i.category === 'sentence-monotony')).toBe(true);
    });
  });

  // ── execute() — validation ────────────────────────────────

  describe('execute() — validation', () => {
    it('returns error when input is missing', async () => {
      const result = await auditor.execute({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('输入');
    });

    it('returns error when chapter content is missing', async () => {
      const result = await auditor.execute({
        promptContext: {
          input: { chapterNumber: 1, genre: 'xianxia' } as StyleAuditInput,
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('内容');
    });

    it('returns error when chapter content is empty', async () => {
      const result = await auditor.execute({
        promptContext: {
          input: { chapterContent: '', chapterNumber: 1, genre: 'xianxia' },
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('内容');
    });

    it('returns error when genre is missing', async () => {
      const result = await auditor.execute({
        promptContext: {
          input: { chapterContent: 'some content', chapterNumber: 1 } as StyleAuditInput,
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('题材');
    });
  });

  // ── execute() — genre context ─────────────────────────────

  describe('execute() — genre context', () => {
    it('includes genre-specific style criteria for xianxia', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [],
        styleConsistency: {
          dialogueConsistency: 'pass',
          narrativeTone: 'pass',
          sentenceVariety: 'pass',
        },
        overallStatus: 'pass',
        summary: '正常',
      });

      await auditor.execute({
        promptContext: {
          input: { chapterContent: '内容', chapterNumber: 1, genre: 'xianxia' },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('仙侠');
    });

    it('includes genre-specific style criteria for romance', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [],
        styleConsistency: {
          dialogueConsistency: 'pass',
          narrativeTone: 'pass',
          sentenceVariety: 'pass',
        },
        overallStatus: 'pass',
        summary: '正常',
      });

      await auditor.execute({
        promptContext: {
          input: { chapterContent: '内容', chapterNumber: 1, genre: 'romance' },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('言情');
    });

    it('handles unknown genre gracefully', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [],
        styleConsistency: {
          dialogueConsistency: 'pass',
          narrativeTone: 'pass',
          sentenceVariety: 'pass',
        },
        overallStatus: 'pass',
        summary: '正常',
      });

      const result = await auditor.execute({
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

function validInput(): StyleAuditInput {
  return {
    chapterContent: '林风说道："我知道了。"李长老说："好的，你退下吧。"苏瑶说："好的。"',
    chapterNumber: 3,
    genre: 'xianxia',
  };
}
