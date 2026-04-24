import * as fs from 'fs';
import * as path from 'path';
import type { StateManager } from '../state/manager';
import type { RuntimeStateStore } from '../state/runtime-store';
import { applyRuntimeStateDelta } from '../state/reducer';
import type { Manifest } from '../models/state';
import type { LLMProvider } from '../llm/provider';
import { GENRE_WRITER_STYLE_MAP } from '../agents/genre-guidance';
import {
  countChineseWords,
  stripFrontmatter,
  normalizeFactCategory,
  normalizeFactConfidence,
  normalizeHookType,
  normalizeHookStatus,
  normalizeHookPriority,
  normalizeStringArray,
  normalizeChapterArray,
  toPositiveNumber,
  findChapterEntry,
  normalizeChapterEntry,
} from '../utils';
import { ProjectionRenderer } from '../state/projections';
import type { WriteDraftInput, WriteNextChapterInput } from './types';
import type { ChapterPlan } from '../agents/chapter-planner';

export function warnIgnoredError(context: string, error: unknown): void {
  console.warn(
    `[PipelineRunner] ${context}: ${error instanceof Error ? error.message : String(error)}`
  );
}

// ── Prompt Builders ─────────────────────────────────────────────

export function buildDraftPrompt(input: WriteDraftInput): string {
  return `你是一位专业的网络小说作家。请根据以下信息撰写章节内容。

## 基本信息
- **章节**: 第 ${input.chapterNumber} 章 — ${input.title}
- **题材**: ${input.genre}
- **场景描述**: ${input.sceneDescription}
${input.previousChapterContent ? `\n## 上一章内容参考\n${input.previousChapterContent.substring(0, 500)}` : ''}
${(input as WriteDraftInput & { bookContext?: string }).bookContext ? `\n## 书籍上下文\n${(input as WriteDraftInput & { bookContext?: string }).bookContext}` : ''}

## 要求
1. 保持情节连贯性
2. 角色对话自然生动
3. 场景描写具体有画面感
4. 注意段落节奏，张弛有度
5. 保持题材风格统一

请直接输出正文内容。`;
}

/**
 * ChapterExecutor 的 generateScene 回调使用的 prompt 构建方法。
 */
export function buildAgentDraftPrompt(
  input: WriteNextChapterInput,
  plan: ChapterPlan,
  contextText: string,
  brief: string
): string {
  const genreStyle = GENRE_WRITER_STYLE_MAP[input.genre] ?? '场景描写具体有画面感，对话自然生动';

  const characters = Array.isArray(plan.characters) ? plan.characters : [];
  const keyEvents = Array.isArray(plan.keyEvents) ? plan.keyEvents : [];
  const hooks = Array.isArray(plan.hooks) ? plan.hooks : [];
  const worldRules = Array.isArray(plan.worldRules) ? plan.worldRules : [];
  const sceneBreakdown = Array.isArray(plan.sceneBreakdown) ? plan.sceneBreakdown : [];
  const hookActions = Array.isArray(plan.hookActions) ? plan.hookActions : [];

  let sceneInstructions = '';
  if (sceneBreakdown.length > 0) {
    sceneInstructions = `
### 场景分解（按此结构写作，每个场景必须写到指定字数）
${sceneBreakdown
  .map(
    (s, i) => `**场景${i + 1}：${s.title}**（约${s.wordCount}字）
  - 内容：${s.description}
  - 出场：${Array.isArray(s.characters) ? s.characters.join('、') || '无特定角色' : '无特定角色'}
  - 调性：${s.mood}`
  )
  .join('\n\n')}`;
  }

  let hookInstructions = '';
  if (hookActions.length > 0) {
    const actionLabels: Record<string, string> = {
      plant: '埋设',
      advance: '推进',
      payoff: '回收',
    };
    hookInstructions = `
### 伏笔动作（必须执行）
${hookActions.map((h) => `- [${actionLabels[h.action] ?? h.action}] ${h.description}`).join('\n')}`;
  }

  return `你是一位资深网络小说作家。请根据以下完整信息撰写章节正文。

## 上下文卡片
${contextText}

## 作品简介
${brief}

## 章节计划
- **章节**: 第 ${input.chapterNumber} 章 — ${plan.title}
- **本章意图**: ${plan.intention}
- **目标字数**: ${plan.wordCountTarget} 字（必须达到）
- **出场角色（仅限以下角色，禁止引入任何未列出的角色）**: ${characters.join('、') || '无'}
- **关键事件**:
${keyEvents.map((e) => `  - ${e}`).join('\n') || '  无'}
${hooks.length > 0 ? `- **伏笔（须自然融入情节，不可生硬点明）**:\n${hooks.map((h) => `  - [${h.priority}] ${h.description}`).join('\n')}` : ''}
${worldRules.length > 0 ? `- **世界观设定（正文须严格遵循，不可违反任何规则）**:\n${worldRules.map((r) => `  - ${r}`).join('\n')}` : ''}
- **情感节拍**: ${plan.emotionalBeat}
- **场景过渡**: ${plan.sceneTransition}
${plan.openingHook ? `- **开篇钩子**: ${plan.openingHook}` : ''}
${plan.closingHook ? `- **结尾悬念**: ${plan.closingHook}` : ''}
${plan.characterGrowthBeat ? `- **主角成长点**: ${plan.characterGrowthBeat}` : ''}
${plan.pacingTag ? `- **叙事节奏**: ${plan.pacingTag}` : ''}
${sceneInstructions}
${hookInstructions}

## 用户意图
${input.userIntent}

## 写作要求

### 硬性约束
1. **字数要求**：正文必须达到 ${plan.wordCountTarget} 字。如果内容不足，请增加场景细节、角色心理活动、对话交锋、环境描写等，而非空泛概括
2. **角色约束**：只允许使用"出场角色"列表中的角色。如需路人/龙套，用"小二""士兵"等泛称，不可为其取具名
3. **设定约束**：严格遵守世界观设定中的每一条规则。如有金手指/特殊能力，必须按规则描写其运作方式，不可自由发挥
4. **情节约束**：按照关键事件推进情节，不可跳过或替换
5. **场景约束**：如果上方有"场景分解"，必须按场景顺序写作，每个场景写到指定字数后再进入下一个
6. **伏笔约束**：如果上方有"伏笔动作"，必须在本章正文中执行，但须自然融入，不可生硬点明

### 文风要求
${genreStyle}

### 质量要求
1. 场景描写须有画面感——用感官细节（视觉、听觉、触觉、嗅觉）构建沉浸感
2. 角色对话须符合其身份和性格——不同角色的说话方式应有区分度
3. 叙事节奏张弛有度——紧张场景用短句和动作描写，舒缓场景用长句和心理描写
4. 避免"总结式叙述"——不要用"经过一番努力""在接下来的日子里"等概括，而是写具体场景
5. 开篇须有钩子——用悬念、冲突或画面直接抓住读者，不要缓慢铺陈

请直接输出正文内容，不要输出章节标题或其他格式标记。`;
}

// ── Chapter I/O ─────────────────────────────────────────────────

export function readChapterSummary(
  bookId: string,
  chapterNumber: number,
  stateManager: StateManager
): string {
  const content = readChapterContent(bookId, chapterNumber, stateManager);
  if (!content) return '';
  return content.substring(0, 300) + (content.length > 300 ? '…' : '');
}

export function readChapterContent(
  bookId: string,
  chapterNumber: number,
  stateManager: StateManager
): string {
  const filePath = stateManager.getChapterFilePath(bookId, chapterNumber);
  if (!fs.existsSync(filePath)) return '';
  const raw = fs.readFileSync(filePath, 'utf-8');
  return stripFrontmatter(raw);
}

// ── Outline Context ─────────────────────────────────────────────

/**
 * 根据章节号定位大纲中所属卷/幕，构建卷级上下文。
 * 如果大纲为空或无法定位，回退到 fallback 文本。
 */
export function buildOutlineContext(
  outline: Array<{
    actNumber: number;
    title: string;
    summary: string;
    chapters: Array<{ chapterNumber: number; title: string; summary: string }>;
  }>,
  chapterNumber: number,
  fallback: string,
  bookId: string,
  stateManager: StateManager
): string {
  if (!outline || outline.length === 0) return fallback;

  const isLongForm = outline.length > 3;
  const volumeLabel = isLongForm ? '卷' : '幕';

  // 读取书籍元数据中的总章节数和总字数
  const bookPath = stateManager.getBookPath(bookId, 'book.json');
  let totalChapters = 0;
  let totalWords = 0;
  if (fs.existsSync(bookPath)) {
    try {
      const bookData = JSON.parse(fs.readFileSync(bookPath, 'utf-8')) as Record<string, unknown>;
      totalChapters = (bookData.targetChapterCount as number) ?? 0;
      totalWords = (bookData.targetWords as number) ?? 0;
    } catch {
      /* ignore */
    }
  }
  const isSuperLong = totalChapters > 100 || totalWords > 1000000;

  // 定位所属卷：找到包含该章节号的卷，或最接近的卷
  let targetAct = outline[0];
  for (const act of outline) {
    const chapterNums = (act.chapters ?? []).map((ch) => ch.chapterNumber);
    if (chapterNums.includes(chapterNumber)) {
      targetAct = act;
      break;
    }
    // 如果章节号在两卷之间，归入前卷
    if (chapterNums.length > 0 && chapterNums[0] <= chapterNumber) {
      targetAct = act;
    }
  }

  const lines: string[] = [];

  // 全书规模信息
  if (isSuperLong) {
    lines.push(`## 全书规模提示`);
    lines.push(
      `本书规划 ${totalChapters > 0 ? totalChapters : '大量'} 章、${totalWords > 0 ? `${totalWords / 10000}万字` : '超百万字'}长篇。当前正在写第 ${chapterNumber} 章。`
    );
    if (isLongForm) {
      lines.push(
        `大纲为多卷结构，每卷约 ${Math.ceil((totalChapters || 1667) / outline.length)} 章。`
      );
    } else {
      lines.push(
        `大纲为三幕概要，每幕实际覆盖约 ${Math.ceil((totalChapters || 1667) / 3)} 章。第 ${chapterNumber} 章处于开篇阶段，应注重铺垫而非快进到高潮。`
      );
    }
    lines.push('');
  }

  // 全书大纲概览
  lines.push(`## 全书${isLongForm ? '多卷' : '三幕'}结构（共 ${outline.length} ${volumeLabel}）`);
  for (const act of outline) {
    const marker = act.actNumber === targetAct.actNumber ? ' ← 当前' : '';
    lines.push(`- 第${act.actNumber}${volumeLabel} ${act.title}${marker}`);
  }
  lines.push('');

  // 当前卷详细信息
  lines.push(`## 当前第${targetAct.actNumber}${volumeLabel}：${targetAct.title}`);
  lines.push(targetAct.summary);
  lines.push('');

  if (targetAct.chapters && targetAct.chapters.length > 0) {
    lines.push(`### 本${volumeLabel}关键章节`);
    // 判断当前章节是否命中某个 beat
    let hitBeat = false;
    for (const ch of targetAct.chapters) {
      const marker = ch.chapterNumber === chapterNumber ? ' ← 本章' : '';
      lines.push(`- 第${ch.chapterNumber}章 ${ch.title}：${ch.summary}${marker}`);
      if (ch.chapterNumber === chapterNumber) hitBeat = true;
    }
    // 如果当前章节不在任何 beat 中，找到最近的前后 beat 提供定位参考
    if (!hitBeat) {
      const beats = targetAct.chapters;
      let prevBeat: (typeof beats)[0] | undefined;
      let nextBeat: (typeof beats)[0] | undefined;
      for (const b of beats) {
        if (b.chapterNumber <= chapterNumber) prevBeat = b;
        if (b.chapterNumber > chapterNumber && !nextBeat) nextBeat = b;
      }
      lines.push('');
      lines.push(`### 本章叙事定位（第 ${chapterNumber} 章不在大纲关键章节中，以下为最近参考）`);
      if (prevBeat) {
        lines.push(
          `- 前一个关键节点：第${prevBeat.chapterNumber}章「${prevBeat.title}」— ${prevBeat.summary}`
        );
      }
      if (nextBeat) {
        lines.push(
          `- 后一个关键节点：第${nextBeat.chapterNumber}章「${nextBeat.title}」— ${nextBeat.summary}`
        );
      }
      if (prevBeat && nextBeat) {
        lines.push(
          `- 当前章节应承前启后：承接前节点余波，为后节点铺垫，同时推进本卷概要中的叙事目标`
        );
      } else if (prevBeat && !nextBeat) {
        lines.push(
          `- 当前章节是本卷最后关键节点之后的延展，应逐步收束本卷线索，为下一卷过渡做准备`
        );
      } else if (!prevBeat && nextBeat) {
        lines.push(`- 当前章节处于本卷开篇，应为即将到来的第一个关键节点做充分铺垫`);
      }
    }
    lines.push('');
  }

  // 前后卷概要（如有）
  const prevAct = outline.find((a) => a.actNumber === targetAct.actNumber - 1);
  const nextAct = outline.find((a) => a.actNumber === targetAct.actNumber + 1);
  if (prevAct) {
    lines.push(`### 上一${volumeLabel}：${prevAct.title}`);
    lines.push(prevAct.summary);
    lines.push('');
  }
  if (nextAct) {
    lines.push(`### 下一${volumeLabel}：${nextAct.title}`);
    lines.push(nextAct.summary);
  }

  return lines.join('\n');
}

// ── Persistence ─────────────────────────────────────────────────

export function persistChapterAtomic(
  content: string,
  bookId: string,
  chapterNumber: number,
  title: string,
  status: 'draft' | 'final' = 'final',
  metadata:
    | {
        warning?: string;
        warningCode?: 'accept_with_warnings' | 'context_drift';
      }
    | undefined,
  stateManager: StateManager
): void {
  const targetPath = stateManager.getChapterFilePath(bookId, chapterNumber);
  const tmpPath = targetPath + '.tmp';

  const sanitizedWarning = metadata?.warning?.replace(/\r?\n/g, ' ').trim();
  const warningBlock = [
    metadata?.warningCode ? `warningCode: ${metadata.warningCode}` : null,
    sanitizedWarning ? `warning: ${sanitizedWarning}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join('\n');

  const chapterMeta = `---
title: ${title}
chapter: ${chapterNumber}
status: ${status}
${warningBlock ? `${warningBlock}\n` : ''}createdAt: ${new Date().toISOString()}
---

`;

  try {
    fs.writeFileSync(tmpPath, chapterMeta + content, 'utf-8');
    fs.renameSync(tmpPath, targetPath);
  } catch (error) {
    if (fs.existsSync(tmpPath)) {
      try {
        fs.unlinkSync(tmpPath);
      } catch {
        /* best effort */
      }
    }
    throw error;
  }
}

export function updateStateAfterChapter(
  bookId: string,
  chapterNumber: number,
  title: string | null,
  content: string,
  stateManager: StateManager,
  stateStore: RuntimeStateStore,
  manifestOverride?: Manifest
): void {
  const index = stateManager.readIndex(bookId);
  const existingChapter = findChapterEntry(index.chapters, chapterNumber);
  if (!existingChapter) {
    const paddedChapterNumber = String(chapterNumber).padStart(4, '0');
    index.chapters.push({
      number: chapterNumber,
      title,
      fileName: `chapter-${paddedChapterNumber}.md`,
      wordCount: countChineseWords(content),
      createdAt: new Date().toISOString(),
    });
  } else {
    normalizeChapterEntry(existingChapter, chapterNumber, title, countChineseWords(content));
    existingChapter.wordCount = countChineseWords(content);
  }
  index.totalChapters = index.chapters.length;
  index.totalWords = index.chapters.reduce(
    (sum, chapter) => sum + (Number.isFinite(chapter.wordCount) ? chapter.wordCount : 0),
    0
  );
  index.lastUpdated = new Date().toISOString();
  stateManager.writeIndex(bookId, index);

  const manifest = manifestOverride ?? stateStore.loadManifest(bookId);
  if (chapterNumber > manifest.lastChapterWritten) {
    manifest.lastChapterWritten = chapterNumber;
  }
  stateStore.saveRuntimeStateSnapshot(bookId, manifest);

  const stateDir = stateManager.getBookPath(bookId, 'story', 'state');
  try {
    const storedHash = loadStoredStateHash(stateDir);
    const currentHash = ProjectionRenderer.computeStateHash(manifest);

    if (storedHash === null || storedHash !== currentHash) {
      const summaries = index.chapters.map((ch) => ({
        chapter: ch.number,
        summary: ch.title ?? '',
        keyEvents: null,
        stateChanges: null,
        created_at: ch.createdAt,
      }));
      ProjectionRenderer.writeProjectionFiles(manifest, stateDir, summaries);
    }
  } catch {
    // 投影刷新失败不影响主流程
  }
}

export function loadStoredStateHash(stateDir: string): string | null {
  try {
    const hashPath = path.join(stateDir, '.state-hash');
    return fs.readFileSync(hashPath, 'utf-8').trim();
  } catch (err) {
    console.warn(
      '[runner-helpers] Failed to load state hash:',
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}

// ── World Rules ─────────────────────────────────────────────────

export async function checkWorldRules(
  content: string,
  chapterNumber: number,
  rules: Array<{ id: string; category: string; rule: string; exceptions: string[] }>,
  provider: LLMProvider
): Promise<string[]> {
  if (rules.length === 0) return [];

  const prompt = `你是一位世界规则审核员。请检查以下章节内容是否违反了设定的世界规则。

## 世界规则
${rules.map((r) => `- [${r.category}] ${r.rule}`).join('\n')}

## 章节内容（第${chapterNumber}章）
${content.slice(0, 3000)}

请逐条检查规则，返回违规列表（JSON 数组格式），如果没有违规返回空数组 []。
每个违规项格式：{ "ruleId": "规则ID", "violation": "违规描述" }`;

  try {
    const result = await provider.generateJSON<Array<{ ruleId: string; violation: string }>>({
      prompt,
    });
    return result.map((v) => `[世界规则] ${v.violation}`);
  } catch {
    return [];
  }
}

// ── Memory Extraction ───────────────────────────────────────────

export async function extractMemory(
  content: string,
  bookId: string,
  chapterNumber: number,
  provider: LLMProvider,
  stateStore: RuntimeStateStore,
  cachedManifest?: Manifest
): Promise<Manifest | null> {
  const contentForExtraction =
    content.length > 8000
      ? content.substring(0, 8000) + '\n...(内容过长，已截取前 8000 字)'
      : content;

  const prompt = `你是一位记忆提取师。请从以下章节内容中提取重要事实和新伏笔。

## 章节内容
${contentForExtraction}

请以 JSON 格式输出：
{
  "facts": [
    { "content": "事实内容", "category": "character|world|plot|timeline|resource", "confidence": "high|medium|low" }
  ],
  "newHooks": [],
  "updatedHooks": []
}`;

  try {
    const memoryResult = await provider.generateJSON<{
      facts: Array<{ content: string; category: string; confidence: string }>;
      newHooks: unknown[];
      updatedHooks: unknown[];
    }>({ prompt, agentName: 'Planner' });

    const manifest = cachedManifest ?? stateStore.loadManifest(bookId);
    const actions = buildMemoryDelta(memoryResult, manifest, chapterNumber);
    if (actions.length === 0) {
      return manifest;
    }

    const updatedManifest = applyRuntimeStateDelta(manifest, {
      actions,
      sourceAgent: 'MemoryExtractor',
      sourceChapter: chapterNumber,
    });
    stateStore.saveRuntimeStateSnapshot(bookId, updatedManifest);
    return updatedManifest;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(
      `[PipelineRunner] 记忆提取失败（bookId=${bookId}, chapter=${chapterNumber}）: ${msg}`
    );
    return null;
  }
}

export function buildMemoryDelta(
  memoryResult: {
    facts: Array<{ content: string; category: string; confidence: string }>;
    newHooks: unknown[];
    updatedHooks: unknown[];
  },
  manifest: Manifest,
  chapterNumber: number
): import('../models/state').Delta['actions'] {
  const now = new Date().toISOString();
  const actions: import('../models/state').Delta['actions'] = [];

  memoryResult.facts.forEach((fact, index) => {
    const content = fact.content?.trim();
    if (!content) {
      return;
    }
    const existingInSameChapter = manifest.facts.some(
      (existingFact) =>
        existingFact.content === content && existingFact.chapterNumber === chapterNumber
    );
    if (existingInSameChapter) {
      return;
    }

    const existingInOtherChapter = manifest.facts.find(
      (existingFact) =>
        existingFact.content === content && existingFact.chapterNumber !== chapterNumber
    );
    let finalConfidence = normalizeFactConfidence(fact.confidence);
    if (existingInOtherChapter && existingInOtherChapter.confidence !== 'high') {
      finalConfidence = 'high';
      actions.push({
        type: 'update_fact',
        payload: {
          id: existingInOtherChapter.id,
          confidence: 'high',
        },
      });
    }

    actions.push({
      type: 'add_fact',
      payload: {
        id: `fact-${chapterNumber}-${index + 1}`,
        content,
        chapterNumber,
        confidence: finalConfidence,
        category: normalizeFactCategory(fact.category),
        createdAt: now,
      },
    });
  });

  memoryResult.newHooks.forEach((rawHook, index) => {
    const hook = rawHook as Record<string, unknown>;
    const description = String(hook.description ?? '').trim();
    if (!description) {
      return;
    }

    const hookId = String(hook.id ?? `hook-${chapterNumber}-${index + 1}`);
    if (
      manifest.hooks.some(
        (existingHook) => existingHook.id === hookId || existingHook.description === description
      )
    ) {
      return;
    }

    actions.push({
      type: 'add_hook',
      payload: {
        id: hookId,
        description,
        type: normalizeHookType(hook.type),
        status: normalizeHookStatus(hook.status),
        priority: normalizeHookPriority(hook.priority),
        plantedChapter: chapterNumber,
        expectedResolutionMin: toPositiveNumber(hook.expectedResolutionMin),
        expectedResolutionMax: toPositiveNumber(hook.expectedResolutionMax),
        wakeAtChapter: toPositiveNumber(hook.wakeAtChapter),
        relatedCharacters: normalizeStringArray(hook.relatedCharacters),
        relatedChapters: normalizeChapterArray(hook.relatedChapters, chapterNumber),
        payoffDescription:
          typeof hook.payoffDescription === 'string' ? hook.payoffDescription : undefined,
        createdAt: now,
        updatedAt: now,
      },
    });
  });

  memoryResult.updatedHooks.forEach((rawHook) => {
    const hook = rawHook as Record<string, unknown>;
    const hookId = typeof hook.id === 'string' ? hook.id : undefined;
    if (!hookId || !manifest.hooks.some((existingHook) => existingHook.id === hookId)) {
      return;
    }

    actions.push({
      type: 'update_hook',
      payload: {
        id: hookId,
        description:
          typeof hook.description === 'string' ? hook.description.trim() || undefined : undefined,
        status: normalizeHookStatus(hook.status, true),
        priority: normalizeHookPriority(hook.priority, true),
        wakeAtChapter: toPositiveNumber(hook.wakeAtChapter),
        expectedResolutionMin: toPositiveNumber(hook.expectedResolutionMin),
        expectedResolutionMax: toPositiveNumber(hook.expectedResolutionMax),
        payoffDescription:
          typeof hook.payoffDescription === 'string' ? hook.payoffDescription : undefined,
        updatedAt: now,
      },
    });
  });

  return actions.map((action) => ({
    ...action,
    payload: Object.fromEntries(
      Object.entries(action.payload).filter(([, value]) => value !== undefined)
    ),
  }));
}
