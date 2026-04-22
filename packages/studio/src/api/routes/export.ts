import { Hono } from 'hono';
import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { EpubExporter } from '@cybernovelist/core';
import { getStudioRuntimeRootDir } from '../core-bridge';

export type ExportFormat = 'markdown' | 'txt' | 'epub';

const exportRangeSchema = z.object({
  chapterRange: z
    .object({ from: z.number().int().positive(), to: z.number().int().positive() })
    .optional(),
});

const exportSchema = z.object({
  format: z.enum(['markdown', 'txt', 'epub']),
  chapterFrom: z.number().int().positive().optional(),
  chapterTo: z.number().int().positive().optional(),
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
  try {
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8')) as {
      chapters?: Array<{ number: number; title: string | null }>;
    };
    const ch = index.chapters?.find((c) => c.number === chapterNumber);
    return ch?.title ?? `第${chapterNumber}章`;
  } catch {
    return `第${chapterNumber}章`;
  }
}

function getBookMeta(runtimeRoot: string, bookId: string): { title: string; author: string } {
  const metaPath = path.join(runtimeRoot, bookId, 'meta.json');
  if (!fs.existsSync(metaPath)) return { title: '未命名', author: 'CyberNovelist' };
  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as {
      title?: string;
      author?: string;
    };
    return {
      title: meta.title || '未命名',
      author: meta.author || 'CyberNovelist',
    };
  } catch {
    return { title: '未命名', author: 'CyberNovelist' };
  }
}

function getChapterNumbers(
  runtimeRoot: string,
  bookId: string,
  range?: { from: number; to: number }
): number[] {
  const indexPath = path.join(runtimeRoot, bookId, 'story', 'state', 'index.json');
  if (!fs.existsSync(indexPath)) return [];
  try {
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
  } catch {
    return [];
  }
}

function collectChapters(
  runtimeRoot: string,
  bookId: string,
  range?: { from: number; to: number }
) {
  const chapterNumbers = getChapterNumbers(runtimeRoot, bookId, range);
  const meta = getBookMeta(runtimeRoot, bookId);
  const chapters = chapterNumbers.map((num) => ({
    number: num,
    title: getChapterTitle(runtimeRoot, bookId, num),
    content: getChapterContent(runtimeRoot, bookId, num),
  }));
  return { meta, chapters };
}

function buildRange(from?: number, to?: number) {
  if (from === undefined || to === undefined) return undefined;
  return { from: Math.min(from, to), to: Math.max(from, to) };
}

async function dispatchExport(c: any, runtimeRoot: string) {
  const bookId = c.req.param('bookId');
  if (!bookId) return c.json({ error: '缺少 bookId' }, 400);

  const format = (c.req.query('format') as ExportFormat | undefined) ?? 'markdown';
  const chapterFrom = Number(c.req.query('chapterFrom')) || undefined;
  const chapterTo = Number(c.req.query('chapterTo')) || undefined;

  if (!(['markdown', 'txt', 'epub'] as const).includes(format)) {
    return c.json({ error: '不支持的导出格式' }, 400);
  }

  const range = buildRange(chapterFrom, chapterTo);
  const { meta, chapters } = collectChapters(runtimeRoot, bookId, range);

  if (chapters.length === 0) {
    return c.json({ error: '没有可导出的章节' }, 400);
  }

  switch (format) {
    case 'epub': {
      try {
        const exporter = new EpubExporter();
        const buffer = await exporter.generate({
          title: meta.title,
          author: meta.author,
          language: 'zh',
          chapters,
        });
        const filename = `${meta.title}.epub`;
        return c.body(new Uint8Array(buffer), 200, {
          'Content-Type': 'application/epub+zip',
          'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
        });
      } catch {
        return c.json({ error: 'EPUB 导出失败' }, 500);
      }
    }

    case 'txt': {
      let txt = `${meta.title}\n作者：${meta.author}\n\n`;
      for (const ch of chapters) {
        txt += `${ch.title}\n\n`;
        txt += ch.content;
        txt += '\n\n';
      }
      const filename = `${meta.title}.txt`;
      return c.body(new TextEncoder().encode(txt), 200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
      });
    }

    case 'markdown': {
      let md = `# ${meta.title}\n\n> 作者：${meta.author}\n\n`;
      for (const ch of chapters) {
        md += `## ${ch.title}\n\n`;
        md += ch.content;
        md += '\n\n';
      }
      const filename = `${meta.title}.md`;
      return c.body(new TextEncoder().encode(md), 200, {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
      });
    }

    default:
      return c.json({ error: '不支持的导出格式' }, 400);
  }
}

export function createExportRouter(): Hono {
  const router = new Hono();
  const runtimeRoot = getStudioRuntimeRootDir();

  // GET/POST /api/books/:bookId/export (unified — dispatches by format)
  router.get('/', async (c) => dispatchExport(c, runtimeRoot));
  router.post('/', async (c) => dispatchExport(c, runtimeRoot));

  // POST /api/books/:bookId/export/epub (legacy sub-endpoint)
  router.post('/epub', async (c) => {
    const bookId = c.req.param('bookId');
    if (!bookId) return c.json({ error: '缺少 bookId' }, 400);
    const body = await c.req.json().catch(() => ({}));
    const parsed = exportRangeSchema.safeParse(body);
    const range = parsed.success ? parsed.data.chapterRange : undefined;

    const { meta, chapters } = collectChapters(runtimeRoot, bookId, range);

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
    } catch {
      return c.json({ error: 'EPUB 导出失败' }, 500);
    }
  });

  // POST /api/books/:bookId/export/txt (legacy sub-endpoint)
  router.post('/txt', async (c) => {
    const bookId = c.req.param('bookId');
    if (!bookId) return c.json({ error: '缺少 bookId' }, 400);
    const body = await c.req.json().catch(() => ({}));
    const parsed = exportRangeSchema.safeParse(body);
    const range = parsed.success ? parsed.data.chapterRange : undefined;

    const { meta, chapters } = collectChapters(runtimeRoot, bookId, range);

    let txt = `${meta.title}\n作者：${meta.author}\n\n`;
    for (const ch of chapters) {
      txt += `${ch.title}\n\n`;
      txt += ch.content;
      txt += '\n\n';
    }

    return c.body(new TextEncoder().encode(txt), 200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(meta.title)}.txt"`,
    });
  });

  // POST /api/books/:bookId/export/markdown (legacy sub-endpoint)
  router.post('/markdown', async (c) => {
    const bookId = c.req.param('bookId');
    if (!bookId) return c.json({ error: '缺少 bookId' }, 400);
    const body = await c.req.json().catch(() => ({}));
    const parsed = exportRangeSchema.safeParse(body);
    const range = parsed.success ? parsed.data.chapterRange : undefined;

    const { meta, chapters } = collectChapters(runtimeRoot, bookId, range);

    let md = `# ${meta.title}\n\n> 作者：${meta.author}\n\n`;
    for (const ch of chapters) {
      md += `## ${ch.title}\n\n`;
      md += ch.content;
      md += '\n\n';
    }

    return c.body(new TextEncoder().encode(md), 200, {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(meta.title)}.md"`,
    });
  });

  return router;
}
