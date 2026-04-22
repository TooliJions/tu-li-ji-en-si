import { Hono } from 'hono';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import {
  RuntimeStateStore,
  StateManager,
  OutlinePlanner,
  CharacterDesigner,
  ChapterPlanner,
  type Hook,
  type CharacterDesignResult,
  type OutlineResult,
  type ChapterPlanResult,
  generateJSONWithValidation,
  fillDefaults,
  type LLMOutputRule,
} from '@cybernovelist/core';
import {
  readStudioBookRuntime,
  updateStudioBookRuntime,
  getStudioPipelineRunner,
  getStudioLLMProvider,
  hasStudioBookRuntime,
  getStudioRuntimeRootDir,
} from '../core-bridge';
import { eventHub } from '../sse';

export const pipelineStore = new Map<
  string,
  {
    pipelineId: string;
    status: string;
    stages: string[];
    currentStage: string;
    progress: Record<string, { status: string; elapsedMs: number }>;
    startedAt: string;
    finishedAt?: string;
    result?: {
      success: boolean;
      chapterNumber: number;
      status?: string;
      persisted?: boolean;
      error?: string;
    };
  }
>();

const writeNextSchema = z.object({
  chapterNumber: z.number().int().positive(),
  customIntent: z.string().optional(),
  userIntent: z.string().optional(),
  skipAudit: z.boolean().optional().default(false),
});

const fastDraftSchema = z.object({
  customIntent: z.string().optional(),
  wordCount: z.number().int().positive().default(800),
});

const upgradeDraftSchema = z.object({
  chapterNumber: z.number().int().positive(),
  userIntent: z.string().optional(),
});

const writeDraftSchema = z.object({
  chapterNumber: z.number().int().positive(),
});

const planChapterSchema = z.object({
  chapterNumber: z.number().int().positive(),
  outlineContext: z.string().optional().default(''),
});

const bootstrapStorySchema = z.object({
  chapterNumber: z.number().int().positive().optional(),
});

function loadBookManifest(bookId: string) {
  const manager = new StateManager(getStudioRuntimeRootDir());
  const store = new RuntimeStateStore(manager);
  return store.loadManifest(bookId);
}

function saveBookManifest(bookId: string, nextManifest: ReturnType<typeof loadBookManifest>) {
  const manager = new StateManager(getStudioRuntimeRootDir());
  const store = new RuntimeStateStore(manager);
  store.saveRuntimeStateSnapshot(bookId, nextManifest);
}

function normalizeGenreForAgents(genre: string | undefined): string {
  const value = (genre ?? '').trim();
  if (value === '都市') return 'urban';
  if (value === '玄幻') return 'fantasy';
  if (value === '科幻') return 'sci-fi';
  if (value === '历史') return 'history';
  if (value === '游戏') return 'game';
  if (value === '悬疑') return 'horror';
  if (value === '同人') return 'fanfic';
  return value || 'urban';
}

function serializeOutline(outline: OutlineResult): string {
  const acts = Array.isArray(outline.acts) ? outline.acts : [];
  const structureLabel = acts.length > 3 ? '卷' : '幕';
  return acts
    .map((act) => {
      const chapters = Array.isArray(act.chapters) ? act.chapters : [];
      const chapterLines = chapters
        .map((chapter) => `- 第${chapter.chapterNumber}章 ${chapter.title}：${chapter.summary}`)
        .join('\n');
      return `第${act.actNumber}${structureLabel} ${act.title}\n${act.summary}\n${chapterLines}`;
    })
    .join('\n\n');
}

function dedupeByKey<T>(items: T[], getKey: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = getKey(item);
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function buildBootstrapPlanningBrief(
  outline: OutlineResult,
  worldBootstrap: {
    centralConflict: string;
    growthArc: string;
  },
  characterDesign: CharacterDesignResult
) {
  const acts = Array.isArray(outline.acts) ? outline.acts : [];
  const outlineSummary = acts
    .slice(0, 3)
    .map((act) => `${act.title}：${act.summary}`)
    .join('；');
  const characterList = Array.isArray(characterDesign.characters) ? characterDesign.characters : [];
  const characterArcSummary = characterList
    .slice(0, 3)
    .map((character) =>
      character.arc?.trim() ? `${character.name}：${character.arc.trim()}` : character.name
    )
    .join('；');

  return [
    outlineSummary ? `主题大纲：${outlineSummary}` : '',
    worldBootstrap.centralConflict?.trim()
      ? `核心矛盾：${worldBootstrap.centralConflict.trim()}`
      : '',
    worldBootstrap.growthArc?.trim() ? `成长主线：${worldBootstrap.growthArc.trim()}` : '',
    characterArcSummary ? `角色成长：${characterArcSummary}` : '',
  ]
    .filter(Boolean)
    .join('；');
}

function buildBootstrapChapterAnchor(outline: OutlineResult, chapterNumber: number): string {
  const acts = Array.isArray(outline.acts) ? outline.acts : [];
  if (acts.length === 0) {
    return `第${chapterNumber}章应优先完成开篇建置：立住主角处境、核心设定和第一道冲突。`;
  }

  let targetAct = acts[0];
  for (const act of acts) {
    const chapterNumbers = Array.isArray(act.chapters)
      ? act.chapters.map((chapter) => chapter.chapterNumber)
      : [];
    if (chapterNumbers.includes(chapterNumber)) {
      targetAct = act;
      break;
    }
    if (chapterNumbers.length > 0 && chapterNumbers[0] <= chapterNumber) {
      targetAct = act;
    }
  }

  const matchedChapter = Array.isArray(targetAct.chapters)
    ? targetAct.chapters.find((chapter) => chapter.chapterNumber === chapterNumber)
    : undefined;
  const structureLabel = acts.length > 3 ? '卷' : '幕';

  return [
    `当前位于第${targetAct.actNumber}${structureLabel}《${targetAct.title}》`,
    targetAct.summary ? `本${structureLabel}目标：${targetAct.summary}` : '',
    matchedChapter
      ? `对应关键章节：第${matchedChapter.chapterNumber}章 ${matchedChapter.title}：${matchedChapter.summary}`
      : '',
    `第${chapterNumber}章要优先建立主角处境、世界规则落地和后续冲突入口。`,
  ]
    .filter(Boolean)
    .join('；');
}

function buildBootstrapChapterBrief(input: {
  rawBrief: string;
  expandedBrief: string;
  planningBrief: string;
  currentFocus: string;
  centralConflict: string;
  growthArc: string;
  chapterAnchor: string;
}): string {
  return [
    input.rawBrief?.trim() ? `【原始灵感】${input.rawBrief.trim()}` : '',
    input.expandedBrief?.trim() ? `【扩展设定】${input.expandedBrief.trim()}` : '',
    input.planningBrief?.trim() ? `【全书规划】${input.planningBrief.trim()}` : '',
    input.currentFocus?.trim() ? `【开篇焦点】${input.currentFocus.trim()}` : '',
    input.centralConflict?.trim() ? `【核心矛盾】${input.centralConflict.trim()}` : '',
    input.growthArc?.trim() ? `【成长主线】${input.growthArc.trim()}` : '',
    input.chapterAnchor?.trim() ? `【当前章节定位】${input.chapterAnchor.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

function normalizeBootstrapChapterPlan(input: {
  chapterNumber: number;
  currentFocus: string;
  chapterAnchor: string;
  characterNames: string[];
  bootstrapWorldRules: string[];
  plan: ChapterPlanResult['plan'] | undefined;
}): ChapterPlanResult['plan'] {
  const plan = input.plan;
  const validCharacterNames = new Set(input.characterNames);
  const normalizedCharacters = (Array.isArray(plan?.characters) ? plan.characters : []).filter(
    (name): name is string => typeof name === 'string' && validCharacterNames.has(name)
  );
  const fallbackCharacters = input.characterNames.slice(
    0,
    Math.min(2, input.characterNames.length)
  );
  const characters = normalizedCharacters.length > 0 ? normalizedCharacters : fallbackCharacters;

  const keyEvents = dedupeByKey(
    [
      ...(Array.isArray(plan?.keyEvents)
        ? plan.keyEvents.filter(
            (event): event is string => typeof event === 'string' && event.trim().length > 0
          )
        : []),
      '交代主角当前处境并建立读者代入点',
      '用具体场景展示关键设定或世界规则',
      '抛出与主线相关的第一道冲突或悬念',
    ],
    (event) => event
  ).slice(0, 5);

  const worldRules = dedupeByKey(
    [
      ...(Array.isArray(plan?.worldRules)
        ? plan.worldRules.filter(
            (rule): rule is string => typeof rule === 'string' && rule.trim().length > 0
          )
        : []),
      ...input.bootstrapWorldRules.slice(0, 4),
    ],
    (rule) => rule
  ).slice(0, 5);

  const hooks = (Array.isArray(plan?.hooks) ? plan.hooks : []).filter(
    (hook): hook is { description: string; type: string; priority: string } =>
      Boolean(
        hook &&
        typeof hook === 'object' &&
        typeof hook.description === 'string' &&
        hook.description.trim().length > 0
      )
  );

  return {
    chapterNumber: plan?.chapterNumber ?? input.chapterNumber,
    title: plan?.title?.trim() || `第${input.chapterNumber}章`,
    intention: plan?.intention?.trim() || input.currentFocus || input.chapterAnchor,
    wordCountTarget: plan?.wordCountTarget ?? 3000,
    characters,
    keyEvents,
    hooks,
    worldRules,
    emotionalBeat: plan?.emotionalBeat?.trim() || '平静→绷紧→期待',
    sceneTransition: plan?.sceneTransition?.trim() || '从开篇建置自然过渡到后续主线推进。',
    openingHook: plan?.openingHook ?? '',
    closingHook: plan?.closingHook ?? '',
    sceneBreakdown: Array.isArray(plan?.sceneBreakdown) ? plan.sceneBreakdown : [],
    characterGrowthBeat: plan?.characterGrowthBeat ?? '',
    hookActions: Array.isArray(plan?.hookActions) ? plan.hookActions : [],
    pacingTag: plan?.pacingTag ?? 'slow_build',
  };
}

interface ExpandedInspiration {
  corePremise: string;
  eraContext: string;
  centralConflict: string;
  protagonistPosition: string;
  powerSystem: string;
}

async function expandInspiration(
  provider: ReturnType<typeof getStudioLLMProvider>,
  title: string,
  genre: string,
  brief: string,
  targetChapters?: number
): Promise<ExpandedInspiration> {
  const genreExpansionHints: Record<string, string> = {
    xianxia:
      '核心设定须包含修炼体系的境界划分和突破规则；能力体系须明确灵气/真元/仙力的获取与消耗机制；演变阶段须体现从凡人到仙人到超脱的递进',
    fantasy:
      '核心设定须包含魔法/异能体系的运作规则和限制；能力体系须明确魔力来源、使用代价和成长路径；演变阶段须体现能力觉醒→掌握→超越的递进',
    urban:
      '核心设定须基于现实可推演的商业模式/技术/社会趋势；能力体系须符合现实逻辑（如商业头脑、技术专长、人脉资源）；时代背景须对应具体的现代都市社会结构',
    'sci-fi':
      '核心设定须包含可自洽推演的科技设定；能力体系须明确技术来源、使用限制和副作用；演变阶段须体现技术突破→社会冲击→适应/抵抗的辩证发展',
    history:
      '核心设定须明确具体的历史时期和年号；能力体系须受时代技术和社会制度约束；时代背景须包含该时期的权力结构、社会矛盾和关键历史事件；禁止跨时代设定',
    game: '核心设定须包含完整的游戏机制规则体系；能力体系须明确等级、技能、装备的获取路径和限制；演变阶段须体现游戏进度的新手→进阶→巅峰',
    horror:
      '核心设定须包含悬疑/恐怖事件的逻辑因果链；能力体系须明确角色可用的推理/对抗手段及其限制；演变阶段须体现谜团→线索→推理→真相的递进',
    romance:
      '核心设定须包含角色情感发展的核心驱动因素；能力体系侧重角色的人格魅力、情感表达方式和成长变化；演变阶段须体现情感从试探到深化的递进',
    fanfic:
      '核心设定须在原作世界观框架内展开；能力体系须与原作设定一致；时代背景须与原作设定对齐；禁止与原作核心设定冲突',
  };

  const genreHint = genreExpansionHints[genre] ?? '';

  const scaleHint =
    targetChapters && targetChapters > 100
      ? `\n## 目标规模\n本书计划 ${targetChapters} 章以上（超长篇），核心设定和演变阶段须足以支撑长线叙事，至少规划5个以上明确的演变阶段，矛盾主线须有多层升级路径。`
      : targetChapters && targetChapters > 30
        ? `\n## 目标规模\n本书计划约 ${targetChapters} 章（中长篇），核心设定须有3-4个演变阶段，矛盾主线须有明确的升级路径。`
        : '';

  const prompt = `你是一位资深网络小说策划师。用户给出了一个创作灵感，请将其扩展为结构化创作简报。

## 书名
${title}

## 题材
${genre}

## 用户灵感
${brief}
${scaleHint}

## 关键词分析
请仔细分析用户灵感中的核心概念，忠实还原用户意图，不可曲解或替换用户使用的词汇。例如：
- 如果用户说"仓库"，指的是物理仓储/物资存储空间，不可理解为"知识库""策略库""技能库"
- 如果用户说"穿越"，指的是现代人穿越到古代，不可理解为"时空旅行者"或"本地人觉醒"
- 如果用户说"战略"，在军事语境下指的是战略级别的物资/资源/军事能力，不可理解为"策略""计策""兵法"
- 如果用户说"战略仓库"，这是一个整体概念，指军事战略级别的物资储备仓库，包含武器、装备、粮草、军需品等实体物资，而不是游戏化的"背包"或"空间"系统
- 禁止自行添加用户灵感中未提及的设定（如"精神力""灵力""修仙体系"等），能力体系的限制和代价必须基于现实军事/物流逻辑

## 题材扩展指引
${genreHint}

## 输出要求

请输出 JSON，包含以下字段：

1. corePremise（字符串）：核心设定，**必须忠实还原用户灵感中的核心概念**。详细描述：
   - 用户灵感中的金手指到底是什么（不可擅自替换为"知识""策略""技能"等概念）
   - 金手指如何运作：来源、触发条件、使用方式
   - 有什么限制和代价（数量限制、使用代价、副作用）
   - 随故事推进会经历什么演变阶段（至少3个阶段，每阶段要有具体变化）

2. eraContext（字符串）：时代背景。包括：
   - 具体历史时期和年号（不可跨时代）
   - 该时代的权力结构和社会特征
   - 与主角设定相关的关键历史事件

3. centralConflict（字符串）：贯穿全书的矛盾主线。需具体描述：
   - 主角面临的核心两难（需与核心设定直接绑定）
   - 外部压力的来源和升级路径
   - 矛盾的最终解决方向

4. protagonistPosition（字符串）：主角定位。包括：
   - 起始身份（现代人穿越后的初始处境）
   - 核心优势（来自金手指）和致命弱点（对金手指的依赖）
   - 终局目标和代价

5. powerSystem（字符串）：能力体系的约束与成长。包括：
   - 金手指的资源/能力具体是什么（不可笼统说"知识"或"策略"，必须具体到物资类型、功能范围）
   - 使用代价和限制条件（每次使用的消耗、恢复机制、容量限制）
   - 成长/升级的里程碑（容量扩大、功能解锁、副作用减弱等）

每个字段至少 200 字，确保内容具体、有细节、可操作。**核心设定必须与用户灵感的原始含义一致，不可自由曲解。**`;

  const EXPANSION_RULES: LLMOutputRule[] = [
    { field: 'corePremise', type: 'min_string_length', min: 50 },
    { field: 'eraContext', type: 'min_string_length', min: 50 },
    { field: 'centralConflict', type: 'min_string_length', min: 50 },
    { field: 'protagonistPosition', type: 'min_string_length', min: 50 },
    { field: 'powerSystem', type: 'min_string_length', min: 50 },
  ];

  const genreDefaultFallbacks: Record<string, ExpandedInspiration> = {
    xianxia: {
      corePremise: `${brief}的核心设定：主角踏上修仙之路，修炼体系有明确的境界划分与突破规则，随故事推进会逐步提升修为，但有天劫和心魔等限制与代价。`,
      eraContext: `故事设定在一个修仙世界，存在宗门、散修和妖族等势力，权力结构以修为境界为尊。`,
      centralConflict: `主角在修仙之路上面临资源争夺、宗门倾轧和天劫考验，须在修炼与入世之间寻找平衡。`,
      protagonistPosition: `主角从凡人起步，凭借机缘和悟性逐步崛起，但过度依赖外力可能导致根基不稳，终局目标是超脱天道。`,
      powerSystem: `修炼体系分练气、筑基、金丹等境界，突破需机缘和资源，每次突破都有心魔考验，境界越高天劫越强。`,
    },
    fantasy: {
      corePremise: `${brief}的核心设定：主角觉醒了独特的魔法/异能，有明确的运作规则和限制，随故事推进会逐步掌握和超越。`,
      eraContext: `故事设定在一个魔法与异能并存的世界，存在公会、王国和暗势力等多方势力。`,
      centralConflict: `主角在探索自身能力的同时，卷入了更大的势力纷争，必须在成长与抉择中找到自己的道路。`,
      protagonistPosition: `主角从能力觉醒起步，凭借独特异能逐步崛起，但能力使用有代价，终局目标是掌握真正的力量。`,
      powerSystem: `能力体系有明确的魔力来源和使用限制，过度使用会导致反噬，随修为提升可解锁新能力但代价递增。`,
    },
    urban: {
      corePremise: `${brief}的核心设定：主角在现代社会中获得了独特优势，基于现实可推演的商业/技术/人脉体系运作。`,
      eraContext: `故事设定在当代都市，社会结构以商业和人际网络为核心，权力来自财富和影响力。`,
      centralConflict: `主角在利用自身优势获得发展空间的同时，面临职场竞争、人际纠葛和道德抉择。`,
      protagonistPosition: `主角从底层起步，凭借独特优势逐步逆袭，但过度依赖可能导致信任危机，终局目标是实现真正的自我价值。`,
      powerSystem: `核心优势基于现实逻辑（商业头脑、技术专长、人脉资源），使用需付出时间或信誉代价，成长路径依赖积累和决策。`,
    },
    'sci-fi': {
      corePremise: `${brief}的核心设定：基于可自洽推演的科技设定，主角的技术突破有明确的科学依据和使用限制。`,
      eraContext: `故事设定在科技高度发展的未来或平行世界，社会结构受技术深度影响，存在技术垄断和资源争夺。`,
      centralConflict: `主角的技术突破引发了社会冲击，必须在技术进步与伦理边界之间做出抉择。`,
      protagonistPosition: `主角从技术突破者起步，在技术与社会碰撞中逐步成长，但技术依赖可能带来副作用，终局目标是找到技术与人文的平衡。`,
      powerSystem: `技术体系有明确的运作规则和副作用，过度使用会导致不可逆的后果，技术升级需要解决新的难题。`,
    },
    history: {
      corePremise: `${brief}的核心设定：主角置身于特定历史时期，必须在真实的历史框架和权力结构中寻找生存与发展之路。`,
      eraContext: `故事设定在具体的历史时期，权力结构和社会制度受时代约束，重大历史事件不可更改。`,
      centralConflict: `主角在历史洪流中面临权谋与道义的抉择，须在维护自身利益与顺应大势之间寻找出路。`,
      protagonistPosition: `主角从小人物或特殊身份起步，凭借对历史的洞察逐步崛起，但改变历史可能带来不可预知的后果。`,
      powerSystem: `能力受时代技术和社会制度约束，成长依赖人脉和时机，不可逾越时代限制。`,
    },
    game: {
      corePremise: `${brief}的核心设定：故事在游戏或类游戏世界中展开，有完整的等级、技能和装备体系。`,
      eraContext: `故事设定在虚拟游戏世界或游戏化的现实，规则明确、数据可见，存在玩家和NPC的复杂关系。`,
      centralConflict: `主角在游戏世界中追求巅峰，但游戏规则的深层秘密和现实世界的联系构成了核心矛盾。`,
      protagonistPosition: `主角从新手起步，凭借独特策略和机遇逐步升级，但过度投入游戏可能导致现实与虚拟的失衡。`,
      powerSystem: `游戏机制明确（等级、技能、装备），升级需经验和资源，存在稀有道具和隐藏职业，成长路径依赖策略选择。`,
    },
    horror: {
      corePremise: `${brief}的核心设定：故事围绕悬疑/恐怖事件展开，事件背后有严密的逻辑因果链，真相逐步揭示。`,
      eraContext: `故事设定在一个暗藏秘密的环境中，表面平静下暗流涌动，每个角色都可能隐藏着关键信息。`,
      centralConflict: `主角在追寻真相的过程中面临层层危险和心理考验，必须在恐惧与理性之间保持平衡。`,
      protagonistPosition: `主角从旁观者或意外卷入者起步，凭借推理能力和勇气逐步接近真相，但每次深入都伴随更大的风险。`,
      powerSystem: `推理和对抗手段受现实约束，信息获取需付出代价（冒险、信任风险），线索拼接是成长的核心方式。`,
    },
    romance: {
      corePremise: `${brief}的核心设定：故事围绕角色之间的情感发展展开，核心驱动因素与人物性格和处境深度绑定。`,
      eraContext: `故事设定在特定的社交和情感环境中，人物关系错综复杂，情感发展受社会规范和个人经历影响。`,
      centralConflict: `主角在情感追求与现实阻碍之间挣扎，必须在自我成长与亲密关系之间找到平衡。`,
      protagonistPosition: `主角从情感试探起步，在相处中逐步深化情感，但情感依赖可能导致自我迷失，终局目标是实现独立而深刻的情感联结。`,
      powerSystem: `情感能力体现为人格魅力、共情能力和表达方式，成长表现为从自我封闭到开放信任，每步推进需面对内心创伤。`,
    },
    fanfic: {
      corePremise: `${brief}的核心设定：故事在原作世界观框架内展开，与原作设定保持一致，不可与原作核心设定冲突。`,
      eraContext: `故事沿用原作的时代背景和世界观，权力结构和社会规则与原作对齐。`,
      centralConflict: `主角在原作世界线中面临新的挑战，必须在遵循原作逻辑的同时探索新的可能性。`,
      protagonistPosition: `主角从原作中的特定位置起步，凭借对原作剧情的了解或独特能力介入，但改变剧情可能引发蝴蝶效应。`,
      powerSystem: `能力体系与原作设定一致，成长路径受原作规则约束，新能力需与原作逻辑自洽。`,
    },
  };

  const EXPANSION_DEFAULTS: ExpandedInspiration = genreDefaultFallbacks[genre] ?? {
    corePremise: `${brief}的核心设定：主角拥有独特的优势，能在特定条件下触发使用，但有明确的限制和代价，随故事推进会逐步演变和升级。`,
    eraContext: `故事设定在一个具有独特社会结构和权力体系的时代，主角需要在其中找到自己的位置和生存之道。`,
    centralConflict: `主角在利用自身优势获得发展空间的同时，面临外部环境的压力和内部成长的挑战，需要在矛盾中不断抉择和突破。`,
    protagonistPosition: `主角从一个特殊身份起步，凭借独特优势逐步崛起，但也面临依赖优势的风险，最终目标是实现真正的独立和成长。`,
    powerSystem: `主角的核心能力有明确的运作规则、使用限制和成长路径，每次使用都有消耗和代价，能力随故事推进逐步解锁新功能。`,
  };

  try {
    const result = await generateJSONWithValidation<ExpandedInspiration>(
      provider,
      prompt,
      EXPANSION_RULES,
      {
        temperature: 0.7,
        agentName: 'InspirationExpander',
        retry: { maxRetries: 2, retryDelayMs: 1000 },
      }
    );
    return fillDefaults(
      {
        corePremise: typeof result.corePremise === 'string' ? result.corePremise : '',
        eraContext: typeof result.eraContext === 'string' ? result.eraContext : '',
        centralConflict: typeof result.centralConflict === 'string' ? result.centralConflict : '',
        protagonistPosition:
          typeof result.protagonistPosition === 'string' ? result.protagonistPosition : '',
        powerSystem: typeof result.powerSystem === 'string' ? result.powerSystem : '',
      },
      EXPANSION_DEFAULTS
    );
  } catch {
    return EXPANSION_DEFAULTS;
  }
}

function buildExpandedBrief(title: string, brief: string, expansion: ExpandedInspiration): string {
  const parts = [
    brief,
    expansion.corePremise ? `\n\n【核心设定】${expansion.corePremise}` : '',
    expansion.eraContext ? `\n\n【时代背景】${expansion.eraContext}` : '',
    expansion.centralConflict ? `\n\n【矛盾主线】${expansion.centralConflict}` : '',
    expansion.protagonistPosition ? `\n\n【主角定位】${expansion.protagonistPosition}` : '',
    expansion.powerSystem ? `\n\n【能力体系】${expansion.powerSystem}` : '',
  ];
  return parts.filter(Boolean).join('');
}

async function buildStoryBootstrap(bookId: string, chapterNumber: number) {
  const book = readStudioBookRuntime(bookId);
  if (!book?.brief?.trim()) {
    return { error: '缺少创作灵感或创作简报' } as const;
  }

  const provider = getStudioLLMProvider();
  const genre = normalizeGenreForAgents(book.genre);

  // 灵感扩展：如果已有 expandedBrief 且原始 brief 未变（expandedBrief 以当前 brief 开头），则复用；否则重新扩展
  const existingExpandedBrief = book.expandedBrief?.trim() ?? '';
  const currentBrief = book.brief?.trim() ?? '';
  const briefUnchanged =
    existingExpandedBrief.length > 0 &&
    currentBrief.length > 0 &&
    existingExpandedBrief.startsWith(currentBrief);
  let expandedBrief: string;
  let expansion: ExpandedInspiration | null = null;
  if (briefUnchanged) {
    expandedBrief = existingExpandedBrief;
  } else {
    expansion = await expandInspiration(
      provider,
      book.title,
      genre,
      book.brief,
      book.targetChapterCount
    );
    expandedBrief = buildExpandedBrief(book.title, book.brief ?? '', expansion);
  }

  // 从 expandedBrief 中提取 eraContext（当 expansion 为 null 时，尝试从文本中解析）
  let eraContext = expansion?.eraContext ?? '';
  if (!eraContext && expandedBrief.includes('【时代背景】')) {
    const eraMatch = expandedBrief.match(/【时代背景】([\s\S]*?)(?=\n【|$)/);
    if (eraMatch) {
      eraContext = eraMatch[1].trim();
    }
  }

  const outlineAgent = new OutlinePlanner(provider);
  const outlineResult = await outlineAgent.execute({
    bookId,
    promptContext: {
      brief: {
        title: book.title,
        genre,
        brief: expandedBrief,
        targetChapters: book.targetChapterCount,
      },
    },
  });

  if (!outlineResult.success || !outlineResult.data) {
    return { error: outlineResult.error ?? '自动大纲规划失败' } as const;
  }

  const outline = outlineResult.data as OutlineResult;
  const outlineText = serializeOutline(outline);
  const WORLD_BOOTSTRAP_RULES: LLMOutputRule[] = [
    { field: 'currentFocus', type: 'min_string_length', min: 20 },
    { field: 'centralConflict', type: 'min_string_length', min: 20 },
    { field: 'growthArc', type: 'min_string_length', min: 20 },
    { field: 'worldRules', type: 'min_array_length', min: 3 },
    { field: 'hooks', type: 'min_array_length', min: 3 },
  ];

  const rawWorldBootstrap = await generateJSONWithValidation<{
    currentFocus: string;
    centralConflict: string;
    growthArc: string;
    worldRules: string[];
    hooks: string[];
  }>(
    provider,
    `你是一位专业的网络小说世界观构建师。请根据创作灵感生成书籍级规划。

## 书名
${book.title}

## 题材
${genre}

## 创作灵感
${expandedBrief}

## 大纲参考
${outlineText}

## 输出要求

请输出 JSON，包含以下字段：

1. currentFocus（字符串）：当前故事焦点，描述开篇阶段的核心叙事目标
2. centralConflict（字符串）：贯穿全书的矛盾主线，需与核心设定深度绑定
3. growthArc（字符串）：主角成长弧线，从起点到终点的蜕变轨迹
4. worldRules（字符串数组，5-10条）：世界运行规则，必须包含：
   - 核心设定（金手指/能力体系）的运作规则与限制
   - 时代背景下的社会规则与权力结构
   - 核心设定随故事推进的演变规则
   每条规则需具体、可操作，避免空泛描述
5. hooks（字符串数组，5-8条）：全书级伏笔，需包含：
   - 与核心设定直接相关的悬念（至少2条）
   - 角色关系的潜在冲突点
   - 时代背景下的历史事件钩子
   每条伏笔需有具体的埋设场景暗示，避免泛泛而谈`,
    WORLD_BOOTSTRAP_RULES,
    {
      temperature: 0.7,
      agentName: 'StoryBootstrapPlanner',
      retry: { maxRetries: 2, retryDelayMs: 1000 },
    }
  ).catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`世界观构建失败: ${msg}`);
  });

  const ensureString = (v: unknown): string => {
    if (typeof v === 'string') return v;
    if (Array.isArray(v))
      return v.map((item) => (typeof item === 'string' ? item : JSON.stringify(item))).join('；');
    if (v != null && typeof v === 'object') return JSON.stringify(v);
    return v != null ? String(v) : '';
  };
  const worldBootstrap = fillDefaults(
    {
      currentFocus:
        ensureString(rawWorldBootstrap.currentFocus) ||
        `${book.title}开篇：主角初入新世界，发现自身独特优势，开始在陌生环境中探索和适应。`,
      centralConflict:
        ensureString(rawWorldBootstrap.centralConflict) ||
        `主角在利用自身优势发展的同时，面对外部环境的压力和内部成长的抉择。`,
      growthArc:
        ensureString(rawWorldBootstrap.growthArc) ||
        `主角从初入世界的迷茫者，逐步学会利用优势、面对挑战，最终成长为具有独立判断力的强者。`,
      worldRules: Array.isArray(rawWorldBootstrap.worldRules)
        ? rawWorldBootstrap.worldRules.filter((r): r is string => typeof r === 'string')
        : [],
      hooks: Array.isArray(rawWorldBootstrap.hooks)
        ? rawWorldBootstrap.hooks.filter((h): h is string => typeof h === 'string')
        : [],
    },
    {
      worldRules: [
        `核心设定有明确的运作规则和使用限制`,
        `社会结构存在清晰的权力层级和资源分配机制`,
        `核心优势随故事推进会逐步演变和升级`,
        `过度依赖核心优势会导致副作用和风险`,
      ],
      hooks: [
        `主角的核心优势背后隐藏着未知的秘密和来源`,
        `某个关键角色与主角存在潜在的利益冲突`,
        `一个看似偶然的事件实际上与核心设定深度关联`,
      ],
    }
  );

  const characterAgent = new CharacterDesigner(provider);
  const characterResult = await characterAgent.execute({
    bookId,
    promptContext: {
      brief: {
        title: book.title,
        genre,
        brief: expandedBrief,
        characterCount: 3,
      },
      outline: outlineText,
      eraContext,
    },
  });

  if (!characterResult.success || !characterResult.data) {
    return { error: characterResult.error ?? '自动角色设计失败' } as const;
  }

  const characterDesign = characterResult.data as CharacterDesignResult;
  const characters = Array.isArray(characterDesign.characters) ? characterDesign.characters : [];
  const characterNames = characters.map((character) => character.name);
  const planningBrief = buildBootstrapPlanningBrief(outline, worldBootstrap, characterDesign);
  const chapterAnchor = buildBootstrapChapterAnchor(outline, chapterNumber);
  const chapterBrief = buildBootstrapChapterBrief({
    rawBrief: book.brief ?? '',
    expandedBrief,
    planningBrief,
    currentFocus: worldBootstrap.currentFocus,
    centralConflict: worldBootstrap.centralConflict,
    growthArc: worldBootstrap.growthArc,
    chapterAnchor,
  });
  const openHooks: Hook[] = dedupeByKey<Hook>(
    (Array.isArray(worldBootstrap.hooks) ? worldBootstrap.hooks : []).map((description, index) => ({
      id: `hook-bootstrap-${index + 1}`,
      description,
      type: 'plot' as const,
      status: 'open' as const,
      priority: index === 0 ? ('major' as const) : ('minor' as const),
      plantedChapter: chapterNumber,
      relatedCharacters: characterNames.slice(0, 2),
      relatedChapters: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })),
    (hook) => hook.description
  );

  const chapterPlanner = new ChapterPlanner(provider);
  const chapterPlanResult = await chapterPlanner.execute({
    bookId,
    promptContext: {
      brief: {
        title: book.title,
        genre,
        brief: chapterBrief,
        chapterNumber,
        wordCountTarget: book.targetWordsPerChapter,
      },
      currentFocus: worldBootstrap.currentFocus,
      centralConflict: worldBootstrap.centralConflict,
      growthArc: worldBootstrap.growthArc,
      chapterAnchor,
      candidateWorldRules: worldBootstrap.worldRules,
      characters: characters.map((c) => {
        const traits = Array.isArray(c.traits)
          ? c.traits.join('、')
          : typeof c.traits === 'string'
            ? c.traits
            : '';
        return `${c.name}（${c.role}）${traits ? `— ${traits}` : ''}：${c.arc ?? ''}`;
      }),
      outline: outlineText,
      openHooks: openHooks.map((hook) => ({
        description: hook.description,
        type: hook.type,
        status: hook.status,
        priority: hook.priority,
        plantedChapter: hook.plantedChapter,
      })),
    },
  });

  if (!chapterPlanResult.success || !chapterPlanResult.data) {
    return { error: chapterPlanResult.error ?? '自动章节规划失败' } as const;
  }

  const chapterPlan = chapterPlanResult.data as ChapterPlanResult;
  const plan = normalizeBootstrapChapterPlan({
    chapterNumber,
    currentFocus: worldBootstrap.currentFocus,
    chapterAnchor,
    characterNames,
    bootstrapWorldRules: Array.isArray(worldBootstrap.worldRules) ? worldBootstrap.worldRules : [],
    plan: chapterPlan.plan,
  });
  const planHooks = (Array.isArray(plan.hooks) ? plan.hooks : []).filter(
    (h): h is { description: string; type: string; priority: string } =>
      h != null && typeof h === 'object'
  );
  const planCharacters = Array.isArray(plan.characters) ? plan.characters : [];
  const manifest = loadBookManifest(bookId);
  const mergedHooksRaw = dedupeByKey(
    [
      ...manifest.hooks,
      ...openHooks,
      ...(planHooks.map((hook, index) => ({
        id: `hook-plan-${index + 1}-${randomUUID().slice(0, 6)}`,
        description: hook.description,
        type: hook.type || 'plot',
        status: 'open' as const,
        priority: (hook.priority === 'critical' ||
        hook.priority === 'major' ||
        hook.priority === 'minor'
          ? hook.priority
          : 'major') as Hook['priority'],
        plantedChapter: chapterNumber,
        relatedCharacters: planCharacters,
        relatedChapters: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })) as Hook[]),
    ],
    (hook) => hook.description
  ) as Hook[];

  // 重新编号避免 ID 冲突
  const mergedHooks = mergedHooksRaw.map((hook, index) => ({
    ...hook,
    id: `hook-${index + 1}`,
  }));

  const nextManifest = {
    ...manifest,
    currentFocus: worldBootstrap.currentFocus,
    worldRules: dedupeByKey(
      [
        ...manifest.worldRules,
        ...(Array.isArray(worldBootstrap.worldRules) ? worldBootstrap.worldRules : []).map(
          (rule, index) => ({
            id: `rule-bootstrap-${index + 1}`,
            category: 'story',
            rule,
            exceptions: [],
            sourceChapter: chapterNumber,
          })
        ),
      ],
      (rule) => rule.rule
    ),
    characters: dedupeByKey(
      [
        ...manifest.characters,
        ...characters.map((character, index) => ({
          id: `char-bootstrap-${index + 1}`,
          name: character.name,
          role: character.role,
          traits: Array.isArray(character.traits)
            ? character.traits
            : typeof character.traits === 'string'
              ? [character.traits]
              : [],
          relationships:
            typeof character.relationships === 'object' &&
            character.relationships !== null &&
            !Array.isArray(character.relationships)
              ? character.relationships
              : {},
          arc: character.arc,
          firstAppearance: chapterNumber,
        })),
      ],
      (character) => character.name
    ),
    hooks: mergedHooks,
    chapterPlans: {
      ...manifest.chapterPlans,
      [String(chapterNumber)]: {
        chapterNumber: plan.chapterNumber ?? chapterNumber,
        title: plan.title ?? '',
        intention: plan.intention ?? '',
        wordCountTarget: plan.wordCountTarget ?? book.targetWordsPerChapter ?? 3000,
        characters: planCharacters,
        keyEvents: Array.isArray(plan.keyEvents) ? plan.keyEvents : [],
        hooks: planHooks.map((h) => ({
          description: h.description,
          type: h.type || 'plot',
          priority: h.priority || 'minor',
        })),
        worldRules: Array.isArray(plan.worldRules) ? plan.worldRules : [],
        emotionalBeat: plan.emotionalBeat ?? '',
        sceneTransition: plan.sceneTransition ?? '',
        openingHook: plan.openingHook ?? '',
        closingHook: plan.closingHook ?? '',
        sceneBreakdown: Array.isArray(plan.sceneBreakdown) ? plan.sceneBreakdown : [],
        characterGrowthBeat: plan.characterGrowthBeat ?? '',
        hookActions: Array.isArray(plan.hookActions) ? plan.hookActions : [],
        pacingTag: plan.pacingTag ?? 'slow_build',
        createdAt: new Date().toISOString(),
      },
    },
    outline: Array.isArray(outline.acts)
      ? outline.acts.map((act) => ({
          actNumber: act.actNumber,
          title: act.title,
          summary: act.summary,
          chapters: Array.isArray(act.chapters)
            ? act.chapters.map((ch) => ({
                chapterNumber: ch.chapterNumber,
                title: ch.title,
                summary: ch.summary,
              }))
            : [],
        }))
      : [],
    updatedAt: new Date().toISOString(),
  };

  saveBookManifest(bookId, nextManifest);

  updateStudioBookRuntime({
    ...book,
    expandedBrief,
    planningBrief,
    updatedAt: new Date().toISOString(),
  });

  return {
    success: true,
    currentFocus: worldBootstrap.currentFocus,
    centralConflict: worldBootstrap.centralConflict,
    growthArc: worldBootstrap.growthArc,
    worldRules: Array.isArray(worldBootstrap.worldRules) ? worldBootstrap.worldRules : [],
    characters: characters.map((character) => ({
      name: character.name,
      role: character.role,
      arc: character.arc,
      traits: character.traits,
    })),
    hooks: mergedHooks.map((hook) => hook.description),
    chapterPlan: {
      chapterNumber: plan.chapterNumber ?? chapterNumber,
      title: plan.title ?? '',
      summary: plan.intention ?? '',
      characters: planCharacters,
      keyEvents: Array.isArray(plan.keyEvents) ? plan.keyEvents : [],
      hooks: planHooks.map((hook) => hook.description),
    },
  };
}

function buildBookScopedIntent(bookId: string, fallback: string) {
  const book = readStudioBookRuntime(bookId);
  const manifest = loadBookManifest(bookId);
  const parts = [
    manifest.currentFocus,
    book?.planningBrief,
    book?.brief,
    manifest.worldRules.length > 0
      ? `世界设定：${manifest.worldRules
          .slice(0, 3)
          .map((rule) => rule.rule)
          .join('；')}`
      : '',
    manifest.characters.length > 0
      ? `关键角色：${manifest.characters
          .slice(0, 3)
          .map((character) => character.name)
          .join('、')}`
      : '',
    manifest.hooks.length > 0
      ? `当前伏笔：${manifest.hooks
          .filter((hook) => ['open', 'progressing', 'deferred', 'dormant'].includes(hook.status))
          .slice(0, 2)
          .map((hook) => hook.description)
          .join('；')}`
      : '',
  ].filter((part): part is string => Boolean(part && part.trim()));

  return parts.join('；') || fallback;
}

function mergeIntentWithBookContext(bookId: string, intent: string | undefined, fallback: string) {
  const baseContext = buildBookScopedIntent(bookId, fallback).trim();
  const chapterIntent = intent?.trim() ?? '';

  if (!chapterIntent) {
    return baseContext;
  }

  if (!baseContext) {
    return chapterIntent;
  }

  return `${baseContext}；${chapterIntent}`;
}

function mergeOutlineContextWithBookContext(bookId: string, outlineContext: string | undefined) {
  const baseContext = buildBookScopedIntent(bookId, '').trim();
  const chapterContext = outlineContext?.trim() ?? '';

  if (!chapterContext) {
    return baseContext;
  }

  if (!baseContext) {
    return chapterContext;
  }

  return `${baseContext}\n${chapterContext}`;
}

function resolveFastDraftChapterNumber(bookId: string) {
  const manifest = loadBookManifest(bookId);
  return Math.max(manifest.lastChapterWritten + 1, 1);
}

function buildBookContextFromManifest(bookId: string): string {
  const manifest = loadBookManifest(bookId);
  const lines: string[] = [];

  if (manifest.currentFocus) {
    lines.push(`当前焦点: ${manifest.currentFocus}`);
  }

  if (manifest.characters.length > 0) {
    lines.push('角色:');
    for (const c of manifest.characters) {
      const traits = Array.isArray(c.traits)
        ? c.traits.join('、')
        : typeof c.traits === 'string'
          ? c.traits
          : '';
      lines.push(`  - ${c.name}(${c.role})${traits ? `: ${traits}` : ''}`);
    }
  }

  const activeHooks = manifest.hooks.filter(
    (h) => h.status === 'open' || h.status === 'progressing'
  );
  if (activeHooks.length > 0) {
    lines.push('进行中伏笔:');
    for (const h of activeHooks) {
      lines.push(`  - [${h.priority}] ${h.description}`);
    }
  }

  if (manifest.worldRules.length > 0) {
    lines.push('世界规则:');
    for (const r of manifest.worldRules) {
      lines.push(`  - [${r.category}] ${r.rule}`);
    }
  }

  return lines.join('\n');
}

function createPipelineEntry() {
  const id = `pipeline-${Date.now()}`;
  const stages = ['planning', 'composing', 'writing', 'auditing', 'revising', 'persisting'];
  pipelineStore.set(id, {
    pipelineId: id,
    status: 'running',
    stages,
    currentStage: stages[0],
    progress: Object.fromEntries(
      stages.map((s) => [s, { status: s === stages[0] ? 'running' : 'pending', elapsedMs: 0 }])
    ),
    startedAt: new Date().toISOString(),
  });
  return id;
}

function markCurrentStage(pipelineId: string, stage: string): void {
  const pipeline = pipelineStore.get(pipelineId);
  if (!pipeline) {
    return;
  }

  pipeline.currentStage = stage;
  for (const [name, progress] of Object.entries(pipeline.progress)) {
    if (name === stage) {
      progress.status = 'running';
    } else if (progress.status !== 'completed') {
      progress.status = 'pending';
    }
  }
}

function finalizePipeline(
  pipelineId: string,
  result: {
    success: boolean;
    chapterNumber: number;
    status?: string;
    persisted?: boolean;
    error?: string;
  }
): void {
  const pipeline = pipelineStore.get(pipelineId);
  if (!pipeline) {
    return;
  }

  pipeline.status = result.success ? 'completed' : 'failed';
  pipeline.currentStage = result.success ? 'persisting' : pipeline.currentStage;
  pipeline.finishedAt = new Date().toISOString();
  pipeline.result = result;

  for (const progress of Object.values(pipeline.progress)) {
    progress.status = result.success
      ? 'completed'
      : progress.status === 'running'
        ? 'failed'
        : progress.status;
  }
}

export function createPipelineRouter(): Hono {
  const router = new Hono();

  // POST /api/books/:bookId/pipeline/write-next
  router.post('/write-next', async (c) => {
    const bookId = c.req.param('bookId')!;
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const body = await c.req.json().catch(() => ({}));
    const result = writeNextSchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: result.error.errors[0].message } },
        400
      );
    }
    const pipelineId = createPipelineEntry();
    const userIntent = mergeIntentWithBookContext(
      bookId,
      result.data.userIntent ?? result.data.customIntent,
      `推进第 ${result.data.chapterNumber} 章主线`
    );

    eventHub.sendEvent(bookId, 'pipeline_progress', {
      pipelineId,
      status: 'running',
      currentStage: 'planning',
    });

    void (async () => {
      const book = readStudioBookRuntime(bookId);
      const runner = getStudioPipelineRunner(bookId);

      markCurrentStage(pipelineId, 'composing');
      const chapterResult = result.data.skipAudit
        ? await runner.writeDraft({
            bookId,
            chapterNumber: result.data.chapterNumber,
            title: `第 ${result.data.chapterNumber} 章`,
            genre: normalizeGenreForAgents(book?.genre),
            sceneDescription: userIntent,
            bookContext: buildBookContextFromManifest(bookId),
          })
        : await runner.composeChapter({
            bookId,
            chapterNumber: result.data.chapterNumber,
            title: `第 ${result.data.chapterNumber} 章`,
            genre: normalizeGenreForAgents(book?.genre),
            userIntent,
          });

      finalizePipeline(pipelineId, {
        success: chapterResult.success,
        chapterNumber: chapterResult.chapterNumber,
        status: chapterResult.status,
        persisted: chapterResult.persisted,
        error: chapterResult.error,
      });

      eventHub.sendEvent(bookId, 'pipeline_progress', pipelineStore.get(pipelineId));
      if (chapterResult.success) {
        eventHub.sendEvent(bookId, 'chapter_complete', {
          pipelineId,
          chapterNumber: chapterResult.chapterNumber,
          status: chapterResult.status,
        });
      }
    })();

    return c.json(
      {
        data: {
          pipelineId,
          status: 'running',
          stages: ['planning', 'composing', 'writing', 'auditing', 'revising', 'persisting'],
        },
      },
      202
    );
  });

  // POST /api/books/:bookId/pipeline/fast-draft
  router.post('/fast-draft', async (c) => {
    const bookId = c.req.param('bookId')!;
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const body = await c.req.json().catch(() => ({}));
    const result = fastDraftSchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: result.error.errors[0].message } },
        400
      );
    }

    const book = readStudioBookRuntime(bookId);
    const chapterNumber = resolveFastDraftChapterNumber(bookId);
    const draft = await getStudioPipelineRunner().writeFastDraft({
      bookId,
      chapterNumber,
      title: `第 ${chapterNumber} 章`,
      genre: normalizeGenreForAgents(book?.genre),
      sceneDescription: mergeIntentWithBookContext(
        bookId,
        result.data.customIntent,
        '快速试写当前主线'
      ),
      bookContext: buildBookContextFromManifest(bookId),
    });

    return c.json({
      data: {
        content: draft.content ?? '',
        wordCount: result.data.wordCount,
        elapsedMs: draft.usage?.totalTokens ?? 0,
        llmCalls: 1,
        draftId: `draft-temp-${Date.now()}`,
      },
    });
  });

  // POST /api/books/:bookId/pipeline/upgrade-draft
  router.post('/upgrade-draft', async (c) => {
    const bookId = c.req.param('bookId')!;
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const body = await c.req.json().catch(() => ({}));
    const result = upgradeDraftSchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: result.error.errors[0].message } },
        400
      );
    }
    const pipelineId = createPipelineEntry();
    eventHub.sendEvent(bookId, 'pipeline_progress', {
      pipelineId,
      status: 'running',
      currentStage: 'planning',
    });

    void (async () => {
      markCurrentStage(pipelineId, 'revising');
      const chapterResult = await getStudioPipelineRunner().upgradeDraft({
        bookId,
        chapterNumber: result.data.chapterNumber,
        userIntent: mergeIntentWithBookContext(bookId, result.data.userIntent, ''),
      });

      finalizePipeline(pipelineId, {
        success: chapterResult.success,
        chapterNumber: chapterResult.chapterNumber,
        status: chapterResult.status,
        persisted: chapterResult.persisted,
        error: chapterResult.error,
      });

      eventHub.sendEvent(bookId, 'pipeline_progress', pipelineStore.get(pipelineId));
      if (chapterResult.success) {
        eventHub.sendEvent(bookId, 'chapter_complete', {
          pipelineId,
          chapterNumber: chapterResult.chapterNumber,
          status: chapterResult.status,
        });
      }
    })();

    return c.json({ data: { pipelineId, status: 'running' } }, 202);
  });

  // POST /api/books/:bookId/pipeline/write-draft
  router.post('/write-draft', async (c) => {
    const bookId = c.req.param('bookId')!;
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const body = await c.req.json().catch(() => ({}));
    const result = writeDraftSchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: result.error.errors[0].message } },
        400
      );
    }

    const book = readStudioBookRuntime(bookId);
    const draft = await getStudioPipelineRunner().writeDraft({
      bookId,
      chapterNumber: result.data.chapterNumber,
      title: `第 ${result.data.chapterNumber} 章`,
      genre: normalizeGenreForAgents(book?.genre),
      sceneDescription: mergeIntentWithBookContext(bookId, undefined, '草稿模式推进主线'),
      bookContext: buildBookContextFromManifest(bookId),
    });

    if (!draft.success) {
      return c.json(
        {
          error: {
            code: 'DRAFT_WRITE_FAILED',
            message: draft.error ?? '草稿模式失败',
          },
        },
        500
      );
    }

    return c.json({
      data: {
        number: result.data.chapterNumber,
        title: null,
        content: draft.content ?? '',
        status: draft.status ?? 'draft',
        wordCount: draft.content?.length ?? 0,
        qualityScore: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
  });

  // POST /api/books/:bookId/pipeline/plan-chapter
  router.post('/plan-chapter', async (c) => {
    const bookId = c.req.param('bookId')!;
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const body = await c.req.json().catch(() => ({}));
    const result = planChapterSchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: result.error.errors[0].message } },
        400
      );
    }

    const runner = getStudioPipelineRunner(bookId);
    const planResult = await runner.planChapter({
      bookId,
      chapterNumber: result.data.chapterNumber,
      outlineContext: mergeOutlineContextWithBookContext(bookId, result.data.outlineContext),
    });

    if (!planResult.success) {
      return c.json({ error: { code: 'PLAN_FAILED', message: planResult.error } }, 500);
    }

    return c.json({ data: planResult });
  });

  // POST /api/books/:bookId/pipeline/bootstrap-story
  router.post('/bootstrap-story', async (c) => {
    const bookId = c.req.param('bookId')!;
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const body = await c.req.json().catch(() => ({}));
    const result = bootstrapStorySchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: result.error.errors[0].message } },
        400
      );
    }

    const chapterNumber = result.data.chapterNumber ?? resolveFastDraftChapterNumber(bookId);

    try {
      const bootstrapResult = await buildStoryBootstrap(bookId, chapterNumber);

      if ('error' in bootstrapResult) {
        return c.json({ error: { code: 'BOOTSTRAP_FAILED', message: bootstrapResult.error } }, 400);
      }

      return c.json({ data: bootstrapResult });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[bootstrap-story] unhandled error:', message);
      return c.json({ error: { code: 'INTERNAL_ERROR', message } }, 500);
    }
  });

  // GET /api/books/:bookId/pipeline/:pipelineId
  router.get('/:pipelineId', (c) => {
    const pipelineId = c.req.param('pipelineId')!;
    const pipeline = pipelineStore.get(pipelineId);
    if (!pipeline) {
      return c.json({ error: { code: 'PIPELINE_NOT_FOUND', message: '流水线不存在' } }, 404);
    }
    return c.json({ data: pipeline });
  });

  return router;
}
