import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StyleRefiner, type StyleRefineInput, type StyleRefineOutput } from './style-refiner';
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

describe('StyleRefiner', () => {
  let mockProvider: ReturnType<typeof createMockProvider>;
  let refiner: StyleRefiner;

  beforeEach(() => {
    mockProvider = createMockProvider();
    refiner = new StyleRefiner(mockProvider);
  });

  // ── Properties ────────────────────────────────────────────

  describe('abstract properties', () => {
    it('has correct agent name', () => {
      expect(refiner.name).toBe('StyleRefiner');
    });

    it('uses low-moderate temperature (0.4 for analytical style refinement)', () => {
      expect(refiner.temperature).toBe(0.4);
    });
  });

  // ── execute() — happy path ────────────────────────────────

  describe('execute()', () => {
    const validInput: StyleRefineInput = {
      draftContent: '林风走进大厅，看到了许多人。大厅里很热闹。他感到很惊讶。',
      chapterNumber: 3,
      genre: 'xianxia',
    };

    it('returns refined content with improvement score', async () => {
      mockProvider.generate.mockResolvedValue({
        text: '林风踏入大殿，只见人头攒动，觥筹交错。他不禁微微愕然。',
        usage: { promptTokens: 300, completionTokens: 200, totalTokens: 500 },
        model: 'test-model',
      });

      const result = await refiner.execute({
        promptContext: { input: validInput },
      });

      expect(result.success).toBe(true);
      const data = result.data as StyleRefineOutput;
      expect(data.refinedContent).toBeTruthy();
      expect(typeof data.improvementScore).toBe('number');
    });

    it('includes style analysis in output', async () => {
      mockProvider.generate.mockResolvedValue({
        text: '精炼后的文字内容',
        usage: { promptTokens: 200, completionTokens: 100, totalTokens: 300 },
        model: 'test',
      });

      const result = await refiner.execute({
        promptContext: { input: validInput },
      });

      const data = result.data as StyleRefineOutput;
      expect(data.styleAnalysis).toBeDefined();
      expect(data.styleAnalysis).toContain('字符多样性');
    });

    it('preserves original meaning while refining', async () => {
      mockProvider.generate.mockResolvedValue({
        text: '林风步入大殿，只见众人齐聚，气氛热烈，他心中暗感震惊。',
        usage: { promptTokens: 200, completionTokens: 100, totalTokens: 300 },
        model: 'test',
      });

      const result = await refiner.execute({
        promptContext: { input: validInput },
      });

      const data = result.data as StyleRefineOutput;
      expect(data.refinedContent).toContain('林风');
    });
  });

  // ── execute() — with style fingerprint ────────────────────

  describe('execute() — with style fingerprint', () => {
    it('includes style fingerprint in prompt when provided', async () => {
      mockProvider.generate.mockResolvedValue({
        text: 'refined',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'test',
      });

      await refiner.execute({
        promptContext: {
          input: {
            ...validInput(),
            styleFingerprint: {
              avgSentenceLength: 18,
              dialogueRatio: 0.3,
              descriptionRatio: 0.5,
              actionRatio: 0.2,
              commonPhrases: ['只见', '不禁', '微微'],
            },
          },
        },
      });

      const callArgs = mockProvider.generate.mock.calls[0][0];
      expect(callArgs.prompt).toContain('18');
      expect(callArgs.prompt).toContain('对话占比');
    });
  });

  // ── execute() — with previous chapter style ───────────────

  describe('execute() — with previous chapter style', () => {
    it('includes previous style reference for consistency', async () => {
      mockProvider.generate.mockResolvedValue({
        text: 'refined',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'test',
      });

      await refiner.execute({
        promptContext: {
          input: {
            ...validInput(),
            previousChapterContent: '上一章的风格参考文字，用来保持文风一致。',
          },
        },
      });

      const callArgs = mockProvider.generate.mock.calls[0][0];
      expect(callArgs.prompt).toContain('上一章的风格');
    });
  });

  // ── execute() — validation ────────────────────────────────

  describe('execute() — validation', () => {
    it('returns error when input is missing', async () => {
      const result = await refiner.execute({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('输入');
    });

    it('returns error when draft content is missing', async () => {
      const result = await refiner.execute({
        promptContext: {
          input: { chapterNumber: 1, genre: 'xianxia' } as StyleRefineInput,
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('草稿');
    });

    it('returns error when draft content is empty', async () => {
      const result = await refiner.execute({
        promptContext: {
          input: { draftContent: '', chapterNumber: 1, genre: 'xianxia' },
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('草稿');
    });

    it('returns error when genre is missing', async () => {
      const result = await refiner.execute({
        promptContext: {
          input: { draftContent: 'some content', chapterNumber: 1 } as StyleRefineInput,
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('题材');
    });
  });

  // ── execute() — genre context ─────────────────────────────

  describe('execute() — genre context', () => {
    it('includes genre-specific style guidance for xianxia', async () => {
      mockProvider.generate.mockResolvedValue({
        text: 'refined',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'test',
      });

      await refiner.execute({
        promptContext: {
          input: { draftContent: '初稿内容', chapterNumber: 1, genre: 'xianxia' },
        },
      });

      const callArgs = mockProvider.generate.mock.calls[0][0];
      expect(callArgs.prompt).toContain('仙侠');
    });

    it('includes genre-specific style guidance for urban', async () => {
      mockProvider.generate.mockResolvedValue({
        text: 'refined',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'test',
      });

      await refiner.execute({
        promptContext: {
          input: { draftContent: '初稿内容', chapterNumber: 1, genre: 'urban' },
        },
      });

      const callArgs = mockProvider.generate.mock.calls[0][0];
      expect(callArgs.prompt).toContain('都市');
    });

    it('handles unknown genre gracefully', async () => {
      mockProvider.generate.mockResolvedValue({
        text: 'refined',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'test',
      });

      const result = await refiner.execute({
        promptContext: {
          input: { draftContent: '初稿内容', chapterNumber: 1, genre: 'litrpg' },
        },
      });

      const callArgs = mockProvider.generate.mock.calls[0][0];
      expect(callArgs.prompt).toContain('litrpg');
      expect(result.success).toBe(true);
    });
  });

  // ── execute() — LLM errors ────────────────────────────────

  describe('execute() — LLM errors', () => {
    it('returns error when LLM call fails', async () => {
      mockProvider.generate.mockRejectedValue(new Error('API timeout'));

      const result = await refiner.execute({
        promptContext: {
          input: validInput(),
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('API timeout');
    });
  });
});

function validInput(): StyleRefineInput {
  return {
    draftContent: '林风走进大厅，看到了许多人。大厅里很热闹。他感到很惊讶。',
    chapterNumber: 3,
    genre: 'xianxia',
  };
}
