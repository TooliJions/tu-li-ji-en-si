import OpenAI from 'openai';
import {
  LLMProvider,
  LLMConfig,
  LLMRequest,
  LLMResponse,
  LLMResponseWithJSON,
  LLMStreamChunk,
} from './provider';

/**
 * Gemini Provider（Google Gemini via OpenAI 兼容 API）。
 * baseURL 默认为 Gemini 的 OpenAI 兼容端点。
 */
export class GeminiProvider extends LLMProvider {
  private client: OpenAI;

  constructor(config: LLMConfig) {
    const mergedConfig: LLMConfig = {
      ...config,
      baseURL: config.baseURL || 'https://generativelanguage.googleapis.com/v1beta/openai',
    };
    super(mergedConfig);
    this.client = new OpenAI({
      apiKey: mergedConfig.apiKey,
      baseURL: mergedConfig.baseURL,
    });
  }

  async generate(request: LLMRequest): Promise<LLMResponse> {
    const completion = await this.client.chat.completions.create({
      model: this.config.model,
      messages: [{ role: 'user', content: request.prompt }],
      temperature: request.temperature ?? this.config.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? this.config.maxTokens,
    });

    const choice = completion.choices[0];
    return {
      text: choice.message.content ?? '',
      usage: {
        promptTokens: completion.usage?.prompt_tokens ?? 0,
        completionTokens: completion.usage?.completion_tokens ?? 0,
        totalTokens: completion.usage?.total_tokens ?? 0,
      },
      model: completion.model ?? this.config.model,
    };
  }

  async generateJSON<T>(request: LLMRequest): Promise<T> {
    const completion = await this.client.chat.completions.create({
      model: this.config.model,
      messages: [
        {
          role: 'user',
          content: request.prompt + '\n\n请仅返回有效的 JSON，不要额外的文本。',
        },
      ],
      temperature: request.temperature ?? this.config.temperature ?? 0.2,
      max_tokens: request.maxTokens ?? this.config.maxTokens,
      response_format: { type: 'json_object' },
    });

    const text = completion.choices[0].message.content ?? '';
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(
        `Gemini 返回了无法解析的 JSON。模型: ${this.config.model}，内容片段: ${text.slice(0, 200)}`
      );
    }
  }

  async generateJSONWithMeta<T>(request: LLMRequest): Promise<LLMResponseWithJSON<T>> {
    const completion = await this.client.chat.completions.create({
      model: this.config.model,
      messages: [
        {
          role: 'user',
          content: request.prompt + '\n\n请仅返回有效的 JSON，不要额外的文本。',
        },
      ],
      temperature: request.temperature ?? this.config.temperature ?? 0.2,
      max_tokens: request.maxTokens ?? this.config.maxTokens,
      response_format: { type: 'json_object' },
    });

    const text = completion.choices[0].message.content ?? '';
    try {
      return {
        data: JSON.parse(text) as T,
        usage: {
          promptTokens: completion.usage?.prompt_tokens ?? 0,
          completionTokens: completion.usage?.completion_tokens ?? 0,
          totalTokens: completion.usage?.total_tokens ?? 0,
        },
        model: completion.model ?? this.config.model,
      };
    } catch {
      throw new Error(
        `Gemini 返回了无法解析的 JSON。模型: ${this.config.model}，内容片段: ${text.slice(0, 200)}`
      );
    }
  }

  async *generateStream(request: LLMRequest): AsyncIterable<LLMStreamChunk> {
    const stream = await this.client.chat.completions.create({
      model: this.config.model,
      messages: [{ role: 'user', content: request.prompt }],
      temperature: request.temperature ?? this.config.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? this.config.maxTokens,
      stream: true,
    });

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content ?? '';
      const done = chunk.choices[0]?.finish_reason !== null;
      if (text || done) {
        yield {
          text,
          done,
          usage: chunk.usage
            ? {
                promptTokens: chunk.usage.prompt_tokens ?? 0,
                completionTokens: chunk.usage.completion_tokens ?? 0,
              }
            : undefined,
        };
      }
    }
  }
}
