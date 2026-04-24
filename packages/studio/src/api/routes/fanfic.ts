import { Hono } from 'hono';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import { buildFanficPrompt, applyFanficMode, FanficMode } from '@cybernovelist/core';
import {
  hasStudioBookRuntime,
  readStudioBookRuntime,
  getStudioRuntimeRootDir,
} from '../core-bridge';

const initFanficSchema = z.object({
  mode: z.enum(['canon', 'au', 'ooc', 'cp']),
  description: z.string().min(1),
  canonReference: z.string().optional().default(''),
});

const generatePromptSchema = z.object({
  basePrompt: z.string().min(1),
  canonReference: z.string().optional().default(''),
});

function persistFanficMode(
  bookId: string,
  mode: string,
  description: string,
  canonReference: string
) {
  const bookPath = path.join(getStudioRuntimeRootDir(), bookId, 'book.json');
  if (!fs.existsSync(bookPath)) return;

  try {
    const book = JSON.parse(fs.readFileSync(bookPath, 'utf-8')) as Record<string, unknown>;
    book.fanficMode = mode;
    book.fanficDescription = description;
    book.fanficCanonReference = canonReference;
    fs.writeFileSync(bookPath, JSON.stringify(book, null, 2), 'utf-8');
  } catch {
    // book.json 损坏时静默跳过，不影响主流程
  }
}

function readFanficState(bookId: string): {
  mode: string | null;
  description: string | null;
  canonReference: string | null;
} {
  const book = readStudioBookRuntime(bookId);
  if (!book) return { mode: null, description: null, canonReference: null };
  const bookJsonPath = path.join(getStudioRuntimeRootDir(), bookId, 'book.json');
  let raw: Record<string, unknown> = {};
  if (fs.existsSync(bookJsonPath)) {
    try {
      raw = JSON.parse(fs.readFileSync(bookJsonPath, 'utf-8')) as Record<string, unknown>;
    } catch {
      // book.json 损坏时回退为空对象
    }
  }
  return {
    mode: book.fanficMode,
    description: (raw.fanficDescription as string) ?? null,
    canonReference: (raw.fanficCanonReference as string) ?? null,
  };
}

export function createFanficRouter(): Hono {
  const router = new Hono();

  // POST /api/books/:bookId/fanfic/init
  router.post('/init', async (c) => {
    const bookId = c.req.param('bookId')!;
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const body = await c.req.json().catch(() => ({}));
    const result = initFanficSchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: result.error.errors[0].message } },
        400
      );
    }

    const constraintPrompt = buildFanficPrompt(
      result.data.mode,
      result.data.description,
      result.data.canonReference
    );
    persistFanficMode(
      bookId,
      result.data.mode,
      result.data.description,
      result.data.canonReference
    );

    return c.json({
      data: {
        success: true,
        bookId,
        mode: result.data.mode,
        description: result.data.description,
        canonReference: result.data.canonReference,
        constraintPrompt,
      },
    });
  });

  // GET /api/books/:bookId/fanfic/status
  router.get('/status', (c) => {
    const bookId = c.req.param('bookId')!;
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const state = readFanficState(bookId);
    const modeLabel = state.mode
      ? (FanficMode[state.mode.toUpperCase() as keyof typeof FanficMode] ?? state.mode)
      : null;

    return c.json({
      data: {
        active: state.mode !== null,
        mode: modeLabel,
        description: state.description,
        canonReference: state.canonReference,
      },
    });
  });

  // POST /api/books/:bookId/fanfic/generate-prompt
  router.post('/generate-prompt', async (c) => {
    const bookId = c.req.param('bookId')!;
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const state = readFanficState(bookId);
    if (!state.mode) {
      return c.json(
        { error: { code: 'FANFIC_NOT_INITIALIZED', message: '同人模式未初始化' } },
        400
      );
    }

    const body = await c.req.json().catch(() => ({}));
    const result = generatePromptSchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: result.error.errors[0].message } },
        400
      );
    }

    const augmentedPrompt = applyFanficMode(
      state.mode,
      result.data.basePrompt,
      state.canonReference ?? undefined
    );
    return c.json({ data: { augmentedPrompt } });
  });

  return router;
}
