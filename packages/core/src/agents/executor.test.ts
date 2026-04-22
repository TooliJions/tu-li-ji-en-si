import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ChapterExecutor,
  type ChapterExecutionInput,
  type ChapterExecutionResult,
  type AgentDependencies,
} from './executor';
import type { ChapterPlan } from './chapter-planner';
import type { LLMProvider } from '../llm/provider';
import { GENRE_TEST_PLANS, buildPlan, buildInput } from './executor.test-config';

/** 旧测试中 minimal plan 缺失字段的补全默认值 */
const MINIMAL_PLAN_EXTENSIONS = {
  openingHook: '',
  closingHook: '',
  sceneBreakdown: [] as ChapterPlan['sceneBreakdown'],
  characterGrowthBeat: '',
  hookActions: [] as ChapterPlan['hookActions'],
  pacingTag: 'slow_build' as ChapterPlan['pacingTag'],
};

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
        ...MINIMAL_PLAN_EXTENSIONS,
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
              ...MINIMAL_PLAN_EXTENSIONS,
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
              ...MINIMAL_PLAN_EXTENSIONS,
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
              ...MINIMAL_PLAN_EXTENSIONS,
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
              ...MINIMAL_PLAN_EXTENSIONS,
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
              ...MINIMAL_PLAN_EXTENSIONS,
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
              ...MINIMAL_PLAN_EXTENSIONS,
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
  return buildInput(xianxia);
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
      openingHook: '',
      closingHook: '',
      sceneBreakdown: [],
      characterGrowthBeat: '',
      hookActions: [],
      pacingTag: 'slow_build',
    },
  };
}

// 题材配置快捷引用
const xianxia = GENRE_TEST_PLANS.xianxia;

/** 获取 fallback 模式下 LLM 收到的 prompt */
async function getFallbackPrompt(
  exec: ChapterExecutor,
  input: ChapterExecutionInput
): Promise<string> {
  const provider = (exec as unknown as { provider: LLMProvider }).provider as ReturnType<
    typeof createMockProvider
  >;
  provider.generate.mockResolvedValue({
    text: '生成的章节正文',
    usage: { promptTokens: 100, completionTokens: 500, totalTokens: 600 },
    model: 'test',
  });

  await exec.execute({ promptContext: { input } });
  return provider.generate.mock.calls[0][0].prompt;
}

/** 创建带 mock 追踪能力的 deps */
function createMockDeps(overrides: { context?: string; scene?: string } = {}) {
  const buildContext = vi.fn().mockResolvedValue(overrides.context ?? 'ctx');
  const generateScene = vi.fn().mockResolvedValue(overrides.scene ?? 'content');
  return { buildContext, generateScene, mock: generateScene.mock } as AgentDependencies & {
    generateScene: typeof generateScene;
  };
}

// ════════════════════════════════════════════════════════════════
// 新增：正文写作核心能力测试
// ════════════════════════════════════════════════════════════════

describe('ChapterExecutor — 大纲结构对齐与正文生成', () => {
  let mockProvider: ReturnType<typeof createMockProvider>;
  let executor: ChapterExecutor;

  beforeEach(() => {
    mockProvider = createMockProvider();
    executor = new ChapterExecutor(mockProvider);
  });

  // ── 1. 大纲结构完整传递 ────────────────────────────────

  describe('大纲结构完整传递到 prompt', () => {
    it('prompt 包含章节标题和意图', async () => {
      const prompt = await getFallbackPrompt(executor, buildInput(xianxia));

      expect(prompt).toContain(xianxia.plan.title);
      expect(prompt).toContain(xianxia.plan.intention);
    });

    it('prompt 包含所有关键事件', async () => {
      const plan = xianxia.plan;
      const prompt = await getFallbackPrompt(executor, buildInput(xianxia));

      for (const event of plan.keyEvents) {
        expect(prompt).toContain(event);
      }
    });

    it('prompt 包含所有出场角色', async () => {
      const plan = xianxia.plan;
      const prompt = await getFallbackPrompt(executor, buildInput(xianxia));

      for (const char of plan.characters) {
        expect(prompt).toContain(char);
      }
    });

    it('prompt 包含伏笔信息', async () => {
      const plan = xianxia.plan;
      const prompt = await getFallbackPrompt(executor, buildInput(xianxia));

      for (const hook of plan.hooks) {
        expect(prompt).toContain(hook.description);
      }
    });

    it('prompt 包含世界观设定', async () => {
      const plan = xianxia.plan;
      const prompt = await getFallbackPrompt(executor, buildInput(xianxia));

      for (const rule of plan.worldRules) {
        expect(prompt).toContain(rule);
      }
    });

    it('prompt 包含情感节拍', async () => {
      const prompt = await getFallbackPrompt(executor, buildInput(xianxia));

      expect(prompt).toContain(xianxia.plan.emotionalBeat);
    });

    it('prompt 包含场景过渡', async () => {
      const prompt = await getFallbackPrompt(executor, buildInput(xianxia));

      expect(prompt).toContain(xianxia.plan.sceneTransition);
    });

    it('prompt 包含目标字数', async () => {
      const prompt = await getFallbackPrompt(executor, buildInput(xianxia));

      expect(prompt).toContain(String(xianxia.plan.wordCountTarget));
    });
  });

  // ── 2. 关键事件按序扩展 ────────────────────────────────

  describe('关键事件按序扩展为段落', () => {
    it('keyEvents 在 prompt 中保持原始顺序', async () => {
      const plan = xianxia.plan;
      const prompt = await getFallbackPrompt(executor, buildInput(xianxia));

      const indices = plan.keyEvents.map((e) => prompt.indexOf(e));
      // 所有事件都应找到
      for (const idx of indices) {
        expect(idx).toBeGreaterThan(-1);
      }
      // 事件顺序应递增
      for (let i = 1; i < indices.length; i++) {
        expect(indices[i]).toBeGreaterThan(indices[i - 1]);
      }
    });

    it('prompt 要求按大纲结构展开正文', async () => {
      const prompt = await getFallbackPrompt(executor, buildInput(xianxia));

      expect(prompt).toContain('章节计划');
      expect(prompt).toContain('撰写正文');
    });

    it('prompt 要求内容自然流畅，避免空洞叙述', async () => {
      const prompt = await getFallbackPrompt(executor, buildInput(xianxia));

      expect(prompt).toContain('自然流畅');
      expect(prompt).toContain('避免空洞叙述');
    });
  });

  // ── 3. 叙事流畅性与过渡语句 ────────────────────────────

  describe('叙事流畅性与过渡语句', () => {
    it('prompt 包含对场景过渡的要求', async () => {
      const prompt = await getFallbackPrompt(executor, buildInput(xianxia));

      expect(prompt).toContain('场景过渡');
      expect(prompt).toContain(xianxia.plan.sceneTransition);
    });

    it('prompt 要求角色对话生动、描写具体', async () => {
      const prompt = await getFallbackPrompt(executor, buildInput(xianxia));

      expect(prompt).toContain('对话生动');
      expect(prompt).toContain('描写具体');
    });

    it('情感节拍引导叙事节奏', async () => {
      const prompt = await getFallbackPrompt(executor, buildInput(xianxia));

      expect(prompt).toContain('情感节拍');
      expect(prompt).toContain(xianxia.plan.emotionalBeat);
    });

    it('sceneTransition 提供场景衔接指引', async () => {
      const customTransition = '深夜独处到清晨出发';
      const prompt = await getFallbackPrompt(executor, {
        ...buildInput(xianxia),
        plan: buildPlan(xianxia, { sceneTransition: customTransition }),
      });

      expect(prompt).toContain(customTransition);
    });
  });

  // ── 4. 细节描写与文风一致性（参数化题材遍历） ──────────

  describe('细节描写与文风一致性', () => {
    // 遍历所有配置中的题材，验证其文风关键词
    const genreEntries = Object.entries(GENRE_TEST_PLANS);

    for (const [genreKey, config] of genreEntries) {
      it(`${genreKey} 题材嵌入对应文风指引`, async () => {
        const prompt = await getFallbackPrompt(executor, buildInput(config));

        for (const keyword of config.styleKeywords) {
          expect(prompt).toContain(keyword);
        }
      });
    }

    it('未知题材不加文风指引但保留题材名', async () => {
      const unknownGenre = 'steampunk';
      const prompt = await getFallbackPrompt(executor, {
        title: '未知之旅',
        genre: unknownGenre,
        brief: '蒸汽朋克冒险',
        chapterNumber: 1,
        plan: buildPlan(xianxia),
      });

      expect(prompt).toContain(unknownGenre);
      for (const [, config] of genreEntries) {
        for (const keyword of config.styleKeywords) {
          expect(prompt).not.toContain(keyword);
        }
      }
    });

    it('简介信息传入 prompt 以维持主题一致', async () => {
      const prompt = await getFallbackPrompt(executor, buildInput(xianxia));

      expect(prompt).toContain(xianxia.input.brief);
    });
  });

  // ── 5. 增强版大纲字段集成 ──────────────────────────────

  describe('增强版大纲字段（sceneBreakdown/openingHook/closingHook 等）集成', () => {
    it('生成内容经过 deps.generateScene 时传入完整的 ChapterPlan', async () => {
      const plan = xianxia.plan;
      const deps: AgentDependencies = {
        buildContext: vi.fn().mockResolvedValue('上下文：主角'),
        generateScene: vi.fn().mockResolvedValue('生成的正文内容'),
      };

      await executor.execute({
        promptContext: { input: { ...buildInput(xianxia) }, dependencies: deps },
      });

      expect(deps.generateScene).toHaveBeenCalledWith(plan, '上下文：主角');
    });

    it('sceneBreakdown 传递到 generateScene 的 plan 中', async () => {
      const deps: AgentDependencies = {
        buildContext: vi.fn().mockResolvedValue('ctx'),
        generateScene: vi.fn().mockResolvedValue('content'),
      };

      await executor.execute({
        promptContext: { input: buildInput(xianxia), dependencies: deps },
      });

      const receivedPlan = (deps.generateScene as any).mock.calls[0][0] as ChapterPlan;
      expect(receivedPlan.sceneBreakdown).toHaveLength(xianxia.plan.sceneBreakdown.length);
      expect(receivedPlan.sceneBreakdown[0].title).toBe(xianxia.plan.sceneBreakdown[0].title);
      expect(receivedPlan.sceneBreakdown[xianxia.plan.sceneBreakdown.length - 1].wordCount).toBe(
        xianxia.plan.sceneBreakdown[xianxia.plan.sceneBreakdown.length - 1].wordCount
      );
    });

    it('openingHook 和 closingHook 传递到 generateScene 的 plan 中', async () => {
      const deps: AgentDependencies = {
        buildContext: vi.fn().mockResolvedValue('ctx'),
        generateScene: vi.fn().mockResolvedValue('content'),
      };

      await executor.execute({
        promptContext: { input: buildInput(xianxia), dependencies: deps },
      });

      const receivedPlan = (deps.generateScene as any).mock.calls[0][0] as ChapterPlan;
      expect(receivedPlan.openingHook).toBe(xianxia.plan.openingHook);
      expect(receivedPlan.closingHook).toBe(xianxia.plan.closingHook);
    });

    it('hookActions 传递到 generateScene 的 plan 中', async () => {
      const deps: AgentDependencies = {
        buildContext: vi.fn().mockResolvedValue('ctx'),
        generateScene: vi.fn().mockResolvedValue('content'),
      };

      await executor.execute({
        promptContext: { input: buildInput(xianxia), dependencies: deps },
      });

      const receivedPlan = (deps.generateScene as any).mock.calls[0][0] as ChapterPlan;
      expect(receivedPlan.hookActions).toHaveLength(xianxia.plan.hookActions.length);
      for (let i = 0; i < xianxia.plan.hookActions.length; i++) {
        expect(receivedPlan.hookActions[i].action).toBe(xianxia.plan.hookActions[i].action);
      }
    });

    it('pacingTag 传递到 generateScene 的 plan 中', async () => {
      const customTag: ChapterPlan['pacingTag'] = 'rising';
      const deps: AgentDependencies = {
        buildContext: vi.fn().mockResolvedValue('ctx'),
        generateScene: vi.fn().mockResolvedValue('content'),
      };

      await executor.execute({
        promptContext: {
          input: { ...buildInput(xianxia), plan: buildPlan(xianxia, { pacingTag: customTag }) },
          dependencies: deps,
        },
      });

      const receivedPlan = (deps.generateScene as any).mock.calls[0][0] as ChapterPlan;
      expect(receivedPlan.pacingTag).toBe(customTag);
    });

    it('characterGrowthBeat 传递到 generateScene 的 plan 中', async () => {
      const customBeat = '主角完成蜕变';
      const deps: AgentDependencies = {
        buildContext: vi.fn().mockResolvedValue('ctx'),
        generateScene: vi.fn().mockResolvedValue('content'),
      };

      await executor.execute({
        promptContext: {
          input: {
            ...buildInput(xianxia),
            plan: buildPlan(xianxia, { characterGrowthBeat: customBeat }),
          },
          dependencies: deps,
        },
      });

      const receivedPlan = (deps.generateScene as any).mock.calls[0][0] as ChapterPlan;
      expect(receivedPlan.characterGrowthBeat).toBe(customBeat);
    });
  });

  // ── 6. 角色一致性 ──────────────────────────────────────

  describe('角色一致性', () => {
    it('prompt 包含全部角色名', async () => {
      const plan = xianxia.plan;
      const prompt = await getFallbackPrompt(executor, buildInput(xianxia));

      for (const c of plan.characters) {
        expect(prompt).toContain(c);
      }
    });

    it('无角色时 prompt 显示"无"', async () => {
      const prompt = await getFallbackPrompt(executor, {
        ...buildInput(xianxia),
        plan: buildPlan(xianxia, { characters: [] }),
      });

      expect(prompt).toContain('无');
    });

    it('角色数量多时全部包含', async () => {
      const extraChars = ['甲', '乙', '丙', '丁', '戊'];
      const prompt = await getFallbackPrompt(executor, {
        ...buildInput(xianxia),
        plan: buildPlan(xianxia, { characters: extraChars }),
      });

      for (const c of extraChars) {
        expect(prompt).toContain(c);
      }
    });
  });

  // ── 7. 伏笔处理 ───────────────────────────────────────

  describe('伏笔处理', () => {
    it('prompt 包含伏笔描述和优先级', async () => {
      const plan = xianxia.plan;
      const prompt = await getFallbackPrompt(executor, buildInput(xianxia));

      for (const h of plan.hooks) {
        expect(prompt).toContain(h.description);
        expect(prompt).toContain(h.priority);
      }
    });

    it('无伏笔时 prompt 不含伏笔段落', async () => {
      const prompt = await getFallbackPrompt(executor, {
        ...buildInput(xianxia),
        plan: buildPlan(xianxia, { hooks: [] }),
      });

      expect(prompt).not.toContain('伏笔');
    });

    it('多个伏笔全部出现在 prompt 中', async () => {
      const multiHooks: ChapterPlan['hooks'] = [
        { description: '伏笔一', type: 'narrative', priority: 'critical' },
        { description: '伏笔二', type: 'character', priority: 'high' },
        { description: '伏笔三', type: 'narrative', priority: 'medium' },
        { description: '伏笔四', type: 'character', priority: 'low' },
      ];
      const prompt = await getFallbackPrompt(executor, {
        ...buildInput(xianxia),
        plan: buildPlan(xianxia, { hooks: multiHooks }),
      });

      for (const h of multiHooks) {
        expect(prompt).toContain(h.description);
      }
    });
  });

  // ── 8. 大纲要点的有效覆盖 ──────────────────────────────

  describe('大纲要点的有效覆盖', () => {
    it('prompt 同时包含 intention、keyEvents、emotionalBeat、sceneTransition', async () => {
      const prompt = await getFallbackPrompt(executor, buildInput(xianxia));

      expect(prompt).toContain('本章意图');
      expect(prompt).toContain('关键事件');
      expect(prompt).toContain('情感节拍');
      expect(prompt).toContain('场景过渡');
    });

    it('worldRules 提供写作约束', async () => {
      const customRules = ['规则甲', '规则乙', '规则丙'];
      const prompt = await getFallbackPrompt(executor, {
        ...buildInput(xianxia),
        plan: buildPlan(xianxia, { worldRules: customRules }),
      });

      expect(prompt).toContain('世界观设定');
      for (const r of customRules) {
        expect(prompt).toContain(r);
      }
    });

    it('空 keyEvents 时 prompt 显示"无"', async () => {
      const prompt = await getFallbackPrompt(executor, {
        ...buildInput(xianxia),
        plan: buildPlan(xianxia, { keyEvents: [] }),
      });

      expect(prompt).toContain('关键事件');
      expect(prompt).toContain('无');
    });

    it('空 worldRules 时 prompt 不含世界观设定段落', async () => {
      const prompt = await getFallbackPrompt(executor, {
        ...buildInput(xianxia),
        plan: buildPlan(xianxia, { worldRules: [] }),
      });

      expect(prompt).not.toContain('世界观设定');
    });
  });

  // ── 9. 生成内容的元数据 ────────────────────────────────

  describe('生成内容的元数据', () => {
    it('返回正确的 wordCount（使用 content.length）', async () => {
      const content = '这是一段测试内容，大约二十个字左右吧';
      const deps: AgentDependencies = {
        buildContext: vi.fn().mockResolvedValue('ctx'),
        generateScene: vi.fn().mockResolvedValue(content),
      };

      const result = await executor.execute({
        promptContext: { input: buildInput(xianxia), dependencies: deps },
      });

      const data = result.data as ChapterExecutionResult;
      expect(data.wordCount).toBe(content.length);
    });

    it('plan.title 为空时使用默认章节标题', async () => {
      const chapterNum = 5;
      const deps: AgentDependencies = {
        buildContext: vi.fn().mockResolvedValue('ctx'),
        generateScene: vi.fn().mockResolvedValue('内容'),
      };

      const result = await executor.execute({
        promptContext: {
          input: {
            ...buildInput(xianxia),
            chapterNumber: chapterNum,
            plan: buildPlan(xianxia, { title: '' }),
          },
          dependencies: deps,
        },
      });

      const data = result.data as ChapterExecutionResult;
      expect(data.title).toBe(`第 ${chapterNum} 章`);
    });

    it('plan.title 有值时使用 plan.title', async () => {
      const deps: AgentDependencies = {
        buildContext: vi.fn().mockResolvedValue('ctx'),
        generateScene: vi.fn().mockResolvedValue('内容'),
      };

      const result = await executor.execute({
        promptContext: { input: buildInput(xianxia), dependencies: deps },
      });

      const data = result.data as ChapterExecutionResult;
      expect(data.title).toBe(xianxia.plan.title);
    });

    it('chapterNumber 与 input.chapterNumber 一致', async () => {
      const chapterNum = 7;
      const deps: AgentDependencies = {
        buildContext: vi.fn().mockResolvedValue('ctx'),
        generateScene: vi.fn().mockResolvedValue('内容'),
      };

      const result = await executor.execute({
        promptContext: {
          input: {
            ...buildInput(xianxia),
            chapterNumber: chapterNum,
            plan: buildPlan(xianxia, { chapterNumber: chapterNum }),
          },
          dependencies: deps,
        },
      });

      const data = result.data as ChapterExecutionResult;
      expect(data.chapterNumber).toBe(chapterNum);
    });
  });

  // ── 10. 上下文传递给 generateScene ─────────────────────

  describe('上下文传递给 generateScene', () => {
    it('buildContext 返回的内容完整传递给 generateScene', async () => {
      const contextCard = '角色卡：主角，16岁，山村少年，性格坚毅\n前章摘要：主角发现了发光的玉佩';
      const deps: AgentDependencies = {
        buildContext: vi.fn().mockResolvedValue(contextCard),
        generateScene: vi.fn().mockResolvedValue('正文内容'),
      };

      await executor.execute({
        promptContext: { input: buildInput(xianxia), dependencies: deps },
      });

      expect(deps.generateScene).toHaveBeenCalledWith(expect.anything(), contextCard);
    });

    it('buildContext 接收完整的 ChapterExecutionInput', async () => {
      const input = buildInput(xianxia);
      const deps: AgentDependencies = {
        buildContext: vi.fn().mockResolvedValue('ctx'),
        generateScene: vi.fn().mockResolvedValue('content'),
      };

      await executor.execute({
        promptContext: { input, dependencies: deps },
      });

      expect(deps.buildContext).toHaveBeenCalledWith(input);
    });
  });

  // ── 11. 错误恢复与健壮性 ──────────────────────────────

  describe('错误恢复与健壮性', () => {
    it('generateScene 返回空字符串仍算成功', async () => {
      const deps: AgentDependencies = {
        buildContext: vi.fn().mockResolvedValue('ctx'),
        generateScene: vi.fn().mockResolvedValue(''),
      };

      const result = await executor.execute({
        promptContext: { input: buildInput(xianxia), dependencies: deps },
      });

      expect(result.success).toBe(true);
      const data = result.data as ChapterExecutionResult;
      expect(data.content).toBe('');
      expect(data.wordCount).toBe(0);
    });

    it('generateScene 返回很长内容时不截断', async () => {
      const longContent = '长内容'.repeat(10000);
      const deps: AgentDependencies = {
        buildContext: vi.fn().mockResolvedValue('ctx'),
        generateScene: vi.fn().mockResolvedValue(longContent),
      };

      const result = await executor.execute({
        promptContext: { input: buildInput(xianxia), dependencies: deps },
      });

      const data = result.data as ChapterExecutionResult;
      expect(data.content).toBe(longContent);
      expect(data.wordCount).toBe(longContent.length);
    });

    it('fallback LLM 返回空内容仍算成功', async () => {
      mockProvider.generate.mockResolvedValue({
        text: '',
        usage: { promptTokens: 10, completionTokens: 0, totalTokens: 10 },
        model: 'test',
      });

      const result = await executor.execute({
        promptContext: { input: minimalInput() },
      });

      expect(result.success).toBe(true);
    });

    it('非 Error 对象的错误也能被捕获', async () => {
      const deps: AgentDependencies = {
        buildContext: vi.fn().mockRejectedValue('string error'),
        generateScene: vi.fn(),
      };

      const result = await executor.execute({
        promptContext: { input: validInput(), dependencies: deps },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('string error');
    });
  });

  // ── 12. 伏笔动作（hookActions）与节奏（pacingTag）─────────

  describe('伏笔动作与节奏标记', () => {
    it('hookActions 中的 plant/advance/payoff 全部传入 generateScene', async () => {
      const customActions: ChapterPlan['hookActions'] = [
        { action: 'plant', description: '埋设线索' },
        { action: 'advance', description: '推进暗示' },
        { action: 'payoff', description: '回收伏笔' },
      ];
      const deps: AgentDependencies = {
        buildContext: vi.fn().mockResolvedValue('ctx'),
        generateScene: vi.fn().mockResolvedValue('content'),
      };

      await executor.execute({
        promptContext: {
          input: {
            ...buildInput(xianxia),
            plan: buildPlan(xianxia, { hookActions: customActions }),
          },
          dependencies: deps,
        },
      });

      const receivedPlan = (deps.generateScene as any).mock.calls[0][0] as ChapterPlan;
      expect(receivedPlan.hookActions).toHaveLength(customActions.length);
      for (let i = 0; i < customActions.length; i++) {
        expect(receivedPlan.hookActions[i].action).toBe(customActions[i].action);
      }
    });

    const pacingTags: Array<ChapterPlan['pacingTag']> = [
      'slow_build',
      'rising',
      'climax',
      'cooldown',
      'transition',
    ];

    for (const tag of pacingTags) {
      it(`pacingTag="${tag}" 正确传递`, async () => {
        const deps: AgentDependencies = {
          buildContext: vi.fn().mockResolvedValue('ctx'),
          generateScene: vi.fn().mockResolvedValue('content'),
        };

        await executor.execute({
          promptContext: {
            input: { ...buildInput(xianxia), plan: buildPlan(xianxia, { pacingTag: tag }) },
            dependencies: deps,
          },
        });

        const receivedPlan = (deps.generateScene as any).mock.calls[0][0] as ChapterPlan;
        expect(receivedPlan.pacingTag).toBe(tag);
      });
    }
  });

  // ── 13. 场景分解完整性 ────────────────────────────────

  describe('场景分解完整性', () => {
    it('sceneBreakdown 中每个场景的 characters 均传递', async () => {
      const deps: AgentDependencies = {
        buildContext: vi.fn().mockResolvedValue('ctx'),
        generateScene: vi.fn().mockResolvedValue('content'),
      };

      await executor.execute({
        promptContext: { input: buildInput(xianxia), dependencies: deps },
      });

      const receivedPlan = (deps.generateScene as any).mock.calls[0][0] as ChapterPlan;
      for (let i = 0; i < xianxia.plan.sceneBreakdown.length; i++) {
        expect(receivedPlan.sceneBreakdown[i].characters).toEqual(
          xianxia.plan.sceneBreakdown[i].characters
        );
      }
    });

    it('sceneBreakdown 中每个场景的 mood 和 wordCount 均传递', async () => {
      const deps: AgentDependencies = {
        buildContext: vi.fn().mockResolvedValue('ctx'),
        generateScene: vi.fn().mockResolvedValue('content'),
      };

      await executor.execute({
        promptContext: { input: buildInput(xianxia), dependencies: deps },
      });

      const receivedPlan = (deps.generateScene as any).mock.calls[0][0] as ChapterPlan;
      for (const sb of xianxia.plan.sceneBreakdown) {
        const received = receivedPlan.sceneBreakdown.find((s) => s.title === sb.title);
        expect(received).toBeDefined();
        expect(received!.mood).toBe(sb.mood);
        expect(received!.wordCount).toBe(sb.wordCount);
      }
    });

    it('sceneBreakdown 场景顺序保持不变', async () => {
      const deps: AgentDependencies = {
        buildContext: vi.fn().mockResolvedValue('ctx'),
        generateScene: vi.fn().mockResolvedValue('content'),
      };

      await executor.execute({
        promptContext: { input: buildInput(xianxia), dependencies: deps },
      });

      const receivedPlan = (deps.generateScene as any).mock.calls[0][0] as ChapterPlan;
      const titles = receivedPlan.sceneBreakdown.map((s) => s.title);
      const expectedTitles = xianxia.plan.sceneBreakdown.map((s) => s.title);
      expect(titles).toEqual(expectedTitles);
    });

    it('sceneBreakdown 的 wordCount 总和与 plan.wordCountTarget 匹配', async () => {
      const plan = xianxia.plan;
      const totalSceneWords = plan.sceneBreakdown.reduce((sum, s) => sum + s.wordCount, 0);

      expect(totalSceneWords).toBe(plan.wordCountTarget);
    });
  });
});
