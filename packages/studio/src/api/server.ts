import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { eventHub, SSEClient } from './sse';
import { registerRequestContext, validateBookId } from './context';
import { createBookRouter } from './routes/books';
import { createChapterRouter } from './routes/chapters';
import { createPipelineRouter } from './routes/pipeline';
import { createStateRouter } from './routes/state';
import { createDaemonRouter } from './routes/daemon';
import { createHooksRouter } from './routes/hooks';
import { createAnalyticsRouter } from './routes/analytics';
import { createConfigRouter } from './routes/config';
import { createExportRouter } from './routes/export';
import { createSystemRouter } from './routes/system';
import { createPromptsRouter } from './routes/prompts';
import { createContextRouter } from './routes/context';
import { createNaturalAgentRouter } from './routes/natural-agent';
import { createFanficRouter } from './routes/fanfic';
import { createStyleRouter } from './routes/style';
import { createGenreRouter } from './routes/genres';
import { createInspirationRouter } from './routes/inspiration';
import { createPlanningBriefRouter } from './routes/planning-brief';
import { createStoryOutlineRouter } from './routes/story-outline';
import { createChapterPlanRouter } from './routes/chapter-plan';
import { createQualityRouter } from './routes/quality';
import { createWritingRouter } from './routes/writing';

// Re-export for route modules
export { eventHub, SSEClient };
export type { SSEEventType } from './sse';

interface CreateAppOptions {
  enableLogger?: boolean;
}

export function createApp(options: CreateAppOptions = {}): Hono {
  const app = new Hono();
  const enableLogger = options.enableLogger ?? process.env.VITEST !== 'true';

  // Global error handler
  app.onError((err, c) => {
    console.error('[server] Unhandled error:', err);
    const status =
      err instanceof Error && 'status' in err
        ? ((err as unknown as Record<string, unknown>).status as number)
        : 500;
    return c.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Internal Server Error',
        },
      },
      status as 500,
    );
  });

  // Middleware
  app.use('*', cors());
  if (enableLogger) {
    app.use('*', logger());
  }
  app.use('*', prettyJSON());

  // Bearer token 认证（开发环境跳过）
  const apiToken = process.env.CYBERNOVELIST_API_TOKEN;
  if (apiToken && process.env.NODE_ENV !== 'development') {
    app.use('/api/*', async (c, next) => {
      const auth = c.req.header('Authorization');
      if (auth === `Bearer ${apiToken}`) {
        await next();
        return;
      }
      return c.json({ error: { code: 'UNAUTHORIZED', message: '认证失败' } }, 401);
    });
  }

  // 速率限制：pipeline 端点 10 req/min，全局 100 req/min
  const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
  function rateLimit(maxPerMinute: number, prefix: string) {
    return async (c: Context, next: () => Promise<void>) => {
      const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
      const key = `${prefix}:${ip}`;
      const now = Date.now();
      const entry = rateLimitStore.get(key);
      if (!entry || now > entry.resetAt) {
        rateLimitStore.set(key, { count: 1, resetAt: now + 60_000 });
        await next();
        return;
      }
      entry.count++;
      if (entry.count > maxPerMinute) {
        c.json({ error: { code: 'RATE_LIMITED', message: '请求过于频繁，请稍后再试' } }, 429);
        return;
      }
      await next();
    };
  }
  app.use('/api/books/:bookId/pipeline/*', rateLimit(10, 'pipeline'));
  app.use('/api/*', rateLimit(100, 'global'));

  // Request context for book-scoped routes
  registerRequestContext(app);

  // Health check
  app.get('/api/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

  // SSE endpoint
  app.get('/api/books/:bookId/sse', async (c) => {
    const { bookId } = c.req.param();

    if (!validateBookId(bookId)) {
      return c.json({ error: { code: 'INVALID_BOOK_ID', message: 'bookId 包含非法字符' } }, 400);
    }

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(': connected\n\n');

        const client = new SSEClient(controller);
        eventHub.addClient(bookId, client);

        const interval = setInterval(() => {
          client.sendComment('ping');
        }, 30000);

        c.req.raw.signal.addEventListener('abort', () => {
          clearInterval(interval);
          eventHub.removeClient(bookId, client.id);
        });
      },
    });

    return c.newResponse(stream, 200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
  });

  // Book-level routes (no bookId param needed)
  app.route('/api/books', createBookRouter());

  // Book-scoped routes — each mounts under /api/books/:bookId/...
  // We create a sub-router and mount all book-scoped routes
  const bookScope = new Hono();
  bookScope.route('/chapters', createChapterRouter());
  bookScope.route('/pipeline', createPipelineRouter());
  bookScope.route('/state', createStateRouter());
  bookScope.route('/daemon', createDaemonRouter());
  bookScope.route('/hooks', createHooksRouter());
  bookScope.route('/analytics', createAnalyticsRouter());
  bookScope.route('/export', createExportRouter());
  bookScope.route('/prompts', createPromptsRouter());
  bookScope.route('/context', createContextRouter());
  bookScope.route('/natural-agent', createNaturalAgentRouter());
  bookScope.route('/fanfic', createFanficRouter());
  bookScope.route('/style', createStyleRouter());
  bookScope.route('/inspiration', createInspirationRouter());
  bookScope.route('/planning-brief', createPlanningBriefRouter());
  bookScope.route('/story-outline', createStoryOutlineRouter());
  bookScope.route('/chapter-plans', createChapterPlanRouter());
  bookScope.route('/quality', createQualityRouter());
  bookScope.route('/writing', createWritingRouter());
  app.route('/api/books/:bookId', bookScope);

  // Global routes
  app.route('/api/config', createConfigRouter());
  app.route('/api/system', createSystemRouter());
  app.route('/api/genres', createGenreRouter());

  return app;
}
