import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AuditTierClassifier,
  type AuditInput,
  type AuditOutput,
  type ClassifiedIssue,
} from './audit-tier-classifier';
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

describe('AuditTierClassifier', () => {
  let mockProvider: ReturnType<typeof createMockProvider>;
  let classifier: AuditTierClassifier;

  beforeEach(() => {
    mockProvider = createMockProvider();
    classifier = new AuditTierClassifier(mockProvider);
  });

  // ── Properties ────────────────────────────────────────────

  describe('abstract properties', () => {
    it('has correct agent name', () => {
      expect(classifier.name).toBe('AuditTierClassifier');
    });

    it('uses analytical temperature (0.2 for tier classification)', () => {
      expect(classifier.temperature).toBe(0.2);
    });
  });

  // ── execute() — happy path ────────────────────────────────

  describe('execute()', () => {
    const validInput: AuditInput = {
      chapterContent: '林风走进青云门，看到了宏伟的山门。他拜入了外门，开始了修仙生活。',
      chapterNumber: 3,
      genre: 'xianxia',
    };

    it('returns clean classification when no blocking issues', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        classified: [],
        tierSummary: { blocker: 0, warning: 0, suggestion: 0 },
        overallVerdict: 'pass',
        summary: '未发现阻断级问题',
      });

      const result = await classifier.execute({
        promptContext: { input: validInput },
      });

      expect(result.success).toBe(true);
      const data = result.data as AuditOutput;
      expect(data.classified).toHaveLength(0);
      expect(data.tierSummary.blocker).toBe(0);
      expect(data.overallVerdict).toBe('pass');
    });

    it('classifies blocker-level issues', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        classified: [
          {
            description: '主角名字前后不一致',
            tier: 'blocker',
            category: 'consistency',
            severity: 'critical',
            suggestion: '统一主角名称',
          },
        ],
        tierSummary: { blocker: 1, warning: 0, suggestion: 0 },
        overallVerdict: 'fail',
        summary: '发现1项阻断级问题',
      });

      const result = await classifier.execute({
        promptContext: { input: validInput },
      });

      expect(result.success).toBe(true);
      const data = result.data as AuditOutput;
      expect(data.classified.some((i) => i.tier === 'blocker')).toBe(true);
      expect(data.overallVerdict).toBe('fail');
    });

    it('classifies warning-level issues', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        classified: [
          {
            description: '段落节奏偏慢',
            tier: 'warning',
            category: 'pacing',
            severity: 'warning',
            suggestion: '加快叙事节奏',
          },
        ],
        tierSummary: { blocker: 0, warning: 1, suggestion: 0 },
        overallVerdict: 'warning',
        summary: '发现1项警告级问题',
      });

      const result = await classifier.execute({
        promptContext: { input: validInput },
      });

      const data = result.data as AuditOutput;
      expect(data.classified.some((i) => i.tier === 'warning')).toBe(true);
      expect(data.overallVerdict).toBe('warning');
    });

    it('classifies suggestion-level issues', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        classified: [
          {
            description: '建议增加环境描写增强氛围',
            tier: 'suggestion',
            category: 'enhancement',
            severity: 'suggestion',
            suggestion: '适当补充场景细节',
          },
        ],
        tierSummary: { blocker: 0, warning: 0, suggestion: 1 },
        overallVerdict: 'pass',
        summary: '仅有建议级优化项',
      });

      const result = await classifier.execute({
        promptContext: { input: validInput },
      });

      const data = result.data as AuditOutput;
      expect(data.classified.some((i) => i.tier === 'suggestion')).toBe(true);
      expect(data.overallVerdict).toBe('pass');
    });

    it('handles mixed tier classification', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        classified: [
          {
            description: '事实矛盾',
            tier: 'blocker',
            category: 'consistency',
            severity: 'critical',
            suggestion: '修正',
          },
          {
            description: '句式重复',
            tier: 'warning',
            category: 'style',
            severity: 'warning',
            suggestion: '调整',
          },
          {
            description: '可增加描写',
            tier: 'suggestion',
            category: 'enhancement',
            severity: 'suggestion',
            suggestion: '优化',
          },
        ],
        tierSummary: { blocker: 1, warning: 1, suggestion: 1 },
        overallVerdict: 'fail',
        summary: '混合级别问题',
      });

      const result = await classifier.execute({
        promptContext: { input: validInput },
      });

      const data = result.data as AuditOutput;
      expect(data.tierSummary.blocker).toBe(1);
      expect(data.tierSummary.warning).toBe(1);
      expect(data.tierSummary.suggestion).toBe(1);
    });

    it('includes tier summary in output', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        classified: [],
        tierSummary: { blocker: 2, warning: 3, suggestion: 5 },
        overallVerdict: 'fail',
        summary: '审计总结',
      });

      const result = await classifier.execute({
        promptContext: { input: validInput },
      });

      const data = result.data as AuditOutput;
      expect(data.tierSummary.blocker).toBe(2);
      expect(data.tierSummary.warning).toBe(3);
      expect(data.tierSummary.suggestion).toBe(5);
    });
  });

  // ── execute() — with audit results ────────────────────────

  describe('execute() — with existing audit results', () => {
    it('includes existing audit results for reclassification', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        classified: [],
        tierSummary: { blocker: 0, warning: 0, suggestion: 0 },
        overallVerdict: 'pass',
        summary: '正常',
      });

      await classifier.execute({
        promptContext: {
          input: {
            ...validInput(),
            existingAuditResults: ['发现主角年龄不一致', '对话节奏偏慢'],
          },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('主角年龄不一致');
    });

    it('classifies issues from existing audit results', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        classified: [
          {
            description: '主角年龄不一致',
            tier: 'blocker',
            category: 'consistency',
            severity: 'critical',
            suggestion: '修正',
          },
        ],
        tierSummary: { blocker: 1, warning: 0, suggestion: 0 },
        overallVerdict: 'fail',
        summary: '从已有审计结果中识别到阻断级问题',
      });

      const result = await classifier.execute({
        promptContext: {
          input: {
            ...validInput(),
            existingAuditResults: ['发现主角年龄不一致'],
          },
        },
      });

      const data = result.data as AuditOutput;
      expect(data.overallVerdict).toBe('fail');
    });
  });

  // ── execute() — verdict logic ─────────────────────────────

  describe('execute() — verdict logic', () => {
    it('returns fail when any blocker exists', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        classified: [
          {
            description: '严重矛盾',
            tier: 'blocker',
            category: 'consistency',
            severity: 'critical',
            suggestion: '修正',
          },
        ],
        tierSummary: { blocker: 1, warning: 0, suggestion: 0 },
        overallVerdict: 'fail',
        summary: '阻断',
      });

      const result = await classifier.execute({
        promptContext: { input: validInput() },
      });

      const data = result.data as AuditOutput;
      expect(data.overallVerdict).toBe('fail');
    });

    it('returns warning when only warnings and suggestions exist', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        classified: [
          {
            description: '节奏问题',
            tier: 'warning',
            category: 'pacing',
            severity: 'warning',
            suggestion: '调整',
          },
          {
            description: '建议优化',
            tier: 'suggestion',
            category: 'enhancement',
            severity: 'suggestion',
            suggestion: '优化',
          },
        ],
        tierSummary: { blocker: 0, warning: 1, suggestion: 1 },
        overallVerdict: 'warning',
        summary: '警告',
      });

      const result = await classifier.execute({
        promptContext: { input: validInput() },
      });

      const data = result.data as AuditOutput;
      expect(data.overallVerdict).toBe('warning');
    });

    it('returns pass when only suggestions or no issues', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        classified: [],
        tierSummary: { blocker: 0, warning: 0, suggestion: 0 },
        overallVerdict: 'pass',
        summary: '通过',
      });

      const result = await classifier.execute({
        promptContext: { input: validInput() },
      });

      const data = result.data as AuditOutput;
      expect(data.overallVerdict).toBe('pass');
    });
  });

  // ── execute() — validation ────────────────────────────────

  describe('execute() — validation', () => {
    it('returns error when input is missing', async () => {
      const result = await classifier.execute({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('输入');
    });

    it('returns error when chapter content is missing', async () => {
      const result = await classifier.execute({
        promptContext: {
          input: { chapterNumber: 1, genre: 'xianxia' } as AuditInput,
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('内容');
    });

    it('returns error when chapter content is empty', async () => {
      const result = await classifier.execute({
        promptContext: {
          input: { chapterContent: '', chapterNumber: 1, genre: 'xianxia' },
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('内容');
    });

    it('returns error when genre is missing', async () => {
      const result = await classifier.execute({
        promptContext: {
          input: { chapterContent: 'content', chapterNumber: 1 } as AuditInput,
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('题材');
    });
  });

  // ── execute() — genre context ─────────────────────────────

  describe('execute() — genre context', () => {
    it('includes genre-specific classification criteria for xianxia', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        classified: [],
        tierSummary: { blocker: 0, warning: 0, suggestion: 0 },
        overallVerdict: 'pass',
        summary: '正常',
      });

      await classifier.execute({
        promptContext: {
          input: { chapterContent: '内容', chapterNumber: 1, genre: 'xianxia' },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('仙侠');
    });

    it('handles unknown genre gracefully', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        classified: [],
        tierSummary: { blocker: 0, warning: 0, suggestion: 0 },
        overallVerdict: 'pass',
        summary: '正常',
      });

      const result = await classifier.execute({
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

      const result = await classifier.execute({
        promptContext: {
          input: validInput(),
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('API timeout');
    });
  });
});

function validInput(): AuditInput {
  return {
    chapterContent: '林风走进青云门，看到了宏伟的山门。他拜入了外门，开始了修仙生活。',
    chapterNumber: 3,
    genre: 'xianxia',
  };
}
