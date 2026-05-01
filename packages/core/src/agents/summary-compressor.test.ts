import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SummaryCompressor,
  type SummaryCompressorInput,
  type SummaryCompressorOutput,
} from './summary-compressor';
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

function validInput(): SummaryCompressorInput {
  return {
    startChapter: 1,
    endChapter: 10,
    chapterSummaries: Array.from({ length: 10 }, (_, i) => ({
      chapter: i + 1,
      brief: `第${i + 1}章简要情节`,
      emotionalArc: i % 2 === 0 ? '紧张' : '平静',
    })),
    genre: 'xianxia',
    title: '修仙之路',
  };
}

function mockOutput(): SummaryCompressorOutput {
  return {
    arcSummary:
      '林风从山村少年踏入青云门，历经入门测试、外门修炼，逐步揭开玉佩中的远古秘密，与师兄赵恒的关系暗流涌动。',
    plotThreads: ['林风入门修仙的适应与成长', '玉佩秘密的逐步揭示', '与赵恒关系的潜在冲突'],
    protagonistGrowth: '林风从懵懂少年成长为有意识追寻真相的修仙者',
  };
}

describe('SummaryCompressor', () => {
  let mockProvider: ReturnType<typeof createMockProvider>;
  let compressor: SummaryCompressor;

  beforeEach(() => {
    mockProvider = createMockProvider();
    compressor = new SummaryCompressor(mockProvider);
  });

  // ── Properties ────────────────────────────────────────────

  describe('abstract properties', () => {
    it('has correct agent name', () => {
      expect(compressor.name).toBe('SummaryCompressor');
    });

    it('uses moderate temperature (0.3 for compression)', () => {
      expect(compressor.temperature).toBe(0.3);
    });
  });

  // ── execute() — happy path ────────────────────────────────

  describe('execute()', () => {
    it('returns compressed arc summary', async () => {
      mockProvider.generateJSON.mockResolvedValue(mockOutput());

      const result = await compressor.execute({
        promptContext: { input: validInput() },
      });

      expect(result.success).toBe(true);
      const data = result.data as SummaryCompressorOutput;
      expect(data.arcSummary).toBeTruthy();
      expect(data.plotThreads.length).toBeGreaterThanOrEqual(1);
      expect(data.protagonistGrowth).toBeTruthy();
    });

    it('includes range info in prompt', async () => {
      mockProvider.generateJSON.mockResolvedValue(mockOutput());

      await compressor.execute({ promptContext: { input: validInput() } });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('第 1 章');
      expect(callArgs.prompt).toContain('第 10 章');
      expect(callArgs.prompt).toContain('修仙之路');
    });

    it('includes chapter summaries in prompt', async () => {
      mockProvider.generateJSON.mockResolvedValue(mockOutput());

      await compressor.execute({ promptContext: { input: validInput() } });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('第 1 章：第1章简要情节');
      expect(callArgs.prompt).toContain('第 10 章：第10章简要情节');
    });

    it('includes emotional arc when present', async () => {
      mockProvider.generateJSON.mockResolvedValue(mockOutput());

      await compressor.execute({ promptContext: { input: validInput() } });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('[情感：紧张]');
      expect(callArgs.prompt).toContain('[情感：平静]');
    });

    it('passes correct temperature and maxTokens', async () => {
      mockProvider.generateJSON.mockResolvedValue(mockOutput());

      await compressor.execute({ promptContext: { input: validInput() } });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.temperature).toBe(0.3);
      expect(callArgs.maxTokens).toBe(1024);
      expect(callArgs.agentName).toBe('SummaryCompressor');
    });
  });

  // ── execute() — validation ────────────────────────────────

  describe('execute() — validation', () => {
    it('returns error when input is missing', async () => {
      const result = await compressor.execute({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('输入');
    });

    it('returns error when chapter summaries are empty', async () => {
      const result = await compressor.execute({
        promptContext: {
          input: { ...validInput(), chapterSummaries: [] },
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('摘要列表');
    });

    it('returns error when genre is missing', async () => {
      const result = await compressor.execute({
        promptContext: {
          input: { ...validInput(), genre: '' },
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('题材');
    });
  });

  // ── execute() — LLM errors ────────────────────────────────

  describe('execute() — LLM errors', () => {
    it('returns error when LLM call fails', async () => {
      mockProvider.generateJSON.mockRejectedValue(new Error('rate limit'));

      const result = await compressor.execute({
        promptContext: { input: validInput() },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('rate limit');
    });
  });

  // ── execute() — sanitize fallback ─────────────────────────

  describe('execute() — sanitize fallback', () => {
    it('fills default values when LLM returns partial output', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        arcSummary: '概要内容',
      });

      const result = await compressor.execute({
        promptContext: { input: validInput() },
      });

      expect(result.success).toBe(true);
      const data = result.data as SummaryCompressorOutput;
      expect(data.arcSummary).toBe('概要内容');
      expect(data.plotThreads).toEqual(['情节推进']);
      expect(data.protagonistGrowth).toBe('主角持续成长');
    });

    it('fills defaults when LLM returns empty arrays', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        arcSummary: '概要内容',
        plotThreads: [],
        protagonistGrowth: '',
      });

      const result = await compressor.execute({
        promptContext: { input: validInput() },
      });

      const data = result.data as SummaryCompressorOutput;
      expect(data.plotThreads).toEqual(['情节推进']);
      expect(data.protagonistGrowth).toBe('主角持续成长');
    });
  });
});
