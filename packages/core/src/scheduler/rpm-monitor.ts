import type { RateLimitHeaders } from './types';
export type { RateLimitHeaders };

export interface RpmMonitorConfig {
  /** 基础间隔（ms），默认 1000 */
  baseIntervalMs?: number;
  /** 退避上限（ms），默认 300_000（300s） */
  maxBackoffMs?: number;
  /** RPM 滑动窗口（ms），默认 60_000 */
  windowMs?: number;
}

export interface BackoffState {
  active: boolean;
  /** 连续 429 计数（指数退避层级） */
  level: number;
  /** 当前推荐间隔（ms） */
  intervalMs: number;
  /** 来自响应头的 retry-after 剩余毫秒（0 表示已过期或未提供） */
  retryAfterMs: number;
  /** retry-after 的截止时间戳（ms epoch），未设置则为 0 */
  retryAfterUntil: number;
}

const DEFAULT_BASE = 1000;
const DEFAULT_MAX_BACKOFF = 300_000;
const DEFAULT_WINDOW = 60_000;

// Header keys (lowercase)
const HEADER_RETRY_AFTER = 'retry-after';
const HEADER_OPENAI_RESET = 'x-ratelimit-reset';
const HEADER_OPENAI_RESET_REQ = 'x-ratelimit-reset-requests';
const HEADER_ANTHROPIC_RESET = 'anthropic-ratelimit-requests-reset';

// ── RpmMonitor ───────────────────────────────────────────────────────

export class RpmMonitor {
  readonly #baseIntervalMs: number;
  readonly #maxBackoffMs: number;
  readonly #windowMs: number;

  #requestTimestamps: number[] = [];
  #backoffLevel = 0;
  #rateLimitErrorCount = 0;
  /** epoch ms — 服务端建议的"最早可重试时间" */
  #retryAfterUntil = 0;

  constructor(config: RpmMonitorConfig = {}) {
    const base = config.baseIntervalMs ?? DEFAULT_BASE;
    if (base <= 0) {
      throw new Error(`baseIntervalMs must be > 0, got ${base}`);
    }
    const maxBackoff = config.maxBackoffMs ?? DEFAULT_MAX_BACKOFF;
    if (maxBackoff < base) {
      throw new Error(`maxBackoffMs (${maxBackoff}) must be >= baseIntervalMs (${base})`);
    }
    this.#baseIntervalMs = base;
    this.#maxBackoffMs = maxBackoff;
    this.#windowMs = config.windowMs ?? DEFAULT_WINDOW;
  }

  // ── Request tracking ──────────────────────────────────────────

  recordRequest(timestamp: number = Date.now()): void {
    this.#requestTimestamps.push(timestamp);
    this.#evictOldTimestamps();
  }

  getCurrentRpm(): number {
    this.#evictOldTimestamps();
    return this.#requestTimestamps.length;
  }

  // ── Rate-limit handling ───────────────────────────────────────

  recordRateLimitError(headers: RateLimitHeaders): void {
    this.#rateLimitErrorCount++;
    this.#backoffLevel++;

    const retryAfterMs = parseRetryAfter(headers);
    if (retryAfterMs !== null && retryAfterMs > 0) {
      this.#retryAfterUntil = Math.max(this.#retryAfterUntil, Date.now() + retryAfterMs);
    }
  }

  recordSuccess(): void {
    this.#backoffLevel = 0;
    this.#retryAfterUntil = 0;
  }

  reset(): void {
    this.#requestTimestamps = [];
    this.#backoffLevel = 0;
    this.#rateLimitErrorCount = 0;
    this.#retryAfterUntil = 0;
  }

  // ── Queries ───────────────────────────────────────────────────

  isBackoffActive(): boolean {
    return this.#backoffLevel > 0;
  }

  getRateLimitErrorCount(): number {
    return this.#rateLimitErrorCount;
  }

  getRecommendedInterval(): number {
    if (this.#backoffLevel === 0) return this.#baseIntervalMs;

    // Exponential: base * 2^(level-1), capped at maxBackoff
    const exponential = this.#baseIntervalMs * Math.pow(2, this.#backoffLevel);
    const headerSuggested = this.#remainingRetryAfterMs();
    const candidate = Math.max(exponential, headerSuggested, this.#baseIntervalMs);
    return Math.min(candidate, this.#maxBackoffMs);
  }

  getBackoffState(): BackoffState {
    return {
      active: this.isBackoffActive(),
      level: this.#backoffLevel,
      intervalMs: this.getRecommendedInterval(),
      retryAfterMs: this.#remainingRetryAfterMs(),
      retryAfterUntil: this.#retryAfterUntil,
    };
  }

  // ── Private ──────────────────────────────────────────────────

  #evictOldTimestamps(): void {
    const cutoff = Date.now() - this.#windowMs;
    while (this.#requestTimestamps.length > 0 && this.#requestTimestamps[0] < cutoff) {
      this.#requestTimestamps.shift();
    }
  }

  #remainingRetryAfterMs(): number {
    if (this.#retryAfterUntil === 0) return 0;
    return Math.max(0, this.#retryAfterUntil - Date.now());
  }
}

// ── Header parsing ──────────────────────────────────────────────────

function lookupHeader(headers: RateLimitHeaders, key: string): string | undefined {
  const target = key.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === target) {
      if (Array.isArray(v)) return v[0];
      return v;
    }
  }
  return undefined;
}

function parseRetryAfter(headers: RateLimitHeaders): number | null {
  // Order of preference: Retry-After (HTTP standard), then provider-specific reset.
  const candidates = [
    HEADER_RETRY_AFTER,
    HEADER_ANTHROPIC_RESET,
    HEADER_OPENAI_RESET_REQ,
    HEADER_OPENAI_RESET,
  ];

  for (const key of candidates) {
    const raw = lookupHeader(headers, key);
    if (raw === undefined) continue;
    const parsed = parseDurationOrTimestamp(raw);
    if (parsed !== null) return parsed;
  }
  return null;
}

/** Parse "10s", "500ms", "10" (seconds), or ISO timestamp into ms-from-now. */
function parseDurationOrTimestamp(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;

  const msMatch = /^(\d+(?:\.\d+)?)ms$/i.exec(trimmed);
  if (msMatch) return Math.max(0, Math.round(Number(msMatch[1])));

  const sMatch = /^(\d+(?:\.\d+)?)s$/i.exec(trimmed);
  if (sMatch) return Math.max(0, Math.round(Number(sMatch[1]) * 1000));

  // Bare integer → seconds (HTTP Retry-After convention)
  if (/^\d+$/.test(trimmed)) {
    return Math.max(0, Number(trimmed) * 1000);
  }

  // Fallback ISO timestamp
  const ts = Date.parse(trimmed);
  if (!Number.isNaN(ts)) {
    return Math.max(0, ts - Date.now());
  }

  return null;
}
