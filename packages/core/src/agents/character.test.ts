import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CharacterDesigner,
  type CharacterDesignBrief,
  type CharacterDesignResult,
  type CharacterProfile,
} from './character';
import type { LLMProvider } from '../llm/provider';

function createMockProvider(): LLMProvider & { generateJSON: ReturnType<typeof vi.fn> } {
  return {
    generate: vi.fn(),
    generateJSON: vi.fn(),
  } as unknown as LLMProvider & { generateJSON: ReturnType<typeof vi.fn> };
}

describe('CharacterDesigner', () => {
  let mockProvider: ReturnType<typeof createMockProvider>;
  let designer: CharacterDesigner;

  beforeEach(() => {
    mockProvider = createMockProvider();
    designer = new CharacterDesigner(mockProvider);
  });

  // ── Properties ────────────────────────────────────────────

  describe('abstract properties', () => {
    it('has correct agent name', () => {
      expect(designer.name).toBe('CharacterDesigner');
    });

    it('uses designer temperature (0.7 for creativity)', () => {
      expect(designer.temperature).toBe(0.7);
    });
  });

  // ── execute() — happy path ────────────────────────────────

  describe('execute()', () => {
    const validBrief: CharacterDesignBrief = {
      title: '修仙之路',
      genre: 'xianxia',
      brief: '一个普通少年从山村走出，踏上修仙之路的故事',
    };

    const mockCharacters: CharacterDesignResult = {
      characters: [
        {
          name: '林风',
          role: 'protagonist',
          traits: ['冷静', '坚韧', '天赋异禀'],
          background: '山村孤儿，被老猎人收养',
          abilities: ['基础炼气术', '追踪术'],
          relationships: { 师父: '养父兼导师', 师妹: '同门好友' },
          arc: '从山村少年成长为修仙宗师',
        },
        {
          name: '魔尊',
          role: 'antagonist',
          traits: ['阴险', '强大', '野心勃勃'],
          background: '魔道宗主',
          abilities: ['魔功', '控魂术'],
          relationships: { 林风: '宿敌' },
          arc: '从隐忍到疯狂',
        },
      ],
    };

    it('returns character profiles from brief', async () => {
      mockProvider.generateJSON.mockResolvedValue(mockCharacters);

      const result = await designer.execute({ promptContext: { brief: validBrief } });

      expect(result.success).toBe(true);
      const data = result.data as CharacterDesignResult;
      expect(data.characters.length).toBeGreaterThan(0);
    });

    it('returns characters with required fields', async () => {
      mockProvider.generateJSON.mockResolvedValue(mockCharacters);

      const result = await designer.execute({ promptContext: { brief: validBrief } });

      const data = result.data as CharacterDesignResult;
      const char = data.characters[0];
      expect(char.name).toBeTruthy();
      expect(char.role).toBeDefined();
      expect(Array.isArray(char.traits)).toBe(true);
      expect(char.background).toBeTruthy();
    });

    it('calls generateJSON with prompt containing brief info', async () => {
      mockProvider.generateJSON.mockResolvedValue(mockCharacters);

      await designer.execute({ promptContext: { brief: validBrief } });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('修仙之路');
      expect(callArgs.prompt).toContain('character');
    });

    it('passes correct temperature', async () => {
      mockProvider.generateJSON.mockResolvedValue(mockCharacters);

      await designer.execute({ promptContext: { brief: validBrief } });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.temperature).toBe(0.7);
    });
  });

  // ── execute() — with outline ──────────────────────────────

  describe('execute() — with outline', () => {
    it('includes outline context in prompt when provided', async () => {
      mockProvider.generateJSON.mockResolvedValue({ characters: [] });

      await designer.execute({
        promptContext: {
          brief: { title: 'Test', genre: 'xianxia', brief: 'story' },
          outline: '三幕结构：第一幕介绍主角，第二幕成长，第三幕决战',
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('三幕结构');
    });
  });

  // ── execute() — character count ───────────────────────────

  describe('execute() — character count', () => {
    it('includes target character count in prompt', async () => {
      mockProvider.generateJSON.mockResolvedValue({ characters: [] });

      await designer.execute({
        promptContext: {
          brief: { title: 'Test', genre: 'xianxia', brief: 'story', characterCount: 5 },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('5');
    });
  });

  // ── execute() — validation ────────────────────────────────

  describe('execute() — validation', () => {
    it('returns error when title is missing', async () => {
      const brief: CharacterDesignBrief = {
        title: '',
        genre: 'xianxia',
        brief: 'some brief',
      };

      const result = await designer.execute({ promptContext: { brief } });

      expect(result.success).toBe(false);
      expect(result.error).toContain('书名');
    });

    it('returns error when brief content is empty', async () => {
      const brief: CharacterDesignBrief = {
        title: 'Some Title',
        genre: 'xianxia',
        brief: '',
      };

      const result = await designer.execute({ promptContext: { brief } });

      expect(result.success).toBe(false);
      expect(result.error).toContain('简介');
    });

    it('returns error when brief context is missing', async () => {
      const result = await designer.execute({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('创作简报');
    });
  });

  // ── execute() — LLM errors ────────────────────────────────

  describe('execute() — LLM errors', () => {
    it('returns error when LLM call fails', async () => {
      mockProvider.generateJSON.mockRejectedValue(new Error('LLM timeout'));

      const result = await designer.execute({
        promptContext: {
          brief: { title: 'Test', genre: 'xianxia', brief: 'story' },
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('LLM timeout');
    });

    it('returns error when LLM returns malformed response', async () => {
      mockProvider.generateJSON.mockRejectedValue(new SyntaxError('Unexpected token'));

      const result = await designer.execute({
        promptContext: {
          brief: { title: 'Test', genre: 'xianxia', brief: 'story' },
        },
      });

      expect(result.success).toBe(false);
    });

    it('handles non-Error rejection gracefully', async () => {
      mockProvider.generateJSON.mockRejectedValue('string error message');

      const result = await designer.execute({
        promptContext: {
          brief: { title: 'Test', genre: 'xianxia', brief: 'story' },
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('string error message');
    });
  });

  // ── execute() — genre context ─────────────────────────────

  describe('execute() — genre context', () => {
    it('includes genre-specific guidance for fantasy', async () => {
      mockProvider.generateJSON.mockResolvedValue({ characters: [] });

      await designer.execute({
        promptContext: {
          brief: { title: '魔法大陆', genre: 'fantasy', brief: '魔法世界' },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('玄幻');
    });

    it('includes genre-specific guidance for urban', async () => {
      mockProvider.generateJSON.mockResolvedValue({ characters: [] });

      await designer.execute({
        promptContext: {
          brief: { title: '都市生活', genre: 'urban', brief: '都市故事' },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('都市');
    });

    it('handles unknown genre gracefully', async () => {
      mockProvider.generateJSON.mockResolvedValue({ characters: [] });

      await designer.execute({
        promptContext: {
          brief: { title: 'Unknown', genre: 'litrpg', brief: 'Some story' },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('litrpg');
    });
  });
});
