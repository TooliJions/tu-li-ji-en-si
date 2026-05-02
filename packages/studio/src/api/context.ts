import type { Hono } from 'hono';
import type { Context } from 'hono';
import type { MiddlewareHandler } from 'hono/types';
import { PipelineRunner, type LLMProvider } from '@cybernovelist/core';
import { getStudioRuntimeRootDir } from '../runtime/runtime-config';
import { readStudioBookRuntime } from '../runtime/book-repository';
import { validateBookId } from '../runtime/validation';
import { buildLLMProvider } from '../llm/provider-factory';
import { DeterministicProvider } from '../llm/deterministic-provider';

export interface RequestContext {
  bookId: string;
  runner: PipelineRunner;
  provider: LLMProvider;
}

declare module 'hono' {
  interface ContextVariableMap {
    requestContext: RequestContext;
  }
}

export { validateBookId };

export function createBookContextMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    const bookId = c.req.param('bookId');
    if (!bookId) {
      await next();
      return;
    }

    if (!validateBookId(bookId)) {
      return c.json({ error: { code: 'INVALID_BOOK_ID', message: 'bookId 包含非法字符' } }, 400);
    }

    const book = readStudioBookRuntime(bookId);
    const rootDir = getStudioRuntimeRootDir();

    let provider: LLMProvider;
    try {
      provider = book ? buildLLMProvider(book) : buildLLMProvider();
    } catch (err) {
      console.warn('[context] Failed to build LLM provider, falling back to deterministic:', err);
      provider = new DeterministicProvider();
    }

    const runner = new PipelineRunner({ rootDir, provider });

    c.set('requestContext', { bookId, runner, provider });
    await next();
  };
}

export function getRequestContext(c: Context): RequestContext {
  const ctx = c.get('requestContext');
  if (!ctx) {
    throw new Error(
      'RequestContext not available. Ensure createBookContextMiddleware is registered.',
    );
  }
  return ctx;
}

export function registerRequestContext(app: Hono): void {
  app.use('/api/books/:bookId', createBookContextMiddleware());
  app.use('/api/books/:bookId/*', createBookContextMiddleware());
}
