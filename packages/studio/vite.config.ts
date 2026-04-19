import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { createApp } from './src/api/server';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'hono-api',
      configureServer(server) {
        const app = createApp();
        server.middlewares.use('/api', async (req, res) => {
          const url = new URL(req.url!, `http://${req.headers.host}`);
          const response = await app.fetch(
            new Request(url.toString(), {
              method: req.method,
              headers: new Headers(req.headers as Record<string, string>),
              body: req.method !== 'GET' && req.method !== 'HEAD' ? req : undefined,
            })
          );
          res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
          res.end(await response.text());
        });
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
