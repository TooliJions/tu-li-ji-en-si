// ─── Provider Reputation System ─────────────────────────────────

export interface ProviderReputation {
  name: string;
  score: number; // 0-100, default 100
  failures: number;
  successes: number;
  lastFailure: Date | null;
  cooldownUntil: Date | null;
}

const REPUTATION_PENALTY = 5;
const REPUTATION_RECOVERY = 1;
const COOLDOWN_MS = 5 * 60 * 1000;
const MIN_SCORE = 0;
const MAX_SCORE = 100;

export class ProviderReputationTracker {
  private reputations: Map<string, ProviderReputation>;

  constructor() {
    this.reputations = new Map();
  }

  register(name: string): void {
    this.reputations.set(name, {
      name,
      score: MAX_SCORE,
      failures: 0,
      successes: 0,
      lastFailure: null,
      cooldownUntil: null,
    });
  }

  get(name: string): ProviderReputation | null {
    return this.reputations.get(name) ?? null;
  }

  getAll(): ProviderReputation[] {
    return Array.from(this.reputations.values());
  }

  reset(name: string): void {
    const rep = this.reputations.get(name);
    if (rep) {
      rep.score = MAX_SCORE;
      rep.failures = 0;
      rep.successes = 0;
      rep.lastFailure = null;
      rep.cooldownUntil = null;
    }
  }

  recordSuccess(name: string): void {
    const rep = this.reputations.get(name);
    if (!rep) return;
    rep.successes++;
    rep.score = Math.min(MAX_SCORE, rep.score + REPUTATION_RECOVERY);
  }

  recordFailure(name: string): void {
    const rep = this.reputations.get(name);
    if (!rep) return;
    rep.failures++;
    rep.lastFailure = new Date();
    rep.score = Math.max(MIN_SCORE, rep.score - REPUTATION_PENALTY);
    if (rep.score < 50) {
      rep.cooldownUntil = new Date(Date.now() + COOLDOWN_MS);
    }
  }

  isInCooldown(name: string): boolean {
    const rep = this.reputations.get(name);
    if (!rep || !rep.cooldownUntil) return false;
    if (Date.now() < rep.cooldownUntil.getTime()) return true;
    rep.cooldownUntil = null;
    return false;
  }

  getSortedByScore(exclude?: string): ProviderReputation[] {
    return Array.from(this.reputations.values())
      .filter((r) => r.name !== exclude)
      .sort((a, b) => b.score - a.score);
  }
}
