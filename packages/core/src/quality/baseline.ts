// ── Types ────────────────────────────────────────────────────────────

export interface ChapterQualityScore {
  chapterNumber: number;
  /** AI 检测分（来自 AIGCDetector，越高越好） */
  aiScore: number;
  /** 节奏分（来自 CadenceAnalyzer） */
  cadenceScore: number;
  /** 综合质量分 0–100 */
  overallScore: number;
  timestamp: string;
}

export interface QualityBaselineConfig {
  bookId: string;
  /** 建立基线所需的最少章节数，默认 3 */
  minBaselineChapters?: number;
  /** 滑动窗口大小，默认 5 */
  windowSize?: number;
  /** 触发 critical 告警所需的连续恶化章节数，默认 3 */
  consecutiveDriftThreshold?: number;
  /** 单章漂移率阈值（基线分数下降百分比），默认 0.3 */
  driftRateThreshold?: number;
}

export interface Baseline {
  bookId: string;
  establishedAt: string;
  chaptersUsed: number[];
  avgScore: number;
  stdDev: number;
}

export type DriftAlert = 'none' | 'warning' | 'critical';

export interface DriftReport {
  hasDrift: boolean;
  /** 漂移率：(基线 - 窗口均分) / 基线，正值表示恶化 */
  driftRate: number;
  consecutiveDriftChapters: number;
  alert: DriftAlert;
  message?: string;
  baseline: Baseline | null;
  windowAvgScore: number;
}

// ── QualityBaseline ──────────────────────────────────────────────────

export class QualityBaseline {
  readonly #bookId: string;
  readonly #minBaselineChapters: number;
  readonly #windowSize: number;
  readonly #consecutiveDriftThreshold: number;
  readonly #driftRateThreshold: number;

  #chapters: ChapterQualityScore[] = [];
  #baseline: Baseline | null = null;

  constructor(config: QualityBaselineConfig) {
    this.#bookId = config.bookId;
    this.#minBaselineChapters = config.minBaselineChapters ?? 3;
    this.#windowSize = config.windowSize ?? 5;
    this.#consecutiveDriftThreshold = config.consecutiveDriftThreshold ?? 3;
    this.#driftRateThreshold = config.driftRateThreshold ?? 0.3;
  }

  addChapter(score: ChapterQualityScore, degraded = false): void {
    if (score.overallScore < 0 || score.overallScore > 100) {
      throw new Error(`overallScore must be in [0,100], got ${score.overallScore}`);
    }
    if (this.#chapters.some((c) => c.chapterNumber === score.chapterNumber)) {
      throw new Error(`Chapter ${score.chapterNumber} already exists`);
    }
    // PRD-034a: 降级章节（accept_with_warnings）不参与基线漂移检测
    if (degraded) return;
    this.#chapters.push(score);
    this.#chapters.sort((a, b) => a.chapterNumber - b.chapterNumber);
    this.#tryEstablishBaseline();
  }

  getBaseline(): Baseline | null {
    return this.#baseline
      ? { ...this.#baseline, chaptersUsed: [...this.#baseline.chaptersUsed] }
      : null;
  }

  /** Recompute baseline from the most recent N chapters */
  rebuild(): Baseline | null {
    if (this.#chapters.length < this.#minBaselineChapters) {
      return null;
    }
    const recent = this.#chapters.slice(-this.#minBaselineChapters);
    this.#baseline = this.#buildBaselineFrom(recent);
    return this.getBaseline();
  }

  detectDrift(): DriftReport {
    if (!this.#baseline) {
      return {
        hasDrift: false,
        driftRate: 0,
        consecutiveDriftChapters: 0,
        alert: 'none',
        baseline: null,
        windowAvgScore: 0,
      };
    }

    const baselineChapterNumbers = new Set(this.#baseline.chaptersUsed);
    const postBaseline = this.#chapters.filter((c) => !baselineChapterNumbers.has(c.chapterNumber));

    if (postBaseline.length === 0) {
      return {
        hasDrift: false,
        driftRate: 0,
        consecutiveDriftChapters: 0,
        alert: 'none',
        baseline: this.getBaseline(),
        windowAvgScore: this.#baseline.avgScore,
      };
    }

    // Sliding window: last N chapters after baseline
    const window = postBaseline.slice(-this.#windowSize);
    const windowAvgScore = avg(window.map((c) => c.overallScore));
    const driftRate = (this.#baseline.avgScore - windowAvgScore) / this.#baseline.avgScore;

    // Count consecutive degraded chapters from the latest backwards
    const consecutiveDriftChapters = this.#countConsecutiveDriftFromEnd(postBaseline);

    const hasDrift = driftRate > this.#driftRateThreshold;
    const alert = this.#classifyAlert(consecutiveDriftChapters, driftRate);
    const message = this.#buildMessage(alert, consecutiveDriftChapters, driftRate);

    return {
      hasDrift,
      driftRate,
      consecutiveDriftChapters,
      alert,
      message,
      baseline: this.getBaseline(),
      windowAvgScore,
    };
  }

  // ── Private ──────────────────────────────────────────────────────

  #tryEstablishBaseline(): void {
    if (this.#baseline) return;
    if (this.#chapters.length < this.#minBaselineChapters) return;
    const seed = this.#chapters.slice(0, this.#minBaselineChapters);
    this.#baseline = this.#buildBaselineFrom(seed);
  }

  #buildBaselineFrom(chapters: ChapterQualityScore[]): Baseline {
    const scores = chapters.map((c) => c.overallScore);
    const mean = avg(scores);
    const variance = scores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / scores.length;
    return {
      bookId: this.#bookId,
      establishedAt: new Date().toISOString(),
      chaptersUsed: chapters.map((c) => c.chapterNumber),
      avgScore: round(mean),
      stdDev: round(Math.sqrt(variance)),
    };
  }

  #countConsecutiveDriftFromEnd(chapters: ChapterQualityScore[]): number {
    if (!this.#baseline) return 0;
    const threshold = this.#baseline.avgScore * (1 - this.#driftRateThreshold);
    let count = 0;
    for (let i = chapters.length - 1; i >= 0; i--) {
      if (chapters[i].overallScore < threshold) {
        count++;
      } else {
        break;
      }
    }
    return count;
  }

  #classifyAlert(consecutive: number, driftRate: number): DriftAlert {
    if (consecutive >= this.#consecutiveDriftThreshold && driftRate > this.#driftRateThreshold) {
      return 'critical';
    }
    if (consecutive >= 1 && driftRate > this.#driftRateThreshold) {
      return 'warning';
    }
    return 'none';
  }

  #buildMessage(alert: DriftAlert, consecutive: number, driftRate: number): string | undefined {
    if (alert === 'none') return undefined;
    const pct = (driftRate * 100).toFixed(1);
    if (alert === 'critical') {
      return `连续 ${consecutive} 章质量恶化 ${pct}%（已超过 ${(this.#driftRateThreshold * 100).toFixed(0)}% 阈值），建议人工审核`;
    }
    return `近期质量出现恶化趋势（漂移率 ${pct}%），请关注`;
  }
}

// ── Utils ────────────────────────────────────────────────────────────

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
