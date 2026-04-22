import { Hono } from 'hono';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { OpenAICompatibleProvider, LLMConfig } from '@cybernovelist/core';

interface ProviderEntry {
  name: string;
  status: string;
  apiKey: string;
  baseUrl: string;
  model?: string;
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
      model: 'qwen3.6-plus',
    },
    {
      name: 'OpenAI',
      status: 'disconnected',
      apiKey: '',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
    },
    {
      name: 'Gemini',
      status: 'disconnected',
      apiKey: '',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      model: 'gemini-2.0-flash',
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

function findProviderConfig(name: string): ProviderEntry | undefined {
  const config = loadConfig();
  return config.providers.find((p) => p.name === name);
}

function resolveProviderConfig(entry: ProviderEntry): {
  config: LLMConfig;
  effectiveModel: string;
} {
  const model = entry.model || defaultConfig.defaultModel;
  const baseUrl = entry.baseUrl;
  const llmConfig: LLMConfig = {
    apiKey: entry.apiKey,
    baseURL: baseUrl,
    model,
    temperature: 0.7,
    maxTokens: 100,
  };
  return { config: llmConfig, effectiveModel: model };
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
    const { apiKey, baseUrl, model, name } = body;

    if (!apiKey || !baseUrl) {
      return c.json({
        data: {
          success: false,
          error: '缺少 apiKey 或 baseUrl',
          provider: name || 'Unknown',
        },
      });
    }

    const testModel = model || 'qwen3.6-plus';
    const startTime = Date.now();

    try {
      const provider = new OpenAICompatibleProvider({
        apiKey,
        baseURL: baseUrl,
        model: testModel,
        maxTokens: 10,
      });

      await provider.generate({ prompt: 'Hi' });

      const latencyMs = Date.now() - startTime;
      return c.json({
        data: {
          success: true,
          latencyMs,
          provider: name || testModel,
          model: testModel,
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
          provider: name || testModel,
        },
      });
    }
  });

  // GET /api/config/available-models
  router.get('/available-models', (c) => {
    const { providers, defaultProvider } = config;
    const connected = providers.filter((p) => p.apiKey);
    const models = connected.flatMap((p) => {
      const entry = findProviderConfig(p.name);
      if (!entry) return [];
      return [
        {
          provider: p.name,
          model: p.model || entry.model || defaultConfig.defaultModel,
          status: 'configured',
        },
      ];
    });
    return c.json({ data: { models, defaultProvider } });
  });

  // POST /api/config/test-notification
  router.post('/test-notification', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const { telegramToken, chatId } = body;

    if (!telegramToken || !chatId) {
      return c.json({
        data: { success: false, error: '缺少 telegramToken 或 chatId' },
      });
    }

    try {
      const url = `https://api.telegram.org/bot${telegramToken}/sendMessage`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: '🔔 CyberNovelist 测试推送 — 通知配置已生效。',
        }),
      });

      if (res.ok) {
        return c.json({ data: { success: true } });
      }
      const errorText = await res.text().catch(() => '');
      return c.json({
        data: { success: false, error: `Telegram API 返回 ${res.status}: ${errorText}` },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : '推送失败';
      return c.json({ data: { success: false, error: message } });
    }
  });

  return router;
}
