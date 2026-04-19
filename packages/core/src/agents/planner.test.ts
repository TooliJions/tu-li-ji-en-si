import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  OutlinePlanner,
  type OutlineBrief,
  type OutlineResult,
} from './planner';
import type { LLMProvider } from '../llm/provider';

// ── Helpers ───────────────────────────────────────────────────

function createMockProvider(): LLMProvider & { generateJSON: ReturnType<typeof vi.fn> } {
  return {
    generate: vi.fn(),
    generateJSON: vi.fn(),
  } as unknown as LLMProvider & { generateJSON: ReturnType<typeof vi.fn> };
}

// ── Tests ─────────────────────────────────────────────────────

describe('OutlinePlanner', () => {
  let mockProvider: ReturnType<typeof createMockProvider>;
  let planner: OutlinePlanner;

  beforeEach(() => {
    mockProvider = createMockProvider();
    planner = new OutlinePlanner(mockProvider);
  });

  // ── Properties ──────────────────────────────────────────────

  describe('abstract properties', () => {
    it('has correct agent name', () => {
      expect(planner.name).toBe('OutlinePlanner');
    });

    it('uses planner temperature (0.8 for creativity)', () => {
      expect(planner.temperature).toBe(0.8);
    });
  });

  // ── execute() — happy path ──────────────────────────────────

  describe('execute()', () => {
    const validBrief: OutlineBrief = {
      title: '修仙之路',
      genre: 'xianxia',
      brief: '一个普通少年从山村走出，踏上修仙之路的故事',
      targetChapters: 30,
    };

    const mockOutline: OutlineResult = {
      acts: [
        {
          actNumber: 1,
          title: '第一幕：起点',
          summary: '少年离开山村',
          chapters: [
            { chapterNumber: 1, title: '山村少年', summary: '介绍主角和背景' },
            { chapterNumber: 2, title: '离家', summary: '主角离开家乡' },
          ],
        },
        {
          actNumber: 2,
          title: '第二幕：成长',
          summary: '拜入仙门',
          chapters: [{ chapterNumber: 3, title: '入门', summary: '拜师学艺' }],
        },
        {
          actNumber: 3,
          title: '第三幕：巅峰',
          summary: '最终决战',
          chapters: [{ chapterNumber: 4, title: '决战', summary: '击败反派' }],
        },
      ],
    };

    it('returns structured three-act outline from brief', async () => {
      mockProvider.generateJSON.mockResolvedValue(mockOutline);

      const result = await planner.execute({
        bookId: 'book-1',
        promptContext: { brief: validBrief },
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      const data = result.data as OutlineResult;
      expect(data.acts).toHaveLength(3);
    });

    it('calls generateJSON with prompt containing brief info', async () => {
      mockProvider.generateJSON.mockResolvedValue(mockOutline);

      await planner.execute({ promptContext: { brief: validBrief } });

      expect(mockProvider.generateJSON).toHaveBeenCalled();
      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('修仙之路');
      expect(callArgs.prompt).toContain('修仙之路');
    });

    it('passes temperature override from agent default', async () => {
      mockProvider.generateJSON.mockResolvedValue(mockOutline);

      await planner.execute({ promptContext: { brief: validBrief } });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      // Planner uses 0.8 temperature
      expect(callArgs.temperature).toBe(0.8);
    });
  });

  // ── execute() — validation ──────────────────────────────────

  describe('execute() — brief validation', () => {
    it('returns error when title is missing', async () => {
      const brief: OutlineBrief = {
        title: '',
        genre: 'xianxia',
        brief: 'some brief',
      };

      const result = await planner.execute({ promptContext: { brief } });

      expect(result.success).toBe(false);
      expect(result.error).toContain('书名');
    });

    it('returns error when brief content is missing', async () => {
      const brief: OutlineBrief = {
        title: 'Some Title',
        genre: 'xianxia',
        brief: '',
      };

      const result = await planner.execute({ promptContext: { brief } });

      expect(result.success).toBe(false);
      expect(result.error).toContain('简介');
    });
  });

  // ── execute() — LLM errors ──────────────────────────────────

  describe('execute() — LLM errors', () => {
    it('returns error when LLM call fails', async () => {
      mockProvider.generateJSON.mockRejectedValue(new Error('LLM timeout'));

      const result = await planner.execute({
        promptContext: {
          brief: { title: 'Test', genre: 'xianxia', brief: 'some brief' },
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('LLM timeout');
    });

    it('returns error when LLM returns malformed JSON', async () => {
      mockProvider.generateJSON.mockRejectedValue(new SyntaxError('Unexpected token'));

      const result = await planner.execute({
        promptContext: {
          brief: { title: 'Test', genre: 'xianxia', brief: 'some brief' },
        },
      });

      expect(result.success).toBe(false);
    });
  });

  // ── execute() — optional fields ─────────────────────────────

  describe('execute() — optional brief fields', () => {
    it('works with minimal brief (only required fields)', async () => {
      const minimalBrief: OutlineBrief = {
        title: 'Minimal Book',
        genre: 'urban',
        brief: 'A simple story',
      };

      mockProvider.generateJSON.mockResolvedValue({
        acts: [
          { actNumber: 1, title: 'Act 1', summary: 'Beginning', chapters: [] },
          { actNumber: 2, title: 'Act 2', summary: 'Middle', chapters: [] },
          { actNumber: 3, title: 'Act 3', summary: 'End', chapters: [] },
        ],
      });

      const result = await planner.execute({ promptContext: { brief: minimalBrief } });

      expect(result.success).toBe(true);
    });

    it('includes targetChapters in prompt when provided', async () => {
      const brief: OutlineBrief = {
        title: 'Test',
        genre: 'xianxia',
        brief: 'some brief',
        targetChapters: 50,
      };

      mockProvider.generateJSON.mockResolvedValue({
        acts: [
          { actNumber: 1, title: 'Act 1', summary: 'Beginning', chapters: [] },
          { actNumber: 2, title: 'Act 2', summary: 'Middle', chapters: [] },
          { actNumber: 3, title: 'Act 3', summary: 'End', chapters: [] },
        ],
      });

      await planner.execute({ promptContext: { brief } });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('50');
    });
  });

  // ── buildPrompt() — genre-specific guidance ─────────────────

  describe('buildPrompt() — genre context', () => {
    it('includes genre-specific guidance for xianxia', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        acts: [
          { actNumber: 1, title: 'Act 1', summary: 'Start', chapters: [] },
          { actNumber: 2, title: 'Act 2', summary: 'Middle', chapters: [] },
          { actNumber: 3, title: 'Act 3', summary: 'End', chapters: [] },
        ],
      });

      await planner.execute({
        promptContext: {
          brief: { title: '仙途', genre: 'xianxia', brief: '修仙故事' },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('仙侠');
    });

    it('includes genre-specific guidance for urban', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        acts: [
          { actNumber: 1, title: 'Act 1', summary: 'Start', chapters: [] },
          { actNumber: 2, title: 'Act 2', summary: 'Middle', chapters: [] },
          { actNumber: 3, title: 'Act 3', summary: 'End', chapters: [] },
        ],
      });

      await planner.execute({
        promptContext: {
          brief: { title: '都市生活', genre: 'urban', brief: '都市故事' },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('都市');
    });

    it('handles unknown genre without genre-specific guidance', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        acts: [
          { actNumber: 1, title: 'Act 1', summary: 'Start', chapters: [] },
          { actNumber: 2, title: 'Act 2', summary: 'Middle', chapters: [] },
          { actNumber: 3, title: 'Act 3', summary: 'End', chapters: [] },
        ],
      });

      await planner.execute({
        promptContext: {
          brief: { title: 'Unknown', genre: 'litrpg', brief: 'Some story' },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      // Should still include the genre name but no specific guidance
      expect(callArgs.prompt).toContain('litrpg');
      expect(callArgs.prompt).not.toContain('仙侠');
    });
  });
});
