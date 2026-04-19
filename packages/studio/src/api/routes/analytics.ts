import { Hono } from 'hono';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  StateManager,
  TelemetryLogger,
  buildChapterQualityAnalytics,
  summarizeAiTrace,
  summarizeBaselineAlert,
  summarizeQualityBaseline,
  EmotionalArcTracker,
  type EmotionalSnapshot,
  type EmotionType,
  type BaselineAlertMetric,
} from '@cybernovelist/core';
import type { ChapterIndex, Manifest } from '@cybernovelist/core';
import { getStudioRuntimeRootDir, getStudioLLMProvider, hasStudioBookRuntime } from '../core-bridge';

// ── Helpers ────────────────────────────────────────────────────────

function getStateManager(): StateManager {
  return new StateManager(getStudioRuntimeRootDir());
}

function getChapterAuditPath(bookId: string, chapterNumber: number): string {
  const padded = String(chapterNumber).padStart(4, '0');
  return path.join(getStudioRuntimeRootDir(), bookId, 'story', 'state', 'audits', `chapter-${padded}.json`);
}

function readIndex(bookId: string): ChapterIndex | null {
  const indexPath = path.join(getStudioRuntimeRootDir(), bookId, 'story', 'state', 'index.json');
  if (!fs.existsSync(indexPath)) return null;
  return JSON.parse(fs.readFileSync(indexPath, 'utf-8')) as ChapterIndex;
}

function readAuditReport(bookId: string, chapterNumber: number): unknown | null {
  const auditPath = getChapterAuditPath(bookId, chapterNumber);
  if (!fs.existsSync(auditPath)) return null;
  return JSON.parse(fs.readFileSync(auditPath, 'utf-8')) as unknown;
}

function readManifest(bookId: string): Manifest | null {
  const manifestPath = path.join(getStudioRuntimeRootDir(), bookId, 'story', 'state', 'manifest.json');
  if (!fs.existsSync(manifestPath)) return null;
  return JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as Manifest;
}

function readChapterContent(bookId: string, chapterNumber: number): string | null {
  const filePath = getStateManager().getChapterFilePath(bookId, chapterNumber);
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, 'utf-8');
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  return match ? raw.slice(match[0].length).trim() : raw.trim();
}

function readChapterQualityAnalytics(bookId: string) {
  const index = readIndex(bookId);
  if (!index) {
    return [];
  }

  return buildChapterQualityAnalytics(
    index.chapters
      .filter((chapter) => chapter.wordCount > 0)
      .map((chapter) => {
        const content = readChapterContent(bookId, chapter.number);
        if (!content) {
          return null;
        }

        return {
          chapterNumber: chapter.number,
          content,
          auditReport: readAuditReport(bookId, chapter.number),
          timestamp: chapter.createdAt,
        };
      })
      .filter((chapter): chapter is NonNullable<typeof chapter> => chapter !== null),
  );
}

// ── Emotion keyword-based heuristic ────────────────────────────────

const EMOTION_KEYWORDS: Record<EmotionType, string[]> = {
  joy: ['笑', '喜悦', '欢喜', '快乐', '开心', '幸福', '愉快', '欢欣', '高兴', '欢喜', '欢乐', '欣喜', '雀跃', '欢畅'],
  anger: ['愤怒', '怒火', '恼怒', '暴躁', '生气', '愤慨', '暴怒', '恼火', '愤懑', '怒视', '咆哮', '愤恨'],
  sadness: ['悲伤', '痛苦', '难过', '哀伤', '哭泣', '眼泪', '泪', '伤心', '悲痛', '忧伤', '沮丧', '失落', '凄凉', '悲凉', '泪'],
  fear: ['恐惧', '害怕', '惊慌', '惊恐', '畏惧', '胆怯', '恐慌', '恐惧', '战栗', '颤抖', '不安', '惶恐'],
  surprise: ['惊讶', '吃惊', '震惊', '意外', '愕然', '诧异', '惊愕', '目瞪口呆', '惊呆', '愣住'],
  disgust: ['厌恶', '恶心', '憎恶', '反感', '鄙视', '嫌弃', '鄙夷', '作呕'],
  trust: ['信任', '信赖', '依靠', '放心', '安心', '可靠', '相信', '托付', '坚定'],
  anticipation: ['期待', '盼望', '期望', '等候', '等待', '盼望', '憧憬', '盼望', '渴望', '期盼'],
};

function computeEmotionsFromText(text: string): Partial<Record<EmotionType, number>> {
  const emotionScores: Partial<Record<EmotionType, number>> = {};
  const totalWords = text.length;
  if (totalWords === 0) return emotionScores;

  for (const [emotion, keywords] of Object.entries(EMOTION_KEYWORDS)) {
    let hits = 0;
    for (const kw of keywords) {
      const re = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      const matches = text.match(re);
      if (matches) hits += matches.length;
    }
    // Normalize: raw hits / total_chars, capped at 0.5 per emotion to prevent dominance
    const raw = hits / (totalWords / 100); // hits per 100 chars
    emotionScores[emotion as EmotionType] = Math.min(raw * 0.15, 0.5);
  }

  // Normalize to sum to ~1.0 if any emotions detected
  const total = Object.values(emotionScores).reduce((sum, value) => sum + (value ?? 0), 0);
  if (total > 0.01) {
    for (const k of Object.keys(emotionScores)) {
      emotionScores[k as EmotionType] = emotionScores[k as EmotionType]! / total;
    }
  }

  return emotionScores;
}

// ── Router ─────────────────────────────────────────────────────────

export function createAnalyticsRouter(): Hono {
  const router = new Hono();

  // GET /api/books/:bookId/analytics/word-count
  router.get('/word-count', (c) => {
    const bookId = c.req.param('bookId')!;
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const index = readIndex(bookId);
    if (!index) {
      return c.json({ data: { totalWords: 0, averagePerChapter: 0, chapters: [] } });
    }

    const chapters = index.chapters
      .filter((ch) => ch.wordCount > 0)
      .map((ch) => ({ number: ch.number, words: ch.wordCount }));

    const totalWords = index.totalWords;
    const chapterCount = chapters.length;
    const averagePerChapter = chapterCount > 0 ? Math.round(totalWords / chapterCount) : 0;

    return c.json({
      data: { totalWords, averagePerChapter, chapters },
    });
  });

  // GET /api/books/:bookId/analytics/audit-rate
  router.get('/audit-rate', (c) => {
    const bookId = c.req.param('bookId')!;
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const index = readIndex(bookId);
    if (!index) {
      return c.json({ data: { totalAudits: 0, passRate: 0, perChapter: [] } });
    }

    const perChapter: { number: number; passed: boolean }[] = [];
    let totalAudits = 0;
    let passedCount = 0;

    for (const ch of index.chapters) {
      const report = readAuditReport(bookId, ch.number);
      if (report) {
        totalAudits++;
        const isPassed = (report as Record<string, unknown>).overallStatus === 'passed';
        if (isPassed) passedCount++;
        perChapter.push({ number: ch.number, passed: isPassed });
      }
    }

    return c.json({
      data: {
        totalAudits,
        passRate: totalAudits > 0 ? passedCount / totalAudits : 0,
        perChapter,
      },
    });
  });

  // GET /api/books/:bookId/analytics/token-usage
  router.get('/token-usage', (c) => {
    const bookId = c.req.param('bookId')!;
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const telemetry = new TelemetryLogger(getStudioRuntimeRootDir()).listBookTelemetry(bookId);
    const perChannel = {
      writer: 0,
      auditor: 0,
      planner: 0,
      composer: 0,
      reviser: 0,
    };
    let totalTokens = 0;

    for (const chapter of telemetry) {
      perChannel.writer += chapter.channels.writer.totalTokens;
      perChannel.auditor += chapter.channels.auditor.totalTokens;
      perChannel.planner += chapter.channels.planner.totalTokens;
      perChannel.composer += chapter.channels.composer.totalTokens;
      perChannel.reviser += chapter.channels.reviser.totalTokens;
      totalTokens += chapter.totalTokens;
    }

    return c.json({
      data: {
        totalTokens,
        perChannel,
        perChapter: telemetry.map((chapter) => ({
          chapter: chapter.chapterNumber,
          totalTokens: chapter.totalTokens,
          channels: {
            writer: chapter.channels.writer.totalTokens,
            auditor: chapter.channels.auditor.totalTokens,
            planner: chapter.channels.planner.totalTokens,
            composer: chapter.channels.composer.totalTokens,
            reviser: chapter.channels.reviser.totalTokens,
          },
        })),
      },
    });
  });

  // GET /api/books/:bookId/analytics/ai-trace
  router.get('/ai-trace', (c) => {
    const bookId = c.req.param('bookId')!;
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const index = readIndex(bookId);
    if (!index || index.chapters.length === 0) {
      return c.json({ data: { trend: [], average: 0, latest: 0 } });
    }

    const analytics = readChapterQualityAnalytics(bookId);
    return c.json({ data: summarizeAiTrace(analytics) });
  });

  // GET /api/books/:bookId/analytics/quality-baseline
  router.get('/quality-baseline', (c) => {
    const bookId = c.req.param('bookId')!;
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const index = readIndex(bookId);
    if (!index || index.chapters.length === 0) {
      return c.json({
        data: {
          baseline: { version: 1, basedOnChapters: [], createdAt: '', metrics: { aiTraceScore: 0, sentenceDiversity: 0, avgParagraphLength: 0 } },
          current: { aiTraceScore: 0, sentenceDiversity: 0, avgParagraphLength: 0, driftPercentage: 0, alert: false },
        },
      });
    }

    const analytics = readChapterQualityAnalytics(bookId);
    return c.json({ data: summarizeQualityBaseline(bookId, analytics) });
  });

  // GET /api/books/:bookId/analytics/baseline-alert
  router.get('/baseline-alert', (c) => {
    const bookId = c.req.param('bookId')!;
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const metric = (c.req.query('metric') || 'aiTraceScore') as BaselineAlertMetric;
    const windowSize = parseInt(c.req.query('window') || '3', 10);

    const index = readIndex(bookId);
    if (!index || index.chapters.length === 0) {
      return c.json({
        data: {
          metric, baseline: 0, threshold: 0, windowSize,
          slidingAverage: 0, chaptersAnalyzed: [],
          triggered: false, consecutiveChapters: 0,
          severity: 'ok', suggestedAction: null,
          inspirationShuffle: { available: false },
        },
      });
    }

    const analytics = readChapterQualityAnalytics(bookId);
    return c.json({ data: summarizeBaselineAlert(analytics, metric, windowSize) });
  });

  // POST /api/books/:bookId/analytics/inspiration-shuffle
  router.post('/inspiration-shuffle', async (c) => {
    const bookId = c.req.param('bookId')!;
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const index = readIndex(bookId);
    if (!index || index.chapters.length === 0) {
      return c.json({
        data: {
          alternatives: [],
          generationTime: 0,
          available: false,
          reason: 'no_chapters',
        },
      });
    }

    const latest = index.chapters[index.chapters.length - 1];
    const latestContent = readChapterContent(bookId, latest.number);
    if (!latestContent) {
      return c.json({
        data: {
          alternatives: [],
          generationTime: 0,
          available: false,
          reason: 'no_content',
        },
      });
    }

    const styles: Array<{
      id: string;
      style: string;
      label: string;
      characteristics: string[];
      promptDirective: string;
    }> = [
      {
        id: 'A',
        style: 'fast_paced',
        label: '快节奏视角',
        characteristics: ['紧凑', '短句', '强推进'],
        promptDirective: '请将章节改写为快节奏、短句为主、强推进情节的版本。',
      },
      {
        id: 'B',
        style: 'emotional',
        label: '细腻情感',
        characteristics: ['情绪深度', '心理刻画', '慢镜头'],
        promptDirective: '请将章节改写为情感细腻、强化心理刻画的版本。',
      },
      {
        id: 'C',
        style: 'contemplative',
        label: '内省冷静',
        characteristics: ['哲思', '节制', '克制'],
        promptDirective: '请将章节改写为冷静内省、节制克制、含哲思的版本。',
      },
    ];

    const provider = getStudioLLMProvider();
    const start = Date.now();

    const results = await Promise.all(
      styles.map(async (s) => {
        try {
          const prompt = `你是一位风格改写师。
${s.promptDirective}

## 原内容（节选）
${latestContent.substring(0, 2000)}

请直接输出改写后的正文（控制在 500 字内）。`;
          const resp = await provider.generate({ prompt });
          return {
            id: s.id,
            style: s.style,
            label: s.label,
            text: resp.text,
            wordCount: resp.text.length,
            characteristics: s.characteristics,
          };
        } catch {
          return {
            id: s.id,
            style: s.style,
            label: s.label,
            text: '',
            wordCount: 0,
            characteristics: s.characteristics,
          };
        }
      })
    );

    const generationTime = (Date.now() - start) / 1000;

    return c.json({
      data: {
        alternatives: results,
        generationTime,
        available: results.some((r) => r.wordCount > 0),
      },
    });
  });

  // GET /api/books/:bookId/analytics/emotional-arcs
  router.get('/emotional-arcs', (c) => {
    const bookId = c.req.param('bookId')!;
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const index = readIndex(bookId);
    const manifest = readManifest(bookId);
    if (!index || !manifest || manifest.characters.length === 0) {
      return c.json({ data: { characters: [], alerts: [] } });
    }

    const chaptersWithContent = index.chapters
      .filter((ch) => ch.wordCount > 0)
      .map((ch) => ch.number);

    if (chaptersWithContent.length === 0) {
      return c.json({ data: { characters: [], alerts: [] } });
    }

    // Build snapshots per character per chapter
    const snapshots: EmotionalSnapshot[] = [];

    for (const character of manifest.characters) {
      for (const chNum of chaptersWithContent) {
        const content = readChapterContent(bookId, chNum);
        if (!content) continue;

        const emotions = computeEmotionsFromText(content);
        if (Object.keys(emotions).length === 0) continue;

        snapshots.push({
          chapterNumber: chNum,
          character: character.name,
          emotions,
          timestamp: new Date().toISOString(),
        });
      }
    }

    const tracker = new EmotionalArcTracker();
    const report = tracker.analyze(snapshots);

    return c.json({ data: { characters: report.characters, alerts: report.alerts } });
  });

  return router;
}
