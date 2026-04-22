import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'hono-api',
      async configureServer(server) {
        const { createApp } = await import('./src/api/server');
        const app = createApp();
        server.middlewares.use(async (req, res, next) => {
          if (!req.url?.startsWith('/api')) {
            next();
            return;
          }

          const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
          const url = new URL(req.url!, `http://${req.headers.host}`);
          const response = await app.fetch(
            new Request(url.toString(), {
              method: req.method,
              headers: new Headers(req.headers as Record<string, string>),
              body: hasBody ? req : undefined,
              duplex: hasBody ? 'half' : undefined,
            })
          );
          res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
          // SSE / streaming: pipe body directly to avoid undici text() crash
          if (response.headers.get('content-type')?.includes('text/event-stream')) {
            const reader = (response as any).body?.getReader();
            if (reader) {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                res.write(value);
              }
              res.end();
              return;
            }
          }
          res.end(await response.text());
        });
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(currentDir, './src'),
    },
  },
  server: {
    port: 5173,
  },
});