import { Hono } from 'hono';

interface ConfigState {
  defaultProvider: string;
  defaultModel: string;
  agentRouting: Array<{ agent: string; model: string; provider: string; temperature: number }>;
  providers: Array<{ name: string; status: string }>;
}

let config: ConfigState = {
  defaultProvider: 'DashScope',
  defaultModel: 'qwen3.6-plus',
  agentRouting: [
    { agent: 'Writer', model: 'qwen3.6-plus', provider: 'DashScope', temperature: 0.8 },
    { agent: 'Auditor', model: 'gpt-4o', provider: 'OpenAI', temperature: 0.2 },
  ],
  providers: [
    { name: 'DashScope', status: 'connected' },
    { name: 'OpenAI', status: 'connected' },
  ],
};

export function createConfigRouter(): Hono {
  const router = new Hono();

  // GET /api/config
  router.get('/', (c) => c.json({ data: config }));

  // PUT /api/config
  router.put('/', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    config = { ...config, ...body };
    return c.json({ data: config });
  });

  // POST /api/config/test-provider
  router.post('/test-provider', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    return c.json({
      data: {
        provider: body.provider || 'Unknown',
        connected: true,
        latencyMs: Math.floor(Math.random() * 500) + 100,
      },
    });
  });

  return router;
}
