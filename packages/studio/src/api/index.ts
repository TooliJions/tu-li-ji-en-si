import { serve } from '@hono/node-server';
import { createApp } from './server';

const app = createApp();
const port = 3000;

console.log(`API server listening on http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port,
});
