import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ChapterExecutor,
  type ChapterExecutionInput,
  type ChapterExecutionResult,
  type AgentDependencies,
} from './executor';
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

describe('ChapterExecutor', () => {
  let mockProvider: ReturnType<typeof createMockProvider>;
  let executor: ChapterExecutor;

  beforeEach(() => {
    mockProvider = createMockProvider();
    executor = new ChapterExecutor(mockProvider);
  });

  // ── Properties ────────────────────────────────────────────

  describe('abstract properties', () => {
    it('has correct agent name', () => {
      expect(executor.name).toBe('ChapterExecutor');
    });

    it('uses executor temperature (0.8 for creative writing)', () => {
      expect(executor.temperature).toBe(0.8);
    });
  });

  // ── execute() — happy path ────────────────────────────────

  describe('execute()', () => {
    const validInput: ChapterExecutionInput = {
      title: '修仙之路',
      genre: 'xianxia',
      brief: '一个普通少年从山村走出，踏上修仙之路的故事',
      chapterNumber: 1,
      plan: {
        chapterNumber: 1,
        title: '山村少年',
        intention: '介绍主角林风的身份、性格和山村生活',
        wordCountTarget: 3000,
        characters: ['林风', '老猎人'],
        keyEvents: ['林风在打猎时发现神秘玉佩', '老猎人讲述修仙世界的存在'],
        hooks: [{ description: '神秘玉佩的来历', type: 'narrative', priority: 'critical' }],
        worldRules: ['修炼分为炼气、筑基、金丹三个阶段'],
        emotionalBeat: '平静→好奇→向往',
        sceneTransition: '从山村日常过渡到修仙世界的门槛',
      },
    };

    const generatedContent =
      '这是一个关于山村少年的故事。清晨的薄雾笼罩着小山村，林风背着猎弓走进了后山……';

    it('returns generated chapter content', async () => {
      const deps: AgentDependencies = {
        buildContext: vi.fn().mockResolvedValue('上下文卡片：主角林风，山村孤儿'),
        generateScene: vi.fn().mockResolvedValue(generatedContent),
      };

      const result = await executor.execute({
        promptContext: { input: validInput, dependencies: deps },
      });

      expect(result.success).toBe(true);
      const data = result.data as ChapterExecutionResult;
      expect(data.content).toBe(generatedContent);
      expect(data.chapterNumber).toBe(1);
    });

    it('calls buildContext before generateScene', async () => {
      const order: string[] = [];
      const deps: AgentDependencies = {
        buildContext: vi.fn().mockImplementation(async () => {
          order.push('context');
          return 'ctx';
        }),
        generateScene: vi.fn().mockImplementation(async () => {
          order.push('scene');
          return 'content';
        }),
      };

      await executor.execute({
        promptContext: { input: validInput, dependencies: deps },
      });

      expect(order).toEqual(['context', 'scene']);
    });

    it('passes plan and context to generateScene', async () => {
      const deps: AgentDependencies = {
        buildContext: vi.fn().mockResolvedValue('context data'),
        generateScene: vi.fn().mockResolvedValue('content'),
      };

      await executor.execute({
        promptContext: { input: validInput, dependencies: deps },
      });

      expect(deps.generateScene).toHaveBeenCalledWith(validInput.plan, 'context data');
    });
  });

  // ── execute() — without dependencies ──────────────────────

  describe('execute() — without dependencies (fallback LLM)', () => {
    it('falls back to direct LLM generation when no dependencies provided', async () => {
      mockProvider.generate.mockResolvedValue({
        text: '直接生成的章节内容',
        usage: { promptTokens: 100, completionTokens: 500, totalTokens: 600 },
        model: 'test-model',
      });

      const result = await executor.execute({
        promptContext: {
          input: {
            title: 'Test',
            genre: 'xianxia',
            brief: 'story',
            chapterNumber: 1,
            plan: {
              chapterNumber: 1,
              title: 'Test Chapter',
              intention: 'test',
              wordCountTarget: 2000,
              characters: [],
              keyEvents: [],
              hooks: [],
              worldRules: [],
              emotionalBeat: 'calm',
              sceneTransition: 'none',
            },
          },
        },
      });

      expect(result.success).toBe(true);
      const data = result.data as ChapterExecutionResult;
      expect(data.content).toBe('直接生成的章节内容');
    });

    it('includes plan details in fallback prompt', async () => {
      mockProvider.generate.mockResolvedValue({
        text: 'fallback content',
        usage: { promptTokens: 50, completionTokens: 200, totalTokens: 250 },
        model: 'test-model',
      });

      await executor.execute({
        promptContext: {
          input: {
            title: '修仙之路',
            genre: 'xianxia',
            brief: '少年修仙的故事',
            chapterNumber: 3,
            plan: {
              chapterNumber: 3,
              title: '突破',
              intention: '主角突破到筑基期',
              wordCountTarget: 3000,
              characters: ['林风'],
              keyEvents: ['突破境界'],
              hooks: [],
              worldRules: [],
              emotionalBeat: '紧张→兴奋',
              sceneTransition: '闭关到出关',
            },
          },
        },
      });

      const callArgs = mockProvider.generate.mock.calls[0][0];
      expect(callArgs.prompt).toContain('突破');
      expect(callArgs.prompt).toContain('筑基');
    });
  });

  // ── execute() — validation ────────────────────────────────

  describe('execute() — validation', () => {
    it('returns error when input is missing', async () => {
      const result = await executor.execute({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('执行输入');
    });

    it('returns error when chapter number is missing', async () => {
      const input = {
        title: 'Test',
        genre: 'xianxia',
        brief: 'story',
      } as ChapterExecutionInput;

      const result = await executor.execute({ promptContext: { input } });

      expect(result.success).toBe(false);
      expect(result.error).toContain('章节号');
    });

    it('returns error when plan is missing', async () => {
      const input = {
        title: 'Test',
        genre: 'xianxia',
        brief: 'story',
        chapterNumber: 1,
      } as ChapterExecutionInput;

      const result = await executor.execute({ promptContext: { input } });

      expect(result.success).toBe(false);
      expect(result.error).toContain('章节计划');
    });

    it('returns error when title is empty', async () => {
      const result = await executor.execute({
        promptContext: {
          input: {
            title: '',
            genre: 'xianxia',
            brief: 'story',
            chapterNumber: 1,
            plan: {
              chapterNumber: 1,
              title: 'Test',
              intention: 'test',
              wordCountTarget: 2000,
              characters: [],
              keyEvents: [],
              hooks: [],
              worldRules: [],
              emotionalBeat: 'calm',
              sceneTransition: 'none',
            },
          },
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('书名');
    });

    it('returns error when brief is empty', async () => {
      const result = await executor.execute({
        promptContext: {
          input: {
            title: 'Test',
            genre: 'xianxia',
            brief: '',
            chapterNumber: 1,
            plan: {
              chapterNumber: 1,
              title: 'Test',
              intention: 'test',
              wordCountTarget: 2000,
              characters: [],
              keyEvents: [],
              hooks: [],
              worldRules: [],
              emotionalBeat: 'calm',
              sceneTransition: 'none',
            },
          },
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('简介');
    });
  });

  // ── execute() — dependency errors ─────────────────────────

  describe('execute() — dependency errors', () => {
    it('returns error when buildContext fails', async () => {
      const deps: AgentDependencies = {
        buildContext: vi.fn().mockRejectedValue(new Error('SQLite unavailable')),
        generateScene: vi.fn(),
      };

      const result = await executor.execute({
        promptContext: { input: validInput(), dependencies: deps },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('SQLite unavailable');
    });

    it('returns error when generateScene fails', async () => {
      const deps: AgentDependencies = {
        buildContext: vi.fn().mockResolvedValue('context'),
        generateScene: vi.fn().mockRejectedValue(new Error('LLM error')),
      };

      const result = await executor.execute({
        promptContext: { input: validInput(), dependencies: deps },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('LLM error');
    });

    it('returns error when fallback LLM generation fails', async () => {
      mockProvider.generate.mockRejectedValue(new Error('API timeout'));

      const result = await executor.execute({
        promptContext: {
          input: minimalInput(),
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('API timeout');
    });
  });

  // ── execute() — result metadata ───────────────────────────

  describe('execute() — result metadata', () => {
    it('includes chapter number and title in result', async () => {
      const deps: AgentDependencies = {
        buildContext: vi.fn().mockResolvedValue('context'),
        generateScene: vi.fn().mockResolvedValue('chapter content'),
      };

      const result = await executor.execute({
        promptContext: { input: validInput(), dependencies: deps },
      });

      const data = result.data as ChapterExecutionResult;
      expect(data.chapterNumber).toBe(1);
      expect(data.title).toBe('山村少年');
    });

    it('includes word count in result', async () => {
      const deps: AgentDependencies = {
        buildContext: vi.fn().mockResolvedValue('context'),
        generateScene: vi.fn().mockResolvedValue('这是一段大约十几个字的内容'),
      };

      const result = await executor.execute({
        promptContext: { input: validInput(), dependencies: deps },
      });

      const data = result.data as ChapterExecutionResult;
      expect(data.wordCount).toBeGreaterThan(0);
    });
  });

  // ── execute() — genre context ─────────────────────────────

  describe('execute() — genre context', () => {
    it('includes genre-specific guidance for romance in fallback', async () => {
      mockProvider.generate.mockResolvedValue({
        text: 'content',
        usage: { promptTokens: 10, completionTokens: 50, totalTokens: 60 },
        model: 'test',
      });

      await executor.execute({
        promptContext: {
          input: {
            title: '爱恋',
            genre: 'romance',
            brief: '爱情故事',
            chapterNumber: 1,
            plan: {
              chapterNumber: 1,
              title: '初见',
              intention: '男女主角相遇',
              wordCountTarget: 2500,
              characters: ['女主', '男主'],
              keyEvents: ['初次相遇'],
              hooks: [],
              worldRules: [],
              emotionalBeat: '好奇→心动',
              sceneTransition: '咖啡馆相遇',
            },
          },
        },
      });

      const callArgs = mockProvider.generate.mock.calls[0][0];
      expect(callArgs.prompt).toContain('言情');
    });

    it('handles unknown genre in fallback', async () => {
      mockProvider.generate.mockResolvedValue({
        text: 'content',
        usage: { promptTokens: 10, completionTokens: 50, totalTokens: 60 },
        model: 'test',
      });

      await executor.execute({
        promptContext: {
          input: {
            title: 'Unknown',
            genre: 'litrpg',
            brief: 'story',
            chapterNumber: 1,
            plan: {
              chapterNumber: 1,
              title: 'Test',
              intention: 'test',
              wordCountTarget: 2000,
              characters: [],
              keyEvents: [],
              hooks: [],
              worldRules: [],
              emotionalBeat: 'calm',
              sceneTransition: 'none',
            },
          },
        },
      });

      const callArgs = mockProvider.generate.mock.calls[0][0];
      expect(callArgs.prompt).toContain('litrpg');
    });
  });
});

function validInput(): ChapterExecutionInput {
  return {
    title: '修仙之路',
    genre: 'xianxia',
    brief: '少年修仙的故事',
    chapterNumber: 1,
    plan: {
      chapterNumber: 1,
      title: '山村少年',
      intention: '介绍主角',
      wordCountTarget: 3000,
      characters: ['林风'],
      keyEvents: ['发现玉佩'],
      hooks: [],
      worldRules: [],
      emotionalBeat: '平静→好奇',
      sceneTransition: '日常到修仙',
    },
  };
}

function minimalInput(): ChapterExecutionInput {
  return {
    title: 'Test',
    genre: 'xianxia',
    brief: 'story',
    chapterNumber: 1,
    plan: {
      chapterNumber: 1,
      title: 'Test',
      intention: 'test',
      wordCountTarget: 2000,
      characters: [],
      keyEvents: [],
      hooks: [],
      worldRules: [],
      emotionalBeat: 'calm',
      sceneTransition: 'none',
    },
  };
}
