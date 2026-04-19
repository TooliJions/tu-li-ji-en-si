import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  FatigueAnalyzer,
  type FatigueInput,
  type FatigueOutput,
  type FatigueIssue,
} from './fatigue-analyzer';
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

describe('FatigueAnalyzer', () => {
  let mockProvider: ReturnType<typeof createMockProvider>;
  let analyzer: FatigueAnalyzer;

  beforeEach(() => {
    mockProvider = createMockProvider();
    analyzer = new FatigueAnalyzer(mockProvider);
  });

  // ── Properties ────────────────────────────────────────────

  describe('abstract properties', () => {
    it('has correct agent name', () => {
      expect(analyzer.name).toBe('FatigueAnalyzer');
    });

    it('uses analytical temperature (0.3 for fatigue analysis)', () => {
      expect(analyzer.temperature).toBe(0.3);
    });
  });

  // ── execute() — happy path ────────────────────────────────

  describe('execute()', () => {
    const validInput: FatigueInput = {
      chapterContent: '林风走进青云门，看到了宏伟的山门。他拜入了外门，开始了修仙生活。',
      chapterNumber: 3,
      genre: 'xianxia',
    };

    it('returns clean analysis when no fatigue detected', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [],
        fatigueScore: 15,
        riskLevel: 'low',
        overallStatus: 'pass',
        summary: '节奏良好，无明显阅读疲劳',
      });

      const result = await analyzer.execute({
        promptContext: { input: validInput },
      });

      expect(result.success).toBe(true);
      const data = result.data as FatigueOutput;
      expect(data.issues).toHaveLength(0);
      expect(data.fatigueScore).toBe(15);
      expect(data.riskLevel).toBe('low');
    });

    it('detects repetitive sentence pattern fatigue', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [
          {
            category: 'repetition',
            severity: 'warning',
            description: '连续使用相同句式结构',
            suggestion: '变换句式长度和结构',
          },
        ],
        fatigueScore: 45,
        riskLevel: 'medium',
        overallStatus: 'warning',
        summary: '发现句式重复疲劳',
      });

      const result = await analyzer.execute({
        promptContext: { input: validInput },
      });

      expect(result.success).toBe(true);
      const data = result.data as FatigueOutput;
      expect(data.issues.some((i) => i.category === 'repetition')).toBe(true);
      expect(data.riskLevel).toBe('medium');
    });

    it('detects description overload fatigue', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [
          {
            category: 'description-overload',
            severity: 'warning',
            description: '连续3段均为环境描写，缺乏情节推进',
            suggestion: '穿插动作或对话打破纯描写段落',
          },
        ],
        fatigueScore: 55,
        riskLevel: 'medium',
        overallStatus: 'warning',
        summary: '描写过度导致阅读疲劳',
      });

      const result = await analyzer.execute({
        promptContext: { input: validInput },
      });

      const data = result.data as FatigueOutput;
      expect(data.issues.some((i) => i.category === 'description-overload')).toBe(true);
    });

    it('detects dialogue fatigue', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [
          {
            category: 'dialogue-fatigue',
            severity: 'critical',
            description: '对话占比超过80%且缺乏动作描写',
            suggestion: '增加动作和环境描写穿插',
          },
        ],
        fatigueScore: 70,
        riskLevel: 'high',
        overallStatus: 'fail',
        summary: '对话密集导致阅读疲劳',
      });

      const result = await analyzer.execute({
        promptContext: { input: validInput },
      });

      const data = result.data as FatigueOutput;
      expect(data.issues.some((i) => i.category === 'dialogue-fatigue')).toBe(true);
      expect(data.fatigueScore).toBe(70);
    });

    it('detects pacing fatigue', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [
          {
            category: 'pacing',
            severity: 'warning',
            description: '连续5章节奏相似，缺乏变化',
            suggestion: '调整章节节奏，增加高潮或转折',
          },
        ],
        fatigueScore: 50,
        riskLevel: 'medium',
        overallStatus: 'warning',
        summary: '章节节奏单调',
      });

      const result = await analyzer.execute({
        promptContext: { input: validInput },
      });

      const data = result.data as FatigueOutput;
      expect(data.issues.some((i) => i.category === 'pacing')).toBe(true);
    });

    it('detects info-dump fatigue', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [
          {
            category: 'info-dump',
            severity: 'warning',
            description: '大段设定说明打断叙事节奏',
            suggestion: '将设定融入对话或情节中逐步揭示',
          },
        ],
        fatigueScore: 60,
        riskLevel: 'medium',
        overallStatus: 'warning',
        summary: '设定堆砌导致阅读疲劳',
      });

      const result = await analyzer.execute({
        promptContext: { input: validInput },
      });

      const data = result.data as FatigueOutput;
      expect(data.issues.some((i) => i.category === 'info-dump')).toBe(true);
    });

    it('includes fatigue score and risk level', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [],
        fatigueScore: 10,
        riskLevel: 'low',
        overallStatus: 'pass',
        summary: '内容节奏良好',
      });

      const result = await analyzer.execute({
        promptContext: { input: validInput },
      });

      const data = result.data as FatigueOutput;
      expect(data.fatigueScore).toBe(10);
      expect(data.riskLevel).toBe('low');
      expect(data.overallStatus).toBe('pass');
    });
  });

  // ── execute() — with previous chapter context ─────────────

  describe('execute() — with previous chapter', () => {
    it('checks pacing against previous chapter when provided', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [],
        fatigueScore: 20,
        riskLevel: 'low',
        overallStatus: 'pass',
        summary: '正常',
      });

      await analyzer.execute({
        promptContext: {
          input: {
            ...validInput(),
            previousChapterContent: '上一章内容...',
          },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('上一章内容');
    });

    it('detects cross-chapter repetition', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [
          {
            category: 'cross-chapter-repetition',
            severity: 'warning',
            description: '与上一章开头句式高度相似',
            suggestion: '变换开头方式',
          },
        ],
        fatigueScore: 40,
        riskLevel: 'medium',
        overallStatus: 'warning',
        summary: '发现跨章重复模式',
      });

      const result = await analyzer.execute({
        promptContext: {
          input: {
            ...validInput(),
            previousChapterContent: '林风走进青云门...',
          },
        },
      });

      const data = result.data as FatigueOutput;
      expect(data.issues.some((i) => i.category === 'cross-chapter-repetition')).toBe(true);
    });
  });

  // ── execute() — validation ────────────────────────────────

  describe('execute() — validation', () => {
    it('returns error when input is missing', async () => {
      const result = await analyzer.execute({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('输入');
    });

    it('returns error when chapter content is missing', async () => {
      const result = await analyzer.execute({
        promptContext: {
          input: { chapterNumber: 1, genre: 'xianxia' } as FatigueInput,
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('内容');
    });

    it('returns error when chapter content is empty', async () => {
      const result = await analyzer.execute({
        promptContext: {
          input: { chapterContent: '', chapterNumber: 1, genre: 'xianxia' },
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('内容');
    });

    it('returns error when genre is missing', async () => {
      const result = await analyzer.execute({
        promptContext: {
          input: { chapterContent: 'content', chapterNumber: 1 } as FatigueInput,
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('题材');
    });
  });

  // ── execute() — genre context ─────────────────────────────

  describe('execute() — genre context', () => {
    it('includes genre-specific fatigue criteria for xianxia', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [],
        fatigueScore: 10,
        riskLevel: 'low',
        overallStatus: 'pass',
        summary: '正常',
      });

      await analyzer.execute({
        promptContext: {
          input: { chapterContent: '内容', chapterNumber: 1, genre: 'xianxia' },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('仙侠');
    });

    it('includes genre-specific fatigue criteria for romance', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [],
        fatigueScore: 10,
        riskLevel: 'low',
        overallStatus: 'pass',
        summary: '正常',
      });

      await analyzer.execute({
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
        fatigueScore: 10,
        riskLevel: 'low',
        overallStatus: 'pass',
        summary: '正常',
      });

      const result = await analyzer.execute({
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

      const result = await analyzer.execute({
        promptContext: {
          input: validInput(),
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('API timeout');
    });
  });
});

function validInput(): FatigueInput {
  return {
    chapterContent: '林风走进青云门，看到了宏伟的山门。他拜入了外门，开始了修仙生活。',
    chapterNumber: 3,
    genre: 'xianxia',
  };
}
