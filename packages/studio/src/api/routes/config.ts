import { Hono } from 'hono';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import { OpenAICompatibleProvider } from '@cybernovelist/core';

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
  maxTokens?: number;
}

interface QuotaConfig {
  dailyTokenQuota: number;
  quotaAlertThreshold: number;
}

interface RateLimitConfig {
  rpmLimit: number;
  tpmLimit: number;
}

interface RetryPolicyConfig {
  maxAttempts: number;
  delayMs: number;
}

interface ConfigState {
  defaultProvider: string;
  defaultModel: string;
  agentRouting: AgentRouteEntry[];
  providers: ProviderEntry[];
  notifications: { telegramToken: string; chatId: string };
  quotas: QuotaConfig;
  rateLimits: RateLimitConfig;
  retryPolicy: RetryPolicyConfig;
  cloudMode: boolean;
}

const defaultConfig: ConfigState = {
  defaultProvider: 'DashScope',
  defaultModel: 'qwen3.6-plus',
  agentRouting: [
    { agent: 'Writer', model: 'qwen3.6-plus', provider: 'DashScope', temperature: 0.8 },
    { agent: 'Auditor', model: 'gpt-4o', provider: 'OpenAI', temperature: 0.2 },
    { agent: 'Planner', model: 'qwen3.6-plus', provider: 'DashScope', temperature: 0.7 },
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
    {
      name: 'DeepSeek',
      status: 'disconnected',
      apiKey: '',
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
    },
  ],
  notifications: { telegramToken: '', chatId: '' },
  quotas: {
    dailyTokenQuota: 0,
    quotaAlertThreshold: 0.8,
  },
  rateLimits: {
    rpmLimit: 0,
    tpmLimit: 0,
  },
  retryPolicy: {
    maxAttempts: 2,
    delayMs: 1000,
  },
  cloudMode: true,
};

function loadConfig(): ConfigState {
  try {
    const cfgPath = process.env.CONFIG_PATH
      ? path.resolve(process.env.CONFIG_PATH)
      : path.join(__dirname, '../../../config.local.json');
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
    : path.join(__dirname, '../../../config.local.json');
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), 'utf-8');
}

function findProviderConfig(name: string): ProviderEntry | undefined {
  const config = loadConfig();
  return config.providers.find((p) => p.name === name);
}

function maskSecret(value: string): string {
  if (!value || value.length <= 8) return value ? '***' : '';
  return value.slice(0, 4) + '***' + value.slice(-4);
}

function maskConfigForResponse(cfg: ConfigState): Record<string, unknown> {
  return {
    ...cfg,
    providers: cfg.providers.map((p) => ({ ...p, apiKey: maskSecret(p.apiKey) })),
    notifications: {
      telegramToken: maskSecret(cfg.notifications.telegramToken),
      chatId: cfg.notifications.chatId,
    },
  };
}

function isMaskedSecret(value: string): boolean {
  return value === '***' || /^.{4}\*\*\*.{4}$/.test(value);
}

const providerEntrySchema = z
  .object({
    name: z.string().min(1).max(64),
    status: z.string().max(32),
    apiKey: z.string().max(512),
    baseUrl: z.string().url().max(512),
    model: z.string().max(128).optional(),
  })
  .strict();

const agentRouteSchema = z
  .object({
    agent: z.string().min(1).max(64),
    model: z.string().min(1).max(128),
    provider: z.string().min(1).max(64),
    temperature: z.number().min(0).max(2),
    maxTokens: z.number().int().positive().optional(),
  })
  .strict();

const configUpdateSchema = z
  .object({
    defaultProvider: z.string().min(1).max(64).optional(),
    defaultModel: z.string().min(1).max(128).optional(),
    agentRouting: z.array(agentRouteSchema).max(32).optional(),
    providers: z.array(providerEntrySchema).max(32).optional(),
    notifications: z
      .object({
        telegramToken: z.string().max(512),
        chatId: z.string().max(128),
      })
      .strict()
      .optional(),
    quotas: z
      .object({
        dailyTokenQuota: z.number().int().nonnegative(),
        quotaAlertThreshold: z.number().min(0).max(1),
      })
      .strict()
      .optional(),
    rateLimits: z
      .object({
        rpmLimit: z.number().int().nonnegative(),
        tpmLimit: z.number().int().nonnegative(),
      })
      .strict()
      .optional(),
    retryPolicy: z
      .object({
        maxAttempts: z.number().int().min(1).max(10),
        delayMs: z.number().int().min(0).max(60_000),
      })
      .strict()
      .optional(),
    cloudMode: z.boolean().optional(),
  })
  .strict();

function mergeProviders(
  oldProviders: ProviderEntry[],
  newProviders: ProviderEntry[],
): ProviderEntry[] {
  return newProviders.map((np) => {
    if (isMaskedSecret(np.apiKey)) {
      const old = oldProviders.find((op) => op.name === np.name);
      if (old) {
        return { ...np, apiKey: old.apiKey };
      }
    }
    return np;
  });
}

function mergeNotifications(
  oldNotif: ConfigState['notifications'],
  newNotif: ConfigState['notifications'],
): ConfigState['notifications'] {
  return {
    telegramToken: isMaskedSecret(newNotif.telegramToken)
      ? oldNotif.telegramToken
      : newNotif.telegramToken,
    chatId: newNotif.chatId,
  };
}

export function createConfigRouter(): Hono {
  let config = loadConfig();
  const router = new Hono();

  router.get('/', (c) => c.json({ data: maskConfigForResponse(config) }));

  router.put('/', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const result = configUpdateSchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: result.error.errors[0].message } },
        400,
      );
    }

    const update = result.data;
    config = {
      ...config,
      ...update,
      providers: update.providers
        ? mergeProviders(config.providers, update.providers)
        : config.providers,
      notifications: update.notifications
        ? mergeNotifications(config.notifications, update.notifications)
        : config.notifications,
    };
    saveConfig(config);
    return c.json({ data: maskConfigForResponse(config) });
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

    // Use passed model, or look up provider config, or fallback
    const providerConfig = name ? findProviderConfig(name) : undefined;
    const testModel = model || providerConfig?.model || 'qwen3.6-plus';
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

  // POST /api/config/fetch-models
  router.post('/fetch-models', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const { apiKey, baseUrl, name } = body;

    if (!apiKey || !baseUrl) {
      return c.json({
        data: { success: false, error: '缺少 apiKey 或 baseUrl', models: [] },
      });
    }

    try {
      let url: string;
      let headers: Record<string, string> = {};

      if (name === 'Gemini' || baseUrl.includes('generativelanguage.googleapis.com')) {
        url = `${baseUrl.replace(/\/$/, '')}/models?key=${apiKey}`;
      } else {
        url = `${baseUrl.replace(/\/$/, '')}/models`;
        headers = { Authorization: `Bearer ${apiKey}` };
      }

      const res = await fetch(url, { headers });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return c.json({
          data: { success: false, error: `HTTP ${res.status}: ${text}`, models: [] },
        });
      }

      const data = (await res.json()) as {
        data?: Array<{ id: string }>;
        models?: Array<{ id: string }>;
      };
      const models = (data.data || data.models || []).map((m) => m.id).filter(Boolean);

      return c.json({
        data: { success: true, models },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '获取模型列表失败';
      return c.json({
        data: { success: false, error: message, models: [] },
      });
    }
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
