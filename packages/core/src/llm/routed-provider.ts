import {
  LLMProvider,
  LLMConfig,
  LLMRequest,
  LLMResponse,
  LLMResponseWithJSON,
  LLMStreamChunk,
} from './provider';
import { OpenAICompatibleProvider } from './provider';
import { ClaudeProvider } from './claude-provider';
import { OllamaProvider } from './ollama-provider';
import { DashScopeProvider } from './dashscope-provider';
import { GeminiProvider } from './gemini-provider';

// ─── Routing Config ────────────────────────────────────────────

export type ProviderType = 'openai' | 'claude' | 'ollama' | 'dashscope' | 'gemini';

export interface AgentRoute {
  agent: string;
  provider: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ProviderEntry {
  name: string;
  type?: ProviderType;
  config: LLMConfig;
  status: 'connected' | 'disconnected' | 'degraded';
}

export interface RoutingConfig {
  defaultProvider: string;
  defaultModel: string;
  agentRouting: AgentRoute[];
  providers: ProviderEntry[];
}

// ─── Reputation System ─────────────────────────────────────────

interface ProviderReputation {
  name: string;
  score: number; // 0-100, default 100
  failures: number;
  successes: number;
  lastFailure: Date | null;
  cooldownUntil: Date | null;
}

const REPUTATION_PENALTY = 5; // 每次失败扣分
const REPUTATION_RECOVERY = 1; // 每次成功回血
const COOLDOWN_MS = 5 * 60 * 1000; // 冷却 5 分钟
const MIN_SCORE = 0;
const MAX_SCORE = 100;

const AGENT_ROLE_ALIASES: Record<string, string> = {
  writer: 'writer',
  scenepolisher: 'writer',
  chapterexecutor: 'writer',
  contextcard: 'writer',
  stylerefiner: 'writer',
  marketinjector: 'writer',
  stylefingerprinter: 'writer',

  auditor: 'auditor',
  qualityreviewer: 'auditor',
  factchecker: 'auditor',
  entityauditor: 'auditor',
  styleauditor: 'auditor',
  titlevoiceauditor: 'auditor',
  compliancereviewer: 'auditor',
  hookauditor: 'auditor',
  fatigueanalyzer: 'auditor',
  dialoguechecker: 'auditor',
  audittierclassifier: 'auditor',

  planner: 'planner',
  outlineplanner: 'planner',
  chapterplanner: 'planner',
  characterdesigner: 'planner',
  intentdirector: 'planner',
  storybootstrapplanner: 'planner',

  reviser: 'reviser',
  surgicalrewriter: 'reviser',

  composer: 'composer',
};

// ─── RoutedLLMProvider ─────────────────────────────────────────

export class RoutedLLMProvider extends LLMProvider {
  private routing: RoutingConfig;
  private providers: Map<string, LLMProvider>;
  private reputations: Map<string, ProviderReputation>;
  private providerCache: Map<string, LLMProvider> = new Map();

  constructor(routing: RoutingConfig) {
    const firstProvider = routing.providers[0];
    super(firstProvider?.config ?? { apiKey: '', baseURL: '', model: '' });

    this.routing = routing;
    this.providers = new Map();
    this.reputations = new Map();

    for (const entry of routing.providers) {
      this.providers.set(entry.name, this.createProvider(entry));
      this.reputations.set(entry.name, {
        name: entry.name,
        score: MAX_SCORE,
        failures: 0,
        successes: 0,
        lastFailure: null,
        cooldownUntil: null,
      });
    }
  }

  private createProvider(entry: ProviderEntry): LLMProvider {
    const type: ProviderType = entry.type ?? 'openai';
    switch (type) {
      case 'claude':
        return new ClaudeProvider(entry.config);
      case 'ollama':
        return new OllamaProvider(entry.config);
      case 'dashscope':
        return new DashScopeProvider(entry.config);
      case 'gemini':
        return new GeminiProvider(entry.config);
      case 'openai':
      default:
        return new OpenAICompatibleProvider(entry.config);
    }
  }

  /**
   * Register a provider instance at runtime.
   */
  registerProvider(name: string, provider: LLMProvider): void {
    this.providers.set(name, provider);
    this.reputations.set(name, {
      name,
      score: MAX_SCORE,
      failures: 0,
      successes: 0,
      lastFailure: null,
      cooldownUntil: null,
    });
  }

  /**
   * Resolve the best provider for a given agent name.
   * Checks agent routing config → falls back to default provider.
   * Excludes providers in cooldown due to recent failures.
   */
  resolveProvider(
    agentName?: string
  ): { provider: LLMProvider; model: string; providerName: string } | null {
    const route = this.findRoute(agentName);

    const targetProvider = route ? route.provider : this.routing.defaultProvider;

    const model = route?.model ?? this.routing.defaultModel;
    const provider = this.providers.get(targetProvider);

    if (provider && !this.isInCooldown(targetProvider)) {
      return { provider, model, providerName: targetProvider };
    }

    // Fallback: find any available provider sorted by reputation
    return this.findFallbackProvider();
  }

  /**
   * Get configuration overrides for a specific agent.
   */
  getAgentConfig(agentName?: string): LLMConfig {
    const route = this.findRoute(agentName);

    if (route) {
      const entry = this.routing.providers.find((e) => e.name === route.provider);
      return {
        ...(entry?.config ?? this.config),
        model: route.model,
        temperature: route.temperature,
        maxTokens: route.maxTokens,
      };
    }

    return this.config;
  }

  async generate(request: LLMRequest): Promise<LLMResponse> {
    const resolved = this.resolveProvider(request.agentName);
    if (!resolved) {
      throw new Error('No available LLM provider — all providers are in cooldown');
    }

    const { provider, model } = resolved;
    const agentConfig = this.getAgentConfig(request.agentName);

    const requestWithOverrides: LLMRequest = {
      ...request,
      temperature: request.temperature ?? agentConfig.temperature,
      maxTokens: request.maxTokens ?? agentConfig.maxTokens,
    };

    try {
      const effectiveProvider = this.createProviderForModel(provider, model);
      const result = await effectiveProvider.generate(requestWithOverrides);
      this.recordSuccess(resolved.providerName);
      return result;
    } catch (error) {
      this.recordFailure(resolved.providerName);
      const fallback = this.findFallbackProvider(resolved.providerName);
      if (fallback) {
        try {
          const result = await fallback.provider.generate(requestWithOverrides);
          this.recordSuccess(fallback.providerName);
          return result;
        } catch {
          this.recordFailure(fallback.providerName);
        }
      }
      throw error;
    }
  }

  async generateJSON<T>(request: LLMRequest): Promise<T> {
    const resolved = this.resolveProvider(request.agentName);
    if (!resolved) {
      throw new Error('No available LLM provider — all providers are in cooldown');
    }

    const { provider, model } = resolved;
    const agentConfig = this.getAgentConfig(request.agentName);

    const requestWithOverrides: LLMRequest = {
      ...request,
      temperature: request.temperature ?? agentConfig.temperature ?? 0.2,
      maxTokens: request.maxTokens ?? agentConfig.maxTokens,
    };

    try {
      const effectiveProvider = this.createProviderForModel(provider, model);
      const result = await effectiveProvider.generateJSON<T>(requestWithOverrides);
      this.recordSuccess(resolved.providerName);
      return result;
    } catch (error) {
      this.recordFailure(resolved.providerName);
      const fallback = this.findFallbackProvider(resolved.providerName);
      if (fallback) {
        try {
          const result = await fallback.provider.generateJSON<T>(requestWithOverrides);
          this.recordSuccess(fallback.providerName);
          return result;
        } catch {
          this.recordFailure(fallback.providerName);
        }
      }
      throw error;
    }
  }

  async generateJSONWithMeta<T>(request: LLMRequest): Promise<LLMResponseWithJSON<T>> {
    const resolved = this.resolveProvider(request.agentName);
    if (!resolved) {
      throw new Error('No available LLM provider — all providers are in cooldown');
    }

    const { provider, model } = resolved;
    const agentConfig = this.getAgentConfig(request.agentName);

    const requestWithOverrides: LLMRequest = {
      ...request,
      temperature: request.temperature ?? agentConfig.temperature ?? 0.2,
      maxTokens: request.maxTokens ?? agentConfig.maxTokens,
    };

    try {
      const effectiveProvider = this.createProviderForModel(provider, model);
      const result = await effectiveProvider.generateJSONWithMeta<T>(requestWithOverrides);
      this.recordSuccess(resolved.providerName);
      return result;
    } catch (error) {
      this.recordFailure(resolved.providerName);
      const fallback = this.findFallbackProvider(resolved.providerName);
      if (fallback) {
        const fallbackConfig = this.routing.providers.find((e) => e.name === fallback.providerName);
        if (fallbackConfig?.config) {
          const fallbackProvider = this.createProvider(fallbackConfig);
          const result = await fallbackProvider.generateJSONWithMeta<T>(requestWithOverrides);
          this.recordSuccess(fallback.providerName);
          return result;
        }
      }
      throw error;
    }
  }

  async *generateStream(request: LLMRequest): AsyncIterable<LLMStreamChunk> {
    const resolved = this.resolveProvider(request.agentName);
    if (!resolved) {
      throw new Error('No available LLM provider — all providers are in cooldown');
    }

    const { provider, model } = resolved;
    const agentConfig = this.getAgentConfig(request.agentName);

    const requestWithOverrides: LLMRequest = {
      ...request,
      temperature: request.temperature ?? agentConfig.temperature,
      maxTokens: request.maxTokens ?? agentConfig.maxTokens,
    };

    try {
      const effectiveProvider = this.createProviderForModel(provider, model);
      for await (const chunk of effectiveProvider.generateStream(requestWithOverrides)) {
        yield chunk;
      }
      this.recordSuccess(resolved.providerName);
    } catch (primaryError) {
      this.recordFailure(resolved.providerName);
      const fallback = this.findFallbackProvider(resolved.providerName);
      if (fallback) {
        try {
          const effectiveProvider = this.createProviderForModel(fallback.provider, model);
          for await (const chunk of effectiveProvider.generateStream(requestWithOverrides)) {
            yield chunk;
          }
          this.recordSuccess(fallback.providerName);
          return; // fallback 成功，不再 throw
        } catch (fallbackError) {
          this.recordFailure(fallback.providerName);
          const combinedError = new Error(
            `Stream failed: primary (${resolved.providerName}): ${primaryError instanceof Error ? primaryError.message : String(primaryError)}; fallback (${fallback.providerName}): ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`
          );
          throw combinedError;
        }
      }
      throw primaryError;
    }
  }

  // ─── Internal Helpers ────────────────────────────────────────

  private normalizeAgentName(agentName?: string): string {
    return (agentName ?? '').trim().toLowerCase();
  }

  private buildAgentCandidates(agentName?: string): string[] {
    const normalized = this.normalizeAgentName(agentName);
    if (!normalized) {
      return [];
    }

    const baseName = normalized.split('-')[0];
    return Array.from(
      new Set(
        [normalized, baseName, AGENT_ROLE_ALIASES[normalized], AGENT_ROLE_ALIASES[baseName]].filter(
          (candidate): candidate is string => Boolean(candidate)
        )
      )
    );
  }

  private findRoute(agentName?: string): AgentRoute | undefined {
    const candidates = this.buildAgentCandidates(agentName);
    if (candidates.length === 0) {
      return undefined;
    }

    return this.routing.agentRouting.find((route) =>
      candidates.includes(route.agent.trim().toLowerCase())
    );
  }

  private createProviderForModel(baseProvider: LLMProvider, model: string): LLMProvider {
    const entry = this.routing.providers.find((e) => this.providers.get(e.name) === baseProvider);
    const baseConfig = entry?.config ?? this.config;
    const type: ProviderType = entry?.type ?? 'openai';
    const cacheKey = `${entry?.name ?? 'default'}:${model}:${type}`;

    const cached = this.providerCache.get(cacheKey);
    if (cached) return cached;

    let provider: LLMProvider;
    switch (type) {
      case 'claude':
        provider = new ClaudeProvider({ ...baseConfig, model });
        break;
      case 'ollama':
        provider = new OllamaProvider({ ...baseConfig, model });
        break;
      case 'dashscope':
        provider = new DashScopeProvider({ ...baseConfig, model });
        break;
      case 'gemini':
        provider = new GeminiProvider({ ...baseConfig, model });
        break;
      case 'openai':
      default:
        provider = new OpenAICompatibleProvider({ ...baseConfig, model });
        break;
    }
    this.providerCache.set(cacheKey, provider);
    return provider;
  }

  private isInCooldown(providerName: string): boolean {
    const rep = this.reputations.get(providerName);
    if (!rep || !rep.cooldownUntil) return false;
    if (Date.now() < rep.cooldownUntil.getTime()) return true;
    // Cooldown expired, clear it
    rep.cooldownUntil = null;
    return false;
  }

  private recordSuccess(providerName: string): void {
    const rep = this.reputations.get(providerName);
    if (!rep) return;
    rep.successes++;
    rep.score = Math.min(MAX_SCORE, rep.score + REPUTATION_RECOVERY);
  }

  private recordFailure(providerName: string): void {
    const rep = this.reputations.get(providerName);
    if (!rep) return;
    rep.failures++;
    rep.lastFailure = new Date();
    rep.score = Math.max(MIN_SCORE, rep.score - REPUTATION_PENALTY);
    // Enter cooldown if score drops below threshold
    if (rep.score < 50) {
      rep.cooldownUntil = new Date(Date.now() + COOLDOWN_MS);
    }
  }

  private findFallbackProvider(
    exclude?: string
  ): { provider: LLMProvider; model: string; providerName: string } | null {
    const available = this.routing.providers
      .filter(
        (e) => e.name !== exclude && e.status !== 'disconnected' && !this.isInCooldown(e.name)
      )
      .sort((a, b) => {
        const repA = this.reputations.get(a.name)?.score ?? 0;
        const repB = this.reputations.get(b.name)?.score ?? 0;
        return repB - repA;
      });

    if (available.length === 0) return null;

    const chosen = available[0];
    return {
      provider: this.providers.get(chosen.name)!,
      model: chosen.config.model,
      providerName: chosen.name,
    };
  }

  // ─── Public API for Status & Management ──────────────────────

  getReputation(providerName: string): ProviderReputation | null {
    return this.reputations.get(providerName) ?? null;
  }

  getAllReputations(): ProviderReputation[] {
    return Array.from(this.reputations.values());
  }

  resetReputation(providerName: string): void {
    const rep = this.reputations.get(providerName);
    if (rep) {
      rep.score = MAX_SCORE;
      rep.failures = 0;
      rep.successes = 0;
      rep.lastFailure = null;
      rep.cooldownUntil = null;
    }
  }

  getProviderStatus(): { name: string; status: string; score: number }[] {
    return this.routing.providers.map((entry) => ({
      name: entry.name,
      status: entry.status,
      score: this.reputations.get(entry.name)?.score ?? 0,
    }));
  }
}
