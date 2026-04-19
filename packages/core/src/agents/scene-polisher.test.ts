import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScenePolisher, type ScenePolishInput, type ScenePolishOutput } from './scene-polisher';
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

describe('ScenePolisher', () => {
  let mockProvider: ReturnType<typeof createMockProvider>;
  let polisher: ScenePolisher;

  beforeEach(() => {
    mockProvider = createMockProvider();
    polisher = new ScenePolisher(mockProvider);
  });

  // ── Properties ────────────────────────────────────────────

  describe('abstract properties', () => {
    it('has correct agent name', () => {
      expect(polisher.name).toBe('ScenePolisher');
    });

    it('uses moderate temperature (0.5 for balanced polishing)', () => {
      expect(polisher.temperature).toBe(0.5);
    });
  });

  // ── execute() — happy path ────────────────────────────────

  describe('execute()', () => {
    const validInput: ScenePolishInput = {
      draftContent: '这是一段需要润色的初稿文字。',
      chapterNumber: 3,
      title: '修仙之路',
      genre: 'xianxia',
    };

    it('returns polished content on success', async () => {
      mockProvider.generate.mockResolvedValue({
        text: '经过润色的高质量文字。',
        usage: { promptTokens: 500, completionTokens: 300, totalTokens: 800 },
        model: 'test-model',
      });

      const result = await polisher.execute({
        promptContext: { input: validInput },
      });

      expect(result.success).toBe(true);
      const data = result.data as ScenePolishOutput;
      expect(data.polishedContent).toBe('经过润色的高质量文字。');
    });

    it('includes word count in output', async () => {
      const polished = '这是润色后的内容';
      mockProvider.generate.mockResolvedValue({
        text: polished,
        usage: { promptTokens: 200, completionTokens: 100, totalTokens: 300 },
        model: 'test-model',
      });

      const result = await polisher.execute({
        promptContext: { input: validInput },
      });

      const data = result.data as ScenePolishOutput;
      expect(data.wordCount).toBe(polished.length);
    });

    it('includes original word count in output', async () => {
      mockProvider.generate.mockResolvedValue({
        text: 'polished',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'test-model',
      });

      const result = await polisher.execute({
        promptContext: { input: validInput },
      });

      const data = result.data as ScenePolishOutput;
      expect(data.originalWordCount).toBe(validInput.draftContent.length);
    });
  });

  // ── execute() — with context card ─────────────────────────

  describe('execute() — with context card', () => {
    it('includes context card data in prompt when available', async () => {
      mockProvider.generate.mockResolvedValue({
        text: 'polished',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'test',
      });

      const contextCard = {
        characters: [
          {
            id: 'c1',
            name: '林风',
            role: 'protagonist',
            traits: ['冷静', '坚韧'],
            relationships: {},
            arc: '成长弧光',
          },
        ],
        hooks: [
          {
            id: 'h1',
            description: '神秘玉佩',
            type: 'narrative',
            status: 'open',
            priority: 'critical',
            plantedChapter: 1,
            relatedCharacters: [],
            relatedChapters: [],
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          },
        ],
        facts: [],
        worldRules: [
          {
            id: 'r1',
            category: 'magic-system',
            rule: '修炼分为炼气、筑基、金丹三个阶段',
            exceptions: [],
          },
        ],
        previousChapterSummary: '上一章摘要',
        formattedText: '上下文卡片格式化文本',
      };

      await polisher.execute({
        promptContext: {
          input: { ...validInput(), contextCard },
        },
      });

      const callArgs = mockProvider.generate.mock.calls[0][0];
      expect(callArgs.prompt).toContain('林风');
      expect(callArgs.prompt).toContain('神秘玉佩');
      expect(callArgs.prompt).toContain('修炼分为炼气');
    });

    it('includes previous chapter summary in prompt when context card provided', async () => {
      mockProvider.generate.mockResolvedValue({
        text: 'polished',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'test',
      });

      const contextCard = {
        characters: [],
        hooks: [],
        facts: [],
        worldRules: [],
        previousChapterSummary: '上一章的故事概要',
        formattedText: '',
      };

      await polisher.execute({
        promptContext: {
          input: { ...validInput(), contextCard },
        },
      });

      const callArgs = mockProvider.generate.mock.calls[0][0];
      expect(callArgs.prompt).toContain('上一章的故事概要');
    });
  });

  // ── execute() — validation ────────────────────────────────

  describe('execute() — validation', () => {
    it('returns error when input is missing', async () => {
      const result = await polisher.execute({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('输入');
    });

    it('returns error when draft content is missing', async () => {
      const result = await polisher.execute({
        promptContext: {
          input: { chapterNumber: 1, genre: 'xianxia' } as ScenePolishInput,
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('草稿');
    });

    it('returns error when draft content is empty', async () => {
      const result = await polisher.execute({
        promptContext: {
          input: { draftContent: '', chapterNumber: 1, genre: 'xianxia' },
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('草稿');
    });

    it('returns error when genre is missing', async () => {
      const result = await polisher.execute({
        promptContext: {
          input: { draftContent: 'some content', chapterNumber: 1 } as ScenePolishInput,
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('题材');
    });
  });

  // ── execute() — genre context ─────────────────────────────

  describe('execute() — genre context', () => {
    it('includes genre-specific guidance for xianxia in prompt', async () => {
      mockProvider.generate.mockResolvedValue({
        text: 'polished',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'test',
      });

      await polisher.execute({
        promptContext: {
          input: { draftContent: '初稿内容', chapterNumber: 1, genre: 'xianxia' },
        },
      });

      const callArgs = mockProvider.generate.mock.calls[0][0];
      expect(callArgs.prompt).toContain('仙侠');
    });

    it('includes genre-specific guidance for romance in prompt', async () => {
      mockProvider.generate.mockResolvedValue({
        text: 'polished',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'test',
      });

      await polisher.execute({
        promptContext: {
          input: { draftContent: '初稿内容', chapterNumber: 1, genre: 'romance' },
        },
      });

      const callArgs = mockProvider.generate.mock.calls[0][0];
      expect(callArgs.prompt).toContain('言情');
    });

    it('handles unknown genre gracefully', async () => {
      mockProvider.generate.mockResolvedValue({
        text: 'polished',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'test',
      });

      const result = await polisher.execute({
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

      const result = await polisher.execute({
        promptContext: {
          input: validInput(),
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('API timeout');
    });
  });
});

function validInput(): ScenePolishInput {
  return {
    draftContent: '这是一段需要润色的初稿文字。',
    chapterNumber: 3,
    title: '修仙之路',
    genre: 'xianxia',
  };
}
