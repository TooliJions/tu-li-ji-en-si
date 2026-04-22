import { describe, it, expect, beforeEach } from 'vitest';
import { RoutedLLMProvider, RoutingConfig } from './routed-provider';
import { LLMRequest } from './provider';

function createMockRouting(): RoutingConfig {
  return {
    defaultProvider: 'DashScope',
    defaultModel: 'qwen3.6-plus',
    agentRouting: [
      { agent: 'Writer', provider: 'DashScope', model: 'qwen3.6-plus', temperature: 0.8 },
      { agent: 'Auditor', provider: 'OpenAI', model: 'gpt-4o', temperature: 0.2 },
      { agent: 'Planner', provider: 'Gemini', model: 'gemini-2.5-pro', temperature: 0.6 },
    ],

    providers: [
      {
        name: 'DashScope',
        config: {
          apiKey: 'sk-dashscope',
          baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
          model: 'qwen3.6-plus',
        },
        status: 'connected',
      },
      {
        name: 'OpenAI',
        config: { apiKey: 'sk-openai', baseURL: 'https://api.openai.com/v1', model: 'gpt-4o' },
        status: 'connected',
      },
      {
        name: 'Gemini',
        config: {
          apiKey: 'sk-gemini',
          baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
          model: 'gemini-2.5-pro',
        },
        status: 'connected',
      },
    ],
  };
}

describe('RoutedLLMProvider', () => {
  let routing: RoutingConfig;
  let provider: RoutedLLMProvider;

  beforeEach(() => {
    routing = createMockRouting();
    provider = new RoutedLLMProvider(routing);
  });

  describe('resolveProvider', () => {
    it('should resolve Writer agent to DashScope', () => {
      const resolved = provider.resolveProvider('Writer');
      expect(resolved).not.toBeNull();
      expect(resolved!.model).toBe('qwen3.6-plus');
    });

    it('should resolve Auditor agent to OpenAI', () => {
      const resolved = provider.resolveProvider('Auditor');
      expect(resolved).not.toBeNull();
      expect(resolved!.model).toBe('gpt-4o');
    });

    it('should fallback to default provider for unknown agent', () => {
      const resolved = provider.resolveProvider('UnknownAgent');
      expect(resolved).not.toBeNull();
      expect(resolved!.model).toBe('qwen3.6-plus');
    });

    it('should fallback to default provider when no agent name provided', () => {
      const resolved = provider.resolveProvider();
      expect(resolved).not.toBeNull();
      expect(resolved!.model).toBe('qwen3.6-plus');
    });
  });

  describe('getAgentConfig', () => {
    it('should return Writer agent config with temperature override', () => {
      const config = provider.getAgentConfig('Writer');
      expect(config.temperature).toBe(0.8);
      expect(config.model).toBe('qwen3.6-plus');
    });

    it('should return Auditor config with low temperature', () => {
      const config = provider.getAgentConfig('Auditor');
      expect(config.temperature).toBe(0.2);
      expect(config.model).toBe('gpt-4o');
    });

    it('should return Planner config for concrete planner agent names', () => {
      const config = provider.getAgentConfig('StoryBootstrapPlanner');
      expect(config.temperature).toBe(0.6);
      expect(config.model).toBe('gemini-2.5-pro');
    });

    it('should return default config for unknown agent', () => {
      const config = provider.getAgentConfig('UnknownAgent');
      expect(config.model).toBe('qwen3.6-plus');
    });
  });

  describe('reputation system', () => {
    it('should initialize all providers with max reputation', () => {
      const reputations = provider.getAllReputations();
      expect(reputations).toHaveLength(3);
      for (const rep of reputations) {
        expect(rep.score).toBe(100);
        expect(rep.failures).toBe(0);
        expect(rep.successes).toBe(0);
      }
    });

    it('should get individual provider reputation', () => {
      const rep = provider.getReputation('DashScope');
      expect(rep).not.toBeNull();
      expect(rep!.name).toBe('DashScope');
      expect(rep!.score).toBe(100);
    });

    it('should return null for unknown provider', () => {
      const rep = provider.getReputation('UnknownProvider');
      expect(rep).toBeNull();
    });

    it('should reset reputation', () => {
      provider.resetReputation('DashScope');
      const rep = provider.getReputation('DashScope');
      expect(rep!.score).toBe(100);
      expect(rep!.failures).toBe(0);
    });
  });

  describe('provider status', () => {
    it('should return status for all providers', () => {
      const status = provider.getProviderStatus();
      expect(status).toHaveLength(3);
      expect(status.find((s) => s.name === 'DashScope')?.status).toBe('connected');
    });

    it('should include reputation scores in status', () => {
      const status = provider.getProviderStatus();
      const dash = status.find((s) => s.name === 'DashScope');
      expect(dash!.score).toBe(100);
    });
  });

  describe('generate failure handling', () => {
    it('should throw when no agent route and no default provider configured', async () => {
      // Create a provider with no providers configured (empty routing)
      const emptyProvider = new RoutedLLMProvider({
        defaultProvider: 'NonExistent',
        defaultModel: 'model',
        agentRouting: [],
        providers: [],
      });

      const request: LLMRequest = { prompt: 'test' };
      await expect(emptyProvider.generate(request)).rejects.toThrow('No available LLM provider');
    });
  });
});
