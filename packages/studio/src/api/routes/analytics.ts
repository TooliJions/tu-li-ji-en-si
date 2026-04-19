import { Hono } from 'hono';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { StateManager } from '@cybernovelist/core';
import { AIGCDetector } from '@cybernovelist/core/src/quality/ai-detector';
import { QualityBaseline, type ChapterQualityScore } from '@cybernovelist/core/src/quality/baseline';
import { EmotionalArcTracker, type EmotionalSnapshot, type EmotionType } from '@cybernovelist/core/src/quality/emotional-arc-tracker';
import type { ChapterIndex, Manifest } from '@cybernovelist/core';
import type { DetectionReport } from '@cybernovelist/core/src/quality/ai-detector';
import type { DriftReport } from '@cybernovelist/core/src/quality/baseline';
import { getStudioRuntimeRootDir, hasStudioBookRuntime } from '../core-bridge';

// ── Helpers ────────────────────────────────────────────────────────

function getStateManager(): StateManager {
  return new StateManager(getStudioRuntimeRootDir());
}

function getChapterAuditPath(bookId: string, chapterNumber: number): string {
  const padded = String(chapterNumber).padStart(4, '0');
  return path.join(getStudioRuntimeRootDir(), bookId, 'story', 'state', 'audits', `chapter-${padded}.json`);
}

function getEmotionalArcsPath(bookId: string): string {
  return path.join(getStudioRuntimeRootDir(), bookId, 'story', 'state', 'emotional_arcs.md');
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
  const total = Object.values(emotionScores).reduce((s, v) => s + v, 0);
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

    // Token usage is not instrumented yet; return zeros with flag
    return c.json({
      data: {
        totalTokens: 0,
        perChapter: {
          writer: 0,
          auditor: 0,
          planner: 0,
          composer: 0,
          reviser: 0,
        },
        instrumented: false,
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

    const detector = new AIGCDetector();
    const trend: { chapter: number; score: number }[] = [];

    for (const ch of index.chapters) {
      if (ch.wordCount === 0) continue;
      const content = readChapterContent(bookId, ch.number);
      if (!content) continue;

      const report = detector.detect(content);
      // overallScore is 0-100, normalize to 0-1
      const normalizedScore = report.overallScore / 100;
      trend.push({ chapter: ch.number, score: normalizedScore });
    }

    const average = trend.length > 0
      ? trend.reduce((s, t) => s + t.score, 0) / trend.length
      : 0;
    const latest = trend.length > 0 ? trend[trend.length - 1].score : 0;

    return c.json({ data: { trend, average, latest } });
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

    const detector = new AIGCDetector();
    const baseline = new QualityBaseline({ bookId, minBaselineChapters: 3, windowSize: 5 });
    const chapterScores: ChapterQualityScore[] = [];

    for (const ch of index.chapters) {
      if (ch.wordCount === 0) continue;
      const content = readChapterContent(bookId, ch.number);
      if (!content) continue;

      const aiReport = detector.detect(content);
      const auditReport = readAuditReport(bookId, ch.number);

      // Audit pass rate: check tier passed counts
      let auditScore = 50; // default
      if (auditReport) {
        const tiers = (auditReport as Record<string, unknown>).tiers as Record<string, { total: number; passed: number }> | undefined;
        if (tiers) {
          let totalItems = 0;
          let passedItems = 0;
          for (const tier of Object.values(tiers)) {
            totalItems += tier.total;
            passedItems += tier.passed;
          }
          auditScore = totalItems > 0 ? (passedItems / totalItems) * 100 : 50;
        }
      }

      // AI score: invert AIGC detection (lower AIGC = better quality)
      const aiInverted = Math.max(0, 100 - aiReport.overallScore);

      // Composite: 60% audit + 40% AI
      const overall = Math.round(auditScore * 0.6 + aiInverted * 0.4);

      chapterScores.push({
        chapterNumber: ch.number,
        aiScore: aiReport.overallScore,
        cadenceScore: 50, // simplified
        overallScore: overall,
        timestamp: new Date().toISOString(),
      });
    }

    for (const score of chapterScores) {
      baseline.addChapter(score);
    }

    const base = baseline.getBaseline();
    const drift = baseline.detectDrift();

    // Compute sentence diversity from latest chapter
    let sentenceDiversity = 0.82;
    let avgParagraphLength = 48;
    const latestChapter = index.chapters[index.chapters.length - 1];
    if (latestChapter && latestChapter.wordCount > 0) {
      const content = readChapterContent(bookId, latestChapter.number);
      if (content) {
        const sentences = content.split(/[。！？.\n]+/).filter((s) => s.trim().length > 2);
        if (sentences.length >= 2) {
          const lengths = sentences.map((s) => s.length);
          const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
          const variance = lengths.reduce((sum, l) => sum + (l - avg) ** 2, 0) / lengths.length;
          const cv = avg > 0 ? Math.sqrt(variance) / avg : 0;
          sentenceDiversity = Math.min(cv * 2, 1);
          avgParagraphLength = Math.round(avg);
        }
      }
    }

    const currentAiTrace = chapterScores.length > 0
      ? chapterScores[chapterScores.length - 1].aiScore / 100
      : 0;

    return c.json({
      data: {
        baseline: {
          version: 1,
          basedOnChapters: base?.chaptersUsed ?? [],
          createdAt: base?.establishedAt ?? new Date().toISOString(),
          metrics: {
            aiTraceScore: currentAiTrace,
            sentenceDiversity: Math.round(sentenceDiversity * 100) / 100,
            avgParagraphLength,
          },
        },
        current: {
          aiTraceScore: currentAiTrace,
          sentenceDiversity: Math.round(sentenceDiversity * 100) / 100,
          avgParagraphLength,
          driftPercentage: drift.driftRate,
          alert: drift.alert !== 'none',
        },
      },
    });
  });

  // GET /api/books/:bookId/analytics/baseline-alert
  router.get('/baseline-alert', (c) => {
    const bookId = c.req.param('bookId')!;
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const metric = c.req.query('metric') || 'aiTraceScore';
    const windowSize = parseInt(c.req.query('window') || '3', 10);
    const threshold = metric === 'aiTraceScore' ? 0.2 : 0.3;

    const index = readIndex(bookId);
    if (!index || index.chapters.length === 0) {
      return c.json({
        data: {
          metric, baseline: 0.15, threshold, windowSize,
          slidingAverage: 0.15, chaptersAnalyzed: [],
          triggered: false, consecutiveChapters: 0,
          severity: 'ok', suggestedAction: null,
          inspirationShuffle: { available: false },
        },
      });
    }

    // Build baseline for drift detection
    const detector = new AIGCDetector();
    const bl = new QualityBaseline({ bookId, minBaselineChapters: 3, windowSize });

    for (const ch of index.chapters) {
      if (ch.wordCount === 0) continue;
      const content = readChapterContent(bookId, ch.number);
      if (!content) continue;

      const aiReport = detector.detect(content);
      const auditReport = readAuditReport(bookId, ch.number);

      let auditScore = 50;
      if (auditReport) {
        const tiers = (auditReport as Record<string, unknown>).tiers as Record<string, { total: number; passed: number }> | undefined;
        if (tiers) {
          let totalItems = 0;
          let passedItems = 0;
          for (const tier of Object.values(tiers)) {
            totalItems += tier.total;
            passedItems += tier.passed;
          }
          auditScore = totalItems > 0 ? (passedItems / totalItems) * 100 : 50;
        }
      }

      const aiInverted = Math.max(0, 100 - aiReport.overallScore);
      const overall = Math.round(auditScore * 0.6 + aiInverted * 0.4);

      bl.addChapter({
        chapterNumber: ch.number,
        aiScore: aiReport.overallScore,
        cadenceScore: 50,
        overallScore: overall,
        timestamp: new Date().toISOString(),
      });
    }

    const drift = bl.detectDrift();
    const base = bl.getBaseline();

    // Sliding window average from post-baseline chapters
    let slidingAverage = 0.15;
    let consecutiveChapters = 0;
    let triggered = false;
    let severity: string = 'ok';
    let suggestedAction: string | null = null;

    if (base) {
      const baseChapterSet = new Set(base.chaptersUsed);
      const postBaseline = index.chapters
        .filter((ch) => !baseChapterSet.has(ch.number))
        .map((ch) => {
          if (ch.wordCount === 0) return null;
          const content = readChapterContent(bookId, ch.number);
          if (!content) return null;
          const aiReport = detector.detect(content);
          return { number: ch.number, aiScore: aiReport.overallScore / 100 };
        })
        .filter((x): x is { number: number; aiScore: number } => x !== null);

      if (postBaseline.length > 0) {
        const window = postBaseline.slice(-windowSize);
        slidingAverage = window.reduce((s, x) => s + x.aiScore, 0) / window.length;
        slidingAverage = Math.round(slidingAverage * 1000) / 1000;

        // Count consecutive chapters above threshold
        for (let i = postBaseline.length - 1; i >= 0; i--) {
          if (postBaseline[i].aiScore > threshold) {
            consecutiveChapters++;
          } else {
            break;
          }
        }

        triggered = consecutiveChapters >= 1 && slidingAverage > threshold;
        severity = triggered && consecutiveChapters >= 3 ? 'critical' : triggered ? 'warning' : 'ok';
        if (severity === 'critical') {
          suggestedAction = '建议人工审核最近章节，或执行灵感洗牌获取不同风格的写作方案';
        } else if (severity === 'warning') {
          suggestedAction = '关注后续章节质量变化趋势，考虑使用灵感洗牌功能';
        }
      }
    }

    const chaptersAnalyzed = index.chapters
      .filter((ch) => ch.wordCount > 0)
      .map((ch) => ch.number);

    return c.json({
      data: {
        metric,
        baseline: base?.avgScore ?? 0.15,
        threshold,
        windowSize,
        slidingAverage,
        chaptersAnalyzed,
        triggered,
        consecutiveChapters,
        severity,
        suggestedAction,
        inspirationShuffle: { available: triggered },
      },
    });
  });

  // POST /api/books/:bookId/analytics/inspiration-shuffle
  router.post('/inspiration-shuffle', (c) => {
    const bookId = c.req.param('bookId')!;
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    // Requires LLM; currently using deterministic placeholder
    return c.json({
      data: {
        alternatives: [
          {
            id: 'A',
            style: 'fast_paced',
            label: '快节奏视角',
            text: '占位内容 — 需要真实 LLM 接入后生成',
            wordCount: 0,
            characteristics: ['占位标签'],
          },
        ],
        generationTime: 0,
        available: false,
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
