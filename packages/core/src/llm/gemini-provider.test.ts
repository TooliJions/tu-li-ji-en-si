import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiProvider } from './gemini-provider';

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

function createProvider(): GeminiProvider {
  return new GeminiProvider({ apiKey: 'gemini-key', model: 'gemini-pro' });
}

describe('GeminiProvider', () => {
  let provider: GeminiProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = createProvider();
  });

  describe('generate', () => {
    it('返回文本和用量', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'Hello from Gemini' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        model: 'gemini-pro',
      });

      const result = await provider.generate({ prompt: 'Say hello' });

      expect(result.text).toBe('Hello from Gemini');
      expect(result.usage.promptTokens).toBe(10);
      expect(result.model).toBe('gemini-pro');
    });

    it('调用参数包含 temperature 和 max_tokens', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: '' } }],
        usage: {},
      });

      await provider.generate({ prompt: 'test', temperature: 0.5, maxTokens: 100 });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.5,
          max_tokens: 100,
        }),
      );
    });
  });

  describe('generateJSON', () => {
    it('解析有效 JSON', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: '{"key": "value"}' } }],
        usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
      });

      const result = await provider.generateJSON<{ key: string }>({ prompt: 'json' });
      expect(result).toEqual({ key: 'value' });
    });

    it('请求包含 json_object response_format', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: '{}' } }],
        usage: {},
      });

      await provider.generateJSON({ prompt: 'test' });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          response_format: { type: 'json_object' },
        }),
      );
    });

    it('无效 JSON 抛出错误', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'not json' } }],
        usage: {},
      });

      await expect(provider.generateJSON({ prompt: 'test' })).rejects.toThrow(
        'Gemini 返回了无法解析的 JSON',
      );
    });
  });

  describe('generateJSONWithMeta', () => {
    it('返回数据和元信息', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: '{"a": 1}' } }],
        usage: { prompt_tokens: 2, completion_tokens: 2, total_tokens: 4 },
        model: 'gemini-pro',
      });

      const result = await provider.generateJSONWithMeta<{ a: number }>({ prompt: 'test' });
      expect(result.data).toEqual({ a: 1 });
      expect(result.usage.totalTokens).toBe(4);
      expect(result.model).toBe('gemini-pro');
    });
  });

  describe('generateStream', () => {
    it('产出文本分块', async () => {
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

  describe('默认配置', () => {
    it('未提供 baseURL 时使用默认端点', () => {
      const p = new GeminiProvider({ apiKey: 'test', model: 'gemini-pro' });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((p as any).config.baseURL).toBe(
        'https://generativelanguage.googleapis.com/v1beta/openai',
      );
    });
  });
});
