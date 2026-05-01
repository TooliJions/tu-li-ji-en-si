// ─── DeepSeek Provider ───────────────────────────────────────────
// DeepSeek 使用 OpenAI 兼容 API，只需配置默认 baseURL 和 model。

import { OpenAICompatibleProvider } from './provider';
import type { LLMConfig } from './provider';

export class DeepSeekProvider extends OpenAICompatibleProvider {
  constructor(config: LLMConfig) {
    super({
      ...config,
      baseURL: config.baseURL || 'https://api.deepseek.com/v1',
      model: config.model || 'deepseek-chat',
    });
  }
}
