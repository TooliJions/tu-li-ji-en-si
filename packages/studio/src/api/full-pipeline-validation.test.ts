import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { createApp } from './server';
import { resetStudioCoreBridgeForTests, getStudioRuntimeRootDir } from './core-bridge';
import type { CreateStoryBlueprintInput } from '@cybernovelist/core';

/**
 * 7 阶段输入/输出准确性验证
 *
 * 每个阶段验证:
 * - 输入校验:错误输入被拒绝(400/422)
 * - 跨阶段约束:upstream 缺失 / 重复创建 / 不存在书籍(409/404)
 * - Round-trip 准确性:posted === fetched
 * - 业务规则:R-01..R-05、ID 链接、contextForWriter 准确性
 * - 持久化一致性:写入 → 读取 → 文件系统三方匹配
 */

let app: ReturnType<typeof createApp>;
let tmpDir: string;

function freshSetup() {
  tmpDir = fs.mkdtempSync(path.join(process.cwd(), 'validation-'));
  resetStudioCoreBridgeForTests(tmpDir);
  app = createApp();
}

function teardown() {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

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
const patch = (url: string, body?: unknown) => fetchJson('PATCH', url, body);

async function createBook(): Promise<string> {
  const { body } = await post('/api/books', {
    title: '验证测试书',
    genre: 'xianxia',
    targetWords: 30000,
    targetChapterCount: 10,
    targetWordsPerChapter: 3000,
    brief: '验证测试用书籍',
  });
  return (body as { data: { id: string } }).data.id;
}

async function createInspirationFor(bookId: string) {
  return post(`/api/books/${bookId}/inspiration`, {
    sourceText: '少年觉醒上古血脉,从外门一路逆袭。',
    genre: '玄幻',
    theme: '逆袭',
    conflict: '身份暴露',
    tone: '热血',
    constraints: ['升级明确'],
    sourceType: 'manual',
  });
}

async function createPlanningFor(bookId: string) {
  return post(`/api/books/${bookId}/planning-brief`, {
    audience: '男频玄幻读者',
    genreStrategy: '高开高走',
    styleTarget: '爽点密集',
    lengthTarget: '100 万字',
    tabooRules: ['不降智'],
    marketGoals: ['起点连载'],
    creativeConstraints: ['成长线清晰'],
  });
}

function buildValidBlueprint(): Omit<CreateStoryBlueprintInput, 'planningBriefId'> {
  return {
    meta: {
      novelType: 'xianxia',
      novelSubgenre: '宗门修仙',
      typeConfidence: 0.92,
      typeIsAuto: true,
      genderTarget: 'male',
      architectureMode: 'lotus_map',
      titleSuggestions: ['星辰剑帝'],
      estimatedWordCount: '100 万字',
      endingType: 'HE',
      oneLineSynopsis: '少年觉醒上古血脉。',
    },
    base: {
      sellingPoints: {
        coreSellingPoint: '逆袭+血脉觉醒',
        hookSentence: '宗门最弱外门弟子身藏远古血脉。',
        auxiliarySellingPoints: [{ point: '热血对决', category: '情节爽感' }],
        differentiation: '',
        readerAppeal: '',
      },
      theme: {
        coreTheme: '逆袭',
        proposition: '',
        narrativeArc: { opening: 'a', development: 'b', climax: 'c', resolution: 'd' },
        toneKeywords: ['热血', '燃', '坚韧'],
        subthemes: [],
        forbiddenTones: [],
        emotionBaseline: {
          openingPhase: '',
          developmentPhase: '',
          climaxPhase: '',
          resolutionPhase: '',
        },
        writingAtmosphere: '',
      },
      goldenOpening: {
        openingHookType: 'high_burn',
        chapter1: { summary: 'a', hook: '', mustAchieve: [], wordCountTarget: '', firstHook: '' },
        chapter2: { summary: 'b', hook: '', mustAchieve: [], wordCountTarget: '' },
        chapter3: { summary: 'c', hook: '', mustAchieve: [], wordCountTarget: '', signingHook: '' },
        openingForbidden: [],
      },
      writingStyle: {
        prose: { tone: [], forbiddenTones: [], sentenceRhythm: '', descriptionDensity: '' },
        scene: { sceneStructure: '', povRules: '', sensoryPriority: [] },
        dialogue: { dialogueToNarrationRatio: '', monologueHandling: '', subtextGuidelines: '' },
        chapterWordCountTarget: '3000',
      },
      characters: [
        {
          id: 'mc',
          name: '林辰',
          role: 'protagonist',
          traits: [],
          background: '',
          motivation: '',
          arc: '',
          age: '',
          gender: '',
          appearance: '',
          socialStatus: '',
          internalConflict: '',
          abilities: [],
          weaknesses: [],
          keyQuotes: [],
          speechPattern: {
            sentenceLength: '',
            vocabularyLevel: '',
            catchphrases: [],
            speechQuirks: '',
          },
        },
      ],
      relationships: [],
      outlineArchitecture: {
        mode: 'lotus_map',
        modeReason: 'reason',
        satisfactionPacing: { earlyGame: [], midGame: [], lateGame: [], climax: [] },
        data: {
          kind: 'lotus_map',
          lotusCore: {
            name: '远古天宫',
            setting: '隐于云海',
            protagonistInitialRelation: '',
            secretLayers: [],
            guardianCharacters: [],
            returnTriggerDesign: '',
          },
          petals: [],
          historyLayers: [],
          ultimateTheme: '',
        },
      },
      foreshadowingSeed: { entries: [], resolutionChecklist: [] },
      completionDesign: {
        endingType: 'HE',
        finalBoss: '',
        finalConflict: '',
        epilogueHint: '',
        looseEndsResolution: [],
      },
    },
    typeSpecific: {
      kind: 'fantasy',
      powerSystem: {
        systemName: '剑道修炼',
        cultivationType: '',
        levels: ['炼体'],
        resourceCategories: [],
        combatSystem: '',
      },
      goldenFinger: null,
    },
  };
}

function buildValidDetailedOutline() {
  return {
    totalChapters: 3,
    estimatedTotalWords: '100 万字',
    volumes: [
      {
        volumeNumber: 1,
        title: '启程立势',
        arcSummary: '主角觉醒并立足。',
        chapterCount: 3,
        startChapter: 1,
        endChapter: 3,
        chapters: [1, 2, 3].map((n) => ({
          chapterNumber: n,
          title: `第 ${n} 章`,
          wordCountTarget: '3000',
          sceneSetup: `场景 ${n}`,
          charactersPresent: ['mc'],
          coreEvents: [`事件 ${n}`],
          emotionArc: '',
          chapterEndHook: '',
          foreshadowingOps: [],
          keyDialogueHints: [],
          writingNotes: '',
          contextForWriter: {
            storyProgress: `第 ${n} 章故事进度:进入新阶段。`,
            chapterPositionNote: `本卷 ${n}/3`,
            characterStates: [],
            activeWorldRules: [],
            activeForeshadowingStatus: [],
            precedingChapterBridge: { cliffhanger: '', emotionalCarry: '', unresolvedTension: '' },
            nextChapterSetup: { seedForNext: '', expectedDevelopment: '' },
          },
        })),
      },
    ],
  };
}

// ════════════════════════════════════════════════════════════════
// 阶段 0:书籍创建 — 边界校验
// ════════════════════════════════════════════════════════════════

describe('阶段 0:书籍创建 - 边界校验', () => {
  beforeEach(() => freshSetup());
  afterEach(() => teardown());

  it('拒绝缺 title 的请求', async () => {
    const { status, body } = await post('/api/books', {
      genre: 'xianxia',
      targetWords: 30000,
    });
    expect(status).toBe(400);
    expect((body as { error: { code: string } }).error.code).toBe('INVALID_STATE');
  });

  it('拒绝缺 genre 的请求', async () => {
    const { status } = await post('/api/books', {
      title: '测试书',
      targetWords: 30000,
    });
    expect(status).toBe(400);
  });

  it('拒绝同时缺 targetWords 和 targetChapterCount', async () => {
    const { status } = await post('/api/books', {
      title: '测试书',
      genre: 'xianxia',
    });
    expect(status).toBe(400);
  });

  it('拒绝 targetWords 为负数', async () => {
    const { status } = await post('/api/books', {
      title: '测试书',
      genre: 'xianxia',
      targetWords: -100,
    });
    expect(status).toBe(400);
  });

  it('Round-trip:创建后 GET 返回完全一致的字段', async () => {
    const create = await post('/api/books', {
      title: '原始书名',
      genre: 'xianxia',
      targetWords: 30000,
      brief: '简介',
    });
    expect(create.status).toBe(201);
    const bookId = (create.body as { data: { id: string } }).data.id;

    const fetched = await get(`/api/books/${bookId}`);
    expect(fetched.status).toBe(200);
    const data = (fetched.body as { data: { title: string; genre: string; brief: string } }).data;
    expect(data.title).toBe('原始书名');
    expect(data.genre).toBe('xianxia');
    expect(data.brief).toBe('简介');
  });
});

// ════════════════════════════════════════════════════════════════
// 阶段 ① 灵感输入 - 输入/输出准确性
// ════════════════════════════════════════════════════════════════

describe('阶段 ① 灵感输入', () => {
  let bookId: string;

  beforeEach(async () => {
    freshSetup();
    bookId = await createBook();
  });
  afterEach(() => teardown());

  it('拒绝空 sourceText', async () => {
    const { status } = await post(`/api/books/${bookId}/inspiration`, {
      sourceText: '',
      sourceType: 'manual',
    });
    expect(status).toBe(400);
  });

  it('拒绝缺 sourceType', async () => {
    const { status } = await post(`/api/books/${bookId}/inspiration`, {
      sourceText: '内容',
    });
    expect(status).toBe(400);
  });

  it('拒绝非法 sourceType 枚举', async () => {
    const { status } = await post(`/api/books/${bookId}/inspiration`, {
      sourceText: '内容',
      sourceType: 'invalid-type',
    });
    expect(status).toBe(400);
  });

  it('拒绝不存在的 bookId', async () => {
    const { status, body } = await post('/api/books/book-nonexistent/inspiration', {
      sourceText: '内容',
      sourceType: 'manual',
    });
    expect(status).toBe(404);
    expect((body as { error: { code: string } }).error.code).toBe('BOOK_NOT_FOUND');
  });

  it('拒绝重复 POST(STAGE_ALREADY_EXISTS)', async () => {
    await createInspirationFor(bookId);
    const second = await createInspirationFor(bookId);
    expect(second.status).toBe(409);
    expect((second.body as { error: { code: string } }).error.code).toBe('STAGE_ALREADY_EXISTS');
  });

  it('PATCH 但未 POST 返回 STAGE_NOT_FOUND', async () => {
    const { status, body } = await patch(`/api/books/${bookId}/inspiration`, { tone: '冷峻' });
    expect(status).toBe(404);
    expect((body as { error: { code: string } }).error.code).toBe('STAGE_NOT_FOUND');
  });

  it('Round-trip:POST 后 GET 字段精确等于输入', async () => {
    const inputs = {
      sourceText: '原始灵感文本',
      genre: '玄幻',
      theme: '主题 X',
      conflict: '冲突 Y',
      tone: '基调 Z',
      constraints: ['约束 1', '约束 2'],
      sourceType: 'manual' as const,
    };
    const created = await post(`/api/books/${bookId}/inspiration`, inputs);
    expect(created.status).toBe(201);

    const fetched = await get(`/api/books/${bookId}/inspiration`);
    const data = (fetched.body as { data: typeof inputs & { id: string; createdAt: string } }).data;

    expect(data.sourceText).toBe(inputs.sourceText);
    expect(data.genre).toBe(inputs.genre);
    expect(data.theme).toBe(inputs.theme);
    expect(data.conflict).toBe(inputs.conflict);
    expect(data.tone).toBe(inputs.tone);
    expect(data.constraints).toEqual(inputs.constraints);
    expect(data.sourceType).toBe('manual');
    expect(data.id).toMatch(/^seed_/);
    expect(() => new Date(data.createdAt).toISOString()).not.toThrow();
  });

  it('PATCH 仅修改指定字段,其它字段保留', async () => {
    await createInspirationFor(bookId);
    const before = await get(`/api/books/${bookId}/inspiration`);
    const beforeData = (
      before.body as { data: { sourceText: string; genre: string; tone: string } }
    ).data;

    const { status, body } = await patch(`/api/books/${bookId}/inspiration`, {
      tone: '冷峻',
    });
    expect(status).toBe(200);
    const afterData = (body as { data: { sourceText: string; genre: string; tone: string } }).data;

    expect(afterData.sourceText).toBe(beforeData.sourceText);
    expect(afterData.genre).toBe(beforeData.genre);
    expect(afterData.tone).toBe('冷峻');
  });
});

// ════════════════════════════════════════════════════════════════
// 阶段 ② 规划简报 - 输入/输出准确性
// ════════════════════════════════════════════════════════════════

describe('阶段 ② 规划简报', () => {
  let bookId: string;

  beforeEach(async () => {
    freshSetup();
    bookId = await createBook();
  });
  afterEach(() => teardown());

  it('未先 POST inspiration → UPSTREAM_REQUIRED', async () => {
    const { status, body } = await post(`/api/books/${bookId}/planning-brief`, {
      audience: '读者',
      genreStrategy: '策略',
      styleTarget: '风格',
      lengthTarget: '长度',
    });
    expect(status).toBe(409);
    expect((body as { error: { code: string } }).error.code).toBe('UPSTREAM_REQUIRED');
  });

  it('拒绝缺 audience', async () => {
    await createInspirationFor(bookId);
    const { status } = await post(`/api/books/${bookId}/planning-brief`, {
      genreStrategy: '策略',
      styleTarget: '风格',
      lengthTarget: '长度',
    });
    expect(status).toBe(400);
  });

  it('拒绝缺 styleTarget', async () => {
    await createInspirationFor(bookId);
    const { status } = await post(`/api/books/${bookId}/planning-brief`, {
      audience: '读者',
      genreStrategy: '策略',
      lengthTarget: '长度',
    });
    expect(status).toBe(400);
  });

  it('Round-trip:seedId 自动从灵感读取并对齐', async () => {
    const insp = await createInspirationFor(bookId);
    const seedId = (insp.body as { data: { id: string } }).data.id;

    const created = await createPlanningFor(bookId);
    expect(created.status).toBe(201);
    const data = (created.body as { data: { seedId: string; status: string } }).data;
    expect(data.seedId).toBe(seedId);
    expect(data.status).toBe('draft');
  });

  it('Round-trip:数组字段(tabooRules / marketGoals)精确保留', async () => {
    await createInspirationFor(bookId);
    const created = await post(`/api/books/${bookId}/planning-brief`, {
      audience: '读者群体',
      genreStrategy: '题材策略',
      styleTarget: '风格目标',
      lengthTarget: '字数目标',
      tabooRules: ['禁忌 A', '禁忌 B', '禁忌 C'],
      marketGoals: ['市场目标 1'],
      creativeConstraints: ['约束 1', '约束 2'],
    });
    expect(created.status).toBe(201);

    const fetched = await get(`/api/books/${bookId}/planning-brief`);
    const data = (
      fetched.body as {
        data: { tabooRules: string[]; marketGoals: string[]; creativeConstraints: string[] };
      }
    ).data;
    expect(data.tabooRules).toEqual(['禁忌 A', '禁忌 B', '禁忌 C']);
    expect(data.marketGoals).toEqual(['市场目标 1']);
    expect(data.creativeConstraints).toEqual(['约束 1', '约束 2']);
  });
});

// ════════════════════════════════════════════════════════════════
// 阶段 ③ 故事总纲 - 三层 schema + R-01..R-05 业务规则
// ════════════════════════════════════════════════════════════════

describe('阶段 ③ 故事总纲', () => {
  let bookId: string;

  beforeEach(async () => {
    freshSetup();
    bookId = await createBook();
    await createInspirationFor(bookId);
    await createPlanningFor(bookId);
  });
  afterEach(() => teardown());

  it('未先 POST planning-brief → UPSTREAM_REQUIRED', async () => {
    const fresh = await createBook();
    const { status, body } = await post(`/api/books/${fresh}/story-outline`, buildValidBlueprint());
    expect(status).toBe(409);
    expect((body as { error: { code: string } }).error.code).toBe('UPSTREAM_REQUIRED');
  });

  it('拒绝 meta.novelType 非枚举值', async () => {
    const bp = buildValidBlueprint();
    (bp.meta as unknown as Record<string, unknown>).novelType = 'invalid-genre';
    const { status } = await post(`/api/books/${bookId}/story-outline`, bp);
    expect(status).toBe(400);
  });

  it('拒绝 characters 数组为空', async () => {
    const bp = buildValidBlueprint();
    bp.base.characters = [];
    const { status } = await post(`/api/books/${bookId}/story-outline`, bp);
    expect(status).toBe(400);
  });

  it('R-01:novelType=xianxia 但 architectureMode=multiverse → 422', async () => {
    const bp = buildValidBlueprint();
    bp.meta.architectureMode = 'multiverse';
    bp.base.outlineArchitecture.mode = 'multiverse';
    bp.base.outlineArchitecture.data = {
      kind: 'multiverse',
      hubWorld: 'main',
      worlds: [{ worldId: 'w1', name: 'A', rules: '', conflict: '', transferMechanism: '' }],
      progressionLogic: '',
    };
    const { status, body } = await post(`/api/books/${bookId}/story-outline`, bp);
    expect(status).toBe(422);
    const err = (body as { error: { code: string; issues: Array<{ rule: string }> } }).error;
    expect(err.code).toBe('OUTLINE_VALIDATION_FAILED');
    expect(err.issues.some((i) => i.rule === 'R-01')).toBe(true);
  });

  it('R-02:typeSpecific.kind 与 novelType 不匹配 → 422', async () => {
    const bp = buildValidBlueprint();
    bp.typeSpecific = {
      kind: 'urban',
      systemPanel: null,
      worldBuilding: {
        socialHierarchy: '',
        economicSystem: '',
        technologyLevel: '',
        locationCards: [],
      },
    };
    const { status, body } = await post(`/api/books/${bookId}/story-outline`, bp);
    expect(status).toBe(422);
    const err = (body as { error: { issues: Array<{ rule: string }> } }).error;
    expect(err.issues.some((i) => i.rule === 'R-02')).toBe(true);
  });

  it('R-04:characters 全部 supporting(无 protagonist) → 422', async () => {
    const bp = buildValidBlueprint();
    bp.base.characters = bp.base.characters.map((c) => ({ ...c, role: 'supporting' as const }));
    const { status, body } = await post(`/api/books/${bookId}/story-outline`, bp);
    expect(status).toBe(422);
    const err = (body as { error: { issues: Array<{ rule: string }> } }).error;
    expect(err.issues.some((i) => i.rule === 'R-04')).toBe(true);
  });

  it('R-05:meta.endingType 与 completionDesign.endingType 不一致 → 警告但通过', async () => {
    const bp = buildValidBlueprint();
    bp.base.completionDesign.endingType = 'BE';
    const { status, body } = await post(`/api/books/${bookId}/story-outline`, bp);
    // R-05 是 warning,不阻断创建
    expect(status).toBe(201);
    const data = (body as { data: { id: string } }).data;
    expect(data.id).toBeTruthy();
  });

  it('Round-trip:planningBriefId 链接正确', async () => {
    const pb = await get(`/api/books/${bookId}/planning-brief`);
    const planningBriefId = (pb.body as { data: { id: string } }).data.id;

    const created = await post(`/api/books/${bookId}/story-outline`, buildValidBlueprint());
    expect(created.status).toBe(201);
    const data = (created.body as { data: { planningBriefId: string } }).data;
    expect(data.planningBriefId).toBe(planningBriefId);
  });

  it('Round-trip:三层结构精确保留', async () => {
    const bp = buildValidBlueprint();
    await post(`/api/books/${bookId}/story-outline`, bp);

    const fetched = await get(`/api/books/${bookId}/story-outline`);
    const data = (
      fetched.body as {
        data: {
          meta: { novelType: string; oneLineSynopsis: string };
          base: { characters: Array<{ id: string; role: string }> };
          typeSpecific: { kind: string };
        };
      }
    ).data;
    expect(data.meta.novelType).toBe(bp.meta.novelType);
    expect(data.meta.oneLineSynopsis).toBe(bp.meta.oneLineSynopsis);
    expect(data.base.characters[0].id).toBe('mc');
    expect(data.base.characters[0].role).toBe('protagonist');
    expect(data.typeSpecific.kind).toBe('fantasy');
  });

  it('PATCH 仅修改 meta.oneLineSynopsis,其它字段保留', async () => {
    await post(`/api/books/${bookId}/story-outline`, buildValidBlueprint());
    const { status, body } = await patch(`/api/books/${bookId}/story-outline`, {
      meta: { oneLineSynopsis: '修改后的简介。' },
    });
    expect(status).toBe(200);
    const data = (
      body as {
        data: {
          meta: { oneLineSynopsis: string; novelType: string };
          base: { characters: Array<{ id: string }> };
        };
      }
    ).data;
    expect(data.meta.oneLineSynopsis).toBe('修改后的简介。');
    expect(data.meta.novelType).toBe('xianxia');
    expect(data.base.characters[0].id).toBe('mc');
  });
});

// ════════════════════════════════════════════════════════════════
// 阶段 ④ 全书细纲 - chapterContext 准确性
// ════════════════════════════════════════════════════════════════

describe('阶段 ④ 全书细纲', () => {
  let bookId: string;

  beforeEach(async () => {
    freshSetup();
    bookId = await createBook();
    await createInspirationFor(bookId);
    await createPlanningFor(bookId);
    await post(`/api/books/${bookId}/story-outline`, buildValidBlueprint());
  });
  afterEach(() => teardown());

  it('未先 POST story-outline → UPSTREAM_REQUIRED', async () => {
    const fresh = await createBook();
    await createInspirationFor(fresh);
    await createPlanningFor(fresh);

    const { status, body } = await post(
      `/api/books/${fresh}/detailed-outline`,
      buildValidDetailedOutline(),
    );
    expect(status).toBe(409);
    expect((body as { error: { code: string } }).error.code).toBe('UPSTREAM_REQUIRED');
  });

  it('拒绝 volumes 为空数组', async () => {
    const { status } = await post(`/api/books/${bookId}/detailed-outline`, {
      totalChapters: 0,
      estimatedTotalWords: '0',
      volumes: [],
    });
    expect(status).toBe(400);
  });

  it('拒绝 chapter.coreEvents 为空数组(min(1) 校验)', async () => {
    const dol = buildValidDetailedOutline();
    dol.volumes[0].chapters[0].coreEvents = [];
    const { status } = await post(`/api/books/${bookId}/detailed-outline`, dol);
    expect(status).toBe(400);
  });

  it('拒绝 contextForWriter.storyProgress 为空字符串', async () => {
    const dol = buildValidDetailedOutline();
    dol.volumes[0].chapters[0].contextForWriter.storyProgress = '';
    const { status } = await post(`/api/books/${bookId}/detailed-outline`, dol);
    expect(status).toBe(400);
  });

  it('Round-trip:storyBlueprintId 链接正确', async () => {
    const so = await get(`/api/books/${bookId}/story-outline`);
    const storyBlueprintId = (so.body as { data: { id: string } }).data.id;

    const created = await post(
      `/api/books/${bookId}/detailed-outline`,
      buildValidDetailedOutline(),
    );
    expect(created.status).toBe(201);
    const data = (created.body as { data: { storyBlueprintId: string } }).data;
    expect(data.storyBlueprintId).toBe(storyBlueprintId);
  });

  it('GET /:n/context 精确返回该章 contextForWriter(无错位)', async () => {
    await post(`/api/books/${bookId}/detailed-outline`, buildValidDetailedOutline());

    const ch1 = await get(`/api/books/${bookId}/detailed-outline/1/context`);
    const ch2 = await get(`/api/books/${bookId}/detailed-outline/2/context`);
    const ch3 = await get(`/api/books/${bookId}/detailed-outline/3/context`);

    expect(ch1.status).toBe(200);
    expect(ch2.status).toBe(200);
    expect(ch3.status).toBe(200);

    const c1 = (ch1.body as { data: { storyProgress: string } }).data.storyProgress;
    const c2 = (ch2.body as { data: { storyProgress: string } }).data.storyProgress;
    const c3 = (ch3.body as { data: { storyProgress: string } }).data.storyProgress;

    expect(c1).toContain('第 1 章');
    expect(c2).toContain('第 2 章');
    expect(c3).toContain('第 3 章');
    expect(c1).not.toBe(c2);
    expect(c2).not.toBe(c3);
  });

  it('GET 不存在的 chapterNumber → 404 CHAPTER_NOT_FOUND', async () => {
    await post(`/api/books/${bookId}/detailed-outline`, buildValidDetailedOutline());

    const { status, body } = await get(`/api/books/${bookId}/detailed-outline/99/context`);
    expect(status).toBe(404);
    expect((body as { error: { code: string } }).error.code).toBe('CHAPTER_NOT_FOUND');
  });

  it('GET 非数字 chapterNumber → 400', async () => {
    await post(`/api/books/${bookId}/detailed-outline`, buildValidDetailedOutline());

    const { status } = await get(`/api/books/${bookId}/detailed-outline/abc/context`);
    expect(status).toBe(400);
  });

  it('totalChapters === sum(volumes[].chapterCount)', async () => {
    const created = await post(
      `/api/books/${bookId}/detailed-outline`,
      buildValidDetailedOutline(),
    );
    const data = (
      created.body as {
        data: { totalChapters: number; volumes: Array<{ chapterCount: number }> };
      }
    ).data;
    const sum = data.volumes.reduce((s, v) => s + v.chapterCount, 0);
    expect(data.totalChapters).toBe(sum);
  });
});

// ════════════════════════════════════════════════════════════════
// 阶段 ⑤ 章节正文 - 写入与持久化
// ════════════════════════════════════════════════════════════════

describe('阶段 ⑤ 章节正文', () => {
  let bookId: string;

  beforeEach(async () => {
    freshSetup();
    bookId = await createBook();
  });
  afterEach(() => teardown());

  it('拒绝 chapterNumber 为 0', async () => {
    const { status } = await post(`/api/books/${bookId}/pipeline/write-draft`, {
      chapterNumber: 0,
    });
    expect(status).toBe(400);
  });

  it('拒绝 chapterNumber 为负数', async () => {
    const { status } = await post(`/api/books/${bookId}/pipeline/write-draft`, {
      chapterNumber: -1,
    });
    expect(status).toBe(400);
  });

  it('拒绝缺 chapterNumber', async () => {
    const { status } = await post(`/api/books/${bookId}/pipeline/write-draft`, {});
    expect(status).toBe(400);
  });

  it('写入第 1 章草稿,GET 列表 + 单章 + 文件系统三方一致', async () => {
    const created = await post(`/api/books/${bookId}/pipeline/write-draft`, {
      chapterNumber: 1,
    });
    expect(created.status).toBe(200);
    const writeData = (created.body as { data: { number: number; content: string } }).data;
    expect(writeData.number).toBe(1);
    expect(writeData.content.length).toBeGreaterThan(50);

    // 1. 列表中存在 status=draft
    const list = await get(`/api/books/${bookId}/chapters`);
    expect(list.status).toBe(200);
    const items = (list.body as { data: Array<{ number: number; status: string }> }).data;
    const ch1 = items.find((c) => c.number === 1);
    expect(ch1).toBeTruthy();
    expect(ch1?.status).toBe('draft');

    // 2. 单章 GET 返回内容相等
    const single = await get(`/api/books/${bookId}/chapters/1`);
    expect(single.status).toBe(200);
    const singleData = (single.body as { data: { number: number; content: string } }).data;
    expect(singleData.number).toBe(1);
    expect(singleData.content).toBe(writeData.content);

    // 3. 文件系统中文件存在,内容包含 POST 返回的内容主体
    const filePath = path.join(
      getStudioRuntimeRootDir(),
      bookId,
      'story',
      'chapters',
      'chapter-0001.md',
    );
    expect(fs.existsSync(filePath)).toBe(true);
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    // 文件内容包含 markdown 格式,正文应包含 API 返回的 content 字符
    const contentSnippet = writeData.content.slice(0, 50);
    expect(fileContent).toContain(contentSnippet.slice(0, 20));
  });

  it('重复 POST chapterNumber=1 第二次成功(允许覆盖草稿)', async () => {
    const first = await post(`/api/books/${bookId}/pipeline/write-draft`, { chapterNumber: 1 });
    expect(first.status).toBe(200);

    const second = await post(`/api/books/${bookId}/pipeline/write-draft`, { chapterNumber: 1 });
    expect(second.status).toBe(200);
  });
});

// ════════════════════════════════════════════════════════════════
// 阶段 ⑥ 质量分析 - 端点连通
// ════════════════════════════════════════════════════════════════

describe('阶段 ⑥ 质量分析', () => {
  let bookId: string;

  beforeEach(async () => {
    freshSetup();
    bookId = await createBook();
    await post(`/api/books/${bookId}/pipeline/write-draft`, { chapterNumber: 1 });
  });
  afterEach(() => teardown());

  it('GET /analytics/word-count 返回 totalWords:number', async () => {
    const { status, body } = await get(`/api/books/${bookId}/analytics/word-count`);
    expect(status).toBe(200);
    const data = (body as { data: { totalWords: number } }).data;
    expect(typeof data.totalWords).toBe('number');
    expect(data.totalWords).toBeGreaterThanOrEqual(0);
  });

  it('GET /analytics/audit-rate 返回 200', async () => {
    const { status } = await get(`/api/books/${bookId}/analytics/audit-rate`);
    expect(status).toBe(200);
  });

  it('GET /analytics/ai-trace 返回 200', async () => {
    const { status } = await get(`/api/books/${bookId}/analytics/ai-trace`);
    expect(status).toBe(200);
  });

  it('GET /analytics/quality-baseline 返回 200', async () => {
    const { status } = await get(`/api/books/${bookId}/analytics/quality-baseline`);
    expect(status).toBe(200);
  });

  it('GET /chapters/:n/audit-report 不存在审计 → 404', async () => {
    const { status } = await get(`/api/books/${bookId}/chapters/1/audit-report`);
    // 没运行过审计 → 应该是 404 或返回空
    expect([200, 404]).toContain(status);
  });
});

// ════════════════════════════════════════════════════════════════
// 阶段 ⑦ 导出 - 内容完整性
// ════════════════════════════════════════════════════════════════

describe('阶段 ⑦ 导出', () => {
  let bookId: string;

  beforeEach(async () => {
    freshSetup();
    bookId = await createBook();
    await post(`/api/books/${bookId}/pipeline/write-draft`, { chapterNumber: 1 });
  });
  afterEach(() => teardown());

  it('POST /export/markdown 返回 200', async () => {
    const { status } = await post(`/api/books/${bookId}/export/markdown`);
    expect(status).toBe(200);
  });

  it('POST /export/txt 返回 200', async () => {
    const { status } = await post(`/api/books/${bookId}/export/txt`);
    expect(status).toBe(200);
  });

  it('POST /export/epub 返回 200', async () => {
    const { status } = await post(`/api/books/${bookId}/export/epub`, {
      metadata: { title: '验证测试书', author: '测试作者' },
    });
    expect(status).toBe(200);
  });

  it('无章节的书也能导出(空文档不报错)', async () => {
    const empty = await createBook();
    const { status } = await post(`/api/books/${empty}/export/markdown`);
    expect(status).toBe(200);
  });
});

// ════════════════════════════════════════════════════════════════
// 跨阶段一致性收敛
// ════════════════════════════════════════════════════════════════

describe('跨阶段一致性收敛', () => {
  beforeEach(() => freshSetup());
  afterEach(() => teardown());

  it('全链路 ID 链:seedId → planningBrief.seedId → outline.planningBriefId → detailed.storyBlueprintId', async () => {
    const bookId = await createBook();
    const insp = await createInspirationFor(bookId);
    const seedId = (insp.body as { data: { id: string } }).data.id;

    const pb = await createPlanningFor(bookId);
    const planningBriefId = (pb.body as { data: { id: string; seedId: string } }).data.id;
    expect((pb.body as { data: { seedId: string } }).data.seedId).toBe(seedId);

    const so = await post(`/api/books/${bookId}/story-outline`, buildValidBlueprint());
    const storyBlueprintId = (so.body as { data: { id: string; planningBriefId: string } }).data.id;
    expect((so.body as { data: { planningBriefId: string } }).data.planningBriefId).toBe(
      planningBriefId,
    );

    const dol = await post(`/api/books/${bookId}/detailed-outline`, buildValidDetailedOutline());
    expect((dol.body as { data: { storyBlueprintId: string } }).data.storyBlueprintId).toBe(
      storyBlueprintId,
    );
  });
});
