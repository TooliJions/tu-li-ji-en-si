import { Hono } from 'hono';
import OpenAI from 'openai';

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
    const { apiKey, baseUrl, model } = body;

    if (!apiKey || !baseUrl) {
      return c.json({
        data: {
          success: false,
          error: '缺少 apiKey 或 baseUrl',
          provider: body.name || body.provider || 'Unknown',
        },
      });
    }

    const testModel = model || 'qwen3.6-plus';
    const startTime = Date.now();

    try {
      const client = new OpenAI({
        apiKey,
        baseURL: baseUrl,
        timeout: 15000,
      });

      await client.chat.completions.create({
        model: testModel,
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 5,
      });

      const latencyMs = Date.now() - startTime;
      return c.json({
        data: {
          success: true,
          latencyMs,
          provider: body.name || body.provider || 'Unknown',
        },
      });
    } catch (err: unknown) {
      const latencyMs = Date.now() - startTime;
      const message = err instanceof Error ? err.message : '连接失败';
      return c.json({
        data: {
          success: false,
          latencyMs,
          error: message,
          provider: body.name || body.provider || 'Unknown',
        },
      });
    }
  });

  return router;
}
