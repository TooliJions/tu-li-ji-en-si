import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MarketInjector,
  type MarketInput,
  type MarketOutput,
} from './market-injector';
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

describe('MarketInjector', () => {
  let mockProvider: ReturnType<typeof createMockProvider>;
  let injector: MarketInjector;

  beforeEach(() => {
    mockProvider = createMockProvider();
    injector = new MarketInjector(mockProvider);
  });

  // ── Properties ────────────────────────────────────────────

  describe('abstract properties', () => {
    it('has correct agent name', () => {
      expect(injector.name).toBe('MarketInjector');
    });

    it('uses creative temperature (0.7 for market element injection)', () => {
      expect(injector.temperature).toBe(0.7);
    });
  });

  // ── execute() — happy path ────────────────────────────────

  describe('execute()', () => {
    const validInput: MarketInput = {
      chapterContent: '林风走进青云门，看到了宏伟的山门。他拜入了外门，开始了修仙生活。',
      chapterNumber: 3,
      genre: 'xianxia',
    };

    it('returns suggestions when market elements can be added', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        suggestions: [
          {
            element: '金手指暗示',
            type: 'hook',
            description: '可在本章末暗示主角的特殊天赋',
            insertPosition: 'chapter-end',
            expectedImpact: 85,
          },
        ],
        marketAlignment: 72,
        overallStatus: 'suggestion',
        summary: '建议增加金手指暗示提升吸引力',
      });

      const result = await injector.execute({
        promptContext: { input: validInput },
      });

      expect(result.success).toBe(true);
      const data = result.data as MarketOutput;
      expect(data.suggestions).toHaveLength(1);
      expect(data.marketAlignment).toBe(72);
    });

    it('returns empty suggestions when chapter is well-optimized', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        suggestions: [],
        marketAlignment: 90,
        overallStatus: 'pass',
        summary: '章节已具有良好的市场吸引力元素',
      });

      const result = await injector.execute({
        promptContext: { input: validInput },
      });

      expect(result.success).toBe(true);
      const data = result.data as MarketOutput;
      expect(data.suggestions).toHaveLength(0);
      expect(data.marketAlignment).toBe(90);
    });

    it('detects missing trending elements', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        suggestions: [
          {
            element: '爽点设计',
            type: 'satisfaction',
            description: '本章缺乏打脸/逆袭等爽点元素',
            insertPosition: 'mid-chapter',
            expectedImpact: 80,
          },
        ],
        marketAlignment: 45,
        overallStatus: 'suggestion',
        summary: '缺少爽点元素，建议补充',
      });

      const result = await injector.execute({
        promptContext: { input: validInput },
      });

      const data = result.data as MarketOutput;
      expect(data.suggestions.some((s) => s.type === 'satisfaction')).toBe(true);
    });

    it('suggests emotional hooks', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        suggestions: [
          {
            element: '师徒情感线',
            type: 'emotional',
            description: '可增加师徒之间的互动增强情感共鸣',
            insertPosition: 'early-chapter',
            expectedImpact: 70,
          },
        ],
        marketAlignment: 60,
        overallStatus: 'suggestion',
        summary: '建议增加情感线',
      });

      const result = await injector.execute({
        promptContext: { input: validInput },
      });

      const data = result.data as MarketOutput;
      expect(data.suggestions.some((s) => s.type === 'emotional')).toBe(true);
    });

    it('suggests conflict escalation', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        suggestions: [
          {
            element: '反派暗线',
            type: 'conflict',
            description: '可增加反派的暗中活动暗示',
            insertPosition: 'mid-chapter',
            expectedImpact: 90,
          },
        ],
        marketAlignment: 50,
        overallStatus: 'suggestion',
        summary: '建议增加冲突铺垫',
      });

      const result = await injector.execute({
        promptContext: { input: validInput },
      });

      const data = result.data as MarketOutput;
      expect(data.suggestions.some((s) => s.type === 'conflict')).toBe(true);
    });

    it('suggests mystery/suspense elements', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        suggestions: [
          {
            element: '神秘身份暗示',
            type: 'mystery',
            description: '可在对话中暗示某人的隐藏身份',
            insertPosition: 'dialogue',
            expectedImpact: 75,
          },
        ],
        marketAlignment: 55,
        overallStatus: 'suggestion',
        summary: '建议增加悬疑元素',
      });

      const result = await injector.execute({
        promptContext: { input: validInput },
      });

      const data = result.data as MarketOutput;
      expect(data.suggestions.some((s) => s.type === 'mystery')).toBe(true);
    });

    it('includes market alignment score', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        suggestions: [],
        marketAlignment: 88,
        overallStatus: 'pass',
        summary: '市场适配度良好',
      });

      const result = await injector.execute({
        promptContext: { input: validInput },
      });

      const data = result.data as MarketOutput;
      expect(data.marketAlignment).toBe(88);
      expect(data.overallStatus).toBe('pass');
    });
  });

  // ── execute() — with market trends ────────────────────────

  describe('execute() — with market trends', () => {
    it('includes current market trends when provided', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        suggestions: [],
        marketAlignment: 70,
        overallStatus: 'pass',
        summary: '正常',
      });

      await injector.execute({
        promptContext: {
          input: {
            ...validInput(),
            marketTrends: ['近期读者偏好快节奏升级流', '师徒互动类内容阅读量上升30%'],
          },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('快节奏升级流');
      expect(callArgs.prompt).toContain('师徒互动');
    });

    it('aligns suggestions with market trends', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        suggestions: [
          {
            element: '快速升级暗示',
            type: 'hook',
            description: '结合当前升级流趋势，可增加主角快速成长的暗示',
            insertPosition: 'mid-chapter',
            expectedImpact: 85,
          },
        ],
        marketAlignment: 55,
        overallStatus: 'suggestion',
        summary: '建议结合市场趋势增加元素',
      });

      const result = await injector.execute({
        promptContext: {
          input: {
            ...validInput(),
            marketTrends: ['近期读者偏好快节奏升级流'],
          },
        },
      });

      const data = result.data as MarketOutput;
      expect(data.suggestions.length).toBeGreaterThan(0);
    });
  });

  // ── execute() — with target audience ──────────────────────

  describe('execute() — with target audience', () => {
    it('tailors suggestions to target audience', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        suggestions: [],
        marketAlignment: 65,
        overallStatus: 'pass',
        summary: '正常',
      });

      await injector.execute({
        promptContext: {
          input: {
            ...validInput(),
            targetAudience: '18-25岁男性读者，偏好升级流和战斗场景',
          },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('18-25岁');
    });
  });

  // ── execute() — validation ────────────────────────────────

  describe('execute() — validation', () => {
    it('returns error when input is missing', async () => {
      const result = await injector.execute({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('输入');
    });

    it('returns error when chapter content is missing', async () => {
      const result = await injector.execute({
        promptContext: {
          input: { chapterNumber: 1, genre: 'xianxia' } as MarketInput,
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('内容');
    });

    it('returns error when chapter content is empty', async () => {
      const result = await injector.execute({
        promptContext: {
          input: { chapterContent: '', chapterNumber: 1, genre: 'xianxia' },
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('内容');
    });

    it('returns error when genre is missing', async () => {
      const result = await injector.execute({
        promptContext: {
          input: { chapterContent: 'content', chapterNumber: 1 } as MarketInput,
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('题材');
    });
  });

  // ── execute() — genre context ─────────────────────────────

  describe('execute() — genre context', () => {
    it('includes genre-specific market criteria for xianxia', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        suggestions: [],
        marketAlignment: 70,
        overallStatus: 'pass',
        summary: '正常',
      });

      await injector.execute({
        promptContext: {
          input: { chapterContent: '内容', chapterNumber: 1, genre: 'xianxia' },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('仙侠');
    });

    it('includes genre-specific market criteria for urban', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        suggestions: [],
        marketAlignment: 70,
        overallStatus: 'pass',
        summary: '正常',
      });

      await injector.execute({
        promptContext: {
          input: { chapterContent: '内容', chapterNumber: 1, genre: 'urban' },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('都市');
    });

    it('handles unknown genre gracefully', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        suggestions: [],
        marketAlignment: 70,
        overallStatus: 'pass',
        summary: '正常',
      });

      const result = await injector.execute({
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

      const result = await injector.execute({
        promptContext: {
          input: validInput(),
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('API timeout');
    });
  });
});

function validInput(): MarketInput {
  return {
    chapterContent: '林风走进青云门，看到了宏伟的山门。他拜入了外门，开始了修仙生活。',
    chapterNumber: 3,
    genre: 'xianxia',
  };
}
