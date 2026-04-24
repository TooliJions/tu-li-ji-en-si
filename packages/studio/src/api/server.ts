import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { eventHub, SSEClient } from './sse';
import { registerRequestContext } from './context';
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

// Re-export for route modules
export { eventHub, SSEClient };
export type { SSEEventType } from './sse';

interface CreateAppOptions {
  enableLogger?: boolean;
}

export function createApp(options: CreateAppOptions = {}): Hono {
  const app = new Hono();
  const enableLogger = options.enableLogger ?? process.env.VITEST !== 'true';

  // Middleware
  app.use('*', cors());
  if (enableLogger) {
    app.use('*', logger());
  }
  app.use('*', prettyJSON());

  // Request context for book-scoped routes
  registerRequestContext(app);

  // Health check
  app.get('/api/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

  // SSE endpoint
  app.get('/api/books/:bookId/sse', async (c) => {
    const { bookId } = c.req.param();

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
  app.route('/api/books/:bookId', bookScope);

  // Global routes
  app.route('/api/config', createConfigRouter());
  app.route('/api/system', createSystemRouter());
  app.route('/api/genres', createGenreRouter());

  return app;
}
