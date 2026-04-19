import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IntentDirector, type IntentInput, type IntentOutput } from './intent-director';
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

describe('IntentDirector', () => {
  let mockProvider: ReturnType<typeof createMockProvider>;
  let director: IntentDirector;

  beforeEach(() => {
    mockProvider = createMockProvider();
    director = new IntentDirector(mockProvider);
  });

  // ── Properties ────────────────────────────────────────────

  describe('abstract properties', () => {
    it('has correct agent name', () => {
      expect(director.name).toBe('IntentDirector');
    });

    it('uses high temperature (0.7 for creative direction)', () => {
      expect(director.temperature).toBe(0.7);
    });
  });

  // ── execute() — happy path ────────────────────────────────

  describe('execute()', () => {
    const validInput: IntentInput = {
      userIntent: '让主角林风在这一章中展现出坚定的意志力',
      chapterNumber: 3,
      genre: 'xianxia',
    };

    it('returns structured intent output', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        narrativeGoal: '展现主角林风的坚定意志',
        emotionalTone: '沉稳、坚定',
        keyBeats: ['面临困境', '内心挣扎', '做出决定'],
        focusCharacters: ['林风'],
        styleNotes: '注重内心独白描写',
      });

      const result = await director.execute({
        promptContext: { input: validInput },
      });

      expect(result.success).toBe(true);
      const data = result.data as IntentOutput;
      expect(data.narrativeGoal).toBeTruthy();
      expect(data.emotionalTone).toBeTruthy();
      expect(data.keyBeats).toBeTruthy();
    });

    it('includes chapter number and genre in output', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        narrativeGoal: '目标',
        emotionalTone: '情感',
        keyBeats: ['节拍1'],
        focusCharacters: [],
        styleNotes: '',
      });

      const result = await director.execute({
        promptContext: { input: validInput },
      });

      const data = result.data as IntentOutput;
      expect(data.chapterNumber).toBe(3);
      expect(data.genre).toBe('xianxia');
    });

    it('returns agent name in output', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        narrativeGoal: '目标',
        emotionalTone: '情感',
        keyBeats: ['节拍1'],
        focusCharacters: [],
        styleNotes: '',
      });

      const result = await director.execute({
        promptContext: { input: validInput },
      });

      const data = result.data as IntentOutput;
      expect(data.agentName).toBe('IntentDirector');
    });
  });

  // ── execute() — with context ──────────────────────────────

  describe('execute() — with context', () => {
    it('includes previous chapter summary in prompt when available', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        narrativeGoal: '目标',
        emotionalTone: '情感',
        keyBeats: ['节拍1'],
        focusCharacters: [],
        styleNotes: '',
      });

      await director.execute({
        promptContext: {
          input: {
            ...validInput(),
            previousChapterSummary: '上一章主角刚刚经历了失败',
          },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('上一章');
    });

    it('includes outline context when available', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        narrativeGoal: '目标',
        emotionalTone: '情感',
        keyBeats: ['节拍1'],
        focusCharacters: [],
        styleNotes: '',
      });

      await director.execute({
        promptContext: {
          input: {
            ...validInput(),
            outlineContext: '第三幕：主角成长阶段',
          },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('第三幕');
    });

    it('includes character profiles when available', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        narrativeGoal: '目标',
        emotionalTone: '情感',
        keyBeats: ['节拍1'],
        focusCharacters: [],
        styleNotes: '',
      });

      const characters = [
        { name: '林风', role: 'protagonist', traits: ['冷静', '坚韧'] },
        { name: '师父', role: 'mentor', traits: ['神秘', '严厉'] },
      ];

      await director.execute({
        promptContext: {
          input: {
            ...validInput(),
            characterProfiles: characters,
          },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('林风');
      expect(callArgs.prompt).toContain('师父');
    });
  });

  // ── execute() — validation ────────────────────────────────

  describe('execute() — validation', () => {
    it('returns error when input is missing', async () => {
      const result = await director.execute({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('输入');
    });

    it('returns error when user intent is missing', async () => {
      const result = await director.execute({
        promptContext: {
          input: { chapterNumber: 1, genre: 'xianxia' } as IntentInput,
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('意图');
    });

    it('returns error when user intent is empty', async () => {
      const result = await director.execute({
        promptContext: {
          input: { userIntent: '', chapterNumber: 1, genre: 'xianxia' },
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('意图');
    });

    it('returns error when genre is missing', async () => {
      const result = await director.execute({
        promptContext: {
          input: { userIntent: 'some intent', chapterNumber: 1 } as IntentInput,
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
        narrativeGoal: '目标',
        emotionalTone: '情感',
        keyBeats: ['节拍1'],
        focusCharacters: [],
        styleNotes: '',
      });

      await director.execute({
        promptContext: {
          input: { userIntent: '主角突破境界', chapterNumber: 1, genre: 'xianxia' },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('仙侠');
    });

    it('includes genre-specific guidance for romance', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        narrativeGoal: '目标',
        emotionalTone: '情感',
        keyBeats: ['节拍1'],
        focusCharacters: [],
        styleNotes: '',
      });

      await director.execute({
        promptContext: {
          input: { userIntent: '男女主角初次相遇', chapterNumber: 1, genre: 'romance' },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('言情');
    });

    it('handles unknown genre gracefully', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        narrativeGoal: '目标',
        emotionalTone: '情感',
        keyBeats: ['节拍1'],
        focusCharacters: [],
        styleNotes: '',
      });

      const result = await director.execute({
        promptContext: {
          input: { userIntent: 'some intent', chapterNumber: 1, genre: 'litrpg' },
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

      const result = await director.execute({
        promptContext: {
          input: validInput(),
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('API timeout');
    });
  });
});

function validInput(): IntentInput {
  return {
    userIntent: '让主角林风在这一章中展现出坚定的意志力',
    chapterNumber: 3,
    genre: 'xianxia',
  };
}
