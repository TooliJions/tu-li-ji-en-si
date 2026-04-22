import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ChapterPlanner,
  type ChapterPlanBrief,
  type ChapterPlanResult,
  type BatchChapterPlanResult,
  type ChapterPlan,
  type BatchPlanRange,
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
        openingHook: '清晨，林风走进山林，却不知今天一切都将不同',
        closingHook: '老猎人低语：那块玉佩是修仙界的遗物',
        sceneBreakdown: [
          {
            title: '山间晨猎',
            description: '林风在猎场追踪猎物',
            characters: ['林风'],
            mood: '平静',
            wordCount: 1500,
          },
          {
            title: '玉佩现世',
            description: '林风发现发光的玉佩',
            characters: ['林风', '老猎人'],
            mood: '惊讶',
            wordCount: 1500,
          },
        ],
        characterGrowthBeat: '林风从安于现状到萌生好奇',
        hookActions: [{ action: 'plant', description: '神秘玉佩首次出现' }],
        pacingTag: 'slow_build',
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
        openingHook: '以悬念开篇',
        closingHook: '留下悬念',
        sceneBreakdown: [
          {
            title: '场景一',
            description: '测试场景描述',
            characters: ['林风'],
            mood: '平静',
            wordCount: 3000,
          },
        ],
        characterGrowthBeat: '测试成长点',
        hookActions: [],
        pacingTag: 'slow_build',
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
          openingHook: '以动作开篇',
          closingHook: '留下悬念',
          sceneBreakdown: [
            {
              title: '主场景',
              description: '测试场景',
              characters: [],
              mood: '平静',
              wordCount: 3000,
            },
          ],
          characterGrowthBeat: '',
          hookActions: [],
          pacingTag: 'slow_build',
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

  // ── 增强字段输出验证 ──────────────────────────────────────────

  describe('execute() — enhanced output fields', () => {
    const fullPlan: ChapterPlan = {
      chapterNumber: 3,
      title: '玉佩之谜',
      intention: '林风发现玉佩中封印着远古神识，被迫修炼引出新的危机',
      wordCountTarget: 3000,
      characters: ['林风', '老猎人'],
      keyEvents: ['林风在打猎时触发玉佩异象', '远古神识残影在梦中显现', '老猎人讲述上古传说'],
      hooks: [{ description: '玉佩中的远古神识', type: 'narrative', priority: 'critical' }],
      worldRules: ['修炼分为炼气、筑基、金丹三个阶段'],
      emotionalBeat: '平静→惊惧→决意',
      sceneTransition: '从日常猎场过渡到超自然事件',
      openingHook: '林风在猎场中感到大地传来不寻常的震颤',
      closingHook: '神识残影警告：玉佩一旦觉醒，修仙界将不再平静',
      sceneBreakdown: [
        {
          title: '猎场异象',
          description: '林风在猎场追踪猎物时，玉佩突然发出微光，大地微微震颤',
          characters: ['林风'],
          mood: '不安',
          wordCount: 1000,
        },
        {
          title: '梦中传承',
          description: '林风在梦中见到远古神识残影，神识告诫他玉佩觉醒的代价',
          characters: ['林风'],
          mood: '神秘',
          wordCount: 1200,
        },
        {
          title: '老猎人的故事',
          description: '老猎人讲述与玉佩相关的上古传说，暗示更大的命运',
          characters: ['林风', '老猎人'],
          mood: '凝重',
          wordCount: 800,
        },
      ],
      characterGrowthBeat: '林风从被动承受玉佩异象到主动面对命运',
      hookActions: [
        { action: 'plant', description: '玉佩中远古神识的残影首次显现' },
        { action: 'advance', description: '老猎人的故事暗示玉佩与上古大战的关联' },
      ],
      pacingTag: 'rising',
    };

    it('returns plan with all enhanced fields populated', async () => {
      mockProvider.generateJSON.mockResolvedValue({ plan: fullPlan });

      const result = await planner.execute({
        promptContext: {
          brief: {
            title: '修仙之路',
            genre: 'xianxia',
            brief: '一个少年修仙的故事',
            chapterNumber: 3,
          },
        },
      });

      expect(result.success).toBe(true);
      const plan = (result.data as ChapterPlanResult).plan;
      expect(plan.openingHook).toBeTruthy();
      expect(plan.closingHook).toBeTruthy();
      expect(plan.sceneBreakdown.length).toBeGreaterThanOrEqual(2);
      expect(plan.characterGrowthBeat).toBeTruthy();
      expect(plan.hookActions.length).toBeGreaterThan(0);
      expect(['slow_build', 'rising', 'climax', 'cooldown', 'transition']).toContain(
        plan.pacingTag
      );
    });

    it('sceneBreakdown wordCounts sum equals wordCountTarget', async () => {
      mockProvider.generateJSON.mockResolvedValue({ plan: fullPlan });

      const result = await planner.execute({
        promptContext: {
          brief: {
            title: '修仙之路',
            genre: 'xianxia',
            brief: '一个少年修仙的故事',
            chapterNumber: 3,
            wordCountTarget: 3000,
          },
        },
      });

      const plan = (result.data as ChapterPlanResult).plan;
      const totalSceneWords = plan.sceneBreakdown.reduce((sum, s) => sum + s.wordCount, 0);
      expect(totalSceneWords).toBe(plan.wordCountTarget);
    });

    it('sceneBreakdown each scene has all required fields', async () => {
      mockProvider.generateJSON.mockResolvedValue({ plan: fullPlan });

      const result = await planner.execute({
        promptContext: {
          brief: {
            title: '修仙之路',
            genre: 'xianxia',
            brief: '一个少年修仙的故事',
            chapterNumber: 3,
          },
        },
      });

      const plan = (result.data as ChapterPlanResult).plan;
      for (const scene of plan.sceneBreakdown) {
        expect(scene.title).toBeTruthy();
        expect(scene.description.length).toBeGreaterThanOrEqual(10);
        expect(Array.isArray(scene.characters)).toBe(true);
        expect(scene.mood).toBeTruthy();
        expect(scene.wordCount).toBeGreaterThan(0);
      }
    });

    it('hookActions only allows plant/advance/payoff actions', async () => {
      mockProvider.generateJSON.mockResolvedValue({ plan: fullPlan });

      const result = await planner.execute({
        promptContext: {
          brief: {
            title: '修仙之路',
            genre: 'xianxia',
            brief: '一个少年修仙的故事',
            chapterNumber: 3,
          },
        },
      });

      const plan = (result.data as ChapterPlanResult).plan;
      const validActions = ['plant', 'advance', 'payoff'];
      for (const ha of plan.hookActions) {
        expect(validActions).toContain(ha.action);
        expect(ha.description).toBeTruthy();
      }
    });

    it('pacingTag is one of the 5 valid values', async () => {
      mockProvider.generateJSON.mockResolvedValue({ plan: fullPlan });

      const result = await planner.execute({
        promptContext: {
          brief: {
            title: '修仙之路',
            genre: 'xianxia',
            brief: '一个少年修仙的故事',
            chapterNumber: 3,
          },
        },
      });

      const plan = (result.data as ChapterPlanResult).plan;
      expect(['slow_build', 'rising', 'climax', 'cooldown', 'transition']).toContain(
        plan.pacingTag
      );
    });

    it('prompt requests openingHook and closingHook', async () => {
      mockProvider.generateJSON.mockResolvedValue({ plan: fullPlan });

      await planner.execute({
        promptContext: {
          brief: {
            title: '修仙之路',
            genre: 'xianxia',
            brief: '一个少年修仙的故事',
            chapterNumber: 3,
          },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('openingHook');
      expect(callArgs.prompt).toContain('closingHook');
      expect(callArgs.prompt).toContain('sceneBreakdown');
      expect(callArgs.prompt).toContain('characterGrowthBeat');
      expect(callArgs.prompt).toContain('hookActions');
      expect(callArgs.prompt).toContain('pacingTag');
    });

    it('prompt enforces keyEvents boundary constraint', async () => {
      mockProvider.generateJSON.mockResolvedValue({ plan: fullPlan });

      await planner.execute({
        promptContext: {
          brief: {
            title: '修仙之路',
            genre: 'xianxia',
            brief: '一个少年修仙的故事',
            chapterNumber: 3,
          },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('事件边界');
      expect(callArgs.prompt).toContain('本章');
      expect(callArgs.prompt).toContain('可完成');
    });
  });

  // ── Sanitize 降级兜底 ──────────────────────────────────────────

  describe('execute() — sanitize fallback', () => {
    it('fills default values when LLM returns partial plan', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        plan: {
          chapterNumber: 1,
          title: '开篇',
          intention: '故事开始',
          wordCountTarget: 3000,
        },
      });

      const result = await planner.execute({
        promptContext: {
          brief: { title: 'Test', genre: 'xianxia', brief: 'story', chapterNumber: 1 },
        },
      });

      expect(result.success).toBe(true);
      const plan = (result.data as ChapterPlanResult).plan;
      // 必须字段有默认值
      expect(Array.isArray(plan.characters)).toBe(true);
      expect(Array.isArray(plan.keyEvents)).toBe(true);
      expect(plan.emotionalBeat).toBeTruthy();
      expect(plan.sceneTransition).toBeTruthy();
      expect(plan.openingHook).toBeTruthy();
      expect(plan.closingHook).toBeTruthy();
      expect(Array.isArray(plan.sceneBreakdown)).toBe(true);
      expect(plan.pacingTag).toBeTruthy();
    });

    it('fills sceneBreakdown with single default scene when LLM returns fewer than 2', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        plan: {
          chapterNumber: 1,
          intention: '故事开始',
          sceneBreakdown: [
            {
              title: '唯一场景',
              description: '描述',
              characters: [],
              mood: '平静',
              wordCount: 3000,
            },
          ],
        },
      });

      const result = await planner.execute({
        promptContext: {
          brief: {
            title: 'Test',
            genre: 'xianxia',
            brief: 'story',
            chapterNumber: 1,
            wordCountTarget: 3000,
          },
        },
      });

      expect(result.success).toBe(true);
      const plan = (result.data as ChapterPlanResult).plan;
      // 只有 1 个场景时，sanitize 会回退到默认单场景
      expect(plan.sceneBreakdown.length).toBeGreaterThanOrEqual(1);
      expect(plan.sceneBreakdown[0].wordCount).toBeGreaterThan(0);
    });

    it('defaults hookActions to empty array when missing', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        plan: { chapterNumber: 1, intention: '故事开始' },
      });

      const result = await planner.execute({
        promptContext: {
          brief: { title: 'Test', genre: 'xianxia', brief: 'story', chapterNumber: 1 },
        },
      });

      const plan = (result.data as ChapterPlanResult).plan;
      expect(Array.isArray(plan.hookActions)).toBe(true);
      expect(plan.hookActions).toEqual([]);
    });
  });

  // ── 批量规划模式 ──────────────────────────────────────────────

  describe('execute() — batch planning mode', () => {
    const batchRange: BatchPlanRange = { startChapter: 1, endChapter: 3 };

    const batchPlans: ChapterPlan[] = [
      {
        chapterNumber: 1,
        title: '山村少年',
        intention: '介绍主角林风的身份与山村生活',
        wordCountTarget: 3000,
        characters: ['林风', '老猎人'],
        keyEvents: ['林风在打猎时发现神秘玉佩', '老猎人讲述修仙世界的存在'],
        hooks: [{ description: '玉佩的来历', type: 'narrative', priority: 'critical' }],
        worldRules: ['修炼分为炼气、筑基、金丹三个阶段'],
        emotionalBeat: '平静→好奇→向往',
        sceneTransition: '从山村日常过渡到修仙世界门槛',
        openingHook: '清晨，林风像往常一样走进山林，却不知今天一切都将不同',
        closingHook: '老猎人临终前低语：那块玉佩……是修仙界的遗物',
        sceneBreakdown: [
          {
            title: '山间晨猎',
            description: '林风在猎场追踪猎物',
            characters: ['林风'],
            mood: '平静',
            wordCount: 1500,
          },
          {
            title: '玉佩现世',
            description: '林风发现发光的玉佩，触发异象',
            characters: ['林风'],
            mood: '惊讶',
            wordCount: 1500,
          },
        ],
        characterGrowthBeat: '林风从安于现状到萌生好奇',
        hookActions: [{ action: 'plant', description: '神秘玉佩首次出现' }],
        pacingTag: 'slow_build',
      },
      {
        chapterNumber: 2,
        title: '初入修仙',
        intention: '林风携带玉佩离开山村，踏入修仙世界',
        wordCountTarget: 3000,
        characters: ['林风', '掌门青虚'],
        keyEvents: ['林风到达云霄宗山门', '通过入门测试被收为外门弟子'],
        hooks: [],
        worldRules: ['外门弟子需从炼气一层开始修炼'],
        emotionalBeat: '紧张→兴奋→受挫',
        sceneTransition: '从山村到修仙宗门的跨越',
        openingHook: '老猎人的低语仍在耳边回响，林风踏上了去往云霄宗的路',
        closingHook: '掌门青虚看了一眼玉佩，目光骤然一缩',
        sceneBreakdown: [
          {
            title: '山门之路',
            description: '林风跋涉三日到达云霄宗',
            characters: ['林风'],
            mood: '疲惫',
            wordCount: 1200,
          },
          {
            title: '入门测试',
            description: '林风参加灵根测试',
            characters: ['林风', '掌门青虚'],
            mood: '紧张',
            wordCount: 1800,
          },
        ],
        characterGrowthBeat: '林风第一次独自面对未知世界',
        hookActions: [{ action: 'advance', description: '掌门注意到玉佩，推动伏笔' }],
        pacingTag: 'rising',
      },
      {
        chapterNumber: 3,
        title: '玉佩觉醒',
        intention: '林风在修炼中触发玉佩觉醒，引来危机',
        wordCountTarget: 3000,
        characters: ['林风', '掌门青虚', '师兄赵恒'],
        keyEvents: ['林风在炼气修炼中玉佩发出异光', '掌门秘密召见林风'],
        hooks: [{ description: '玉佩中远古神识', type: 'narrative', priority: 'critical' }],
        worldRules: ['炼气期弟子不可使用法宝'],
        emotionalBeat: '专注→惊惧→悬念',
        sceneTransition: '从外门日常到暗流涌动',
        openingHook: '掌门那凝重的目光让林风一夜未眠',
        closingHook: '神识残影在梦中开口：玉佩一旦觉醒，整个修仙界将不再平静',
        sceneBreakdown: [
          {
            title: '修炼异变',
            description: '林风炼气时玉佩突然发光，灵力暴动',
            characters: ['林风', '师兄赵恒'],
            mood: '惊恐',
            wordCount: 1500,
          },
          {
            title: '掌门密谈',
            description: '掌门青虚秘密召见林风，透露玉佩部分秘密',
            characters: ['林风', '掌门青虚'],
            mood: '神秘',
            wordCount: 1500,
          },
        ],
        characterGrowthBeat: '林风从被动卷入到主动追问真相',
        hookActions: [
          { action: 'advance', description: '掌门透露玉佩部分来历' },
          { action: 'payoff', description: '第一章伏笔"玉佩的来历"部分回收' },
        ],
        pacingTag: 'rising',
      },
    ];

    it('enters batch mode when batchRange is provided', async () => {
      mockProvider.generateJSON.mockResolvedValue({ plans: batchPlans });

      const result = await planner.execute({
        promptContext: {
          brief: {
            title: '修仙之路',
            genre: 'xianxia',
            brief: '一个少年修仙的故事',
            chapterNumber: 1,
          },
          batchRange,
        },
      });

      expect(result.success).toBe(true);
      const data = result.data as BatchChapterPlanResult;
      expect(data.plans).toHaveLength(3);
    });

    it('batch plans have sequential chapter numbers', async () => {
      mockProvider.generateJSON.mockResolvedValue({ plans: batchPlans });

      const result = await planner.execute({
        promptContext: {
          brief: {
            title: '修仙之路',
            genre: 'xianxia',
            brief: '一个少年修仙的故事',
            chapterNumber: 1,
          },
          batchRange,
        },
      });

      const data = result.data as BatchChapterPlanResult;
      const numbers = data.plans.map((p) => p.chapterNumber);
      expect(numbers).toEqual([1, 2, 3]);
    });

    it('batch plans closingHook/openingHook form causal chain', async () => {
      mockProvider.generateJSON.mockResolvedValue({ plans: batchPlans });

      const result = await planner.execute({
        promptContext: {
          brief: {
            title: '修仙之路',
            genre: 'xianxia',
            brief: '一个少年修仙的故事',
            chapterNumber: 1,
          },
          batchRange,
        },
      });

      const data = result.data as BatchChapterPlanResult;
      // 第 1 章 closingHook 与第 2 章 openingHook 应形成因果衔接
      expect(data.plans[0].closingHook).toBeTruthy();
      expect(data.plans[1].openingHook).toBeTruthy();
      // 提示词中应包含章间连贯约束
      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('章间连贯');
      expect(callArgs.prompt).toContain('closingHook');
      expect(callArgs.prompt).toContain('openingHook');
    });

    it('batch plans pacing tags form reasonable progression', async () => {
      mockProvider.generateJSON.mockResolvedValue({ plans: batchPlans });

      await planner.execute({
        promptContext: {
          brief: {
            title: '修仙之路',
            genre: 'xianxia',
            brief: '一个少年修仙的故事',
            chapterNumber: 1,
          },
          batchRange,
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('节奏递进');
    });

    it('batch prompt includes hookActions cross-chapter constraint', async () => {
      mockProvider.generateJSON.mockResolvedValue({ plans: batchPlans });

      await planner.execute({
        promptContext: {
          brief: {
            title: '修仙之路',
            genre: 'xianxia',
            brief: '一个少年修仙的故事',
            chapterNumber: 1,
          },
          batchRange,
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('伏笔贯穿');
    });

    it('batch prompt specifies range and count', async () => {
      mockProvider.generateJSON.mockResolvedValue({ plans: batchPlans });

      await planner.execute({
        promptContext: {
          brief: {
            title: '修仙之路',
            genre: 'xianxia',
            brief: '一个少年修仙的故事',
            chapterNumber: 1,
          },
          batchRange,
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('第 1 章');
      expect(callArgs.prompt).toContain('第 3 章');
      expect(callArgs.prompt).toContain('3 章');
    });

    it('batch uses higher maxTokens (8192)', async () => {
      mockProvider.generateJSON.mockResolvedValue({ plans: batchPlans });

      await planner.execute({
        promptContext: {
          brief: {
            title: '修仙之路',
            genre: 'xianxia',
            brief: '一个少年修仙的故事',
            chapterNumber: 1,
          },
          batchRange,
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.maxTokens).toBe(8192);
    });

    it('batch validation requires min array length matching chapter count', async () => {
      mockProvider.generateJSON.mockResolvedValue({ plans: batchPlans });

      await planner.execute({
        promptContext: {
          brief: {
            title: '修仙之路',
            genre: 'xianxia',
            brief: '一个少年修仙的故事',
            chapterNumber: 1,
          },
          batchRange,
        },
      });

      // 验证调用了 generateJSON（意味着校验规则已通过 generateJSONWithValidation）
      expect(mockProvider.generateJSON).toHaveBeenCalled();
    });

    it('returns error when batch range exceeds 10 chapters', async () => {
      const largeRange: BatchPlanRange = { startChapter: 1, endChapter: 20 };

      const result = await planner.execute({
        promptContext: {
          brief: {
            title: '修仙之路',
            genre: 'xianxia',
            brief: '一个少年修仙的故事',
            chapterNumber: 1,
          },
          batchRange: largeRange,
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('1-10');
    });

    it('returns error when LLM fails in batch mode', async () => {
      mockProvider.generateJSON.mockRejectedValue(new Error('Batch LLM error'));

      const result = await planner.execute({
        promptContext: {
          brief: {
            title: '修仙之路',
            genre: 'xianxia',
            brief: '一个少年修仙的故事',
            chapterNumber: 1,
          },
          batchRange,
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('批量规划失败');
    });

    it('each batch plan gets sanitized independently', async () => {
      const partialBatchPlans = [
        { chapterNumber: 1, title: '第一章', intention: '开头', wordCountTarget: 3000 },
        { chapterNumber: 2, title: '第二章', intention: '发展', wordCountTarget: 3000 },
      ];
      mockProvider.generateJSON.mockResolvedValue({ plans: partialBatchPlans });

      const result = await planner.execute({
        promptContext: {
          brief: {
            title: '修仙之路',
            genre: 'xianxia',
            brief: '一个少年修仙的故事',
            chapterNumber: 1,
          },
          batchRange,
        },
      });

      expect(result.success).toBe(true);
      const data = result.data as BatchChapterPlanResult;
      for (const plan of data.plans) {
        expect(plan.openingHook).toBeTruthy();
        expect(plan.closingHook).toBeTruthy();
        expect(Array.isArray(plan.sceneBreakdown)).toBe(true);
        expect(plan.pacingTag).toBeTruthy();
      }
    });
  });

  // ── 大纲对齐验证 ──────────────────────────────────────────────

  describe('execute() — outline alignment', () => {
    it('injects full outline context into prompt', async () => {
      mockProvider.generateJSON.mockResolvedValue({ plan: {} });

      const outlineText = `## 第一幕：起源
主角林风从山村出发，发现修仙世界的存在
### 关键章节
- 第1章 山村少年：介绍林风身份
- 第20章 宗门大比：林风首次参加比武
- 第45章 秘境探索：发现上古遗迹`;

      await planner.execute({
        promptContext: {
          brief: {
            title: '修仙之路',
            genre: 'xianxia',
            brief: '一个少年修仙的故事',
            chapterNumber: 5,
          },
          outline: outlineText,
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('第一幕');
      expect(callArgs.prompt).toContain('起源');
      expect(callArgs.prompt).toContain('故事大纲');
    });

    it('injects centralConflict into prompt', async () => {
      mockProvider.generateJSON.mockResolvedValue({ plan: {} });

      await planner.execute({
        promptContext: {
          brief: { title: '修仙之路', genre: 'xianxia', brief: 'story', chapterNumber: 5 },
          centralConflict: '修仙界的秩序与远古力量的冲突',
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('核心矛盾');
      expect(callArgs.prompt).toContain('修仙界的秩序与远古力量的冲突');
    });

    it('injects growthArc into prompt', async () => {
      mockProvider.generateJSON.mockResolvedValue({ plan: {} });

      await planner.execute({
        promptContext: {
          brief: { title: '修仙之路', genre: 'xianxia', brief: 'story', chapterNumber: 5 },
          growthArc: '林风从平凡少年到背负命运之人',
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('成长主线');
      expect(callArgs.prompt).toContain('平凡少年到背负命运之人');
    });

    it('injects candidateWorldRules into prompt', async () => {
      mockProvider.generateJSON.mockResolvedValue({ plan: {} });

      await planner.execute({
        promptContext: {
          brief: { title: '修仙之路', genre: 'xianxia', brief: 'story', chapterNumber: 5 },
          candidateWorldRules: [
            '[magic-system] 修炼分为炼气、筑基、金丹三个阶段',
            '[society] 宗门等级森严',
          ],
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('书级规则');
      expect(callArgs.prompt).toContain('修炼分为炼气');
      expect(callArgs.prompt).toContain('宗门等级森严');
    });

    it('injects currentFocus into prompt', async () => {
      mockProvider.generateJSON.mockResolvedValue({ plan: {} });

      await planner.execute({
        promptContext: {
          brief: { title: '修仙之路', genre: 'xianxia', brief: 'story', chapterNumber: 5 },
          currentFocus: '林风初次进入宗门，面临入门考验',
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('当前故事焦点');
      expect(callArgs.prompt).toContain('入门考验');
    });

    it('injects chapterAnchor into prompt', async () => {
      mockProvider.generateJSON.mockResolvedValue({ plan: {} });

      await planner.execute({
        promptContext: {
          brief: { title: '修仙之路', genre: 'xianxia', brief: 'story', chapterNumber: 5 },
          chapterAnchor: '本章处于第一幕中期，应承接第1章伏笔并为第20章大比铺垫',
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('本章定位');
      expect(callArgs.prompt).toContain('承接第1章伏笔');
    });

    it('prompt requests worldRules to be specific to the chapter, not copied verbatim', async () => {
      mockProvider.generateJSON.mockResolvedValue({ plan: {} });

      await planner.execute({
        promptContext: {
          brief: { title: '修仙之路', genre: 'xianxia', brief: 'story', chapterNumber: 5 },
          candidateWorldRules: ['[magic-system] 修炼分为炼气、筑基、金丹'],
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('本章如何体现');
    });
  });

  // ── 上下文完整性：验证所有关键上下文项共存 ──────────────────

  describe('execute() — full context integration', () => {
    it('prompt contains all context sections when all are provided', async () => {
      mockProvider.generateJSON.mockResolvedValue({ plan: {} });

      await planner.execute({
        promptContext: {
          brief: {
            title: '修仙之路',
            genre: 'xianxia',
            brief: '一个少年修仙的故事',
            chapterNumber: 5,
            wordCountTarget: 4000,
          },
          characters: [
            '林风（protagonist）：坚毅、好奇心强；成长弧光：从平凡到背负命运',
            '老猎人（supporting）：博学、神秘',
          ],
          outline: '第一幕：起源\n第二幕：成长\n第三幕：决战',
          previousChapterSummary: '林风在猎场发现了发光的玉佩',
          openHooks: [
            {
              description: '玉佩的来历',
              type: 'narrative',
              status: 'open',
              priority: 'critical',
              plantedChapter: 1,
            },
          ],
          centralConflict: '修仙界秩序与远古力量的冲突',
          growthArc: '林风从平凡少年到背负命运之人',
          candidateWorldRules: ['[magic-system] 修炼分炼气、筑基、金丹'],
          currentFocus: '林风初入宗门面临考验',
          chapterAnchor: '本章处于第一幕中期',
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      const prompt = callArgs.prompt;

      // 验证所有上下文块都存在于 prompt 中
      expect(prompt).toContain('创作简报');
      expect(prompt).toContain('修仙之路');
      expect(prompt).toContain('已有角色');
      expect(prompt).toContain('林风');
      expect(prompt).toContain('故事大纲');
      expect(prompt).toContain('上一章摘要');
      expect(prompt).toContain('进行中伏笔');
      expect(prompt).toContain('核心矛盾');
      expect(prompt).toContain('成长主线');
      expect(prompt).toContain('书级规则');
      expect(prompt).toContain('当前故事焦点');
      expect(prompt).toContain('本章定位');
      expect(prompt).toContain('4000');
    });
  });

  // ── 章节大纲逻辑严密性：验证输出规范中的关键约束 ────────────

  describe('execute() — outline rigor constraints', () => {
    it('prompt requires 3-5 keyEvents that are completable within the chapter', async () => {
      mockProvider.generateJSON.mockResolvedValue({ plan: {} });

      await planner.execute({
        promptContext: {
          brief: { title: '修仙之路', genre: 'xianxia', brief: 'story', chapterNumber: 5 },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('3-5');
      expect(callArgs.prompt).toContain('可完成');
    });

    it('prompt requires sceneBreakdown with 2-4 scenes', async () => {
      mockProvider.generateJSON.mockResolvedValue({ plan: {} });

      await planner.execute({
        promptContext: {
          brief: { title: '修仙之路', genre: 'xianxia', brief: 'story', chapterNumber: 5 },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('2-4');
      expect(callArgs.prompt).toContain('场景分解');
    });

    it('prompt requires scene descriptions to be specific (50-100 chars)', async () => {
      mockProvider.generateJSON.mockResolvedValue({ plan: {} });

      await planner.execute({
        promptContext: {
          brief: { title: '修仙之路', genre: 'xianxia', brief: 'story', chapterNumber: 5 },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('50-100');
      expect(callArgs.prompt).toContain('具体动作');
    });

    it('prompt requires hookActions to be operable by Writer', async () => {
      mockProvider.generateJSON.mockResolvedValue({ plan: {} });

      await planner.execute({
        promptContext: {
          brief: { title: '修仙之路', genre: 'xianxia', brief: 'story', chapterNumber: 5 },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('伏笔可操作');
    });

    it('prompt requires openingHook and closingHook to connect chapters', async () => {
      mockProvider.generateJSON.mockResolvedValue({ plan: {} });

      await planner.execute({
        promptContext: {
          brief: { title: '修仙之路', genre: 'xianxia', brief: 'story', chapterNumber: 5 },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('首尾衔接');
    });

    it('prompt enforces character restriction from provided list', async () => {
      mockProvider.generateJSON.mockResolvedValue({ plan: {} });

      await planner.execute({
        promptContext: {
          brief: { title: '修仙之路', genre: 'xianxia', brief: 'story', chapterNumber: 5 },
          characters: ['林风（protagonist）：坚毅', '老猎人（supporting）：博学'],
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('必须且只能从');
      expect(callArgs.prompt).toContain('已有角色');
    });

    it('prompt specifies word count allocation must sum to target', async () => {
      mockProvider.generateJSON.mockResolvedValue({ plan: {} });

      await planner.execute({
        promptContext: {
          brief: {
            title: '修仙之路',
            genre: 'xianxia',
            brief: 'story',
            chapterNumber: 5,
            wordCountTarget: 4000,
          },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('字数分配');
      expect(callArgs.prompt).toContain('wordCountTarget');
    });
  });
});
