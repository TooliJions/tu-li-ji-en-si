import { Hono } from 'hono';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import { StyleRefiner, type StyleFingerprint } from '@cybernovelist/core';
import {
  hasStudioBookRuntime,
  readStudioBookRuntime,
  getStudioRuntimeRootDir,
} from '../core-bridge';
import { getRequestContext } from '../context';

const extractSchema = z.object({
  referenceText: z.string().min(1),
  genre: z.string().min(1),
});

const applySchema = z.object({
  chapterNumber: z.number().int().positive(),
  intensity: z.number().min(0).max(100),
});

function analyzeFingerprint(referenceText: string): StyleFingerprint {
  if (!referenceText || referenceText.trim().length === 0) {
    return {
      avgSentenceLength: 0,
      dialogueRatio: 0,
      descriptionRatio: 0,
      actionRatio: 0,
      commonPhrases: [],
      sentencePatternPreference: '',
      wordUsageHabit: '',
      rhetoricTendency: '',
    };
  }

  const sentences = referenceText.split(/[。！？；\n]/).filter((s) => s.trim().length > 0);
  const avgSentenceLength =
    sentences.length > 0 ? Math.round(referenceText.length / sentences.length) : 0;
  const dialogueSegments = referenceText.match(/["""'][^""""'"]*["""']/g) || [];
  const dialogueRatio =
    referenceText.length > 0
      ? Math.round((dialogueSegments.join('').length / referenceText.length) * 100) / 100
      : 0;

  const descriptionMarkers = ['是', '有', '像', '如', '般', '的'];
  const descriptionCount = descriptionMarkers.filter((m) => referenceText.includes(m)).length;
  const descriptionRatio = Math.min(descriptionCount / Math.max(sentences.length, 1), 1);

  const actionVerbs = ['走', '跑', '飞', '打', '杀', '冲', '跳', '挥', '斩', '击'];
  const actionCount = actionVerbs.filter((v) => referenceText.includes(v)).length;
  const actionRatio = Math.min(actionCount / Math.max(sentences.length, 1), 1);

  const commonPhrases = [
    '只见',
    '不禁',
    '心中',
    '微微',
    '突然',
    '瞬间',
    '于是',
    '然而',
    '接着',
    '然后',
    '仿佛',
    '似乎',
  ].filter((phrase) => {
    const regex = new RegExp(phrase, 'g');
    const matches = referenceText.match(regex);
    return matches && matches.length >= 2;
  });

  return {
    avgSentenceLength,
    dialogueRatio,
    descriptionRatio: Math.round(descriptionRatio * 100) / 100,
    actionRatio: Math.round(actionRatio * 100) / 100,
    commonPhrases,
    sentencePatternPreference:
      avgSentenceLength > 25 ? '长句为主' : avgSentenceLength > 15 ? '中长句交替' : '短句为主',
    wordUsageHabit:
      dialogueRatio > 0.4 ? '对话驱动' : descriptionRatio > 0.5 ? '描写驱动' : '均衡型',
    rhetoricTendency:
      actionRatio > 0.4 ? '动作描写突出' : descriptionRatio > 0.4 ? '氛围营造为主' : '叙事推进型',
  };
}

function readChapterContent(bookId: string, chapterNumber: number): string {
  const padded = String(chapterNumber).padStart(4, '0');
  const filePath = path.join(
    getStudioRuntimeRootDir(),
    bookId,
    'story',
    'chapters',
    `chapter-${padded}.md`
  );
  if (!fs.existsSync(filePath)) return '';
  const raw = fs.readFileSync(filePath, 'utf-8');
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  return match ? raw.slice(match[0].length).trim() : raw.trim();
}

function readAllChapterText(bookId: string): string {
  const chapterDir = path.join(getStudioRuntimeRootDir(), bookId, 'story', 'chapters');
  if (!fs.existsSync(chapterDir)) return '';

  const files = fs
    .readdirSync(chapterDir)
    .filter((f) => /^chapter-\d{4}\.md$/.test(f) && f !== 'chapter-0000.md')
    .sort();

  const texts: string[] = [];
  for (const file of files) {
    const raw = fs.readFileSync(path.join(chapterDir, file), 'utf-8');
    const match = raw.match(/^---\n([\s\S]*?)\n---\n?/);
    texts.push(match ? raw.slice(match[0].length).trim() : raw.trim());
  }
  return texts.join('\n\n');
}

export function createStyleRouter(): Hono {
  const router = new Hono();

  // POST /api/books/:bookId/style/fingerprint
  router.post('/fingerprint', async (c) => {
    const bookId = c.req.param('bookId')!;
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const body = await c.req.json().catch(() => ({}));
    const result = extractSchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: result.error.errors[0].message } },
        400
      );
    }

    const agent = analyzeFingerprint(result.data.referenceText);

    return c.json({
      data: {
        fingerprint: agent,
        sourceGenre: result.data.genre,
        textLength: result.data.referenceText.length,
      },
    });
  });

  // POST /api/books/:bookId/style/apply
  router.post('/apply', async (c) => {
    const bookId = c.req.param('bookId')!;
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const body = await c.req.json().catch(() => ({}));
    const result = applySchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: result.error.errors[0].message } },
        400
      );
    }

    const book = readStudioBookRuntime(bookId);
    const chapterContent = readChapterContent(bookId, result.data.chapterNumber);
    if (!chapterContent) {
      return c.json({ error: { code: 'CHAPTER_NOT_FOUND', message: '章节内容不存在' } }, 404);
    }

    const previousContent =
      result.data.chapterNumber > 1
        ? readChapterContent(bookId, result.data.chapterNumber - 1)
        : undefined;

    const { provider } = getRequestContext(c);
    const refiner = new StyleRefiner(provider);

    const refinerResult = await refiner.execute({
      promptContext: {
        input: {
          draftContent: chapterContent,
          chapterNumber: result.data.chapterNumber,
          genre: book?.genre ?? 'urban',
          previousChapterContent: previousContent,
        },
      },
    });

    if (!refinerResult.success) {
      return c.json(
        { error: { code: 'STYLE_REFINE_FAILED', message: refinerResult.error ?? '文风精炼失败' } },
        500
      );
    }

    const refinedData = refinerResult.data as
      | { refinedContent?: string; styleAnalysis?: string; improvementScore?: number }
      | undefined;

    return c.json({
      data: {
        success: true,
        bookId,
        chapterNumber: result.data.chapterNumber,
        refinedContent: refinedData?.refinedContent ?? chapterContent,
        styleAnalysis: refinedData?.styleAnalysis ?? '',
        improvementScore: refinedData?.improvementScore ?? 0,
        intensity: result.data.intensity,
      },
    });
  });

  // GET /api/books/:bookId/style/current
  router.get('/current', (c) => {
    const bookId = c.req.param('bookId')!;
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const allText = readAllChapterText(bookId);
    if (!allText) {
      return c.json({ data: { fingerprint: null, chapterCount: 0 } });
    }

    const fingerprint = analyzeFingerprint(allText);
    const chapterCount = allText.split('chapter-').length - 1;

    return c.json({
      data: {
        fingerprint,
        chapterCount,
        totalLength: allText.length,
      },
    });
  });

  return router;
}
