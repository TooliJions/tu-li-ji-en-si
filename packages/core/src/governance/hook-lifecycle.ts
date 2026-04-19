import type { Hook } from '../models/state';

// ─── Types ─────────────────────────────────────────────────────────

export type HookState = Hook['status'];

export interface StateTransition {
  from: HookState;
  to: HookState;
  hookId: string;
  reason?: string;
}

export interface LifecycleEvents {
  onPlanted?: (hook: Hook) => void;
  onAdvanced?: (hook: Hook, from: HookState) => void;
  onDeferred?: (hook: Hook) => void;
  onDormant?: (hook: Hook) => void;
  onWake?: (hook: Hook) => void;
  onResolved?: (hook: Hook) => void;
  onAbandoned?: (hook: Hook) => void;
}

export interface TransitionResult {
  success: boolean;
  transition?: StateTransition;
  reason?: string;
}

// ─── Valid transitions ────────────────────────────────────────────

const VALID_TRANSITIONS: Record<HookState, HookState[]> = {
  open: ['progressing', 'deferred', 'dormant', 'resolved', 'abandoned'],
  progressing: ['deferred', 'dormant', 'resolved', 'abandoned'],
  deferred: ['open', 'dormant', 'resolved', 'abandoned'],
  dormant: ['open', 'deferred', 'resolved', 'abandoned'],
  resolved: [],
  abandoned: [],
};

const TERMINAL_STATES: HookState[] = ['resolved', 'abandoned'];

// ─── HookLifecycle ──────────────────────────────────────────────
/**
 * 伏笔生命周期状态机。
 * 管理状态转换：open → progressing → deferred → dormant → resolved/abandoned
 * 事件通知：onPlanted / onAdvanced / onDormant / onWake / onResolved / onAbandoned
 * 自动唤醒：章节到达 minChapter 时 dormant → open
 */
export class HookLifecycle {
  private events: LifecycleEvents;

  constructor(events?: LifecycleEvents) {
    this.events = events ?? {};
  }

  // ── State Transitions ─────────────────────────────────────────

  /**
   * 埋设新伏笔（初始状态：open）。
   */
  plantHook(hook: Hook): TransitionResult {
    if (!TERMINAL_STATES.includes(hook.status)) {
      return { success: false, reason: `伏笔「${hook.id}」已处于「${hook.status}」状态` };
    }

    hook.status = 'open';
    hook.updatedAt = new Date().toISOString();

    this.events.onPlanted?.(hook);
    return { success: true, transition: { from: hook.status, to: 'open', hookId: hook.id } };
  }

  /**
   * 将伏笔标记为进行中。
   */
  advance(hook: Hook): TransitionResult {
    return this.#transition(hook, 'progressing', '伏笔推进中');
  }

  /**
   * 将伏笔标记为延期（系统自动判定暂不推进）。
   */
  defer(hook: Hook, reason?: string): TransitionResult {
    const result = this.#transition(hook, 'deferred', reason ?? '系统判定延期');
    if (result.success) {
      this.events.onDeferred?.(hook);
    }
    return result;
  }

  /**
   * 将伏笔标记为休眠（人工意图声明）。
   */
  setDormant(hook: Hook, reason?: string): TransitionResult {
    const result = this.#transition(hook, 'dormant', reason ?? '人工标记休眠');
    if (result.success) {
      this.events.onDormant?.(hook);
    }
    return result;
  }

  /**
   * 唤醒休眠伏笔 → open。
   */
  wake(hook: Hook, reason?: string): TransitionResult {
    const result = this.#transition(hook, 'open', reason ?? '自动唤醒');
    if (result.success) {
      this.events.onWake?.(hook);
    }
    return result;
  }

  /**
   * 标记伏笔为已回收。
   */
  resolve(hook: Hook, reason?: string): TransitionResult {
    const result = this.#transition(hook, 'resolved', reason ?? '伏笔已回收');
    if (result.success) {
      this.events.onResolved?.(hook);
    }
    return result;
  }

  /**
   * 标记伏笔为已废弃。
   */
  abandon(hook: Hook, reason?: string): TransitionResult {
    const result = this.#transition(hook, 'abandoned', reason ?? '伏笔已废弃');
    if (result.success) {
      this.events.onAbandoned?.(hook);
    }
    return result;
  }

  // ── Queries ───────────────────────────────────────────────────

  /**
   * 检查是否可以进行指定状态转换。
   */
  canTransition(from: HookState, to: HookState): boolean {
    const allowed = VALID_TRANSITIONS[from];
    return allowed ? allowed.includes(to) : false;
  }

  /**
   * 获取伏笔当前状态的所有合法目标状态。
   */
  getNextStates(state: HookState): HookState[] {
    return [...(VALID_TRANSITIONS[state] ?? [])];
  }

  /**
   * 判断是否为终止状态。
   */
  isTerminal(state: HookState): boolean {
    return TERMINAL_STATES.includes(state);
  }

  // ── Internal ──────────────────────────────────────────────────

  #transition(hook: Hook, to: HookState, reason: string): TransitionResult {
    const from = hook.status;

    if (from === to) {
      return { success: false, reason: `伏笔「${hook.id}」已处于「${to}」状态` };
    }

    if (!this.canTransition(from, to)) {
      return {
        success: false,
        reason: `不允许从「${from}」转换到「${to}」（伏笔「${hook.id}」）`,
      };
    }

    hook.status = to;
    hook.updatedAt = new Date().toISOString();

    const transition: StateTransition = { from, to, hookId: hook.id, reason };

    if (to !== 'resolved' && to !== 'abandoned' && to !== 'dormant') {
      this.events.onAdvanced?.(hook, from);
    }

    return { success: true, transition };
  }
}
