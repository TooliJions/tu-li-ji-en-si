import { LLMProvider, LLMConfig, LLMRequest, LLMResponse, LLMResponseWithJSON } from './provider';
import { OpenAICompatibleProvider } from './provider';

// ─── Routing Config ────────────────────────────────────────────

export interface AgentRoute {
  agent: string;
  provider: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ProviderEntry {
  name: string;
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

// ─── RoutedLLMProvider ─────────────────────────────────────────

export class RoutedLLMProvider extends LLMProvider {
  private routing: RoutingConfig;
  private providers: Map<string, OpenAICompatibleProvider>;
  private reputations: Map<string, ProviderReputation>;

  constructor(routing: RoutingConfig) {
    // Use the first provider's config as the base (actual routing overrides per call)
    const firstProvider = routing.providers[0];
    super(firstProvider?.config ?? { apiKey: '', baseURL: '', model: '' });

    this.routing = routing;
    this.providers = new Map();
    this.reputations = new Map();

    // Initialize provider instances and reputations
    for (const entry of routing.providers) {
      this.providers.set(entry.name, new OpenAICompatibleProvider(entry.config));
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

  /**
   * Resolve the best provider for a given agent name.
   * Checks agent routing config → falls back to default provider.
   * Excludes providers in cooldown due to recent failures.
   */
  resolveProvider(
    agentName?: string
  ): { provider: OpenAICompatibleProvider; model: string; providerName: string } | null {
    // Find agent-specific route
    const route = this.routing.agentRouting.find(
      (r) => r.agent.toLowerCase() === (agentName ?? '').toLowerCase()
    );

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
    const route = this.routing.agentRouting.find(
      (r) => r.agent.toLowerCase() === (agentName ?? '').toLowerCase()
    );

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
          const fallbackProvider = new OpenAICompatibleProvider(fallbackConfig.config);
          const result = await fallbackProvider.generateJSONWithMeta<T>(requestWithOverrides);
          this.recordSuccess(fallback.providerName);
          return result;
        }
      }
      throw error;
    }
  }

  // ─── Internal Helpers ────────────────────────────────────────

  private createProviderForModel(
    baseProvider: OpenAICompatibleProvider,
    model: string
  ): OpenAICompatibleProvider {
    // Reuse the base provider's config by looking up the routing entry
    const entry = this.routing.providers.find((e) => this.providers.get(e.name) === baseProvider);
    const baseConfig = entry?.config ?? this.config;
    return new OpenAICompatibleProvider({ ...baseConfig, model });
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
  ): { provider: OpenAICompatibleProvider; model: string; providerName: string } | null {
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
