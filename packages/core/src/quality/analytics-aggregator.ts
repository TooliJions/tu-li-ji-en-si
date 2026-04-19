import { AIGCDetector } from './ai-detector';
import { QualityBaseline, type ChapterQualityScore } from './baseline';

export interface ChapterQualityAnalyticsInput {
  chapterNumber: number;
  content: string;
  auditReport?: unknown | null;
  timestamp?: string;
}

export interface ChapterQualityAnalytics {
  chapterNumber: number;
  aiTraceScore: number;
  sentenceDiversity: number;
  avgParagraphLength: number;
  overallQualityScore: number;
  timestamp: string;
}

export interface AiTraceTrendPoint {
  chapter: number;
  score: number;
}

export interface AiTraceSummary {
  trend: AiTraceTrendPoint[];
  average: number;
  latest: number;
}

export interface QualityBaselineSummary {
  baseline: {
    version: number;
    basedOnChapters: number[];
    createdAt: string;
    metrics: {
      aiTraceScore: number;
      sentenceDiversity: number;
      avgParagraphLength: number;
    };
  };
  current: {
    aiTraceScore: number;
    sentenceDiversity: number;
    avgParagraphLength: number;
    driftPercentage: number;
    alert: boolean;
  };
}

export type BaselineAlertMetric = 'aiTraceScore' | 'sentenceDiversity' | 'avgParagraphLength';

export interface BaselineAlertSummary {
  metric: BaselineAlertMetric;
  baseline: number;
  threshold: number;
  windowSize: number;
  slidingAverage: number;
  chaptersAnalyzed: number[];
  triggered: boolean;
  consecutiveChapters: number;
  severity: 'ok' | 'warning' | 'critical';
  suggestedAction: string | null;
  inspirationShuffle: {
    available: boolean;
  };
}

export interface BuildChapterQualityAnalyticsOptions {
  detector?: AIGCDetector;
}

const DEFAULT_BASELINE_METRICS = {
  aiTraceScore: 0,
  sentenceDiversity: 0,
  avgParagraphLength: 0,
};

export function buildChapterQualityAnalytics(
  inputs: ChapterQualityAnalyticsInput[],
  options: BuildChapterQualityAnalyticsOptions = {},
): ChapterQualityAnalytics[] {
  const detector = options.detector ?? new AIGCDetector();

  return [...inputs]
    .sort((left, right) => left.chapterNumber - right.chapterNumber)
    .map((input) => {
      const aiReport = detector.detect(input.content);
      const styleMetrics = extractNarrativeMetrics(input.content);
      const auditScore = computeAuditScore(input.auditReport);
      const aiInverted = Math.max(0, 100 - aiReport.overallScore);

      return {
        chapterNumber: input.chapterNumber,
        aiTraceScore: round(aiReport.overallScore / 100),
        sentenceDiversity: styleMetrics.sentenceDiversity,
        avgParagraphLength: styleMetrics.avgParagraphLength,
        overallQualityScore: Math.round(auditScore * 0.6 + aiInverted * 0.4),
        timestamp: input.timestamp ?? new Date().toISOString(),
      };
    });
}

export function summarizeAiTrace(analytics: ChapterQualityAnalytics[]): AiTraceSummary {
  const trend = analytics.map((item) => ({
    chapter: item.chapterNumber,
    score: item.aiTraceScore,
  }));

  return {
    trend,
    average: round(avg(trend.map((item) => item.score))),
    latest: trend.length > 0 ? trend[trend.length - 1].score : 0,
  };
}

export function summarizeQualityBaseline(
  bookId: string,
  analytics: ChapterQualityAnalytics[],
): QualityBaselineSummary {
  if (analytics.length === 0) {
    return {
      baseline: {
        version: 1,
        basedOnChapters: [],
        createdAt: '',
        metrics: DEFAULT_BASELINE_METRICS,
      },
      current: {
        aiTraceScore: 0,
        sentenceDiversity: 0,
        avgParagraphLength: 0,
        driftPercentage: 0,
        alert: false,
      },
    };
  }

  const qualityBaseline = new QualityBaseline({ bookId, minBaselineChapters: 3, windowSize: 5 });
  for (const score of analytics.map(toChapterQualityScore)) {
    qualityBaseline.addChapter(score);
  }

  const baseline = qualityBaseline.getBaseline();
  const drift = qualityBaseline.detectDrift();
  const latest = analytics[analytics.length - 1];
  const baselineMetrics = averageMetricsByChapters(analytics, baseline?.chaptersUsed ?? []);

  return {
    baseline: {
      version: 1,
      basedOnChapters: baseline?.chaptersUsed ?? [],
      createdAt: baseline?.establishedAt ?? '',
      metrics: baselineMetrics,
    },
    current: {
      aiTraceScore: latest.aiTraceScore,
      sentenceDiversity: latest.sentenceDiversity,
      avgParagraphLength: latest.avgParagraphLength,
      driftPercentage: round(drift.driftRate),
      alert: drift.alert !== 'none',
    },
  };
}

export function summarizeBaselineAlert(
  analytics: ChapterQualityAnalytics[],
  metric: BaselineAlertMetric = 'aiTraceScore',
  windowSize = 3,
): BaselineAlertSummary {
  const chaptersAnalyzed = analytics.map((item) => item.chapterNumber);
  if (analytics.length === 0) {
    return {
      metric,
      baseline: 0,
      threshold: 0,
      windowSize,
      slidingAverage: 0,
      chaptersAnalyzed,
      triggered: false,
      consecutiveChapters: 0,
      severity: 'ok',
      suggestedAction: null,
      inspirationShuffle: { available: false },
    };
  }

  const baselineChapters = analytics.slice(0, Math.min(3, analytics.length));
  const postBaseline = analytics.slice(baselineChapters.length);
  const analysisWindowSource = postBaseline.length > 0 ? postBaseline : analytics;
  const analysisWindow = analysisWindowSource.slice(-Math.max(windowSize, 1));

  const baselineValue = round(avg(baselineChapters.map((item) => getMetricValue(item, metric))));
  const slidingAverage = round(avg(analysisWindow.map((item) => getMetricValue(item, metric))));
  const threshold = round(computeMetricThreshold(metric, baselineValue));
  const consecutiveChapters = countConsecutiveMetricDrift(analysisWindowSource, metric, threshold);
  const triggered = isMetricDriftTriggered(metric, slidingAverage, threshold);
  const severity = triggered && consecutiveChapters >= 3 ? 'critical' : triggered ? 'warning' : 'ok';

  return {
    metric,
    baseline: baselineValue,
    threshold,
    windowSize,
    slidingAverage,
    chaptersAnalyzed,
    triggered,
    consecutiveChapters,
    severity,
    suggestedAction: buildSuggestedAction(severity),
    inspirationShuffle: { available: triggered },
  };
}

function toChapterQualityScore(analytics: ChapterQualityAnalytics): ChapterQualityScore {
  return {
    chapterNumber: analytics.chapterNumber,
    aiScore: Math.round((1 - analytics.aiTraceScore) * 100),
    cadenceScore: 50,
    overallScore: analytics.overallQualityScore,
    timestamp: analytics.timestamp,
  };
}

function computeAuditScore(auditReport: unknown): number {
  if (!auditReport || typeof auditReport !== 'object') {
    return 50;
  }

  const tiers = (auditReport as { tiers?: Record<string, { total?: number; passed?: number }> }).tiers;
  if (!tiers) {
    return 50;
  }

  let totalItems = 0;
  let passedItems = 0;
  for (const tier of Object.values(tiers)) {
    totalItems += tier.total ?? 0;
    passedItems += tier.passed ?? 0;
  }

  if (totalItems === 0) {
    return 50;
  }

  return round((passedItems / totalItems) * 100);
}

function extractNarrativeMetrics(content: string): {
  sentenceDiversity: number;
  avgParagraphLength: number;
} {
  const sentences = content.split(/[。！？.!?\n]+/).filter((sentence) => sentence.trim().length > 2);
  if (sentences.length < 2) {
    return {
      sentenceDiversity: 0,
      avgParagraphLength: sentences[0]?.trim().length ?? 0,
    };
  }

  const lengths = sentences.map((sentence) => sentence.trim().length);
  const averageLength = avg(lengths);
  const variance = avg(lengths.map((length) => (length - averageLength) ** 2));
  const cv = averageLength > 0 ? Math.sqrt(variance) / averageLength : 0;

  return {
    sentenceDiversity: round(Math.min(cv * 2, 1)),
    avgParagraphLength: Math.round(averageLength),
  };
}

function averageMetricsByChapters(
  analytics: ChapterQualityAnalytics[],
  chapterNumbers: number[],
): QualityBaselineSummary['baseline']['metrics'] {
  if (chapterNumbers.length === 0) {
    return DEFAULT_BASELINE_METRICS;
  }

  const chapterSet = new Set(chapterNumbers);
  const selected = analytics.filter((item) => chapterSet.has(item.chapterNumber));
  if (selected.length === 0) {
    return DEFAULT_BASELINE_METRICS;
  }

  return {
    aiTraceScore: round(avg(selected.map((item) => item.aiTraceScore))),
    sentenceDiversity: round(avg(selected.map((item) => item.sentenceDiversity))),
    avgParagraphLength: Math.round(avg(selected.map((item) => item.avgParagraphLength))),
  };
}

function getMetricValue(
  analytics: ChapterQualityAnalytics,
  metric: BaselineAlertMetric,
): number {
  return analytics[metric];
}

function computeMetricThreshold(metric: BaselineAlertMetric, baselineValue: number): number {
  if (metric === 'sentenceDiversity') {
    return baselineValue * 0.95;
  }

  if (metric === 'avgParagraphLength') {
    return baselineValue * 1.15;
  }

  return baselineValue * 1.15;
}

function isMetricDriftTriggered(
  metric: BaselineAlertMetric,
  slidingAverage: number,
  threshold: number,
): boolean {
  if (metric === 'sentenceDiversity') {
    return slidingAverage < threshold;
  }

  return slidingAverage > threshold;
}

function countConsecutiveMetricDrift(
  analytics: ChapterQualityAnalytics[],
  metric: BaselineAlertMetric,
  threshold: number,
): number {
  let count = 0;
  for (let index = analytics.length - 1; index >= 0; index -= 1) {
    const value = getMetricValue(analytics[index], metric);
    if (isMetricDriftTriggered(metric, value, threshold)) {
      count += 1;
      continue;
    }

    break;
  }

  return count;
}

function buildSuggestedAction(
  severity: 'ok' | 'warning' | 'critical',
): string | null {
  if (severity === 'critical') {
    return '建议人工审核最近章节，或执行灵感洗牌获取不同风格的写作方案';
  }

  if (severity === 'warning') {
    return '关注后续章节质量变化趋势，考虑使用灵感洗牌功能';
  }

  return null;
}

function avg(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}