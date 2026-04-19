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
 */
export function applyRuntimeStateDelta(
  state: Manifest,
  delta: Pick<Delta, 'actions' | 'sourceAgent' | 'sourceChapter'>
): Manifest {
  let current = structuredClone(state);
  const now = new Date().toISOString();

  for (const action of delta.actions) {
    current = reduceAction(current, action);
  }

  current.updatedAt = now;
  current.versionToken = state.versionToken + 1;

  return current;
}

function reduceAction(state: Manifest, action: NonNullable<Delta['actions']>[0]): Manifest {
  const { type, payload } = action;

  switch (type) {
    // ── 伏笔操作 ──────────────────────────────────────
    case 'add_hook': {
      const hook = payload as Record<string, unknown>;
      return { ...state, hooks: [...state.hooks, hook as Manifest['hooks'][number]] };
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
      const idx = state.hooks.findIndex((h) => h.id === id);
      if (idx === -1) throw new Error(`Hook "${id}" not found`);
      const resolved = { ...state.hooks[idx], status: 'resolved' as const, ...rest };
      const hooks = [...state.hooks];
      hooks[idx] = resolved;
      return { ...state, hooks };
    }

    // ── 事实操作 ──────────────────────────────────────
    case 'add_fact': {
      const fact = payload as Record<string, unknown>;
      return { ...state, facts: [...state.facts, fact as Manifest['facts'][number]] };
    }

    case 'update_fact': {
      const { id, ...rest } = payload as Record<string, unknown> & { id: string };
      const idx = state.facts.findIndex((f) => f.id === id);
      if (idx === -1) throw new Error(`Fact "${id}" not found`);
      const updated = { ...state.facts[idx], ...rest };
      const facts = [...state.facts];
      facts[idx] = updated;
      return { ...state, facts };
    }

    // ── 角色操作 ──────────────────────────────────────
    case 'add_character': {
      const char = payload as Record<string, unknown>;
      return {
        ...state,
        characters: [...state.characters, char as Manifest['characters'][number]],
      };
    }

    case 'update_character': {
      const { id, ...rest } = payload as Record<string, unknown> & { id: string };
      const idx = state.characters.findIndex((c) => c.id === id);
      if (idx === -1) throw new Error(`Character "${id}" not found`);
      const updated = { ...state.characters[idx], ...rest };
      const characters = [...state.characters];
      characters[idx] = updated;
      return { ...state, characters };
    }

    // ── 世界规则操作 ─────────────────────────────────
    case 'add_world_rule': {
      const rule = payload as Record<string, unknown>;
      return {
        ...state,
        worldRules: [...state.worldRules, rule as Manifest['worldRules'][number]],
      };
    }

    case 'update_world_rule': {
      const { id, ...rest } = payload as Record<string, unknown> & { id: string };
      const idx = state.worldRules.findIndex((r) => r.id === id);
      if (idx === -1) throw new Error(`World rule "${id}" not found`);
      const updated = { ...state.worldRules[idx], ...rest };
      const worldRules = [...state.worldRules];
      worldRules[idx] = updated;
      return { ...state, worldRules };
    }

    // ── 通用操作 ─────────────────────────────────────
    case 'set_focus': {
      return { ...state, currentFocus: (payload as { focus: string }).focus };
    }

    case 'advance_chapter': {
      return { ...state, lastChapterWritten: (payload as { chapterNumber: number }).chapterNumber };
    }

    default: {
      const _exhaustive: never = type;
      throw new Error(`Unknown delta action type: ${_exhaustive}`);
    }
  }
}
