import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ComplianceReviewer,
  type ComplianceInput,
  type ComplianceOutput,
  type ComplianceIssue,
} from './compliance-reviewer';
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

describe('ComplianceReviewer', () => {
  let mockProvider: ReturnType<typeof createMockProvider>;
  let reviewer: ComplianceReviewer;

  beforeEach(() => {
    mockProvider = createMockProvider();
    reviewer = new ComplianceReviewer(mockProvider);
  });

  // ── Properties ────────────────────────────────────────────

  describe('abstract properties', () => {
    it('has correct agent name', () => {
      expect(reviewer.name).toBe('ComplianceReviewer');
    });

    it('uses strict temperature (0.1 for compliance review)', () => {
      expect(reviewer.temperature).toBe(0.1);
    });
  });

  // ── execute() — happy path ────────────────────────────────

  describe('execute()', () => {
    const validInput: ComplianceInput = {
      chapterContent: '林风走进青云门，看到了宏伟的山门。他拜入了外门，开始了修仙生活。',
      chapterNumber: 3,
      genre: 'xianxia',
    };

    it('returns clean compliance check when content is safe', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [],
        riskLevel: 'low',
        overallStatus: 'pass',
        summary: '未发现合规风险',
      });

      const result = await reviewer.execute({
        promptContext: { input: validInput },
      });

      expect(result.success).toBe(true);
      const data = result.data as ComplianceOutput;
      expect(data.issues).toHaveLength(0);
      expect(data.riskLevel).toBe('low');
    });

    it('detects sensitive content issues', async () => {
      const mockIssues: ComplianceIssue[] = [
        {
          category: 'violence',
          severity: 'critical',
          description: '包含过度暴力描写',
          location: { paragraph: 2 },
          suggestion: '弱化暴力描写程度',
        },
      ];

      mockProvider.generateJSON.mockResolvedValue({
        issues: mockIssues,
        riskLevel: 'high',
        overallStatus: 'fail',
        summary: '发现1项高风险内容',
      });

      const result = await reviewer.execute({
        promptContext: { input: validInput },
      });

      expect(result.success).toBe(true);
      const data = result.data as ComplianceOutput;
      expect(data.issues).toHaveLength(1);
      expect(data.riskLevel).toBe('high');
    });

    it('identifies warning-level issues', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [
          {
            category: 'sensitive-topic',
            severity: 'warning',
            description: '涉及敏感话题',
            location: {},
            suggestion: '注意措辞',
          },
        ],
        riskLevel: 'medium',
        overallStatus: 'warning',
        summary: '发现潜在风险内容',
      });

      const result = await reviewer.execute({
        promptContext: { input: validInput },
      });

      const data = result.data as ComplianceOutput;
      expect(data.riskLevel).toBe('medium');
    });

    it('includes compliance summary in output', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [],
        riskLevel: 'low',
        overallStatus: 'pass',
        summary: '内容健康，适合全年龄段阅读',
      });

      const result = await reviewer.execute({
        promptContext: { input: validInput },
      });

      const data = result.data as ComplianceOutput;
      expect(data.summary).toBe('内容健康，适合全年龄段阅读');
    });
  });

  // ── execute() — issue categories ──────────────────────────

  describe('execute() — issue categories', () => {
    it('detects violence issues', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [
          {
            category: 'violence',
            severity: 'critical',
            description: '血腥暴力描写',
            location: {},
            suggestion: '修改',
          },
        ],
        riskLevel: 'high',
        overallStatus: 'fail',
        summary: '发现暴力内容',
      });

      const result = await reviewer.execute({
        promptContext: { input: validInput() },
      });

      const data = result.data as ComplianceOutput;
      expect(data.issues.some((i) => i.category === 'violence')).toBe(true);
    });

    it('detects explicit content issues', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [
          {
            category: 'explicit',
            severity: 'critical',
            description: '不当内容',
            location: {},
            suggestion: '删除',
          },
        ],
        riskLevel: 'high',
        overallStatus: 'fail',
        summary: '发现不当内容',
      });

      const result = await reviewer.execute({
        promptContext: { input: validInput() },
      });

      const data = result.data as ComplianceOutput;
      expect(data.issues.some((i) => i.category === 'explicit')).toBe(true);
    });

    it('detects political sensitivity issues', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [
          {
            category: 'political',
            severity: 'warning',
            description: '涉及政治敏感内容',
            location: {},
            suggestion: '调整表述',
          },
        ],
        riskLevel: 'medium',
        overallStatus: 'warning',
        summary: '发现政治敏感内容',
      });

      const result = await reviewer.execute({
        promptContext: { input: validInput() },
      });

      const data = result.data as ComplianceOutput;
      expect(data.issues.some((i) => i.category === 'political')).toBe(true);
    });

    it('detects copyright issues', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [
          {
            category: 'copyright',
            severity: 'warning',
            description: '可能引用了版权内容',
            location: {},
            suggestion: '确认引用权限',
          },
        ],
        riskLevel: 'medium',
        overallStatus: 'warning',
        summary: '发现版权风险',
      });

      const result = await reviewer.execute({
        promptContext: { input: validInput() },
      });

      const data = result.data as ComplianceOutput;
      expect(data.issues.some((i) => i.category === 'copyright')).toBe(true);
    });
  });

  // ── execute() — with platform rules ───────────────────────

  describe('execute() — with platform rules', () => {
    it('includes custom platform rules when provided', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [],
        riskLevel: 'low',
        overallStatus: 'pass',
        summary: '符合平台规则',
      });

      await reviewer.execute({
        promptContext: {
          input: {
            ...validInput(),
            platformRules: [
              '禁止出现真实地名和人名',
              '战斗描写不得过于血腥',
              '不得出现具体犯罪手法描写',
            ],
          },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('真实地名');
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
          input: { chapterNumber: 1, genre: 'xianxia' } as ComplianceInput,
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
  });

  // ── execute() — genre context ─────────────────────────────

  describe('execute() — genre context', () => {
    it('includes genre-specific compliance criteria for horror', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [],
        riskLevel: 'low',
        overallStatus: 'pass',
        summary: '正常',
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
        riskLevel: 'low',
        overallStatus: 'pass',
        summary: '正常',
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

function validInput(): ComplianceInput {
  return {
    chapterContent: '林风走进青云门，看到了宏伟的山门。他拜入了外门，开始了修仙生活。',
    chapterNumber: 3,
    genre: 'xianxia',
  };
}
