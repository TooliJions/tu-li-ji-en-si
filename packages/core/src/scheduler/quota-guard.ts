import * as fs from 'node:fs';
import * as path from 'node:path';

// ── Types ────────────────────────────────────────────────────────────

export interface TokenRecord {
  inputTokens?: number;
  outputTokens?: number;
}

export interface QuotaGuardConfig {
  /** 每日 token 上限（input + output 合计） */
  dailyLimit: number;
  /** 警告阈值百分比，默认 0.8 */
  warningThreshold?: number;
  /** 严重阈值百分比，默认 0.95 */
  criticalThreshold?: number;
  /** 持久化文件路径（可选），用于守护进程重启后恢复配额记录 */
  persistPath?: string;
}

export interface QuotaUsage {
  used: number;
  limit: number;
  remaining: number;
  percentUsed: number;
  /** 当前生效的 UTC 日期 key（YYYY-MM-DD） */
  dayKey: string;
}

export interface QuotaUsageEvent {
  used: number;
  limit: number;
  percentUsed: number;
  timestamp: string;
}

export interface QuotaExhaustedEvent extends QuotaUsageEvent {
  overshoot: number;
}

type Listener<T> = (event: T) => void;
type Unsubscribe = () => void;

const DEFAULT_WARNING = 0.8;
const DEFAULT_CRITICAL = 0.95;

// ── QuotaGuard ───────────────────────────────────────────────────────

export class QuotaGuard {
  readonly #limit: number;
  readonly #warningThreshold: number;
  readonly #criticalThreshold: number;
  readonly #persistPath?: string;

  #used = 0;
  #dayKey: string;

  #warningFired = false;
  #criticalFired = false;
  #exhaustedFired = false;

  readonly #warningListeners = new Set<Listener<QuotaUsageEvent>>();
  readonly #criticalListeners = new Set<Listener<QuotaUsageEvent>>();
  readonly #exhaustedListeners = new Set<Listener<QuotaExhaustedEvent>>();

  constructor(config: QuotaGuardConfig) {
    if (config.dailyLimit <= 0) {
      throw new Error(`dailyLimit must be > 0, got ${config.dailyLimit}`);
    }

    const warning = config.warningThreshold ?? DEFAULT_WARNING;
    const critical = config.criticalThreshold ?? DEFAULT_CRITICAL;

    if (warning < 0 || warning > 1) {
      throw new Error(`warningThreshold must be in [0,1], got ${warning}`);
    }
    if (critical < 0 || critical > 1) {
      throw new Error(`criticalThreshold must be in [0,1], got ${critical}`);
    }
    if (warning > critical) {
      throw new Error(`warningThreshold (${warning}) must be <= criticalThreshold (${critical})`);
    }

    this.#limit = config.dailyLimit;
    this.#warningThreshold = warning;
    this.#criticalThreshold = critical;
    this.#persistPath = config.persistPath;
    this.#dayKey = currentUtcDayKey();
    this.#loadFromFile();
  }

  // ── Recording ────────────────────────────────────────────────

  recordTokens(record: TokenRecord): void {
    const inp = record.inputTokens ?? 0;
    const out = record.outputTokens ?? 0;
    if (inp < 0 || out < 0) {
      throw new Error(`Token counts must be non-negative, got input=${inp} output=${out}`);
    }

    this.#rolloverIfNeeded();
    this.#used += inp + out;

    this.#fireThresholdEvents();
    this.#saveToFile();
  }

  // ── Queries ──────────────────────────────────────────────────

  getUsage(): QuotaUsage {
    this.#rolloverIfNeeded();
    const used = this.#used;
    const remaining = Math.max(0, this.#limit - used);
    const percentUsed = used / this.#limit;
    return {
      used,
      limit: this.#limit,
      remaining,
      percentUsed,
      dayKey: this.#dayKey,
    };
  }

  isExhausted(): boolean {
    this.#rolloverIfNeeded();
    return this.#used >= this.#limit;
  }

  canProceed(estimatedTokens = 0): boolean {
    this.#rolloverIfNeeded();
    if (estimatedTokens < 0) return false;
    return this.#used + estimatedTokens <= this.#limit;
  }

  // ── Subscriptions ────────────────────────────────────────────

  onWarning(listener: Listener<QuotaUsageEvent>): Unsubscribe {
    this.#warningListeners.add(listener);
    return () => this.#warningListeners.delete(listener);
  }

  onCritical(listener: Listener<QuotaUsageEvent>): Unsubscribe {
    this.#criticalListeners.add(listener);
    return () => this.#criticalListeners.delete(listener);
  }

  onExhausted(listener: Listener<QuotaExhaustedEvent>): Unsubscribe {
    this.#exhaustedListeners.add(listener);
    return () => this.#exhaustedListeners.delete(listener);
  }

  // ── Reset ────────────────────────────────────────────────────

  reset(): void {
    this.#used = 0;
    this.#warningFired = false;
    this.#criticalFired = false;
    this.#exhaustedFired = false;
    this.#dayKey = currentUtcDayKey();
  }

  // ── Private ──────────────────────────────────────────────────

  #rolloverIfNeeded(): void {
    const today = currentUtcDayKey();
    if (today !== this.#dayKey) {
      this.#used = 0;
      this.#warningFired = false;
      this.#criticalFired = false;
      this.#exhaustedFired = false;
      this.#dayKey = today;
      this.#saveToFile();
    }
  }

  #fireThresholdEvents(): void {
    const percent = this.#used / this.#limit;
    const usageEvent: QuotaUsageEvent = {
      used: this.#used,
      limit: this.#limit,
      percentUsed: percent,
      timestamp: new Date().toISOString(),
    };

    if (!this.#warningFired && percent >= this.#warningThreshold) {
      this.#warningFired = true;
      this.#emit(this.#warningListeners, usageEvent);
    }

    if (!this.#criticalFired && percent >= this.#criticalThreshold) {
      this.#criticalFired = true;
      this.#emit(this.#criticalListeners, usageEvent);
    }

    if (!this.#exhaustedFired && this.#used >= this.#limit) {
      this.#exhaustedFired = true;
      const exhaustedEvent: QuotaExhaustedEvent = {
        ...usageEvent,
        overshoot: this.#used - this.#limit,
      };
      this.#emit(this.#exhaustedListeners, exhaustedEvent);
    }
  }

  #emit<T>(listeners: Set<Listener<T>>, event: T): void {
    for (const listener of listeners) {
      try {
        listener(event);
      } catch {
        // Swallow listener errors so one bad subscriber can't block others
      }
    }
  }

  // ── Persistence ────────────────────────────────────────────────

  #loadFromFile(): void {
    if (!this.#persistPath) return;
    try {
      if (!fs.existsSync(this.#persistPath)) return;
      const raw = fs.readFileSync(this.#persistPath, 'utf-8');
      const data = JSON.parse(raw) as { dayKey?: string; used?: number };
      if (data.dayKey === this.#dayKey && typeof data.used === 'number') {
        this.#used = data.used;
      }
    } catch {
      // 忽略损坏的持久化文件，从零开始
    }
  }

  #saveToFile(): void {
    if (!this.#persistPath) return;
    try {
      fs.mkdirSync(path.dirname(this.#persistPath), { recursive: true });
      fs.writeFileSync(
        this.#persistPath,
        JSON.stringify({ dayKey: this.#dayKey, used: this.#used }, null, 2),
        'utf-8',
      );
    } catch {
      // 持久化失败不应阻塞主流程
    }
  }
}

// ── Utils ────────────────────────────────────────────────────────────

function currentUtcDayKey(): string {
  return new Date().toISOString().slice(0, 10);
}
