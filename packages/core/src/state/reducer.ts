import type { Manifest } from '../models/state';
import type { Delta } from '../models/state';

// ─── StateReducer ────────────────────────────────────────────────
// 不可变状态更新。每次 delta 返回新对象，原状态不变。
// 支持所有 DeltaActionSchema 定义的操作类型。

export interface HookOps {
  added: string[];
  updated: string[];
  resolved: string[];
}

export interface ReductionResult {
  state: Manifest;
  hookOps: HookOps;
}

/**
 * 对运行时状态应用一组 delta 操作，返回新状态和钩子操作记录。
 * 原状态对象不被修改（不可变更新）。
 * 优化：移除 structuredClone，采用结构化共享提升性能。
 */
export function applyRuntimeStateDelta(
  state: Manifest,
  delta: Pick<Delta, 'actions' | 'sourceAgent' | 'sourceChapter'>
): Manifest {
  // 核心优化：不再全量深拷贝 state，reduceAction 会通过 spread operator 实现局部更新
  let current = state;
  const now = new Date().toISOString();

  for (const action of delta.actions) {
    try {
      current = reduceAction(current, action);
    } catch (err) {
      console.error(`[StateReducer] Failed to apply action ${action.type}:`, err);
      // 继续应用后续 action，或者根据策略抛出。这里选择抛出以保证原子性状态一致性。
      throw err;
    }
  }

  // 确保返回的是一个新对象（即使 actions 为空）
  return {
    ...current,
    updatedAt: now,
    versionToken: state.versionToken + 1,
  };
}

function reduceAction(state: Manifest, action: Delta['actions'][number]): Manifest {
  const { type, payload } = action;

  if (!payload || typeof payload !== 'object') {
    throw new Error(`Action "${type}" requires a valid object payload`);
  }

  switch (type) {
    // ── 伏笔操作 ──────────────────────────────────────
    case 'add_hook': {
      const hook = payload as Manifest['hooks'][number];
      // 容错处理：如果缺少 id 但有描述，则允许（StateImporter 会在投影时重新分配或保持一致）
      if (!hook.description) throw new Error('add_hook: missing description');
      const finalHook = {
        ...hook,
        id: hook.id || `hook-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      };
      return { ...state, hooks: [...state.hooks, finalHook] };
    }

    case 'update_hook': {
      const { id, ...rest } = payload as Record<string, unknown> & { id: string };
      const idx = state.hooks.findIndex((h) => h.id === id);
      if (idx === -1) throw new Error(`Hook "${id}" not found`);
      const updated = { ...state.hooks[idx], ...rest };
      const hooks = [...state.hooks];
      hooks[idx] = updated;
      return { ...state, hooks };
    }

    case 'resolve_hook': {
      const { id, ...rest } = payload as Record<string, unknown> & { id: string };
      if (!id) throw new Error('resolve_hook: missing id');
      const idx = state.hooks.findIndex((h) => h.id === id);
      if (idx === -1) throw new Error(`Hook "${id}" not found`);
      const resolved = { ...state.hooks[idx], status: 'resolved' as const, ...rest };
      const hooks = [...state.hooks];
      hooks[idx] = resolved;
      return { ...state, hooks };
    }

    // ── 事实操作 ──────────────────────────────────────
    case 'add_fact': {
      const fact = payload as Manifest['facts'][number];
      if (!fact.content) throw new Error('add_fact: missing content');
      const finalFact = {
        ...fact,
        id: fact.id || `fact-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      };
      return { ...state, facts: [...state.facts, finalFact] };
    }

    case 'update_fact': {
      const { id, ...rest } = payload as Record<string, unknown> & { id: string };
      if (!id) throw new Error('update_fact: missing id');
      const idx = state.facts.findIndex((f) => f.id === id);
      if (idx === -1) throw new Error(`Fact "${id}" not found`);
      const updated = { ...state.facts[idx], ...rest };
      const facts = [...state.facts];
      facts[idx] = updated;
      return { ...state, facts };
    }

    // ── 角色操作 ──────────────────────────────────────
    case 'add_character': {
      const char = payload as Manifest['characters'][number];
      if (!char.name) throw new Error('add_character: missing name');
      const finalChar = {
        ...char,
        id: char.id || `char-${char.name}`,
      };
      return {
        ...state,
        characters: [...state.characters, finalChar],
      };
    }

    case 'update_character': {
      const { id, ...rest } = payload as Record<string, unknown> & { id: string };
      if (!id) throw new Error('update_character: missing id');
      const idx = state.characters.findIndex((c) => c.id === id);
      if (idx === -1) throw new Error(`Character "${id}" not found`);
      const updated = { ...state.characters[idx], ...rest };
      const characters = [...state.characters];
      characters[idx] = updated;
      return { ...state, characters };
    }

    // ── 世界规则操作 ─────────────────────────────────
    case 'add_world_rule': {
      const rule = payload as Manifest['worldRules'][number];
      if (!rule.rule) throw new Error('add_world_rule: missing rule');
      const finalRule = {
        ...rule,
        id: rule.id || `rule-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      };
      return {
        ...state,
        worldRules: [...state.worldRules, finalRule],
      };
    }

    case 'update_world_rule': {
      const { id, ...rest } = payload as Record<string, unknown> & { id: string };
      if (!id) throw new Error('update_world_rule: missing id');
      const idx = state.worldRules.findIndex((r) => r.id === id);
      if (idx === -1) throw new Error(`World rule "${id}" not found`);
      const updated = { ...state.worldRules[idx], ...rest };
      const worldRules = [...state.worldRules];
      worldRules[idx] = updated;
      return { ...state, worldRules };
    }

    // ── 通用操作 ─────────────────────────────────────
    case 'set_focus': {
      const { focus } = payload as { focus: string };
      if (focus === undefined) throw new Error('set_focus: missing focus');
      return { ...state, currentFocus: focus };
    }

    case 'advance_chapter': {
      const { chapterNumber } = payload as { chapterNumber: number };
      if (chapterNumber === undefined) throw new Error('advance_chapter: missing chapterNumber');
      return { ...state, lastChapterWritten: chapterNumber };
    }

    default: {
      const _exhaustive: never = type;
      throw new Error(`Unknown delta action type: ${_exhaustive}`);
    }
  }
}
