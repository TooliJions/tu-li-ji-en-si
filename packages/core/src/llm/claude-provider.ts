import Anthropic from '@anthropic-ai/sdk';
import {
  LLMProvider,
  LLMConfig,
  LLMRequest,
  LLMResponse,
  LLMResponseWithJSON,
  LLMStreamChunk,
} from './provider';

export class ClaudeProvider extends LLMProvider {
  private client: Anthropic;

  constructor(config: LLMConfig) {
    super(config);
    this.client = new Anthropic({ apiKey: config.apiKey });
  }

  async generate(request: LLMRequest): Promise<LLMResponse> {
    const message = await this.client.messages.create({
      model: this.config.model,
      max_tokens: request.maxTokens ?? this.config.maxTokens ?? 4096,
      temperature: request.temperature ?? this.config.temperature ?? 0.7,
      messages: [{ role: 'user', content: request.prompt }],
    });

    const text = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    return {
      text,
      usage: {
        promptTokens: message.usage.input_tokens ?? 0,
        completionTokens: message.usage.output_tokens ?? 0,
        totalTokens: (message.usage.input_tokens ?? 0) + (message.usage.output_tokens ?? 0),
      },
      model: this.config.model,
    };
  }

  async generateJSON<T>(request: LLMRequest): Promise<T> {
    const message = await this.client.messages.create({
      model: this.config.model,
      max_tokens: request.maxTokens ?? this.config.maxTokens ?? 4096,
      temperature: request.temperature ?? this.config.temperature ?? 0.2,
      messages: [
        {
          role: 'user',
          content: request.prompt + '\n\n请仅返回有效的 JSON，不要额外的文本。',
        },
      ],
    });

    const text = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(
        `Claude 返回了无法解析的 JSON。模型: ${this.config.model}，内容片段: ${text.slice(0, 200)}`
      );
    }
  }

  async generateJSONWithMeta<T>(request: LLMRequest): Promise<LLMResponseWithJSON<T>> {
    const message = await this.client.messages.create({
      model: this.config.model,
      max_tokens: request.maxTokens ?? this.config.maxTokens ?? 4096,
      temperature: request.temperature ?? this.config.temperature ?? 0.2,
      messages: [
        {
          role: 'user',
          content: request.prompt + '\n\n请仅返回有效的 JSON，不要额外的文本。',
        },
      ],
    });

    const text = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    try {
      return {
        data: JSON.parse(text) as T,
        usage: {
          promptTokens: message.usage.input_tokens ?? 0,
          completionTokens: message.usage.output_tokens ?? 0,
          totalTokens: (message.usage.input_tokens ?? 0) + (message.usage.output_tokens ?? 0),
        },
        model: this.config.model,
      };
    } catch {
      throw new Error(
        `Claude 返回了无法解析的 JSON。模型: ${this.config.model}，内容片段: ${text.slice(0, 200)}`
      );
    }
  }

  async *generateStream(request: LLMRequest): AsyncIterable<LLMStreamChunk> {
    const stream = await this.client.messages.stream({
      model: this.config.model,
      max_tokens: request.maxTokens ?? this.config.maxTokens ?? 4096,
      temperature: request.temperature ?? this.config.temperature ?? 0.7,
      messages: [{ role: 'user', content: request.prompt }],
    });

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
        yield {
          text: chunk.delta.text,
          done: false,
        };
      }
    }

    yield { text: '', done: true };
  }
}
