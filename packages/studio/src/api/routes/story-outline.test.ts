import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import type { CreateStoryBlueprintInput } from '@cybernovelist/core';
import { createInspirationRouter } from './inspiration';
import { createPlanningBriefRouter } from './planning-brief';
import { createStoryOutlineRouter } from './story-outline';
import { initializeStudioBookRuntime, resetStudioCoreBridgeForTests } from '../core-bridge';

function createTestApp() {
  const app = new Hono();
  app.route('/api/books/:bookId/inspiration', createInspirationRouter());
  app.route('/api/books/:bookId/planning-brief', createPlanningBriefRouter());
  app.route('/api/books/:bookId/story-outline', createStoryOutlineRouter());
  return app;
}

function buildOutlineBody(): Omit<CreateStoryBlueprintInput, 'planningBriefId'> {
  return {
    meta: {
      novelType: 'xianxia',
      novelSubgenre: '宗门修仙',
      typeConfidence: 0.92,
      typeIsAuto: true,
      genderTarget: 'male',
      architectureMode: 'lotus_map',
      titleSuggestions: ['星辰剑帝', '逆天剑路'],
      estimatedWordCount: '200 万字',
      endingType: 'HE',
      oneLineSynopsis: '少年觉醒上古血脉,从外门一路逆袭。',
    },
    base: {
      sellingPoints: {
        coreSellingPoint: '逆袭+血脉觉醒',
        hookSentence: '宗门最弱外门弟子身藏远古血脉。',
        auxiliarySellingPoints: [{ point: '热血对决', category: '情节爽感' }],
        differentiation: '血脉代价机制',
        readerAppeal: '热血+爽快',
      },
      theme: {
        coreTheme: '逆袭与代价',
        proposition: '强大须付代价',
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
          wordCountTarget: '3500',
          firstHook: '雷霆破空',
        },
        chapter2: {
          summary: '导师私下传授',
          hook: '神秘传承启动',
          mustAchieve: ['获得指引'],
          wordCountTarget: '3500',
        },
        chapter3: {
          summary: '面对宗门追杀',
          hook: '亡命突围',
          mustAchieve: ['第一次胜利'],
          wordCountTarget: '3500',
          signingHook: '黑影逼近',
        },
        openingForbidden: [],
      },
      writingStyle: {
        prose: {
          tone: ['紧凑'],
          forbiddenTones: [],
          sentenceRhythm: '短句切割',
          descriptionDensity: '中等',
        },
        scene: { sceneStructure: '动作-反应', povRules: '主角第三人称', sensoryPriority: ['视觉'] },
        dialogue: {
          dialogueToNarrationRatio: '4:6',
          monologueHandling: '点到为止',
          subtextGuidelines: '留白',
        },
        chapterWordCountTarget: '3500',
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

describe('Story Outline Route', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    resetStudioCoreBridgeForTests();
    initializeStudioBookRuntime({
      id: 'book-001',
      title: '测试小说',
      genre: 'xuanhuan',
      targetWords: 30000,
      targetChapterCount: 10,
      targetWordsPerChapter: 3000,
      currentWords: 0,
      chapterCount: 0,
      status: 'active',
      language: 'zh',
      platform: 'qidian',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      fanficMode: null,
      promptVersion: 'v2',
      modelConfig: {
        useGlobalDefaults: true,
        writer: 'DashScope',
        auditor: 'OpenAI',
        planner: 'DashScope',
      },
    });
    app = createTestApp();
  });

  afterEach(() => {
    resetStudioCoreBridgeForTests();
  });

  it('requires planning brief before creating story outline', async () => {
    const res = await app.request('/api/books/book-001/story-outline', {
      method: 'POST',
      body: JSON.stringify(buildOutlineBody()),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(409);
    const data = (await res.json()) as { error: { code: string } };
    expect(data.error.code).toBe('UPSTREAM_REQUIRED');
  });

  it('creates and reads story outline after planning brief is ready', async () => {
    await app.request('/api/books/book-001/inspiration', {
      method: 'POST',
      body: JSON.stringify({
        sourceText: '宗门天才在外门考核暴露秘密血脉',
        genre: '玄幻',
        theme: '逆袭',
        conflict: '身份暴露',
        tone: '热血',
        constraints: ['升级明确'],
        sourceType: 'manual',
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    await app.request('/api/books/book-001/planning-brief', {
      method: 'POST',
      body: JSON.stringify({
        audience: '男频玄幻读者',
        genreStrategy: '高开高走',
        styleTarget: '爽点密集',
        lengthTarget: '300 万字',
        tabooRules: ['不降智'],
        marketGoals: ['起点连载'],
        creativeConstraints: ['成长线清晰'],
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const createRes = await app.request('/api/books/book-001/story-outline', {
      method: 'POST',
      body: JSON.stringify(buildOutlineBody()),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(createRes.status).toBe(201);

    const getRes = await app.request('/api/books/book-001/story-outline');
    expect(getRes.status).toBe(200);
    const data = (await getRes.json()) as {
      data: {
        meta: { novelType: string; architectureMode: string };
        typeSpecific: { kind: string };
        base: { characters: { role: string }[] };
      };
    };
    expect(data.data.meta.novelType).toBe('xianxia');
    expect(data.data.meta.architectureMode).toBe('lotus_map');
    expect(data.data.typeSpecific.kind).toBe('fantasy');
    expect(data.data.base.characters.some((c) => c.role === 'protagonist')).toBe(true);
  });

  it('updates story outline', async () => {
    await app.request('/api/books/book-001/inspiration', {
      method: 'POST',
      body: JSON.stringify({
        sourceText: '宗门天才在外门考核暴露秘密血脉',
        genre: '玄幻',
        theme: '逆袭',
        conflict: '身份暴露',
        tone: '热血',
        constraints: ['升级明确'],
        sourceType: 'manual',
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    await app.request('/api/books/book-001/planning-brief', {
      method: 'POST',
      body: JSON.stringify({
        audience: '男频玄幻读者',
        genreStrategy: '高开高走',
        styleTarget: '爽点密集',
        lengthTarget: '300 万字',
        tabooRules: ['不降智'],
        marketGoals: ['起点连载'],
        creativeConstraints: ['成长线清晰'],
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    await app.request('/api/books/book-001/story-outline', {
      method: 'POST',
      body: JSON.stringify(buildOutlineBody()),
      headers: { 'Content-Type': 'application/json' },
    });

    const patchRes = await app.request('/api/books/book-001/story-outline', {
      method: 'PATCH',
      body: JSON.stringify({
        meta: { oneLineSynopsis: '少年血脉觉醒,改写宗门秩序。' },
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(patchRes.status).toBe(200);
    const data = (await patchRes.json()) as {
      data: { meta: { oneLineSynopsis: string } };
    };
    expect(data.data.meta.oneLineSynopsis).toBe('少年血脉觉醒,改写宗门秩序。');
  });
});
