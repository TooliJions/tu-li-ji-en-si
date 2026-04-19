import OpenAI from 'openai';

export interface LLMConfig {
  apiKey: string;
  baseURL: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMRequest {
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  agentName?: string;
}

export interface LLMResponse {
  text: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
}

export abstract class LLMProvider {
  protected config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  abstract generate(request: LLMRequest): Promise<LLMResponse>;
  abstract generateJSON<T>(request: LLMRequest): Promise<T>;
}

export class OpenAICompatibleProvider extends LLMProvider {
  private client: OpenAI;

  constructor(config: LLMConfig) {
    super(config);
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
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
      messages: [{ role: 'user', content: request.prompt }],
      temperature: request.temperature ?? this.config.temperature ?? 0.2,
      max_tokens: request.maxTokens ?? this.config.maxTokens,
      response_format: { type: 'json_object' },
    });

    const text = completion.choices[0].message.content ?? '';
    return JSON.parse(text) as T;
  }
}
