export type SchedulerMode = 'local' | 'cloud';

import type { RateLimitHeaders } from './types';
export type { RateLimitHeaders };

export interface SmartIntervalConfig {
  mode?: SchedulerMode;
  /** Cloud 模式必填：期望平均每分钟请求数 */
  targetRpm?: number;
  /** 间隔下界（ms）。Local 默认 0；Cloud 默认 100 */
  minIntervalMs?: number;
  /** 间隔上界（ms），默认 60_000 */
  maxIntervalMs?: number;
}

interface RateLimitSnapshot {
  remaining: number;
  resetMs: number; // ms until reset
}

const DEFAULT_MAX_INTERVAL = 60_000;
const DEFAULT_CLOUD_MIN = 100;
const DEFAULT_LOCAL_MIN = 0;

// Header keys (lowercase) — OpenAI / Anthropic style
const OPENAI_LIMIT = 'x-ratelimit-limit-requests';
const OPENAI_REMAINING = 'x-ratelimit-remaining-requests';
const OPENAI_RESET = 'x-ratelimit-reset-requests';
const ANTHROPIC_LIMIT = 'anthropic-ratelimit-requests-limit';
const ANTHROPIC_REMAINING = 'anthropic-ratelimit-requests-remaining';
const ANTHROPIC_RESET = 'anthropic-ratelimit-requests-reset';

// ── SmartInterval ────────────────────────────────────────────────────

export class SmartInterval {
  readonly #mode: SchedulerMode;
  readonly #targetRpm: number;
  readonly #minIntervalMs: number;
  readonly #maxIntervalMs: number;
  readonly #baseIntervalMs: number;

  #currentIntervalMs: number;
  #requestCount = 0;

  constructor(config: SmartIntervalConfig = {}) {
    this.#mode = config.mode ?? 'local';

    if (this.#mode === 'cloud') {
      if (config.targetRpm === undefined) {
        throw new Error('Cloud mode requires targetRpm');
      }
      if (config.targetRpm <= 0) {
        throw new Error(`targetRpm must be > 0, got ${config.targetRpm}`);
      }
      this.#targetRpm = config.targetRpm;
      this.#minIntervalMs = config.minIntervalMs ?? DEFAULT_CLOUD_MIN;
      this.#maxIntervalMs = config.maxIntervalMs ?? DEFAULT_MAX_INTERVAL;
      this.#baseIntervalMs = this.#clamp(Math.floor(60_000 / this.#targetRpm));
    } else {
      this.#targetRpm = 0;
      this.#minIntervalMs = config.minIntervalMs ?? DEFAULT_LOCAL_MIN;
      this.#maxIntervalMs = config.maxIntervalMs ?? DEFAULT_MAX_INTERVAL;
      this.#baseIntervalMs = 0;
    }

    this.#currentIntervalMs = this.#baseIntervalMs;
  }

  getMode(): SchedulerMode {
    return this.#mode;
  }

  getInterval(): number {
    return this.#currentIntervalMs;
  }

  getRequestCount(): number {
    return this.#requestCount;
  }

  recordRequest(): void {
    this.#requestCount++;
  }

  recordResponse(headers: RateLimitHeaders): void {
    if (this.#mode === 'local') return;

    // Anthropic headers take precedence (typically more restrictive on Claude API)
    const snapshot =
      this.#parseHeaders(headers, ANTHROPIC_LIMIT, ANTHROPIC_REMAINING, ANTHROPIC_RESET) ??
      this.#parseHeaders(headers, OPENAI_LIMIT, OPENAI_REMAINING, OPENAI_RESET);

    if (!snapshot) return;

    // Effective interval = time-until-reset / max(remaining, 1)
    const effectiveRemaining = Math.max(snapshot.remaining, 1);
    const requiredInterval = snapshot.resetMs / effectiveRemaining;

    // Choose the larger of base interval and required interval (slow down only)
    const next = Math.max(this.#baseIntervalMs, Math.ceil(requiredInterval));
    this.#currentIntervalMs = this.#clamp(next);
  }

  reset(): void {
    this.#currentIntervalMs = this.#baseIntervalMs;
    this.#requestCount = 0;
  }

  // ── Private ──────────────────────────────────────────────────

  #clamp(value: number): number {
    if (value < this.#minIntervalMs) return this.#minIntervalMs;
    if (value > this.#maxIntervalMs) return this.#maxIntervalMs;
    return value;
  }

  #parseHeaders(
    headers: RateLimitHeaders,
    _limitKey: string,
    remainingKey: string,
    resetKey: string
  ): RateLimitSnapshot | null {
    const remainingRaw = lookupHeader(headers, remainingKey);
    const resetRaw = lookupHeader(headers, resetKey);
    if (remainingRaw === undefined || resetRaw === undefined) return null;

    const remaining = Number.parseInt(remainingRaw, 10);
    if (!Number.isFinite(remaining) || remaining < 0) return null;

    const resetMs = parseResetMs(resetRaw);
    if (resetMs === null) return null;

    return { remaining, resetMs };
  }
}

// ── Header helpers ──────────────────────────────────────────────────

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

/** Parse reset header into ms-until-reset. Supports "60s", "500ms", or ISO timestamp. */
function parseResetMs(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;

  // "500ms"
  const msMatch = /^(\d+(?:\.\d+)?)ms$/i.exec(trimmed);
  if (msMatch) return Math.max(0, Math.round(Number(msMatch[1])));

  // "60s"
  const sMatch = /^(\d+(?:\.\d+)?)s$/i.exec(trimmed);
  if (sMatch) return Math.max(0, Math.round(Number(sMatch[1]) * 1000));

  // ISO timestamp
  const ts = Date.parse(trimmed);
  if (!Number.isNaN(ts)) {
    return Math.max(0, ts - Date.now());
  }

  // Bare number → seconds
  const num = Number(trimmed);
  if (Number.isFinite(num)) return Math.max(0, Math.round(num * 1000));

  return null;
}
