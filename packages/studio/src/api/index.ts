import { serve } from '@hono/node-server';
import { createApp } from './server';

const app = createApp();
const port = 3000;

serve({
  fetch: app.fetch,
  port,
});
