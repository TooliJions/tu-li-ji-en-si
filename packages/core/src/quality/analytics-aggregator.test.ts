import { describe, it, expect } from 'vitest';
import {
  buildChapterQualityAnalytics,
  summarizeAiTrace,
  summarizeBaselineAlert,
  summarizeQualityBaseline,
} from './analytics-aggregator';

const chapterInputs = [
  {
    chapterNumber: 1,
    content:
      '林晨推门。' +
      '桌上摊着一叠厚厚的试卷，边角被雨水泡皱。' +
      '走廊尽头忽然传来急促脚步声，他下意识把纸页塞进书包最底层。',
    audit: { passedItems: 10, totalItems: 12, overallStatus: 'passed' },
  },
  {
    chapterNumber: 2,
    content:
      '苏小雨压低声音提醒他钥匙不见了。' +
      '林晨没有立刻回答。' +
      '他只是盯着纸条末尾那串极短的编号，忽然想起昨晚自己漏看的那一页名单。',
    audit: { passedItems: 9, totalItems: 12, overallStatus: 'passed' },
  },
  {
    chapterNumber: 3,
    content:
      '档案室的灯很暗。' +
      '风从窗缝里灌进来。' +
      '林晨借着那点摇晃的光，终于在名单最末尾看见了那个被反复划掉的名字。',
    audit: { passedItems: 11, totalItems: 12, overallStatus: 'passed' },
  },
  {
    chapterNumber: 4,
    content:
      '夜幕降临，华灯初上。岁月如梭，光阴似箭。综上所述，让我们来看看接下来会发生什么。' +
      '林晨心中涌起一阵莫名的感觉，仿佛一切都将从这里开始。',
    audit: { passedItems: 4, totalItems: 12, overallStatus: 'failed' },
  },
];

describe('analytics-aggregator', () => {
  it('builds chapter analytics from content and audit summaries', () => {
    const analytics = buildChapterQualityAnalytics(chapterInputs);

    expect(analytics).toHaveLength(4);
    expect(analytics[0].chapterNumber).toBe(1);
    expect(analytics.every((item) => item.aiTraceScore >= 0 && item.aiTraceScore <= 1)).toBe(true);
    expect(analytics.every((item) => item.sentenceDiversity >= 0 && item.sentenceDiversity <= 1)).toBe(true);
    expect(analytics[3].overallQualityScore).toBeLessThan(analytics[0].overallQualityScore);
  });

  it('summarizes ai trace trend from core analytics output', () => {
    const analytics = buildChapterQualityAnalytics(chapterInputs);
    const summary = summarizeAiTrace(analytics);

    expect(summary.trend).toHaveLength(4);
    expect(summary.trend[3].chapter).toBe(4);
    expect(summary.latest).toBe(summary.trend[3].score);
    expect(summary.average).toBeGreaterThan(0);
  });

  it('derives baseline metrics from baseline chapters and current metrics from latest chapter', () => {
    const analytics = buildChapterQualityAnalytics(chapterInputs);
    const summary = summarizeQualityBaseline('book-001', analytics);

    expect(summary.baseline.basedOnChapters).toEqual([1, 2, 3]);
    expect(summary.current.aiTraceScore).toBe(analytics[3].aiTraceScore);
    expect(summary.current.avgParagraphLength).toBe(analytics[3].avgParagraphLength);
    expect(summary.baseline.metrics.aiTraceScore).not.toBe(summary.current.aiTraceScore);
    expect(summary.baseline.metrics.avgParagraphLength).not.toBe(summary.current.avgParagraphLength);
  });

  it('computes metric-specific baseline alerts from aggregated chapter metrics', () => {
    const analytics = buildChapterQualityAnalytics(chapterInputs);
    const aiTraceAlert = summarizeBaselineAlert(analytics, 'aiTraceScore', 2);
    const diversityAlert = summarizeBaselineAlert(analytics, 'sentenceDiversity', 2);

    expect(aiTraceAlert.metric).toBe('aiTraceScore');
    expect(aiTraceAlert.chaptersAnalyzed).toEqual([1, 2, 3, 4]);
    expect(aiTraceAlert.triggered).toBe(true);
    expect(aiTraceAlert.slidingAverage).toBeGreaterThan(aiTraceAlert.baseline);

    expect(diversityAlert.metric).toBe('sentenceDiversity');
    expect(diversityAlert.chaptersAnalyzed).toEqual([1, 2, 3, 4]);
    expect(diversityAlert.triggered).toBe(true);
    expect(diversityAlert.slidingAverage).toBeLessThan(diversityAlert.baseline);
  });
});