import type { Hono } from 'hono';
import type { Context } from 'hono';
import type { MiddlewareHandler } from 'hono/types';
import { PipelineRunner, type LLMProvider } from '@cybernovelist/core';
import { getStudioRuntimeRootDir } from '../runtime/runtime-config';
import { readStudioBookRuntime } from '../runtime/book-repository';
import { buildLLMProvider } from '../llm/provider-factory';

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

export function createBookContextMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    const bookId = c.req.param('bookId');
    if (!bookId) {
      await next();
      return;
    }

    const book = readStudioBookRuntime(bookId);
    const rootDir = getStudioRuntimeRootDir();
    const provider = book ? buildLLMProvider(book) : buildLLMProvider();
    const runner = new PipelineRunner({ rootDir, provider });

    c.set('requestContext', { bookId, runner, provider });
    await next();
  };
}

export function getRequestContext(c: Context): RequestContext {
  const ctx = c.get('requestContext');
  if (!ctx) {
    throw new Error(
      'RequestContext not available. Ensure createBookContextMiddleware is registered.'
    );
  }
  return ctx;
}

export function registerRequestContext(app: Hono): void {
  app.use('/api/books/:bookId/*', createBookContextMiddleware());
}
