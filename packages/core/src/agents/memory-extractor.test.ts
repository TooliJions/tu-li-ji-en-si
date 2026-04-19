import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryExtractor, type MemoryInput, type MemoryOutput } from './memory-extractor';
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

describe('MemoryExtractor', () => {
  let mockProvider: ReturnType<typeof createMockProvider>;
  let extractor: MemoryExtractor;

  beforeEach(() => {
    mockProvider = createMockProvider();
    extractor = new MemoryExtractor(mockProvider);
  });

  // ── Properties ────────────────────────────────────────────

  describe('abstract properties', () => {
    it('has correct agent name', () => {
      expect(extractor.name).toBe('MemoryExtractor');
    });

    it('uses analytical temperature (0.3 for factual extraction)', () => {
      expect(extractor.temperature).toBe(0.3);
    });
  });

  // ── execute() — happy path ────────────────────────────────

  describe('execute()', () => {
    const validInput: MemoryInput = {
      chapterContent:
        '林风踏入青云门，看到了宏伟的山门和忙碌的弟子们。他拜入了外门，师父是李长老。',
      chapterNumber: 3,
      genre: 'xianxia',
    };

    it('returns extracted memory items', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        newFacts: ['林风拜入青云门外门', '李长老是林风的师父'],
        relationshipChanges: [{ character: '林风', relatedTo: '李长老', relationship: '师徒' }],
        hookProgress: [],
        characterDevelopment: ['林风成为青云门外门弟子'],
        worldbuildingAdditions: [],
      });

      const result = await extractor.execute({
        promptContext: { input: validInput },
      });

      expect(result.success).toBe(true);
      const data = result.data as MemoryOutput;
      expect(data.newFacts).toHaveLength(2);
      expect(data.relationshipChanges).toHaveLength(1);
    });

    it('includes chapter number in output', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        newFacts: [],
        relationshipChanges: [],
        hookProgress: [],
        characterDevelopment: [],
        worldbuildingAdditions: [],
      });

      const result = await extractor.execute({
        promptContext: { input: validInput },
      });

      const data = result.data as MemoryOutput;
      expect(data.chapterNumber).toBe(3);
    });

    it('includes all memory categories in output', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        newFacts: ['新事实'],
        relationshipChanges: [],
        hookProgress: [{ hookDescription: '玉佩伏笔', progress: '首次提及' }],
        characterDevelopment: ['角色成长'],
        worldbuildingAdditions: ['新设定'],
      });

      const result = await extractor.execute({
        promptContext: { input: validInput },
      });

      const data = result.data as MemoryOutput;
      expect(data.hookProgress).toHaveLength(1);
      expect(data.characterDevelopment).toHaveLength(1);
      expect(data.worldbuildingAdditions).toHaveLength(1);
    });
  });

  // ── execute() — with existing context ─────────────────────

  describe('execute() — with existing context', () => {
    it('includes existing facts when provided', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        newFacts: [],
        relationshipChanges: [],
        hookProgress: [],
        characterDevelopment: [],
        worldbuildingAdditions: [],
      });

      await extractor.execute({
        promptContext: {
          input: {
            ...validInput(),
            existingFacts: ['青云门是正道第一大宗'],
          },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('青云门是正道');
    });

    it('includes open hooks when provided', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        newFacts: [],
        relationshipChanges: [],
        hookProgress: [],
        characterDevelopment: [],
        worldbuildingAdditions: [],
      });

      await extractor.execute({
        promptContext: {
          input: {
            ...validInput(),
            openHooks: ['神秘玉佩的来历'],
          },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('神秘玉佩');
    });

    it('includes character list when provided', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        newFacts: [],
        relationshipChanges: [],
        hookProgress: [],
        characterDevelopment: [],
        worldbuildingAdditions: [],
      });

      await extractor.execute({
        promptContext: {
          input: {
            ...validInput(),
            knownCharacters: ['林风', '李长老'],
          },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('林风');
    });
  });

  // ── execute() — validation ────────────────────────────────

  describe('execute() — validation', () => {
    it('returns error when input is missing', async () => {
      const result = await extractor.execute({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('输入');
    });

    it('returns error when chapter content is missing', async () => {
      const result = await extractor.execute({
        promptContext: {
          input: { chapterNumber: 1, genre: 'xianxia' } as MemoryInput,
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('内容');
    });

    it('returns error when chapter content is empty', async () => {
      const result = await extractor.execute({
        promptContext: {
          input: { chapterContent: '', chapterNumber: 1, genre: 'xianxia' },
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('内容');
    });

    it('returns error when genre is missing', async () => {
      const result = await extractor.execute({
        promptContext: {
          input: { chapterContent: 'some content', chapterNumber: 1 } as MemoryInput,
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('题材');
    });
  });

  // ── execute() — genre context ─────────────────────────────

  describe('execute() — genre context', () => {
    it('includes genre-specific guidance for xianxia', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        newFacts: [],
        relationshipChanges: [],
        hookProgress: [],
        characterDevelopment: [],
        worldbuildingAdditions: [],
      });

      await extractor.execute({
        promptContext: {
          input: { chapterContent: '内容', chapterNumber: 1, genre: 'xianxia' },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('仙侠');
    });

    it('includes genre-specific guidance for urban', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        newFacts: [],
        relationshipChanges: [],
        hookProgress: [],
        characterDevelopment: [],
        worldbuildingAdditions: [],
      });

      await extractor.execute({
        promptContext: {
          input: { chapterContent: '内容', chapterNumber: 1, genre: 'urban' },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('都市');
    });

    it('handles unknown genre gracefully', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        newFacts: [],
        relationshipChanges: [],
        hookProgress: [],
        characterDevelopment: [],
        worldbuildingAdditions: [],
      });

      const result = await extractor.execute({
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

      const result = await extractor.execute({
        promptContext: {
          input: validInput(),
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('API timeout');
    });
  });
});

function validInput(): MemoryInput {
  return {
    chapterContent: '林风踏入青云门，看到了宏伟的山门和忙碌的弟子们。他拜入了外门，师父是李长老。',
    chapterNumber: 3,
    genre: 'xianxia',
  };
}
