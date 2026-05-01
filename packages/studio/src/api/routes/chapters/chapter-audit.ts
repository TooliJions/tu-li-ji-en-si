import { AIGCDetector } from '@cybernovelist/core';
import {
  type ChapterAuditReport,
  type AuditCheck,
  type AuditTierSummary,
  readAuditReport,
  writeAuditReport,
  isLegacyAuditReport,
} from './chapter-reader';

const detector = new AIGCDetector();

const CATEGORY_LABELS: Record<string, string> = {
  'cliche-phrase': '套话堆积',
  'monotonous-syntax': '句式单调',
  'analytical-report': '报告体表达',
  'meta-narrative': '元叙事跳出',
  'imagery-repetition': '意象重复',
  'semantic-repetition': '语义重复',
  'logic-gap': '逻辑跳跃',
  'false-emotion': '情绪失真',
  'hollow-description': '描写空泛',
};

function toTierSummary(severity: AuditCheck['severity'], checks: AuditCheck[]): AuditTierSummary {
  const tierChecks = checks.filter((check) => check.severity === severity);
  const items = tierChecks
    .filter((check) => !check.passed)
    .map((check) => ({
      rule: check.rule,
      severity,
      message: check.message ?? '未通过',
    }));

  return {
    total: tierChecks.length,
    passed: tierChecks.filter((check) => check.passed).length,
    failed: items.length,
    items,
  };
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function countMatches(content: string, pattern: RegExp): number {
  return content.match(pattern)?.length ?? 0;
}

export function buildChapterAuditReport(
  chapterNumber: number,
  content: string,
): ChapterAuditReport {
  const normalizedContent = content.trim();
  const paragraphs =
    normalizedContent.length > 0
      ? normalizedContent.split(/\n\s*\n/).filter((paragraph) => paragraph.trim().length > 0)
      : [];
  const sentences = normalizedContent
    .split(/[。！？.!?]+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
  const detection = detector.detect(normalizedContent);
  const highRiskCategories = detection.categories.filter(
    (category) => category.severity === 'high',
  );
  const mediumRiskCategories = detection.categories.filter(
    (category) => category.severity === 'medium',
  );
  const lowRiskCategories = detection.categories.filter((category) => category.severity === 'low');

  const checks: AuditCheck[] = [
    {
      rule: 'content_non_empty',
      severity: 'blocker',
      passed: normalizedContent.length > 0,
      message: '章节正文为空，无法执行有效审计。',
    },
    {
      rule: 'minimum_narrative_sample',
      severity: 'blocker',
      passed: normalizedContent.length >= 60,
      message: `当前正文仅 ${normalizedContent.length} 字，样本过短，无法支撑稳定判断。`,
    },
    {
      rule: 'ai_trace_high_risk',
      severity: 'blocker',
      passed: detection.overallScore < 55,
      message: `AI 痕迹评分 ${detection.overallScore}，已超过高风险阈值。`,
    },
    {
      rule: 'paragraph_structure',
      severity: 'warning',
      passed: paragraphs.length >= 2,
      message: `当前仅 ${paragraphs.length} 个段落，结构支撑偏弱。`,
    },
    {
      rule: 'sentence_support',
      severity: 'warning',
      passed: sentences.length >= 3,
      message: `当前仅 ${sentences.length} 句，细节展开不足。`,
    },
    {
      rule: 'ai_trace_medium_risk',
      severity: 'warning',
      passed: mediumRiskCategories.length === 0,
      message: `检测到 ${mediumRiskCategories.length} 项中风险 AI 痕迹。`,
    },
    {
      rule: 'detail_density',
      severity: 'suggestion',
      passed: normalizedContent.length >= 180,
      message: `正文长度为 ${normalizedContent.length} 字，可继续补强场景细节。`,
    },
    {
      rule: 'stylistic_noise',
      severity: 'suggestion',
      passed: lowRiskCategories.length === 0,
      message: `检测到 ${lowRiskCategories.length} 项轻度风格噪音。`,
    },
  ];

  for (const category of highRiskCategories) {
    checks.push({
      rule: category.category,
      severity: 'blocker',
      passed: false,
      message: `${CATEGORY_LABELS[category.category] ?? category.category}：${
        category.issues[0]?.detail ?? '存在明显高风险模式'
      }`,
    });
  }

  for (const category of mediumRiskCategories) {
    checks.push({
      rule: category.category,
      severity: 'warning',
      passed: false,
      message: `${CATEGORY_LABELS[category.category] ?? category.category}：${
        category.issues[0]?.detail ?? '存在中风险模式'
      }`,
    });
  }

  for (const category of lowRiskCategories) {
    checks.push({
      rule: category.category,
      severity: 'suggestion',
      passed: false,
      message: `${CATEGORY_LABELS[category.category] ?? category.category}：${
        category.issues[0]?.detail ?? '存在轻度模式'
      }`,
    });
  }

  const blocker = toTierSummary('blocker', checks);
  const warning = toTierSummary('warning', checks);
  const suggestion = toTierSummary('suggestion', checks);
  const dialogueMarks = countMatches(normalizedContent, /[“”「」]/g) / 2;
  const descriptionHits = countMatches(
    normalizedContent,
    /雨|风|灯|夜|街|窗|门|脚步|阴影|回声|光|雾|墙|楼/g,
  );
  const emotionHits = countMatches(
    normalizedContent,
    /心|痛|怕|怒|喜|悲|慌|压住|迟疑|紧张|松了口气/g,
  );
  const avgSentenceLength = sentences.length > 0 ? normalizedContent.length / sentences.length : 0;
  const categoryScores = detection.categories.map((category) => category.score / 100);

  return {
    chapterNumber,
    overallStatus: blocker.failed > 0 || warning.failed >= 2 ? 'needs_revision' : 'passed',
    tiers: { blocker, warning, suggestion },
    radarScores: [
      { dimension: 'ai_trace', label: 'AI 痕迹', score: clampScore(detection.overallScore / 100) },
      {
        dimension: 'coherence',
        label: '连贯性',
        score: clampScore(1 - blocker.failed * 0.22 - warning.failed * 0.08),
      },
      {
        dimension: 'pacing',
        label: '节奏',
        score: clampScore(
          0.45 + Math.min(sentences.length, 8) * 0.05 - Math.abs(avgSentenceLength - 26) * 0.01,
        ),
      },
      {
        dimension: 'dialogue',
        label: '对话',
        score: clampScore(dialogueMarks > 0 ? 0.45 + Math.min(dialogueMarks, 4) * 0.12 : 0.45),
      },
      {
        dimension: 'description',
        label: '描写',
        score: clampScore(0.35 + Math.min(descriptionHits, 6) * 0.09),
      },
      {
        dimension: 'emotion',
        label: '情感',
        score: clampScore(0.35 + Math.min(emotionHits, 6) * 0.08),
      },
      {
        dimension: 'innovation',
        label: '创新',
        score: clampScore(1 - average(categoryScores)),
      },
      {
        dimension: 'completeness',
        label: '完整性',
        score: clampScore(
          Math.min(1, normalizedContent.length / 280) * 0.7 +
            Math.min(1, paragraphs.length / 3) * 0.3,
        ),
      },
    ],
  };
}

export function readNormalizedAuditReport(
  bookId: string,
  chapterNumber: number,
  content: string,
): unknown | null {
  const report = readAuditReport(bookId, chapterNumber);
  if (!report) {
    return null;
  }

  if (!isLegacyAuditReport(report)) {
    return report;
  }

  const normalizedReport = buildChapterAuditReport(chapterNumber, content);
  writeAuditReport(bookId, chapterNumber, normalizedReport);
  return normalizedReport;
}
