import { randomUUID } from 'node:crypto';
import {
  OutlinePlanner,
  CharacterDesigner,
  ChapterPlanner,
  type Hook,
  type CharacterDesignResult,
  type OutlineResult,
  type ChapterPlanResult,
  type LLMOutputRule,
  type LLMProvider,
  generateJSONWithValidation,
  fillDefaults,
} from '@cybernovelist/core';
import {
  readStudioBookRuntime,
  updateStudioBookRuntime,
  loadBookManifest,
  saveBookManifest,
} from '../../api/core-bridge';
import { normalizeGenreForAgents, serializeOutline } from '../../utils';
import {
  dedupeByKey,
  normalizeStoredHookPlan,
  buildBootstrapPlanningBrief,
  buildBootstrapChapterAnchor,
  buildBootstrapChapterBrief,
  normalizeBootstrapChapterPlan,
  buildExpandedBrief,
  type ExpandedInspiration,
} from './pipeline-helpers';
import { expandInspiration } from './pipeline-expansion';

export async function buildStoryBootstrap(
  bookId: string,
  chapterNumber: number,
  provider: LLMProvider,
) {
  const book = readStudioBookRuntime(bookId);
  if (!book?.brief?.trim()) {
    return { error: '缺少创作灵感或创作简报' } as const;
  }
  const genre = normalizeGenreForAgents(book.genre);

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
      book.targetChapterCount,
    );
    expandedBrief = buildExpandedBrief(book.title, book.brief ?? '', expansion);
  }

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
    `你是一位专业的网络小说世界观构建师。请根据创作灵感生成书籍级规划。\n\n## 书名\n${book.title}\n\n## 题材\n${genre}\n\n## 创作灵感\n${expandedBrief}\n\n## 大纲参考\n${outlineText}\n\n## 输出要求\n\n请输出 JSON，包含以下字段：\n\n1. currentFocus（字符串）：当前故事焦点，描述开篇阶段的核心叙事目标\n2. centralConflict（字符串）：贯穿全书的矛盾主线，需与核心设定深度绑定\n3. growthArc（字符串）：主角成长弧线，从起点到终点的蜕变轨迹\n4. worldRules（字符串数组，5-10条）：世界运行规则，必须包含：\n   - 核心设定（金手指/能力体系）的运作规则与限制\n   - 时代背景下的社会规则与权力结构\n   - 核心设定随故事推进的演变规则\n   每条规则需具体、可操作，避免空泛描述\n5. hooks（字符串数组，5-8条）：全书级伏笔，需包含：\n   - 与核心设定直接相关的悬念（至少2条）\n   - 角色关系的潜在冲突点\n   - 时代背景下的历史事件钩子\n   每条伏笔需有具体的埋设场景暗示，避免泛泛而谈`,
    WORLD_BOOTSTRAP_RULES,
    {
      temperature: 0.7,
      agentName: 'StoryBootstrapPlanner',
      retry: { maxRetries: 2, retryDelayMs: 1000 },
    },
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
    },
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
    (hook) => hook.description,
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
      h != null && typeof h === 'object',
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
    (hook) => hook.description,
  ) as Hook[];

  const mergedHooks = mergedHooksRaw.map((hook, index) => ({
    ...hook,
    id: `hook-${index + 1}`,
  }));

  const nextManifest: ReturnType<typeof loadBookManifest> = {
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
          }),
        ),
      ],
      (rule) => rule.rule,
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
      (character) => character.name,
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
        hooks: planHooks.map(normalizeStoredHookPlan),
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
