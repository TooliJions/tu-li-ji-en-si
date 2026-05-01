import type { LLMProvider, LLMRequest } from '../llm/provider';
import { z } from 'zod';

export interface AgentContext {
  bookId?: string;
  chapterId?: number;
  promptContext?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface AgentResult {
  success: boolean;
  data?: unknown;
  error?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export abstract class BaseAgent {
  abstract readonly name: string;
  abstract readonly temperature: number;

  protected readonly provider: LLMProvider;

  constructor(provider: LLMProvider) {
    this.provider = provider;
  }

  abstract execute(ctx: AgentContext): Promise<AgentResult>;

  /**
   * 调用 LLM Provider 生成文本
   */
  protected async generate(
    prompt: string,
    options?: { temperature?: number; maxTokens?: number },
  ): Promise<string> {
    const response = await this.provider.generate(this.#buildRequest(prompt, options));
    this.#lastUsage = response.usage;
    return response.text;
  }

  /**
   * 调用 LLM Provider 生成结构化 JSON
   */
  protected async generateJSON<T>(
    prompt: string,
    options?: { temperature?: number; maxTokens?: number },
  ): Promise<T> {
    return this.provider.generateJSON<T>(this.#buildRequest(prompt, options));
  }

  protected async generateJSONWithSchema<T>(
    prompt: string,
    schema: z.ZodType<T>,
    options?: { temperature?: number; maxTokens?: number },
  ): Promise<T> {
    const raw = await this.provider.generateJSON<unknown>(this.#buildRequest(prompt, options));
    const result = schema.safeParse(raw);
    if (!result.success) {
      throw new Error(
        `LLM 响应校验失败 (${this.name}): ${result.error.issues.map((i) => i.message).join('; ')}`,
      );
    }
    return result.data;
  }

  #lastUsage?: AgentResult['usage'];

  /**
   * 获取最近一次 generate 调用的 usage 信息
   */
  getLastUsage(): AgentResult['usage'] {
    return this.#lastUsage;
  }

  #buildRequest(
    prompt: string,
    options?: { temperature?: number; maxTokens?: number },
  ): LLMRequest {
    return {
      prompt,
      temperature: options?.temperature ?? this.temperature,
      maxTokens: options?.maxTokens,
      agentName: this.name,
    };
  }
}
