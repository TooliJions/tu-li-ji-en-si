import { Hono } from 'hono';
import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { EpubExporter } from '@cybernovelist/core';
import { getStudioRuntimeRootDir } from '../core-bridge';

const exportRangeSchema = z.object({
  chapterRange: z
    .object({ from: z.number().int().positive(), to: z.number().int().positive() })
    .optional(),
});

function getChapterContent(runtimeRoot: string, bookId: string, chapterNumber: number): string {
  const padded = String(chapterNumber).padStart(4, '0');
  const filePath = path.join(runtimeRoot, bookId, 'story', 'chapters', `chapter-${padded}.md`);
  if (!fs.existsSync(filePath)) return '';
  return fs.readFileSync(filePath, 'utf-8');
}

function getChapterTitle(runtimeRoot: string, bookId: string, chapterNumber: number): string {
  const indexPath = path.join(runtimeRoot, bookId, 'story', 'state', 'index.json');
  if (!fs.existsSync(indexPath)) return `第${chapterNumber}章`;
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8')) as {
    chapters?: Array<{ number: number; title: string | null }>;
  };
  const ch = index.chapters?.find((c) => c.number === chapterNumber);
  return ch?.title ?? `第${chapterNumber}章`;
}

function getBookMeta(runtimeRoot: string, bookId: string): { title: string; author: string } {
  const metaPath = path.join(runtimeRoot, bookId, 'meta.json');
  if (!fs.existsSync(metaPath)) return { title: '未命名', author: 'CyberNovelist' };
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as {
    title?: string;
    author?: string;
  };
  return {
    title: meta.title || '未命名',
    author: meta.author || 'CyberNovelist',
  };
}

function getChapterNumbers(
  runtimeRoot: string,
  bookId: string,
  range?: { from: number; to: number }
): number[] {
  const indexPath = path.join(runtimeRoot, bookId, 'story', 'state', 'index.json');
  if (!fs.existsSync(indexPath)) return [];
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8')) as {
    chapters?: Array<{ number: number }>;
  };
  return (index.chapters ?? [])
    .filter((ch) => {
      if (!range) return true;
      return ch.number >= range.from && ch.number <= range.to;
    })
    .map((ch) => ch.number)
    .sort((a, b) => a - b);
}

export function createExportRouter(): Hono {
  const router = new Hono();

  // POST /api/books/:bookId/export/epub
  router.post('/epub', async (c) => {
    const bookId = c.req.param('bookId');
    if (!bookId) return c.json({ error: '缺少 bookId' }, 400);
    const body = await c.req.json().catch(() => ({}));
    const parsed = exportRangeSchema.safeParse(body);
    const range = parsed.success ? parsed.data.chapterRange : undefined;

    const runtimeRoot = getStudioRuntimeRootDir();
    const chapterNumbers = getChapterNumbers(runtimeRoot, bookId, range);
    const meta = getBookMeta(runtimeRoot, bookId);
    const chapters = chapterNumbers.map((num) => ({
      number: num,
      title: getChapterTitle(runtimeRoot, bookId, num),
      content: getChapterContent(runtimeRoot, bookId, num),
    }));

    try {
      const exporter = new EpubExporter();
      const buffer = await exporter.generate({
        title: meta.title,
        author: meta.author,
        language: 'zh',
        chapters,
      });
      return c.body(new Uint8Array(buffer), 200, {
        'Content-Type': 'application/epub+zip',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(meta.title)}.epub"`,
      });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'EPUB 导出失败' }, 500);
    }
  });

  // POST /api/books/:bookId/export/txt
  router.post('/txt', async (c) => {
    const bookId = c.req.param('bookId');
    if (!bookId) return c.json({ error: '缺少 bookId' }, 400);
    const body = await c.req.json().catch(() => ({}));
    const parsed = exportRangeSchema.safeParse(body);
    const range = parsed.success ? parsed.data.chapterRange : undefined;

    const runtimeRoot = getStudioRuntimeRootDir();
    const chapterNumbers = getChapterNumbers(runtimeRoot, bookId, range);
    const meta = getBookMeta(runtimeRoot, bookId);

    let txt = `${meta.title}\n作者：${meta.author}\n\n`;
    for (const num of chapterNumbers) {
      txt += `${getChapterTitle(runtimeRoot, bookId, num)}\n\n`;
      txt += getChapterContent(runtimeRoot, bookId, num);
      txt += '\n\n';
    }

    return c.body(new TextEncoder().encode(txt), 200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(meta.title)}.txt"`,
    });
  });

  // POST /api/books/:bookId/export/markdown
  router.post('/markdown', async (c) => {
    const bookId = c.req.param('bookId');
    if (!bookId) return c.json({ error: '缺少 bookId' }, 400);
    const body = await c.req.json().catch(() => ({}));
    const parsed = exportRangeSchema.safeParse(body);
    const range = parsed.success ? parsed.data.chapterRange : undefined;

    const runtimeRoot = getStudioRuntimeRootDir();
    const chapterNumbers = getChapterNumbers(runtimeRoot, bookId, range);
    const meta = getBookMeta(runtimeRoot, bookId);

    let md = `# ${meta.title}\n\n> 作者：${meta.author}\n\n`;
    for (const num of chapterNumbers) {
      md += `## ${getChapterTitle(runtimeRoot, bookId, num)}\n\n`;
      md += getChapterContent(runtimeRoot, bookId, num);
      md += '\n\n';
    }

    return c.body(new TextEncoder().encode(md), 200, {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(meta.title)}.md"`,
    });
  });

  return router;
}
