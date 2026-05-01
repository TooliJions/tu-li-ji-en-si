import type { ChapterPlanResult, OutlineResult, CharacterDesignResult } from '@cybernovelist/core';

export function dedupeByKey<T>(items: T[], getKey: (item: T) => string): T[] {
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

export function normalizeStoredHookPlan(hook: unknown): ChapterPlanResult['plan']['hooks'][number] {
  return {
    description:
      typeof hook === 'object' && hook !== null && 'description' in hook
        ? String((hook as Record<string, unknown>).description)
        : String(hook),
    type:
      typeof hook === 'object' && hook !== null && 'type' in hook
        ? String((hook as Record<string, unknown>).type)
        : 'plot',
    priority:
      typeof hook === 'object' && hook !== null && 'priority' in hook
        ? String((hook as Record<string, unknown>).priority)
        : 'minor',
  };
}

export function buildBootstrapPlanningBrief(
  outline: OutlineResult,
  worldBootstrap: {
    centralConflict: string;
    growthArc: string;
  },
  characterDesign: CharacterDesignResult,
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
      character.arc?.trim() ? `${character.name}：${character.arc.trim()}` : character.name,
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

export function buildBootstrapChapterAnchor(outline: OutlineResult, chapterNumber: number): string {
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

export function buildBootstrapChapterBrief(input: {
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

export function normalizeBootstrapChapterPlan(input: {
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
    (name): name is string => typeof name === 'string' && validCharacterNames.has(name),
  );
  const fallbackCharacters = input.characterNames.slice(
    0,
    Math.min(2, input.characterNames.length),
  );
  const characters = normalizedCharacters.length > 0 ? normalizedCharacters : fallbackCharacters;

  const keyEvents = dedupeByKey(
    [
      ...(Array.isArray(plan?.keyEvents)
        ? plan.keyEvents.filter(
            (event): event is string => typeof event === 'string' && event.trim().length > 0,
          )
        : []),
      '交代主角当前处境并建立读者代入点',
      '用具体场景展示关键设定或世界规则',
      '抛出与主线相关的第一道冲突或悬念',
    ],
    (event) => event,
  ).slice(0, 5);

  const worldRules = dedupeByKey(
    [
      ...(Array.isArray(plan?.worldRules)
        ? plan.worldRules.filter(
            (rule): rule is string => typeof rule === 'string' && rule.trim().length > 0,
          )
        : []),
      ...input.bootstrapWorldRules.slice(0, 4),
    ],
    (rule) => rule,
  ).slice(0, 5);

  const hooks = (Array.isArray(plan?.hooks) ? plan.hooks : []).filter(
    (hook): hook is { description: string; type: string; priority: string } =>
      Boolean(
        hook &&
        typeof hook === 'object' &&
        typeof hook.description === 'string' &&
        hook.description.trim().length > 0,
      ),
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

export function buildExpandedBrief(
  title: string,
  brief: string,
  expansion: ExpandedInspiration,
): string {
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

export interface ExpandedInspiration {
  corePremise: string;
  eraContext: string;
  centralConflict: string;
  protagonistPosition: string;
  powerSystem: string;
}
