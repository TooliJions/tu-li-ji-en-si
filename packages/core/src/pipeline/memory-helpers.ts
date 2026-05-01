import type { LLMProvider } from '../llm/provider';
import type { RuntimeStateStore } from '../state/runtime-store';
import { applyRuntimeStateDelta } from '../state/reducer';
import type { Manifest } from '../models/state';
import {
  normalizeFactCategory,
  normalizeFactConfidence,
  normalizeHookType,
  normalizeHookStatus,
  normalizeHookPriority,
  normalizeStringArray,
  normalizeChapterArray,
  toPositiveNumber,
} from '../utils';

// ── World Rules ─────────────────────────────────────────────────

export async function checkWorldRules(
  content: string,
  chapterNumber: number,
  rules: Array<{ id: string; category: string; rule: string; exceptions: string[] }>,
  provider: LLMProvider,
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
  cachedManifest?: Manifest,
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
      `[PipelineRunner] 记忆提取失败（bookId=${bookId}, chapter=${chapterNumber}）: ${msg}`,
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
  chapterNumber: number,
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
        existingFact.content === content && existingFact.chapterNumber === chapterNumber,
    );
    if (existingInSameChapter) {
      return;
    }

    const existingInOtherChapter = manifest.facts.find(
      (existingFact) =>
        existingFact.content === content && existingFact.chapterNumber !== chapterNumber,
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
        (existingHook) => existingHook.id === hookId || existingHook.description === description,
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
      Object.entries(action.payload).filter(([, value]) => value !== undefined),
    ),
  }));
}
