import { Hono } from 'hono';
import fs from 'node:fs';
import path from 'node:path';
import OpenAI from 'openai';

interface ProviderEntry {
  name: string;
  status: string;
  apiKey: string;
  baseUrl: string;
}

interface AgentRouteEntry {
  agent: string;
  model: string;
  provider: string;
  temperature: number;
}

interface ConfigState {
  defaultProvider: string;
  defaultModel: string;
  agentRouting: AgentRouteEntry[];
  providers: ProviderEntry[];
  notifications: { telegramToken: string; chatId: string };
}

const DEFAULT_CONFIG_PATH = '.cybernovelist-config.json';

const defaultConfig: ConfigState = {
  defaultProvider: 'DashScope',
  defaultModel: 'qwen3.6-plus',
  agentRouting: [
    { agent: 'Writer', model: 'qwen3.6-plus', provider: 'DashScope', temperature: 0.8 },
    { agent: 'Auditor', model: 'gpt-4o', provider: 'OpenAI', temperature: 0.2 },
  ],
  providers: [
    {
      name: 'DashScope',
      status: 'disconnected',
      apiKey: '',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    },
    {
      name: 'OpenAI',
      status: 'disconnected',
      apiKey: '',
      baseUrl: 'https://api.openai.com/v1',
    },
    {
      name: 'Gemini',
      status: 'disconnected',
      apiKey: '',
      baseUrl: 'https://generativelanguage.googleapis.com',
    },
  ],
  notifications: { telegramToken: '', chatId: '' },
};

function loadConfig(): ConfigState {
  try {
    const cfgPath = process.env.CONFIG_PATH
      ? path.resolve(process.env.CONFIG_PATH)
      : path.join(process.cwd(), DEFAULT_CONFIG_PATH);
    if (fs.existsSync(cfgPath)) {
      const raw = fs.readFileSync(cfgPath, 'utf-8');
      const parsed = JSON.parse(raw);
      return { ...defaultConfig, ...parsed };
    }
  } catch {
    // use defaults
  }
  return { ...defaultConfig };
}

function saveConfig(cfg: ConfigState) {
  const cfgPath = process.env.CONFIG_PATH
    ? path.resolve(process.env.CONFIG_PATH)
    : path.join(process.cwd(), DEFAULT_CONFIG_PATH);
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), 'utf-8');
}

export function createConfigRouter(): Hono {
  let config = loadConfig();
  const router = new Hono();

  // GET /api/config
  router.get('/', (c) => c.json({ data: config }));

  // PUT /api/config
  router.put('/', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    config = { ...config, ...body };
    saveConfig(config);
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
