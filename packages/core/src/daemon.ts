// ── Types ────────────────────────────────────────────────────────────

import { SmartInterval, type SmartIntervalConfig } from './scheduler/smart-interval';
import { QuotaGuard, type QuotaGuardConfig } from './scheduler/quota-guard';
import { createNotifier, type NotifyChannel, type NotifyEvent } from './notify';

export enum DaemonState {
  Idle = 'idle',
  Running = 'running',
  Paused = 'paused',
  Stopped = 'stopped',
}

export interface DaemonConfig extends SmartIntervalConfig {
  bookId: string;
  rootDir: string;
  fromChapter?: number;
  toChapter?: number;
  intervalMs?: number;
  dailyTokenLimit: number;
  /** 连续降级自动暂停阈值，默认 2 */
  maxConsecutiveFallbacks?: number;
  /** 通知推送渠道配置 */
  notifyChannels?: NotifyChannel[];
  /** 书籍名称，用于通知消息格式化 */
  bookTitle?: string;
}

export interface DaemonStatus {
  bookId: string;
  state: DaemonState;
  nextChapter?: number;
  toChapter?: number;
  chaptersCompleted: number;
  intervalMs: number;
  dailyTokenUsed: number;
  dailyTokenLimit: number;
  consecutiveFallbacks: number;
  startedAt?: string;
  pausedAt?: string;
}

export interface ChapterResultLike {
  success: boolean;
  bookId?: string;
  chapterNumber: number;
  content?: string;
  error?: string;
  warning?: string;
  warningCode?: 'accept_with_warnings' | 'context_drift';
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

interface PipelineRunnerLike {
  composeChapter(input: {
    bookId: string;
    chapterNumber: number;
    title: string;
    genre: string;
    userIntent: string;
  }): Promise<ChapterResultLike>;
}

type EventName =
  | 'chapter_complete'
  | 'chapter_error'
  | 'state_change'
  | 'quota_exhausted'
  | 'max_fallbacks_reached';

interface EventPayloadMap {
  chapter_complete: { bookId: string; chapterNumber: number; result: ChapterResultLike };
  chapter_error: { bookId: string; chapterNumber: number; error: string };
  state_change: { from: DaemonState; to: DaemonState };
  quota_exhausted: Record<string, unknown>;
  max_fallbacks_reached: { consecutiveFallbacks: number };
}

type Listener<T> = (data: T) => void;
type Unsubscribe = () => void;

// ── DaemonScheduler ──────────────────────────────────────────────────

export class DaemonScheduler {
  readonly #bookId: string;
  readonly #toChapter?: number;
  readonly #maxConsecutiveFallbacks: number;
  readonly #bookTitle?: string;

  #state: DaemonState = DaemonState.Idle;
  #nextChapter?: number;
  #chaptersCompleted = 0;
  #consecutiveFallbacks = 0;
  #startedAt?: string;
  #pausedAt?: string;

  readonly #smartInterval: SmartInterval;
  readonly #quotaGuard: QuotaGuard;
  readonly #notifier: ReturnType<typeof createNotifier> | null;

  readonly #events = new Map<EventName, Set<Listener<EventPayloadMap[EventName]>>>();
  #stopSignal?: () => void;

  constructor(config: DaemonConfig) {
    if (config.dailyTokenLimit <= 0) {
      throw new Error(`dailyTokenLimit must be > 0, got ${config.dailyTokenLimit}`);
    }

    this.#bookId = config.bookId;
    this.#toChapter = config.toChapter;
    this.#nextChapter = config.fromChapter;
    this.#maxConsecutiveFallbacks = config.maxConsecutiveFallbacks ?? 2;
    this.#bookTitle = config.bookTitle;

    // SmartInterval config
    const siConfig: SmartIntervalConfig = {
      mode: config.mode,
      targetRpm: config.targetRpm,
      minIntervalMs: config.minIntervalMs,
      maxIntervalMs: config.maxIntervalMs ?? 300_000,
    };
    this.#smartInterval = new SmartInterval(siConfig);

    // QuotaGuard config
    const qgConfig: QuotaGuardConfig = {
      dailyLimit: config.dailyTokenLimit,
      warningThreshold: 0.8,
      criticalThreshold: 0.95,
    };
    this.#quotaGuard = new QuotaGuard(qgConfig);

    // Notifier
    const channels = config.notifyChannels ?? [];
    this.#notifier = channels.length > 0 ? createNotifier(channels) : null;

    // Wire up quota events
    this.#quotaGuard.onExhausted((event) => {
      this.#emit('quota_exhausted', { type: 'quota_exhausted', ...event });
      this.#notify({ type: 'quota_exhausted', message: 'API配额已耗尽' });
      this.#autoStop('配额已耗尽');
    });
  }

  // ── Lifecycle ──────────────────────────────────────────────────────

  start(runner: PipelineRunnerLike): void {
    if (this.#state === DaemonState.Running) {
      throw new Error('守护进程已在运行中');
    }

    this.#transitionTo(DaemonState.Running);
    this.#startedAt = new Date().toISOString();
    this.#notify({
      type: 'daemon_start',
      bookTitle: this.#bookTitle,
      message: '守护进程已启动',
    });

    void this.#runLoop(runner);
  }

  pause(): void {
    if (this.#state !== DaemonState.Running) return;
    this.#transitionTo(DaemonState.Paused);
    this.#pausedAt = new Date().toISOString();
  }

  resume(): void {
    if (this.#state !== DaemonState.Paused) return;
    this.#transitionTo(DaemonState.Running);
  }

  stop(): void {
    if (this.#state === DaemonState.Idle) return;
    this.#stopSignal?.();
    this.#transitionTo(DaemonState.Idle);
    this.#notify({
      type: 'daemon_stop',
      bookTitle: this.#bookTitle,
      message: '守护进程已停止',
    });
    this.#startedAt = undefined;
    this.#pausedAt = undefined;
  }

  // ── Status ─────────────────────────────────────────────────────────

  getStatus(): DaemonStatus {
    const usage = this.#quotaGuard.getUsage();
    return {
      bookId: this.#bookId,
      state: this.#state,
      nextChapter: this.#nextChapter,
      toChapter: this.#toChapter,
      chaptersCompleted: this.#chaptersCompleted,
      intervalMs: this.#smartInterval.getInterval(),
      dailyTokenUsed: usage.used,
      dailyTokenLimit: usage.limit,
      consecutiveFallbacks: this.#consecutiveFallbacks,
      startedAt: this.#startedAt,
      pausedAt: this.#pausedAt,
    };
  }

  // ── Events ─────────────────────────────────────────────────────────

  on(
    event: 'chapter_complete',
    listener: Listener<{ bookId: string; chapterNumber: number; result: ChapterResultLike }>
  ): Unsubscribe;
  on(
    event: 'chapter_error',
    listener: Listener<{ bookId: string; chapterNumber: number; error: string }>
  ): Unsubscribe;
  on(
    event: 'state_change',
    listener: Listener<{ from: DaemonState; to: DaemonState }>
  ): Unsubscribe;
  on(event: 'quota_exhausted', listener: Listener<Record<string, unknown>>): Unsubscribe;
  on(
    event: 'max_fallbacks_reached',
    listener: Listener<{ consecutiveFallbacks: number }>
  ): Unsubscribe;
  on<K extends EventName>(event: K, listener: Listener<EventPayloadMap[K]>): Unsubscribe {
    let set = this.#events.get(event) as Set<Listener<EventPayloadMap[K]>> | undefined;
    if (!set) {
      set = new Set();
      this.#events.set(event, set as Set<Listener<EventPayloadMap[EventName]>>);
    }
    set.add(listener);
    return () => set!.delete(listener);
  }

  // ── Main Loop ──────────────────────────────────────────────────────

  async #runLoop(runner: PipelineRunnerLike): Promise<void> {
    return new Promise<void>((resolve) => {
      this.#stopSignal = () => resolve();
      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      const tick = async () => {
        if (this.#state !== DaemonState.Running) {
          if (this.#isTerminalState(this.#state)) {
            resolve();
            return;
          }
          // Paused — schedule next check
          timeoutId = setTimeout(tick, 1000);
          return;
        }

        // Check chapter limit
        if (
          this.#toChapter !== undefined &&
          this.#nextChapter !== undefined &&
          this.#nextChapter > this.#toChapter
        ) {
          this.#autoStop('已达到目标章节数');
          resolve();
          return;
        }

        // Check quota before composing
        if (this.#quotaGuard.isExhausted()) {
          this.#autoStop('配额已耗尽');
          resolve();
          return;
        }

        const chapterNum = this.#nextChapter ?? 1;

        try {
          const result = await runner.composeChapter({
            bookId: this.#bookId,
            chapterNumber: chapterNum,
            title: `第 ${chapterNum} 章`,
            genre: '',
            userIntent: '继续上一章',
          });

          this.#handleChapterResult(chapterNum, result);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.#emit('chapter_error', {
            bookId: this.#bookId,
            chapterNumber: chapterNum,
            error: message,
          });
        }

        if (this.#isTerminalState(this.#state)) {
          resolve();
          return;
        }

        // Wait for interval, then continue
        const interval = this.#smartInterval.getInterval();
        const waitTime = interval > 0 ? interval : 0;
        timeoutId = setTimeout(tick, waitTime);
      };

      // Override stopSignal to clear the active timeout
      this.#stopSignal = () => {
        if (timeoutId !== null) clearTimeout(timeoutId);
        resolve();
      };

      tick();
    });
  }

  // ── Chapter Result Handler ─────────────────────────────────────────

  #handleChapterResult(chapterNum: number, result: ChapterResultLike): void {
    // Track tokens
    if (result.usage) {
      this.#quotaGuard.recordTokens({
        inputTokens: result.usage.promptTokens,
        outputTokens: result.usage.completionTokens,
      });
    }

    if (result.success) {
      // Check for fallback marker
      if (result.warningCode === 'accept_with_warnings') {
        this.#consecutiveFallbacks++;
        if (this.#consecutiveFallbacks >= this.#maxConsecutiveFallbacks) {
          this.#emit('max_fallbacks_reached', { consecutiveFallbacks: this.#consecutiveFallbacks });
          this.#notify({
            type: 'max_fallbacks_reached',
            bookTitle: this.#bookTitle,
            message: `连续 ${this.#consecutiveFallbacks} 次降级，自动暂停`,
          });
          this.#autoStop(`连续 ${this.#consecutiveFallbacks} 次降级，自动暂停`);
          return;
        }
      } else {
        this.#consecutiveFallbacks = 0;
        this.#chaptersCompleted++;
        this.#nextChapter = chapterNum + 1;
        this.#emit('chapter_complete', { bookId: this.#bookId, chapterNumber: chapterNum, result });
        this.#notify({
          type: 'chapter_complete',
          bookTitle: this.#bookTitle,
          chapterNumber: chapterNum,
          wordCount: result.usage?.completionTokens,
          message: `第${chapterNum}章写作完成`,
        });
      }
    } else {
      // Failed chapter — still advance but track error
      this.#emit('chapter_error', {
        bookId: this.#bookId,
        chapterNumber: chapterNum,
        error: result.error ?? 'unknown',
      });
      this.#notify({
        type: 'chapter_error',
        bookTitle: this.#bookTitle,
        chapterNumber: chapterNum,
        message: `第${chapterNum}章写作失败: ${result.error ?? 'unknown'}`,
      });
      this.#nextChapter = chapterNum + 1;
    }
  }

  // ── Private Helpers ────────────────────────────────────────────────

  #transitionTo(newState: DaemonState): void {
    const old = this.#state;
    if (old === newState) return;
    this.#state = newState;
    this.#emit('state_change', { from: old, to: newState });
  }

  #autoStop(_reason: string): void {
    this.#transitionTo(DaemonState.Stopped);
  }

  #isTerminalState(state: DaemonState): boolean {
    return state === DaemonState.Idle || state === DaemonState.Stopped;
  }

  #emit<K extends EventName>(event: K, data: EventPayloadMap[K]): void {
    const set = this.#events.get(event) as Set<Listener<EventPayloadMap[K]>> | undefined;
    if (!set) return;
    for (const listener of set) {
      try {
        listener(data);
      } catch {
        // Swallow listener errors
      }
    }
  }

  #notify(event: NotifyEvent): void {
    if (!this.#notifier) return;
    // Fire-and-forget — notification errors don't block daemon flow
    this.#notifier.send(event).catch(() => {});
  }
}
