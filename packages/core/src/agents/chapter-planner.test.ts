import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ChapterPlanner,
  type ChapterPlanBrief,
  type ChapterPlanResult,
  type ChapterPlan,
} from './chapter-planner';
import type { LLMProvider } from '../llm/provider';
import type { HookAgenda } from '../governance/hook-agenda';
import type { Hook } from '../models/state';

function createMockProvider(): LLMProvider & { generateJSON: ReturnType<typeof vi.fn> } {
  return {
    generate: vi.fn(),
    generateJSON: vi.fn(),
  } as unknown as LLMProvider & { generateJSON: ReturnType<typeof vi.fn> };
}

describe('ChapterPlanner', () => {
  let mockProvider: ReturnType<typeof createMockProvider>;
  let planner: ChapterPlanner;

  beforeEach(() => {
    mockProvider = createMockProvider();
    planner = new ChapterPlanner(mockProvider);
  });

  // ── Properties ────────────────────────────────────────────

  describe('abstract properties', () => {
    it('has correct agent name', () => {
      expect(planner.name).toBe('ChapterPlanner');
    });

    it('uses planner temperature (0.6 for structured planning)', () => {
      expect(planner.temperature).toBe(0.6);
    });
  });

  // ── execute() — happy path ────────────────────────────────

  describe('execute()', () => {
    const validBrief: ChapterPlanBrief = {
      title: '修仙之路',
      genre: 'xianxia',
      brief: '一个普通少年从山村走出，踏上修仙之路的故事',
      chapterNumber: 1,
    };

    const mockPlan: ChapterPlanResult = {
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

    it('returns chapter plan from brief', async () => {
      mockProvider.generateJSON.mockResolvedValue(mockPlan);

      const result = await planner.execute({ promptContext: { brief: validBrief } });

      expect(result.success).toBe(true);
      const data = result.data as ChapterPlanResult;
      expect(data.plan.chapterNumber).toBe(1);
    });

    it('returns plan with all required fields', async () => {
      mockProvider.generateJSON.mockResolvedValue(mockPlan);

      const result = await planner.execute({ promptContext: { brief: validBrief } });

      const data = result.data as ChapterPlanResult;
      const plan = data.plan;
      expect(plan.intention).toBeTruthy();
      expect(Array.isArray(plan.characters)).toBe(true);
      expect(Array.isArray(plan.keyEvents)).toBe(true);
      expect(plan.emotionalBeat).toBeTruthy();
    });

    it('calls generateJSON with prompt containing chapter number', async () => {
      mockProvider.generateJSON.mockResolvedValue(mockPlan);

      await planner.execute({ promptContext: { brief: validBrief } });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('第 1 章');
    });

    it('passes correct temperature', async () => {
      mockProvider.generateJSON.mockResolvedValue(mockPlan);

      await planner.execute({ promptContext: { brief: validBrief } });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.temperature).toBe(0.6);
    });
  });

  // ── execute() — with context ──────────────────────────────

  describe('execute() — with context', () => {
    it('includes character list in prompt when provided', async () => {
      mockProvider.generateJSON.mockResolvedValue({ plan: {} });

      await planner.execute({
        promptContext: {
          brief: { title: 'Test', genre: 'xianxia', brief: 'story', chapterNumber: 2 },
          characters: ['林风', '魔尊'],
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('林风');
      expect(callArgs.prompt).toContain('魔尊');
    });

    it('includes outline context when provided', async () => {
      mockProvider.generateJSON.mockResolvedValue({ plan: {} });

      await planner.execute({
        promptContext: {
          brief: { title: 'Test', genre: 'xianxia', brief: 'story', chapterNumber: 3 },
          outline: '第二幕：成长阶段',
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('第二幕');
    });

    it('includes previous chapter summary when provided', async () => {
      mockProvider.generateJSON.mockResolvedValue({ plan: {} });

      await planner.execute({
        promptContext: {
          brief: { title: 'Test', genre: 'xianxia', brief: 'story', chapterNumber: 4 },
          previousChapterSummary: '上一章主角离开了家乡',
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('上一章主角离开了家乡');
    });

    it('includes open hooks when provided', async () => {
      mockProvider.generateJSON.mockResolvedValue({ plan: {} });

      await planner.execute({
        promptContext: {
          brief: { title: 'Test', genre: 'xianxia', brief: 'story', chapterNumber: 5 },
          openHooks: [
            {
              description: '玉佩的秘密',
              type: 'narrative',
              status: 'open',
              priority: 'critical' as const,
              plantedChapter: 1,
            },
          ],
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('玉佩的秘密');
    });
  });

  // ── execute() — validation ────────────────────────────────

  describe('execute() — validation', () => {
    it('returns error when chapter number is missing', async () => {
      const brief: ChapterPlanBrief = {
        title: 'Test',
        genre: 'xianxia',
        brief: 'story',
      } as ChapterPlanBrief;

      const result = await planner.execute({ promptContext: { brief } });

      expect(result.success).toBe(false);
      expect(result.error).toContain('章节号');
    });

    it('returns error when title is missing', async () => {
      const result = await planner.execute({
        promptContext: {
          brief: { title: '', genre: 'xianxia', brief: 'story', chapterNumber: 1 },
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('书名');
    });

    it('returns error when brief content is empty', async () => {
      const result = await planner.execute({
        promptContext: {
          brief: { title: 'Some Title', genre: 'xianxia', brief: '', chapterNumber: 1 },
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('简介');
    });

    it('returns error when brief context is missing', async () => {
      const result = await planner.execute({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('创作简报');
    });
  });

  // ── execute() — LLM errors ────────────────────────────────

  describe('execute() — LLM errors', () => {
    it('returns error when LLM call fails', async () => {
      mockProvider.generateJSON.mockRejectedValue(new Error('LLM timeout'));

      const result = await planner.execute({
        promptContext: {
          brief: { title: 'Test', genre: 'xianxia', brief: 'story', chapterNumber: 1 },
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('LLM timeout');
    });

    it('returns error when LLM returns malformed response', async () => {
      mockProvider.generateJSON.mockRejectedValue(new SyntaxError('Unexpected token'));

      const result = await planner.execute({
        promptContext: {
          brief: { title: 'Test', genre: 'xianxia', brief: 'story', chapterNumber: 1 },
        },
      });

      expect(result.success).toBe(false);
    });
  });

  // ── execute() — genre context ─────────────────────────────

  describe('execute() — genre context', () => {
    it('includes genre-specific guidance for sci-fi', async () => {
      mockProvider.generateJSON.mockResolvedValue({ plan: {} });

      await planner.execute({
        promptContext: {
          brief: { title: '星际', genre: 'sci-fi', brief: '科幻故事', chapterNumber: 1 },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('科幻');
    });

    it('handles unknown genre gracefully', async () => {
      mockProvider.generateJSON.mockResolvedValue({ plan: {} });

      await planner.execute({
        promptContext: {
          brief: { title: 'Unknown', genre: 'litrpg', brief: 'Some story', chapterNumber: 1 },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('litrpg');
    });
  });

  // ── execute() — word count target ─────────────────────────

  describe('execute() — word count target', () => {
    it('includes wordCountTarget in prompt when provided', async () => {
      mockProvider.generateJSON.mockResolvedValue({ plan: {} });

      await planner.execute({
        promptContext: {
          brief: {
            title: 'Test',
            genre: 'xianxia',
            brief: 'story',
            chapterNumber: 1,
            wordCountTarget: 4000,
          },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('4000');
    });
  });

  // ── execute() — HookAgenda integration ───────────────────

  describe('execute() — HookAgenda integration', () => {
    const mockPlan: ChapterPlanResult = {
      plan: {
        chapterNumber: 5,
        title: 'Test Chapter',
        intention: 'Test intention',
        wordCountTarget: 3000,
        characters: ['林风'],
        keyEvents: ['Event 1'],
        hooks: [],
        worldRules: [],
        emotionalBeat: '平静',
        sceneTransition: 'transition',
      },
    };

    it('includes hookAgenda in result when agenda is provided', async () => {
      mockProvider.generateJSON.mockResolvedValue(mockPlan);

      const mockAgenda = {
        onChapterReached: vi.fn().mockReturnValue({
          woken: [{ hookId: 'h1', priority: 'critical' }],
          deferred: [{ hookId: 'h2', wakeAtChapter: 6 }],
          totalCandidates: 2,
        }),
      } as unknown as HookAgenda;

      const hooks: Hook[] = [
        {
          id: 'h1',
          status: 'dormant',
          priority: 'critical',
          plantedChapter: 1,
          description: '玉佩',
          type: 'narrative',
          relatedCharacters: [],
          relatedChapters: [],
          createdAt: '',
          updatedAt: '',
        },
        {
          id: 'h2',
          status: 'dormant',
          priority: 'major',
          plantedChapter: 2,
          description: '身世',
          type: 'narrative',
          relatedCharacters: [],
          relatedChapters: [],
          createdAt: '',
          updatedAt: '',
        },
      ];

      const agendaPlanner = new ChapterPlanner(mockProvider, mockAgenda);
      const result = await agendaPlanner.execute({
        promptContext: {
          brief: { title: 'Test', genre: 'xianxia', brief: 'story', chapterNumber: 5 },
          hooks,
        },
      });

      expect(result.success).toBe(true);
      const data = result.data as ChapterPlanResult;
      expect(data.plan.hookAgenda).toBeDefined();
      expect(data.plan.hookAgenda?.wakeResult?.woken).toHaveLength(1);
      expect(data.plan.hookAgenda?.wakeResult?.deferred).toHaveLength(1);
    });

    it('does not include hookAgenda when agenda is not provided', async () => {
      const freshPlan: ChapterPlanResult = {
        plan: {
          chapterNumber: 1,
          title: 'Test',
          intention: 'test',
          wordCountTarget: 3000,
          characters: [],
          keyEvents: [],
          hooks: [],
          worldRules: [],
          emotionalBeat: '平静',
          sceneTransition: 'transition',
        },
      };
      mockProvider.generateJSON.mockResolvedValue(freshPlan);

      const result = await planner.execute({
        promptContext: {
          brief: { title: 'Test', genre: 'xianxia', brief: 'story', chapterNumber: 1 },
          hooks: [],
        },
      });

      expect(result.success).toBe(true);
      const data = result.data as ChapterPlanResult;
      expect(data.plan.hookAgenda).toBeUndefined();
    });

    it('does not include hookAgenda when chapter number is missing', async () => {
      const mockAgenda = {
        onChapterReached: vi.fn(),
      } as unknown as HookAgenda;

      const agendaPlanner = new ChapterPlanner(mockProvider, mockAgenda);
      const result = await agendaPlanner.execute({
        promptContext: {
          brief: { title: 'Test', genre: 'xianxia', brief: 'story' } as ChapterPlanBrief,
          hooks: [],
        },
      });

      expect(result.success).toBe(false);
      expect(mockAgenda.onChapterReached).not.toHaveBeenCalled();
    });

    it('does not call agenda when no hooks provided', async () => {
      mockProvider.generateJSON.mockResolvedValue(mockPlan);

      const mockAgenda = {
        onChapterReached: vi.fn(),
      } as unknown as HookAgenda;

      const agendaPlanner = new ChapterPlanner(mockProvider, mockAgenda);
      await agendaPlanner.execute({
        promptContext: {
          brief: { title: 'Test', genre: 'xianxia', brief: 'story', chapterNumber: 5 },
        },
      });

      expect(mockAgenda.onChapterReached).not.toHaveBeenCalled();
    });

    it('includes schedule info in prompt when agenda is provided', async () => {
      mockProvider.generateJSON.mockResolvedValue(mockPlan);

      const mockAgenda = {
        onChapterReached: vi.fn().mockReturnValue({
          woken: [{ hookId: 'h1', priority: 'critical' }],
          deferred: [],
          totalCandidates: 1,
        }),
      } as unknown as HookAgenda;

      const hooks: Hook[] = [
        {
          id: 'h1',
          status: 'dormant',
          priority: 'critical',
          plantedChapter: 1,
          description: '玉佩',
          type: 'narrative',
          relatedCharacters: [],
          relatedChapters: [],
          createdAt: '',
          updatedAt: '',
        },
      ];

      const agendaPlanner = new ChapterPlanner(mockProvider, mockAgenda);
      await agendaPlanner.execute({
        promptContext: {
          brief: { title: 'Test', genre: 'xianxia', brief: 'story', chapterNumber: 5 },
          hooks,
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('唤醒伏笔');
      expect(callArgs.prompt).toContain('h1');
    });

    it('includes deferred hooks info in prompt when present', async () => {
      mockProvider.generateJSON.mockResolvedValue(mockPlan);

      const mockAgenda = {
        onChapterReached: vi.fn().mockReturnValue({
          woken: [],
          deferred: [{ hookId: 'h2', wakeAtChapter: 8 }],
          totalCandidates: 1,
        }),
      } as unknown as HookAgenda;

      const hooks: Hook[] = [
        {
          id: 'h2',
          status: 'dormant',
          priority: 'minor',
          plantedChapter: 2,
          description: '身世',
          type: 'narrative',
          relatedCharacters: [],
          relatedChapters: [],
          createdAt: '',
          updatedAt: '',
        },
      ];

      const agendaPlanner = new ChapterPlanner(mockProvider, mockAgenda);
      await agendaPlanner.execute({
        promptContext: {
          brief: { title: 'Test', genre: 'xianxia', brief: 'story', chapterNumber: 5 },
          hooks,
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('延期唤醒');
      expect(callArgs.prompt).toContain('h2');
      expect(callArgs.prompt).toContain('8');
    });
  });
});
