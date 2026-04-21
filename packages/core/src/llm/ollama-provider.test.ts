import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OllamaProvider } from './ollama-provider';
import OpenAI from 'openai';

// Hoisted mock factory
const mockCreate = vi.fn();

vi.mock('openai', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    })),
  };
});

function createProvider(): OllamaProvider {
  return new OllamaProvider({ apiKey: 'ollama', model: 'llama3' });
}

describe('OllamaProvider', () => {
  let provider: OllamaProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = createProvider();
  });

  describe('generate', () => {
    it('should return text from Ollama response', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'Hello from Ollama' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        model: 'llama3',
      });

      const result = await provider.generate({ prompt: 'Say hello' });

      expect(result.text).toBe('Hello from Ollama');
      expect(result.usage.promptTokens).toBe(10);
      expect(result.model).toBe('llama3');
    });
  });

  describe('generateJSON', () => {
    it('should parse valid JSON response', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: '{"key": "value"}' } }],
        usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
      });

      const result = await provider.generateJSON<{ key: string }>({ prompt: 'json' });
      expect(result).toEqual({ key: 'value' });
    });

    it('should throw on invalid JSON', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'not json' } }],
        usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
      });

      await expect(provider.generateJSON({ prompt: 'test' })).rejects.toThrow(
        'Ollama 返回了无法解析的 JSON'
      );
    });
  });

  describe('generateStream', () => {
    it('should yield text chunks', async () => {
      mockCreate.mockResolvedValue({
        async *[Symbol.asyncIterator]() {
          yield {
            choices: [{ delta: { content: 'Hello' }, finish_reason: null }],
          };
          yield {
            choices: [{ delta: { content: ' world' }, finish_reason: null }],
          };
          yield {
            choices: [{ delta: {}, finish_reason: 'stop' }],
          };
        },
      });

      const collected: string[] = [];
      for await (const chunk of provider.generateStream({ prompt: 'stream' })) {
        collected.push(chunk.text);
      }

      expect(collected).toEqual(['Hello', ' world', '']);
    });
  });

  describe('default config', () => {
    it('should use default baseURL when not provided', () => {
      const p = new OllamaProvider({ apiKey: 'test', model: 'llama3' });
      expect((p as any).config.baseURL).toBe('http://localhost:11434/v1');
    });

    it('should use default apiKey when not provided', () => {
      const p = new OllamaProvider({ model: 'llama3' } as any);
      expect((p as any).config.apiKey).toBe('ollama');
    });
  });
});
