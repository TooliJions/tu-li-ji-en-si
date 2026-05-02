import { describe, expect, it } from 'vitest';
import {
  LLMProvider,
  type LLMRequest,
  type LLMResponse,
  type LLMResponseWithJSON,
  type LLMStreamChunk,
} from '../../llm/provider';
import { DefaultOutlineService } from './outline-service';
import { DefaultDetailedOutlineService } from './detailed-outline-service';
import type { InspirationSeed } from '../contracts/inspiration';
import type { PlanningBrief } from '../contracts/planning';
import type { CreateStoryBlueprintInput, StoryBlueprint } from '../contracts/outline';

/**
 * 阶段间内容流真实验证(灵感→规划→总纲→细纲)
 *
 * 通过 CapturingProvider 截获真实发送给 LLM 的 prompt,逐字段断言:
 * - 灵感(seed)5 字段是否进入 OutlineGenerator prompt
 * - 规划(brief)7 字段是否进入 OutlineGenerator prompt
 * - 总纲(blueprint)关键字段是否进入 DetailedOutlineGenerator skeleton + chapter prompts
 *
 * 不需要真实 LLM,直接验证字段流动 — 比 schema 测试更强。
 */

class CapturingProvider extends LLMProvider {
  capturedPrompts: string[] = [];
  readonly #responses: unknown[];
  #idx = 0;

  constructor(responses: unknown[]) {
    super({ apiKey: 'mock', baseURL: 'http://mock', model: 'mock' });
    this.#responses = responses;
  }

  async generate(): Promise<LLMResponse> {
    throw new Error('CapturingProvider.generate not implemented');
  }

  async generateJSON<T>(req: LLMRequest): Promise<T> {
    this.capturedPrompts.push(req.prompt);
    const next = this.#responses[this.#idx++];
    if (next === undefined) {
      throw new Error(`CapturingProvider: no mock response for call #${this.#idx}`);
    }
    return next as T;
  }

  async generateJSONWithMeta<T>(req: LLMRequest): Promise<LLMResponseWithJSON<T>> {
    const data = await this.generateJSON<T>(req);
    return {
      data,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      model: 'mock',
    };
  }

  async *generateStream(): AsyncIterable<LLMStreamChunk> {
    yield { text: '', done: true };
  }
}

// ─── 辅助构造器 ──────────────────────────────────────────────

function baseSeed(overrides: Partial<InspirationSeed> = {}): InspirationSeed {
  return {
    id: 'seed_test',
    sourceText: '基线灵感原文,描述少年在外门考核中觉醒上古血脉的故事开端。',
    genre: '玄幻',
    theme: '基线主题',
    conflict: '基线冲突',
    tone: '热血',
    constraints: [],
    sourceType: 'manual',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function baseBrief(overrides: Partial<PlanningBrief> = {}): PlanningBrief {
  return {
    id: 'brief_test',
    seedId: 'seed_test',
    audience: '男频玄幻读者',
    genreStrategy: '高开高走',
    styleTarget: '紧凑节奏',
    lengthTarget: '一百万字',
    tabooRules: ['基线禁忌一', '基线禁忌二'],
    marketGoals: ['基线市场目标一', '基线市场目标二'],
    creativeConstraints: ['基线约束一', '基线约束二'],
    status: 'draft',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/**
 * 返回符合 OutlineGenerator 输出校验规则的 DraftBlueprint
 *
 * 校验规则:
 * - meta.titleSuggestions ≥ 1
 * - meta.oneLineSynopsis ≥ 10 字
 * - base.theme.toneKeywords ≥ 3
 * - base.characters ≥ 1
 * - base.sellingPoints.coreSellingPoint ≥ 1 字
 * - base.completionDesign.finalConflict ≥ 1 字
 *
 * 经 #assemble 后能通过 CreateStoryBlueprintInputSchema 与 R-01..R-05。
 */
function validBlueprintDraft() {
  return {
    meta: {
      titleSuggestions: ['测试标题甲', '测试标题乙'],
      oneLineSynopsis: '一句话简介测试内容这里至少十个字符长度。',
      novelSubgenre: '宗门修仙',
      estimatedWordCount: '100 万字',
      typeConfidence: 0.9,
      typeIsAuto: true,
    },
    base: {
      sellingPoints: {
        coreSellingPoint: '逆袭流爽点',
        hookSentence: '万众瞩目下少年觉醒。',
        auxiliarySellingPoints: [{ point: '热血对决', category: '情节爽感' }],
        differentiation: '差异化',
        readerAppeal: '热血',
      },
      theme: {
        coreTheme: '逆袭与代价',
        proposition: '强者付代价',
        narrativeArc: {
          opening: '外门考核暴露血脉',
          development: '宗门博弈步步为营',
          climax: '与上古势力对决',
          resolution: '建立新秩序',
        },
        toneKeywords: ['热血', '燃', '坚韧'],
        subthemes: [],
        forbiddenTones: [],
        emotionBaseline: {
          openingPhase: '',
          developmentPhase: '',
          climaxPhase: '',
          resolutionPhase: '',
        },
        writingAtmosphere: '紧张',
      },
      goldenOpening: {
        openingHookType: 'high_burn',
        chapter1: {
          summary: '考核日血脉觉醒',
          hook: '万众瞩目下的异象',
          mustAchieve: ['暴露血脉'],
          wordCountTarget: '3000',
          firstHook: '雷霆破空',
        },
        chapter2: {
          summary: '导师私下传授',
          hook: '神秘传承启动',
          mustAchieve: ['获得指引'],
          wordCountTarget: '3000',
        },
        chapter3: {
          summary: '面对宗门追杀',
          hook: '亡命突围',
          mustAchieve: ['第一次胜利'],
          wordCountTarget: '3000',
          signingHook: '黑影逼近',
        },
        openingForbidden: [],
      },
      writingStyle: {
        prose: {
          tone: ['紧凑'],
          forbiddenTones: [],
          sentenceRhythm: '短句',
          descriptionDensity: '中等',
        },
        scene: {
          sceneStructure: '动作-反应',
          povRules: '主角第三人称',
          sensoryPriority: ['视觉'],
        },
        dialogue: {
          dialogueToNarrationRatio: '4:6',
          monologueHandling: '点到为止',
          subtextGuidelines: '留白',
        },
        chapterWordCountTarget: '3000',
      },
      characters: [
        {
          id: 'mc',
          name: '林辰',
          role: 'protagonist',
          traits: ['坚韧', '隐忍'],
          background: '宗门外门弟子',
          motivation: '揭开血脉之谜',
          arc: '从隐忍自保到主动反击',
          age: '17',
          gender: '男',
          appearance: '清瘦',
          socialStatus: '外门弟子',
          internalConflict: '善良与决绝',
          abilities: ['剑法'],
          weaknesses: ['血脉反噬'],
          keyQuotes: [],
          speechPattern: {
            sentenceLength: '短',
            vocabularyLevel: '日常',
            catchphrases: [],
            speechQuirks: '',
          },
        },
      ],
      relationships: [],
      outlineArchitecture: {
        mode: 'lotus_map',
        modeReason: '修仙世界存在层层秘境',
        satisfactionPacing: {
          earlyGame: ['打脸'],
          midGame: ['揭秘'],
          lateGame: ['碾压'],
          climax: ['反转'],
        },
        data: {
          kind: 'lotus_map',
          lotusCore: {
            name: '远古天宫',
            setting: '隐于云海的上古遗迹',
            protagonistInitialRelation: '血脉与天宫共鸣',
            secretLayers: [],
            guardianCharacters: [],
            returnTriggerDesign: '血脉觉醒达到第三阶',
          },
          petals: [
            {
              petalId: 'p1',
              name: '宗门外门',
              arcSummary: '主角觉醒并立足',
              keyConflict: '与同门竞争',
              newFactions: [],
              worldExpansion: '',
              lotusCoreConnection: '导师从天宫秘传',
              satisfactionType: 'face_slap',
            },
          ],
          historyLayers: [],
          ultimateTheme: '血脉传承与个人选择',
        },
      },
      foreshadowingSeed: {
        entries: [
          { id: 'f1', content: '主角胸口的远古印记', category: '血脉', importance: 'high' },
        ],
        resolutionChecklist: ['印记真相'],
      },
      completionDesign: {
        endingType: 'HE',
        finalBoss: '上古魔尊',
        finalConflict: '血脉本源之战',
        epilogueHint: '新秩序建立',
        looseEndsResolution: ['印记之谜'],
      },
    },
    typeSpecific: {
      kind: 'fantasy',
      powerSystem: {
        systemName: '剑道修炼',
        cultivationType: '剑修',
        levels: ['炼体', '凝气', '筑基', '金丹', '元婴'],
        resourceCategories: ['灵石', '剑诀'],
        combatSystem: '招式+灵气',
      },
      goldenFinger: {
        name: '远古剑魂',
        abilityType: '血脉',
        origin: '上古天宫传承',
        growthPath: '与境界同步觉醒',
        limitations: ['过度使用反噬'],
        keyAbilities: ['剑魂共鸣'],
      },
    },
  };
}

/**
 * 构造一个合法的 StoryBlueprint(给 Group D 用)
 *
 * 默认 novelType=xuanhuan / lotus_map / fantasy,与 validBlueprintDraft 的 base/typeSpecific 一致。
 * 通过 mutate 回调可以在调用 service.createBlueprint 前修改 base 内部字段。
 */
function makeBlueprint(
  mutate?: (draft: ReturnType<typeof validBlueprintDraft>) => void,
): StoryBlueprint {
  const draft = validBlueprintDraft();
  if (mutate) {
    mutate(draft);
  }
  const input: CreateStoryBlueprintInput = {
    planningBriefId: 'brief_test',
    meta: {
      novelType: 'xuanhuan',
      novelSubgenre: '宗门修仙',
      typeConfidence: 0.9,
      typeIsAuto: true,
      genderTarget: 'male',
      architectureMode: 'lotus_map',
      titleSuggestions: ['测试标题'],
      estimatedWordCount: '100 万字',
      endingType: 'HE',
      oneLineSynopsis: '基线一句话简介测试内容至少十字。',
    },
    base: draft.base as CreateStoryBlueprintInput['base'],
    typeSpecific: draft.typeSpecific as CreateStoryBlueprintInput['typeSpecific'],
  };
  return new DefaultOutlineService().createBlueprint(input);
}

/** 卷骨架响应:总卷数 + 每卷章数 */
function validSkeletonResponse(volumeCount: number, chaptersPerVolume = 3) {
  return {
    volumes: Array.from({ length: volumeCount }, (_, i) => ({
      volumeNumber: i + 1,
      title: `第 ${i + 1} 卷`,
      arcSummary: `本卷叙事弧线测试 ${i + 1},含核心冲突、关键转折、主角成长节点。`,
      chapterCount: chaptersPerVolume,
      startChapter: i * chaptersPerVolume + 1,
      endChapter: i * chaptersPerVolume + chaptersPerVolume,
    })),
  };
}

/** 卷内章节响应 */
function validVolumeChaptersResponse(chapterCount: number, startChapter = 1) {
  return {
    chapters: Array.from({ length: chapterCount }, (_, i) => ({
      chapterNumber: startChapter + i,
      title: `第 ${startChapter + i} 章`,
      wordCountTarget: '3000',
      sceneSetup: '场景测试',
      charactersPresent: ['mc'],
      coreEvents: ['事件1'],
      emotionArc: '紧张',
      chapterEndHook: '钩子',
      foreshadowingOps: [],
      satisfactionType: 'face_slap',
      keyDialogueHints: [],
      writingNotes: '',
      contextForWriter: {
        storyProgress: '故事进度测试,主角处境清晰展示。',
        chapterPositionNote: `本卷第 ${i + 1} 章`,
        characterStates: [],
        activeWorldRules: [],
        activeForeshadowingStatus: [],
        precedingChapterBridge: { cliffhanger: '', emotionalCarry: '', unresolvedTension: '' },
        nextChapterSetup: { seedForNext: '', expectedDevelopment: '' },
      },
    })),
  };
}

// ─── 测试集 ──────────────────────────────────────────────────

describe('阶段间内容流真实验证(灵感→规划→总纲→细纲)', () => {
  // ── A. 灵感字段流入 OutlineGenerator prompt ─────────────

  describe('A. 灵感字段流入 OutlineGenerator prompt', () => {
    it('seed.sourceText 进入 prompt', async () => {
      const provider = new CapturingProvider([validBlueprintDraft()]);
      await new DefaultOutlineService().generateBlueprint({
        seed: baseSeed({ sourceText: '独特灵感原文标记九五二七字串' }),
        brief: baseBrief(),
        provider,
      });
      expect(provider.capturedPrompts).toHaveLength(1);
      expect(provider.capturedPrompts[0]).toContain('独特灵感原文标记九五二七字串');
    });

    it('seed.genre 进入 prompt', async () => {
      const provider = new CapturingProvider([validBlueprintDraft()]);
      await new DefaultOutlineService().generateBlueprint({
        seed: baseSeed({ genre: '玄幻独特题材标记八九零' }),
        brief: baseBrief(),
        provider,
      });
      expect(provider.capturedPrompts[0]).toContain('玄幻独特题材标记八九零');
    });

    it('seed.theme 进入 prompt', async () => {
      const provider = new CapturingProvider([validBlueprintDraft()]);
      await new DefaultOutlineService().generateBlueprint({
        seed: baseSeed({ theme: '独特主题标记一二三' }),
        brief: baseBrief(),
        provider,
      });
      expect(provider.capturedPrompts[0]).toContain('独特主题标记一二三');
    });

    it('seed.conflict 进入 prompt', async () => {
      const provider = new CapturingProvider([validBlueprintDraft()]);
      await new DefaultOutlineService().generateBlueprint({
        seed: baseSeed({ conflict: '独特冲突标记四五六' }),
        brief: baseBrief(),
        provider,
      });
      expect(provider.capturedPrompts[0]).toContain('独特冲突标记四五六');
    });

    it('seed.tone 进入 prompt', async () => {
      const provider = new CapturingProvider([validBlueprintDraft()]);
      await new DefaultOutlineService().generateBlueprint({
        seed: baseSeed({ tone: '热血独特基调标记七八九' }),
        brief: baseBrief(),
        provider,
      });
      expect(provider.capturedPrompts[0]).toContain('热血独特基调标记七八九');
    });
  });

  // ── B. 规划字段流入 OutlineGenerator prompt ──────────────

  describe('B. 规划字段流入 OutlineGenerator prompt', () => {
    it('brief.audience 进入 prompt', async () => {
      const provider = new CapturingProvider([validBlueprintDraft()]);
      await new DefaultOutlineService().generateBlueprint({
        seed: baseSeed(),
        brief: baseBrief({ audience: '男频独特受众标记一一一' }),
        provider,
      });
      expect(provider.capturedPrompts[0]).toContain('男频独特受众标记一一一');
    });

    it('brief.genreStrategy 进入 prompt', async () => {
      const provider = new CapturingProvider([validBlueprintDraft()]);
      await new DefaultOutlineService().generateBlueprint({
        seed: baseSeed(),
        brief: baseBrief({ genreStrategy: '玄幻独特策略标记二二二' }),
        provider,
      });
      expect(provider.capturedPrompts[0]).toContain('玄幻独特策略标记二二二');
    });

    it('brief.styleTarget 进入 prompt', async () => {
      const provider = new CapturingProvider([validBlueprintDraft()]);
      await new DefaultOutlineService().generateBlueprint({
        seed: baseSeed(),
        brief: baseBrief({ styleTarget: '独特风格标记三三三' }),
        provider,
      });
      expect(provider.capturedPrompts[0]).toContain('独特风格标记三三三');
    });

    it('brief.lengthTarget 进入 prompt', async () => {
      const provider = new CapturingProvider([validBlueprintDraft()]);
      await new DefaultOutlineService().generateBlueprint({
        seed: baseSeed(),
        brief: baseBrief({ lengthTarget: '独特字数标记四四四' }),
        provider,
      });
      expect(provider.capturedPrompts[0]).toContain('独特字数标记四四四');
    });

    it('brief.tabooRules 进入 prompt', async () => {
      const provider = new CapturingProvider([validBlueprintDraft()]);
      await new DefaultOutlineService().generateBlueprint({
        seed: baseSeed(),
        brief: baseBrief({ tabooRules: ['独特禁忌标记五五五'] }),
        provider,
      });
      expect(provider.capturedPrompts[0]).toContain('独特禁忌标记五五五');
    });

    it('brief.marketGoals 进入 prompt', async () => {
      const provider = new CapturingProvider([validBlueprintDraft()]);
      await new DefaultOutlineService().generateBlueprint({
        seed: baseSeed(),
        brief: baseBrief({ marketGoals: ['独特市场标记六六六'] }),
        provider,
      });
      expect(provider.capturedPrompts[0]).toContain('独特市场标记六六六');
    });

    it('brief.creativeConstraints 进入 prompt', async () => {
      const provider = new CapturingProvider([validBlueprintDraft()]);
      await new DefaultOutlineService().generateBlueprint({
        seed: baseSeed(),
        brief: baseBrief({ creativeConstraints: ['独特约束标记七七七'] }),
        provider,
      });
      expect(provider.capturedPrompts[0]).toContain('独特约束标记七七七');
    });
  });

  // ── C. 输出反映输入(推断函数) ──────────────────────────

  describe('C. 输出反映输入(推断函数)', () => {
    it('seed.genre="玄幻" → blueprint.meta.novelType="xuanhuan" + architectureMode="lotus_map"', async () => {
      const provider = new CapturingProvider([validBlueprintDraft()]);
      const blueprint = await new DefaultOutlineService().generateBlueprint({
        seed: baseSeed({ genre: '玄幻' }),
        brief: baseBrief(),
        provider,
      });
      expect(blueprint.meta.novelType).toBe('xuanhuan');
      expect(blueprint.meta.architectureMode).toBe('lotus_map');
      expect(blueprint.typeSpecific.kind).toBe('fantasy');
    });

    it('seed.tone 含 "悲剧" → blueprint.meta.endingType="BE",且与 completionDesign 同步', async () => {
      const provider = new CapturingProvider([validBlueprintDraft()]);
      const blueprint = await new DefaultOutlineService().generateBlueprint({
        seed: baseSeed({ tone: '悲剧基调' }),
        brief: baseBrief(),
        provider,
      });
      expect(blueprint.meta.endingType).toBe('BE');
      expect(blueprint.base.completionDesign.endingType).toBe('BE');
    });

    it('brief.audience 含 "男频" → blueprint.meta.genderTarget="male"', async () => {
      const provider = new CapturingProvider([validBlueprintDraft()]);
      const blueprint = await new DefaultOutlineService().generateBlueprint({
        seed: baseSeed(),
        brief: baseBrief({ audience: '男频玄幻读者' }),
        provider,
      });
      expect(blueprint.meta.genderTarget).toBe('male');
    });
  });

  // ── D. 总纲字段流入 DetailedOutlineGenerator prompts ─────

  describe('D. 总纲字段流入 DetailedOutlineGenerator prompts', () => {
    it('blueprint.meta.novelType / oneLineSynopsis 进入 skeleton + chapter prompts', async () => {
      const blueprint = makeBlueprint();
      // 替换 oneLineSynopsis 为唯一标记(meta 由 makeBlueprint 内部组装,需先构造再替换)
      const taggedBlueprint: StoryBlueprint = {
        ...blueprint,
        meta: { ...blueprint.meta, oneLineSynopsis: '独特一句话简介标记XYZ987测试。' },
      };
      const provider = new CapturingProvider([
        validSkeletonResponse(1, 3),
        validVolumeChaptersResponse(3, 1),
      ]);
      await new DefaultDetailedOutlineService().generateOutline({
        blueprint: taggedBlueprint,
        provider,
        totalChapters: 3,
        chaptersPerVolume: 3,
      });
      expect(provider.capturedPrompts).toHaveLength(2);
      // novelType 在 skeleton + chapter 两个 prompt 中
      expect(provider.capturedPrompts[0]).toContain('xuanhuan');
      expect(provider.capturedPrompts[1]).toContain('xuanhuan');
      // oneLineSynopsis 在 skeleton + chapter 两个 prompt 中
      expect(provider.capturedPrompts[0]).toContain('独特一句话简介标记XYZ987测试。');
      expect(provider.capturedPrompts[1]).toContain('独特一句话简介标记XYZ987测试。');
    });

    it('blueprint.base.characters[0].name 进入 skeleton + chapter prompts', async () => {
      const blueprint = makeBlueprint((draft) => {
        draft.base.characters[0].name = '独特角色名标记ABC456';
      });
      const provider = new CapturingProvider([
        validSkeletonResponse(1, 3),
        validVolumeChaptersResponse(3, 1),
      ]);
      await new DefaultDetailedOutlineService().generateOutline({
        blueprint,
        provider,
        totalChapters: 3,
        chaptersPerVolume: 3,
      });
      expect(provider.capturedPrompts[0]).toContain('独特角色名标记ABC456');
      expect(provider.capturedPrompts[1]).toContain('独特角色名标记ABC456');
    });

    it('blueprint.base.foreshadowingSeed.entries[].id 进入 chapter prompt', async () => {
      const blueprint = makeBlueprint((draft) => {
        draft.base.foreshadowingSeed = {
          entries: [
            {
              id: 'unique_fid_TEST_888',
              content: '独特伏笔内容',
              category: '血脉',
              importance: 'high',
            },
          ],
          resolutionChecklist: ['印记真相'],
        };
      });
      const provider = new CapturingProvider([
        validSkeletonResponse(1, 3),
        validVolumeChaptersResponse(3, 1),
      ]);
      await new DefaultDetailedOutlineService().generateOutline({
        blueprint,
        provider,
        totalChapters: 3,
        chaptersPerVolume: 3,
      });
      expect(provider.capturedPrompts[1]).toContain('unique_fid_TEST_888');
    });

    it('blueprint.base.completionDesign.finalConflict 进入 skeleton prompt', async () => {
      const blueprint = makeBlueprint((draft) => {
        draft.base.completionDesign = {
          endingType: 'HE',
          finalBoss: '上古魔尊',
          finalConflict: '独特终极冲突标记XYZ123',
          epilogueHint: '新秩序建立',
          looseEndsResolution: ['印记之谜'],
        };
      });
      const provider = new CapturingProvider([
        validSkeletonResponse(1, 3),
        validVolumeChaptersResponse(3, 1),
      ]);
      await new DefaultDetailedOutlineService().generateOutline({
        blueprint,
        provider,
        totalChapters: 3,
        chaptersPerVolume: 3,
      });
      expect(provider.capturedPrompts[0]).toContain('独特终极冲突标记XYZ123');
    });
  });
});
