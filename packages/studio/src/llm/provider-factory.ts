import { LLMProvider, RoutedLLMProvider } from '@cybernovelist/core';
import { DeterministicProvider } from './deterministic-provider';
import { type StudioRuntimeBookRecord } from '../runtime/book-repository';
import * as fs from 'node:fs';
import * as path from 'node:path';

class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

type StudioConfigProvider = {
  name: string;
  apiKey: string;
  baseUrl: string;
  model?: string;
  type?: 'openai' | 'claude' | 'ollama' | 'dashscope' | 'gemini';
  status?: string;
};

type StudioConfigRoute = {
  agent: string;
  model: string;
  provider: string;
  temperature?: number;
  maxTokens?: number;
};

type StudioConfigState = {
  defaultProvider?: string;
  defaultModel?: string;
  agentRouting?: StudioConfigRoute[];
  providers?: StudioConfigProvider[];
};

function loadStudioConfig(): StudioConfigState | null {
  const cfgPath = process.env.CONFIG_PATH
    ? path.resolve(process.env.CONFIG_PATH)
    : path.join(process.cwd(), '.cybernovelist-config.json');

  try {
    if (!fs.existsSync(cfgPath)) {
      return null;
    }

    const raw = fs.readFileSync(cfgPath, 'utf-8');
    return JSON.parse(raw) as StudioConfigState;
  } catch (err) {
    console.warn('[provider-factory] Failed to load studio config:', cfgPath, err);
    return null;
  }
}

function inferProviderType(
  name: string,
  baseUrl: string
): 'openai' | 'claude' | 'ollama' | 'dashscope' | 'gemini' {
  const normalizedName = name.trim().toLowerCase();
  const normalizedBaseUrl = baseUrl.trim().toLowerCase();

  if (normalizedName.includes('claude') || normalizedBaseUrl.includes('anthropic')) {
    return 'claude';
  }
  if (normalizedName.includes('gemini') || normalizedBaseUrl.includes('generativelanguage')) {
    return 'gemini';
  }
  if (normalizedName.includes('dashscope') || normalizedBaseUrl.includes('dashscope')) {
    return 'dashscope';
  }
  if (normalizedName.includes('ollama') || normalizedBaseUrl.includes('11434')) {
    return 'ollama';
  }
  return 'openai';
}

function upsertRoute(
  routes: StudioConfigRoute[],
  nextRoute: StudioConfigRoute
): StudioConfigRoute[] {
  return [
    ...routes.filter(
      (route) => route.agent.trim().toLowerCase() !== nextRoute.agent.trim().toLowerCase()
    ),
    nextRoute,
  ];
}

function applyBookModelOverrides(
  baseRoutes: StudioConfigRoute[],
  defaultProvider: string,
  book?: StudioRuntimeBookRecord | null
): StudioConfigRoute[] {
  const routes = [...baseRoutes];
  if (!book || book.modelConfig.useGlobalDefaults) {
    return routes;
  }

  const overrides: Array<{ agent: 'Writer' | 'Auditor' | 'Planner'; model: string }> = [
    { agent: 'Writer', model: book.modelConfig.writer },
    { agent: 'Auditor', model: book.modelConfig.auditor },
    { agent: 'Planner', model: book.modelConfig.planner },
  ];

  return overrides.reduce((currentRoutes, override) => {
    const existing = currentRoutes.find(
      (route) => route.agent.trim().toLowerCase() === override.agent.toLowerCase()
    );

    return upsertRoute(currentRoutes, {
      agent: override.agent,
      provider: existing?.provider ?? defaultProvider,
      model: override.model,
      temperature: existing?.temperature,
      maxTokens: existing?.maxTokens,
    });
  }, routes);
}

function isBrowserLikeRuntime(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

export function buildLLMProvider(book?: StudioRuntimeBookRecord | null): LLMProvider {
  if (isBrowserLikeRuntime()) {
    return new DeterministicProvider();
  }

  const parsed = loadStudioConfig();
  const configuredProviders = (parsed?.providers ?? []).filter(
    (provider) => provider.apiKey && provider.baseUrl
  );

  if (configuredProviders.length > 0) {
    const defaultProvider = configuredProviders.some(
      (provider) => provider.name === parsed?.defaultProvider
    )
      ? (parsed?.defaultProvider ?? configuredProviders[0].name)
      : configuredProviders[0].name;

    const defaultProviderEntry =
      configuredProviders.find((provider) => provider.name === defaultProvider) ??
      configuredProviders[0];

    const defaultModel =
      parsed?.defaultModel ??
      defaultProviderEntry.model ??
      configuredProviders[0].model ??
      'deterministic-provider';

    const routingConfig = {
      defaultProvider,
      defaultModel,
      agentRouting: applyBookModelOverrides(parsed?.agentRouting ?? [], defaultProvider, book),
      providers: configuredProviders.map((provider) => ({
        name: provider.name,
        type: provider.type ?? inferProviderType(provider.name, provider.baseUrl),
        config: {
          apiKey: provider.apiKey,
          baseURL: provider.baseUrl,
          model: provider.model ?? defaultModel,
        },
        status:
          provider.status === 'disconnected' ? ('disconnected' as const) : ('connected' as const),
      })),
    };
    return new RoutedLLMProvider(routingConfig);
  }

  if (process.env.VITEST === 'true') {
    return new DeterministicProvider();
  }

  throw new ConfigurationError(
    'No LLM provider configured. Please set up API keys in .cybernovelist-config.json'
  );
}
