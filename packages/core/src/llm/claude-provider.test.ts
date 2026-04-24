import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClaudeProvider } from './claude-provider';

// Hoisted mock factory
const mockCreate = vi.fn();
const mockStream = vi.fn();

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        create: mockCreate,
        stream: mockStream,
      },
    })),
  };
});

function createProvider(): ClaudeProvider {
  return new ClaudeProvider({
    apiKey: 'sk-ant-test',
    baseURL: 'https://api.anthropic.com',
    model: 'claude-sonnet-4-20250514',
  });
}

describe('ClaudeProvider', () => {
  let provider: ClaudeProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = createProvider();
  });

  describe('generate', () => {
    it('should return text from Claude response', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Hello from Claude' }],
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      const result = await provider.generate({ prompt: 'Say hello' });

      expect(result.text).toBe('Hello from Claude');
      expect(result.usage.promptTokens).toBe(10);
      expect(result.usage.completionTokens).toBe(5);
      expect(result.model).toBe('claude-sonnet-4-20250514');
    });

    it('should concatenate multiple text blocks', async () => {
      mockCreate.mockResolvedValue({
        content: [
          { type: 'text', text: 'Hello ' },
          { type: 'text', text: 'world' },
        ],
        usage: { input_tokens: 5, output_tokens: 3 },
      });

      const result = await provider.generate({ prompt: 'test' });
      expect(result.text).toBe('Hello world');
    });
  });

  describe('generateJSON', () => {
    it('should parse valid JSON response', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: '{"name": "test", "value": 42}' }],
        usage: { input_tokens: 10, output_tokens: 8 },
      });

      const result = await provider.generateJSON<{ name: string; value: number }>({
        prompt: 'return json',
      });

      expect(result).toEqual({ name: 'test', value: 42 });
    });

    it('should throw on invalid JSON', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'not json' }],
        usage: { input_tokens: 5, output_tokens: 3 },
      });

      await expect(provider.generateJSON({ prompt: 'test' })).rejects.toThrow(
        'Claude 返回了无法解析的 JSON'
      );
    });
  });

  describe('generateStream', () => {
    it('should yield text chunks', async () => {
      mockStream.mockResolvedValue({
        async *[Symbol.asyncIterator]() {
          yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } };
          yield { type: 'content_block_delta', delta: { type: 'text_delta', text: ' world' } };
        },
      });

      const collected: string[] = [];
      for await (const chunk of provider.generateStream({ prompt: 'stream test' })) {
        collected.push(chunk.text);
      }

      expect(collected).toEqual(['Hello', ' world', '']);
    });
  });
});
