import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { createApp } from './server';
import { resetStudioCoreBridgeForTests } from './core-bridge';
import type { CreateStoryBlueprintInput } from '@cybernovelist/core';

/**
 * 7 阶段全链路集成测试
 *
 * 通过 Hono app.fetch() 直接打通 7 阶段流程,验证每阶段产出可被下一阶段消费:
 * ① 灵感输入 → ② 规划 → ③ 总纲规划 → ④ 细纲规划 → ⑤ 章节正文 → ⑥ 质量检查 → ⑦ 导出
 */
describe('7 阶段全链路打通', () => {
  let app: ReturnType<typeof createApp>;
  let tmpDir: string;
  let bookId = '';

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(process.cwd(), 'full-pipeline-'));
    resetStudioCoreBridgeForTests(tmpDir);
    app = createApp();
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  async function fetchJson(method: string, url: string, body?: unknown) {
    const res = await app.fetch(
      new Request(`http://localhost${url}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      }),
    );
    return {
      status: res.status,
      body: (await res.json().catch(() => null)) as unknown,
    };
  }

  const get = (url: string) => fetchJson('GET', url);
  const post = (url: string, body?: unknown) => fetchJson('POST', url, body);

  // ─── 0. 创建书籍 ─────────────────────────────────────────

  it('Step 0: 创建书籍', async () => {
    const { status, body } = await post('/api/books', {
      title: 'E2E 全链路-修仙传',
      genre: 'xianxia',
      targetWords: 100000,
      targetChapterCount: 30,
      targetWordsPerChapter: 3000,
      brief: '少年林辰在天玄宗外门考核中觉醒上古星辰灵体,踏上逆袭之路。',
    });

    expect(status).toBe(201);
    const data = body as { data: { id: string } };
    bookId = data.data.id;
    expect(bookId).toMatch(/^book-/);
  });

  // ─── ① 灵感输入 ───────────────────────────────────────────

  it('Step 1: 灵感输入(POST /inspiration)', async () => {
    const { status, body } = await post(`/api/books/${bookId}/inspiration`, {
      sourceText: '少年林辰外门考核中觉醒上古星辰灵体,从被欺凌到一路逆袭。',
      genre: '玄幻',
      theme: '逆袭',
      conflict: '身份暴露与宗门追杀',
      tone: '热血',
      constraints: ['升级明确', '主角不降智'],
      sourceType: 'manual',
    });

    expect(status).toBe(201);
    const data = body as { data: { id: string; sourceText: string } };
    expect(data.data.id).toBeTruthy();
    expect(data.data.sourceText).toContain('林辰');
  });

  it('Step 1 验证: GET /inspiration 返回已保存的灵感', async () => {
    const { status, body } = await get(`/api/books/${bookId}/inspiration`);
    expect(status).toBe(200);
    const data = body as { data: { id: string; sourceText: string } | null };
    expect(data.data?.sourceText).toContain('林辰');
  });

  // ─── ② 规划 ──────────────────────────────────────────────

  it('Step 2: 规划简报(POST /planning-brief)', async () => {
    const { status, body } = await post(`/api/books/${bookId}/planning-brief`, {
      audience: '男频玄幻读者',
      genreStrategy: '高开高走',
      styleTarget: '爽点密集 + 节奏紧凑',
      lengthTarget: '100 万字',
      tabooRules: ['不降智', '不洗白反派'],
      marketGoals: ['起点连载', '完本签约'],
      creativeConstraints: ['成长线清晰', '伏笔回收完整'],
    });

    expect(status).toBe(201);
    const data = body as { data: { id: string; seedId: string } };
    expect(data.data.id).toBeTruthy();
    expect(data.data.seedId).toBeTruthy();
  });

  // ─── ③ 总纲规划 ──────────────────────────────────────────

  it('Step 3: 故事总纲(POST /story-outline,manual mode + 三层 schema)', async () => {
    const blueprint: Omit<CreateStoryBlueprintInput, 'planningBriefId'> = {
      meta: {
        novelType: 'xianxia',
        novelSubgenre: '宗门修仙',
        typeConfidence: 0.92,
        typeIsAuto: true,
        genderTarget: 'male',
        architectureMode: 'lotus_map',
        titleSuggestions: ['星辰剑帝', '逆天剑路'],
        estimatedWordCount: '100 万字',
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
            sentenceRhythm: '短句切割',
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
          {
            id: 'mentor',
            name: '玄风长老',
            role: 'mentor',
            traits: ['深邃'],
            background: '隐世长老',
            motivation: '寻找血脉传承者',
            arc: '从观察到全力相助',
            age: '300',
            gender: '男',
            appearance: '鹤发童颜',
            socialStatus: '宗门长老',
            internalConflict: '',
            abilities: ['剑道'],
            weaknesses: [],
            keyQuotes: [],
            speechPattern: {
              sentenceLength: '中',
              vocabularyLevel: '雅致',
              catchphrases: [],
              speechQuirks: '',
            },
          },
        ],
        relationships: [
          {
            fromId: 'mentor',
            toId: 'mc',
            relationType: '师徒',
            evolution: '从观察到全力相助',
            keyEvents: ['第一次传授', '危急时救援'],
          },
        ],
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

    const { status, body } = await post(`/api/books/${bookId}/story-outline`, blueprint);

    expect(status).toBe(201);
    const data = body as {
      data: {
        id: string;
        meta: { novelType: string; architectureMode: string };
        typeSpecific: { kind: string };
      };
    };
    expect(data.data.meta.novelType).toBe('xianxia');
    expect(data.data.meta.architectureMode).toBe('lotus_map');
    expect(data.data.typeSpecific.kind).toBe('fantasy');
  });

  // ─── ④ 细纲规划 ──────────────────────────────────────────

  it('Step 4: 全书细纲(POST /detailed-outline,manual mode)', async () => {
    const detailedOutline = {
      totalChapters: 3,
      estimatedTotalWords: '100 万字',
      volumes: [
        {
          volumeNumber: 1,
          title: '启程立势',
          arcSummary: '主角觉醒并立足外门。',
          chapterCount: 3,
          startChapter: 1,
          endChapter: 3,
          chapters: [
            {
              chapterNumber: 1,
              title: '考核日',
              wordCountTarget: '3000',
              sceneSetup: '宗门外门考核现场',
              charactersPresent: ['mc'],
              coreEvents: ['血脉觉醒'],
              emotionArc: '紧张到爆发',
              chapterEndHook: '黑影浮现',
              foreshadowingOps: [],
              keyDialogueHints: [],
              writingNotes: '',
              contextForWriter: {
                storyProgress: '故事开端,主角刚到外门考核现场。',
                chapterPositionNote: '本卷第 1/3 章',
                characterStates: [],
                activeWorldRules: [],
                activeForeshadowingStatus: [],
                precedingChapterBridge: {
                  cliffhanger: '',
                  emotionalCarry: '',
                  unresolvedTension: '',
                },
                nextChapterSetup: { seedForNext: '', expectedDevelopment: '' },
              },
            },
            {
              chapterNumber: 2,
              title: '导师传授',
              wordCountTarget: '3000',
              sceneSetup: '后山秘境',
              charactersPresent: ['mc', 'mentor'],
              coreEvents: ['获得指引'],
              emotionArc: '激动',
              chapterEndHook: '',
              foreshadowingOps: [],
              keyDialogueHints: [],
              writingNotes: '',
              contextForWriter: {
                storyProgress: '主角获得宗门长老的暗中传授。',
                chapterPositionNote: '本卷第 2/3 章',
                characterStates: [],
                activeWorldRules: [],
                activeForeshadowingStatus: [],
                precedingChapterBridge: {
                  cliffhanger: '',
                  emotionalCarry: '',
                  unresolvedTension: '',
                },
                nextChapterSetup: { seedForNext: '', expectedDevelopment: '' },
              },
            },
            {
              chapterNumber: 3,
              title: '亡命突围',
              wordCountTarget: '3000',
              sceneSetup: '林间小径',
              charactersPresent: ['mc'],
              coreEvents: ['首次胜利'],
              emotionArc: '危机到爆发',
              chapterEndHook: '黑影逼近',
              foreshadowingOps: [],
              keyDialogueHints: [],
              writingNotes: '',
              contextForWriter: {
                storyProgress: '主角面对宗门追杀,初次展示血脉力量。',
                chapterPositionNote: '本卷第 3/3 章',
                characterStates: [],
                activeWorldRules: [],
                activeForeshadowingStatus: [],
                precedingChapterBridge: {
                  cliffhanger: '',
                  emotionalCarry: '',
                  unresolvedTension: '',
                },
                nextChapterSetup: { seedForNext: '', expectedDevelopment: '' },
              },
            },
          ],
        },
      ],
    };

    const { status, body } = await post(`/api/books/${bookId}/detailed-outline`, detailedOutline);

    expect(status).toBe(201);
    const data = body as {
      data: {
        id: string;
        storyBlueprintId: string;
        totalChapters: number;
        volumes: Array<{ chapters: Array<{ chapterNumber: number }> }>;
      };
    };
    expect(data.data.storyBlueprintId).toBeTruthy();
    expect(data.data.totalChapters).toBe(3);
    expect(data.data.volumes[0].chapters).toHaveLength(3);
  });

  it('Step 4 验证: GET 单章 contextForWriter', async () => {
    const { status, body } = await get(`/api/books/${bookId}/detailed-outline/2/context`);
    expect(status).toBe(200);
    const data = body as { data: { storyProgress: string } };
    expect(data.data.storyProgress).toContain('暗中传授');
  });

  // ─── ⑤ 章节正文 ──────────────────────────────────────────

  it('Step 5: 写第 1 章草稿(POST /pipeline/write-draft)', async () => {
    const { status, body } = await post(`/api/books/${bookId}/pipeline/write-draft`, {
      chapterNumber: 1,
    });

    expect(status).toBe(200);
    const data = body as {
      data: { number: number; status: string; content: string };
    };
    expect(data.data.number).toBe(1);
    expect(data.data.status).toBe('draft');
    expect(data.data.content.length).toBeGreaterThan(50);
  });

  it('Step 5 验证: GET /chapters 列出第 1 章', async () => {
    const { status, body } = await get(`/api/books/${bookId}/chapters`);
    expect(status).toBe(200);
    const data = body as { data: Array<{ number: number; status: string }> };
    const ch1 = data.data.find((c) => c.number === 1);
    expect(ch1).toBeTruthy();
    expect(ch1?.status).toBe('draft');
  });

  // ─── ⑥ 质量检查 ──────────────────────────────────────────

  it('Step 6: 质量分析(GET /analytics/word-count + /analytics/ai-trace)', async () => {
    const wc = await get(`/api/books/${bookId}/analytics/word-count`);
    expect(wc.status).toBe(200);
    const wcData = wc.body as { data: { totalWords: number } };
    expect(wcData.data.totalWords).toBeGreaterThanOrEqual(0);

    const aiTrace = await get(`/api/books/${bookId}/analytics/ai-trace`);
    expect(aiTrace.status).toBe(200);
  });

  // ─── ⑦ 导出 ──────────────────────────────────────────────

  it('Step 7: 导出 Markdown(POST /export/markdown)', async () => {
    const { status } = await post(`/api/books/${bookId}/export/markdown`);
    expect(status).toBe(200);
  });

  it('Step 7 备选: 导出 TXT(POST /export/txt)', async () => {
    const { status } = await post(`/api/books/${bookId}/export/txt`);
    expect(status).toBe(200);
  });

  // ─── 上下游一致性 ──────────────────────────────────────────

  it('全链路一致性: 各阶段产出可被下一阶段消费', async () => {
    const insp = await get(`/api/books/${bookId}/inspiration`);
    const pb = await get(`/api/books/${bookId}/planning-brief`);
    const so = await get(`/api/books/${bookId}/story-outline`);
    const dol = await get(`/api/books/${bookId}/detailed-outline`);

    expect(insp.status).toBe(200);
    expect(pb.status).toBe(200);
    expect(so.status).toBe(200);
    expect(dol.status).toBe(200);

    const inspData = insp.body as { data: { id: string } };
    const pbData = pb.body as { data: { id: string; seedId: string } };
    const soData = so.body as { data: { id: string; planningBriefId: string } };
    const dolData = dol.body as { data: { storyBlueprintId: string } };

    expect(pbData.data.seedId).toBe(inspData.data.id);
    expect(soData.data.planningBriefId).toBe(pbData.data.id);
    expect(dolData.data.storyBlueprintId).toBe(soData.data.id);
  });
});
