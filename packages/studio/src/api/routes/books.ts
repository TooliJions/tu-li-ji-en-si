import { Hono } from 'hono';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';

// --- In-memory book store (real implementation uses file system via StateManager) ---
interface BookRecord {
  id: string;
  title: string;
  genre: string;
  targetWords: number;
  targetChapterCount: number;
  currentWords: number;
  chapterCount: number;
  status: 'active' | 'archived';
  language: string;
  brief?: string;
  createdAt: string;
  updatedAt: string;
  fanficMode: string | null;
  promptVersion: string;
}

const bookStore = new Map<string, BookRecord>();

// --- Zod schemas ---
const createBookSchema = z.object({
  title: z.string().min(1),
  genre: z.string().min(1),
  targetWords: z.number().int().positive(),
  language: z.string().optional().default('zh-CN'),
  brief: z.string().optional(),
});

const updateBookSchema = z.object({
  title: z.string().min(1).optional(),
  targetWords: z.number().int().positive().optional(),
  status: z.enum(['active', 'archived']).optional(),
  promptVersion: z.string().optional(),
  genre: z.string().min(1).optional(),
});

export function createBookRouter(): Hono {
  const router = new Hono();

  // GET /api/books — list all books
  router.get('/', (c) => {
    const status = c.req.query('status');
    const genre = c.req.query('genre');

    let books = Array.from(bookStore.values());
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
      targetChapterCount: Math.ceil(result.data.targetWords / 3000),
      currentWords: 0,
      chapterCount: 0,
      status: 'active',
      language: result.data.language,
      brief: result.data.brief,
      createdAt: now,
      updatedAt: now,
      fanficMode: null,
      promptVersion: 'v2',
    };

    bookStore.set(book.id, book);
    return c.json({ data: book }, 201);
  });

  // GET /api/books/:bookId — get book details
  router.get('/:bookId', (c) => {
    const bookId = c.req.param('bookId');
    const book = bookStore.get(bookId);
    if (!book) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }
    return c.json({ data: book });
  });

  // PATCH /api/books/:bookId — update book
  router.patch('/:bookId', async (c) => {
    const bookId = c.req.param('bookId');
    const book = bookStore.get(bookId);
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

    Object.assign(book, result.data, { updatedAt: new Date().toISOString() });
    bookStore.set(bookId, book);
    return c.json({ data: book });
  });

  // DELETE /api/books/:bookId — delete a book
  router.delete('/:bookId', (c) => {
    const bookId = c.req.param('bookId');
    if (!bookStore.has(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }
    bookStore.delete(bookId);
    return c.body(null, 204);
  });

  // GET /api/books/:bookId/activity — recent activity
  router.get('/:bookId/activity', (c) => {
    const bookId = c.req.param('bookId')!;
    if (!bookStore.has(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }
    const limit = parseInt(c.req.query('limit') || '10', 10);
    // Placeholder — real implementation reads from activity log
    return c.json({ data: [] });
  });

  return router;
}
