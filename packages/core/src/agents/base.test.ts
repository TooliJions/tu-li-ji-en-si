import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseAgent, type AgentContext, type AgentResult } from './base';
import type { LLMProvider } from '../llm/provider';

// ── Test double concrete agent ────────────────────────────

class TestAgent extends BaseAgent {
  readonly name = 'TestAgent';
  readonly temperature = 0.5;

  async execute(_ctx: AgentContext): Promise<AgentResult> {
    const text = await this.generate('test prompt');
    return { success: true, data: text };
  }
}

class TestJsonAgent extends BaseAgent {
  readonly name = 'TestJsonAgent';
  readonly temperature = 0.3;

  async execute(_ctx: AgentContext): Promise<AgentResult> {
    const json = await this.generateJSON<{ key: string }>('json prompt');
    return { success: true, data: json };
  }
}

// ── Tests ─────────────────────────────────────────────────

describe('BaseAgent', () => {
  let mockProvider: LLMProvider;
  let agent: TestAgent;
  let jsonAgent: TestJsonAgent;
  let ctx: AgentContext;

  beforeEach(() => {
    mockProvider = {
      generate: vi.fn(),
      generateJSON: vi.fn(),
    } as unknown as LLMProvider;

    agent = new TestAgent(mockProvider);
    jsonAgent = new TestJsonAgent(mockProvider);
    ctx = {};
  });

  // ── Properties ──────────────────────────────────────────

  describe('abstract properties', () => {
    it('exposes agent name', () => {
      expect(agent.name).toBe('TestAgent');
    });

    it('exposes temperature', () => {
      expect(agent.temperature).toBe(0.5);
    });
  });

  // ── generate() ──────────────────────────────────────────

  describe('generate()', () => {
    it('forwards prompt to provider with agent temperature', async () => {
      const mockResponse: LLMResponse = {
        text: 'generated text',
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        model: 'test-model',
      };
      (mockProvider.generate as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      const result = await agent.generate('hello world');

      expect(mockProvider.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: 'hello world',
          temperature: 0.5,
        })
      );
      expect(result).toBe('generated text');
    });

    it('allows overriding temperature', async () => {
      const mockResponse: LLMResponse = {
        text: 'override text',
        usage: { promptTokens: 5, completionTokens: 10, totalTokens: 15 },
        model: 'test-model',
      };
      (mockProvider.generate as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      await agent.generate('override temp', { temperature: 0.9 });

      expect(mockProvider.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: 'override temp',
          temperature: 0.9,
        })
      );
    });

    it('allows overriding maxTokens', async () => {
      const mockResponse: LLMResponse = {
        text: 'short text',
        usage: { promptTokens: 5, completionTokens: 10, totalTokens: 15 },
        model: 'test-model',
      };
      (mockProvider.generate as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      await agent.generate('short prompt', { maxTokens: 100 });

      expect(mockProvider.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: 'short prompt',
          temperature: 0.5,
          maxTokens: 100,
        })
      );
    });

    it('includes agentName in provider request', async () => {
      const mockResponse: LLMResponse = {
        text: 'named text',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        model: 'test-model',
      };
      (mockProvider.generate as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      await agent.generate('name check');

      expect(mockProvider.generate).toHaveBeenCalledWith(
        expect.objectContaining({ agentName: 'TestAgent' })
      );
    });
  });

  // ── generateJSON() ──────────────────────────────────────

  describe('generateJSON()', () => {
    it('returns parsed JSON from provider', async () => {
      const parsed = { key: 'value' };
      (mockProvider.generateJSON as ReturnType<typeof vi.fn>).mockResolvedValue(parsed);

      const result = await jsonAgent.generateJSON<{ key: string }>('json prompt');

      expect(result).toEqual({ key: 'value' });
    });

    it('forwards prompt to provider with agent temperature', async () => {
      (mockProvider.generateJSON as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await jsonAgent.generateJSON<{ key: string }>('parse this');

      expect(mockProvider.generateJSON).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: 'parse this',
          temperature: 0.3,
        })
      );
    });

    it('allows overriding temperature', async () => {
      (mockProvider.generateJSON as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await jsonAgent.generateJSON<{ key: string }>('temp override', { temperature: 0.1 });

      expect(mockProvider.generateJSON).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: 'temp override',
          temperature: 0.1,
        })
      );
    });

    it('includes agentName in provider request', async () => {
      (mockProvider.generateJSON as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await jsonAgent.generateJSON<{ key: string }>('name check');

      expect(mockProvider.generateJSON).toHaveBeenCalledWith(
        expect.objectContaining({ agentName: 'TestJsonAgent' })
      );
    });
  });

  // ── execute() delegation ────────────────────────────────

  describe('execute() delegation', () => {
    it('concrete execute() can call generate and return result', async () => {
      const mockResponse: LLMResponse = {
        text: 'execution result',
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        model: 'test-model',
      };
      (mockProvider.generate as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      const result = await agent.execute(ctx);

      expect(result.success).toBe(true);
      expect(result.data).toBe('execution result');
    });
  });

  // ── Error handling ─────────────────────────────────────

  describe('error propagation', () => {
    it('propagates provider errors from generate', async () => {
      (mockProvider.generate as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('LLM timeout')
      );

      await expect(agent.generate('fail')).rejects.toThrow('LLM timeout');
    });

    it('propagates provider errors from generateJSON', async () => {
      (mockProvider.generateJSON as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Invalid JSON')
      );

      await expect(jsonAgent.generateJSON('fail')).rejects.toThrow('Invalid JSON');
    });
  });
});
