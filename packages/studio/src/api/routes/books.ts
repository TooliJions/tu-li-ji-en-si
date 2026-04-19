import { Hono } from 'hono';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import {
  deleteStudioBookRuntime,
  getStudioRuntimeRootDir,
  initializeStudioBookRuntime,
  listStudioBookRuntimes,
  readStudioBookRuntime,
  resetStudioCoreBridgeForTests,
  updateStudioBookRuntime,
} from '../core-bridge';

type BookRecord = NonNullable<ReturnType<typeof readStudioBookRuntime>>;

export function resetBookStoreForTests() {
  // no-op: book routes now read directly from runtime files
}

const defaultModelConfig = {
  useGlobalDefaults: true,
  writer: 'qwen3.6-plus',
  auditor: 'gpt-4o',
  planner: 'qwen3.6-plus',
};

const modelConfigSchema = z.object({
  useGlobalDefaults: z.boolean(),
  writer: z.string().min(1),
  auditor: z.string().min(1),
  planner: z.string().min(1),
});

// --- Zod schemas ---
const createBookSchema = z
  .object({
    title: z.string().min(1),
    genre: z.string().min(1),
    targetWords: z.number().int().positive().optional(),
    targetChapterCount: z.number().int().positive().optional(),
    targetWordsPerChapter: z.number().int().positive().optional().default(3000),
    language: z.string().optional().default('zh-CN'),
    platform: z.string().optional().default('qidian'),
    brief: z.string().optional(),
    promptVersion: z.string().optional().default('v2'),
    modelConfig: modelConfigSchema.optional().default(defaultModelConfig),
  })
  .superRefine((data, ctx) => {
    if (!data.targetWords && !data.targetChapterCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'targetWords 或 targetChapterCount 至少提供一个',
        path: ['targetWords'],
      });
    }
  })
  .transform((data) => {
    const targetWordsPerChapter = data.targetWordsPerChapter ?? 3000;
    const targetWords =
      data.targetWords ??
      (data.targetChapterCount ? data.targetChapterCount * targetWordsPerChapter : 0);
    const targetChapterCount =
      data.targetChapterCount ?? Math.max(1, Math.ceil(targetWords / targetWordsPerChapter));

    return {
      ...data,
      targetWords,
      targetChapterCount,
      targetWordsPerChapter,
      modelConfig: data.modelConfig ?? defaultModelConfig,
      platform: data.platform ?? 'qidian',
      promptVersion: data.promptVersion ?? 'v2',
      language: data.language ?? 'zh-CN',
    };
  });

const updateBookSchema = z.object({
  title: z.string().min(1).optional(),
  targetWords: z.number().int().positive().optional(),
  targetChapterCount: z.number().int().positive().optional(),
  targetWordsPerChapter: z.number().int().positive().optional(),
  status: z.enum(['active', 'archived']).optional(),
  language: z.string().min(1).optional(),
  platform: z.string().min(1).optional(),
  promptVersion: z.string().optional(),
  genre: z.string().min(1).optional(),
  brief: z.string().optional(),
  modelConfig: modelConfigSchema.optional(),
});

interface BookActivityItem {
  id: string;
  type: string;
  timestamp: string;
  detail: string;
  chapterNumber?: number;
}

function parseActivityLimit(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? '10', 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return 10;
  }
  return Math.min(parsed, 50);
}

function collectBookActivity(bookId: string): BookActivityItem[] {
  const book = readStudioBookRuntime(bookId);
  if (!book) {
    return [];
  }

  const bookDir = path.join(getStudioRuntimeRootDir(), bookId);
  const chapterDir = path.join(bookDir, 'story', 'chapters');
  const auditDir = path.join(bookDir, 'story', 'state', 'audits');
  const activities: BookActivityItem[] = [
    {
      id: `${bookId}:book_created`,
      type: 'book_created',
      timestamp: book.createdAt,
      detail: `已创建《${book.title}》`,
    },
  ];

  if (book.updatedAt !== book.createdAt) {
    activities.push({
      id: `${bookId}:book_updated`,
      type: 'book_updated',
      timestamp: book.updatedAt,
      detail: `已更新《${book.title}》的基础信息`,
    });
  }

  if (fs.existsSync(chapterDir)) {
    for (const fileName of fs.readdirSync(chapterDir)) {
      const match = /^chapter-(\d{4})\.md$/.exec(fileName);
      if (!match || match[1] === '0000') {
        continue;
      }

      const chapterNumber = Number.parseInt(match[1], 10);
      const filePath = path.join(chapterDir, fileName);
      const stat = fs.statSync(filePath);
      activities.push({
        id: `${bookId}:chapter_saved:${chapterNumber}`,
        type: 'chapter_saved',
        timestamp: stat.mtime.toISOString(),
        detail: `第 ${chapterNumber} 章已写入 runtime`,
        chapterNumber,
      });
    }
  }

  if (fs.existsSync(auditDir)) {
    for (const fileName of fs.readdirSync(auditDir)) {
      const match = /^chapter-(\d{4})\.json$/.exec(fileName);
      if (!match) {
        continue;
      }

      const chapterNumber = Number.parseInt(match[1], 10);
      const filePath = path.join(auditDir, fileName);
      const stat = fs.statSync(filePath);
      activities.push({
        id: `${bookId}:chapter_audited:${chapterNumber}`,
        type: 'chapter_audited',
        timestamp: stat.mtime.toISOString(),
        detail: `第 ${chapterNumber} 章已生成审计报告`,
        chapterNumber,
      });
    }
  }

  return activities.sort((left, right) => right.timestamp.localeCompare(left.timestamp));
}

export function createBookRouter(): Hono {
  const router = new Hono();

  // GET /api/books — list all books
  router.get('/', (c) => {
    const status = c.req.query('status');
    const genre = c.req.query('genre');

    let books = listStudioBookRuntimes();
    if (status && status !== 'all') {
      books = books.filter((b) => b.status === status);
    }
    if (genre) {
      books = books.filter((b) => b.genre === genre);
    }

    return c.json({ data: books, total: books.length });
  });

  // POST /api/books — create a new book
  router.post('/', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const result = createBookSchema.safeParse(body);

    if (!result.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: result.error.errors[0].message } },
        400
      );
    }

    const now = new Date().toISOString();
    const book: BookRecord = {
      id: `book-${randomUUID().slice(0, 8)}`,
      title: result.data.title,
      genre: result.data.genre,
      targetWords: result.data.targetWords,
      targetChapterCount: result.data.targetChapterCount,
      targetWordsPerChapter: result.data.targetWordsPerChapter,
      currentWords: 0,
      chapterCount: 0,
      status: 'active',
      language: result.data.language,
      platform: result.data.platform,
      brief: result.data.brief,
      createdAt: now,
      updatedAt: now,
      fanficMode: null,
      promptVersion: result.data.promptVersion,
      modelConfig: result.data.modelConfig,
    };

    initializeStudioBookRuntime(book);
    return c.json({ data: readStudioBookRuntime(book.id) ?? book }, 201);
  });

  // GET /api/books/:bookId — get book details
  router.get('/:bookId', (c) => {
    const bookId = c.req.param('bookId');
    const book = readStudioBookRuntime(bookId);
    if (!book) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }
    return c.json({ data: book });
  });

  // PATCH /api/books/:bookId — update book
  router.patch('/:bookId', async (c) => {
    const bookId = c.req.param('bookId');
    const book = readStudioBookRuntime(bookId);
    if (!book) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const body = await c.req.json().catch(() => ({}));
    if (Object.keys(body).length === 0) {
      return c.json({ error: { code: 'INVALID_STATE', message: '至少需要一个更新字段' } }, 400);
    }
    const result = updateBookSchema.safeParse(body);

    if (!result.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: result.error.errors[0].message } },
        400
      );
    }

    const updatedBook = { ...book, ...result.data, updatedAt: new Date().toISOString() };
    updateStudioBookRuntime(updatedBook);
    return c.json({ data: readStudioBookRuntime(bookId) ?? updatedBook });
  });

  // DELETE /api/books/:bookId — delete a book
  router.delete('/:bookId', (c) => {
    const bookId = c.req.param('bookId');
    if (!readStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }
    deleteStudioBookRuntime(bookId);
    return c.body(null, 204);
  });

  // GET /api/books/:bookId/activity — recent activity
  router.get('/:bookId/activity', (c) => {
    const bookId = c.req.param('bookId')!;
    if (!readStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }
    const limit = parseActivityLimit(c.req.query('limit'));
    return c.json({ data: collectBookActivity(bookId).slice(0, limit) });
  });

  return router;
}

export function resetBookRouteForTests() {
  resetBookStoreForTests();
  resetStudioCoreBridgeForTests();
}
