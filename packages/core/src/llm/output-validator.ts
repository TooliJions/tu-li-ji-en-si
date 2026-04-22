import type { LLMProvider } from './provider';

/**
 * LLM 输出校验规则
 */
export interface LLMOutputRule {
  /** 字段路径（支持嵌套，如 "plan.keyEvents"） */
  field: string;
  /** 校验类型 */
  type: 'required' | 'non_empty_array' | 'min_array_length' | 'min_string_length';
  /** 最小值（用于 min_array_length 和 min_string_length） */
  min?: number;
}

/**
 * LLM 输出校验结果
 */
export interface LLMOutputCheckResult {
  valid: boolean;
  errors: string[];
}

/**
 * 重试配置
 */
export interface LLMRetryConfig {
  maxRetries: number;
  retryDelayMs: number;
}

const DEFAULT_RETRY: LLMRetryConfig = { maxRetries: 2, retryDelayMs: 1000 };

/**
 * 从嵌套对象中按路径取值
 */
function getByPath(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * 校验 LLM 输出是否符合规则
 */
export function validateLLMOutput(data: unknown, rules: LLMOutputRule[]): LLMOutputCheckResult {
  const errors: string[] = [];

  for (const rule of rules) {
    const value = getByPath(data, rule.field);

    switch (rule.type) {
      case 'required':
        if (value == null || (typeof value === 'string' && value.trim().length === 0)) {
          errors.push(`字段 "${rule.field}" 缺失或为空`);
        }
        break;
      case 'non_empty_array':
        if (!Array.isArray(value) || value.length === 0) {
          errors.push(`字段 "${rule.field}" 必须是非空数组`);
        }
        break;
      case 'min_array_length':
        if (!Array.isArray(value) || value.length < (rule.min ?? 1)) {
          errors.push(
            `字段 "${rule.field}" 数组长度至少 ${rule.min ?? 1}，当前 ${Array.isArray(value) ? value.length : 0}`
          );
        }
        break;
      case 'min_string_length':
        if (typeof value !== 'string' || value.trim().length < (rule.min ?? 1)) {
          errors.push(
            `字段 "${rule.field}" 字符串长度至少 ${rule.min ?? 1}，当前 ${typeof value === 'string' ? value.trim().length : 0}`
          );
        }
        break;
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * 带校验和重试的 JSON 生成调用
 * 如果校验失败，会在 prompt 中追加错误提示并重新调用 LLM
 */
export async function generateJSONWithValidation<T>(
  provider: LLMProvider,
  prompt: string,
  rules: LLMOutputRule[],
  options?: {
    temperature?: number;
    maxTokens?: number;
    agentName?: string;
    retry?: LLMRetryConfig;
  }
): Promise<T> {
  const retry = options?.retry ?? DEFAULT_RETRY;
  let currentPrompt = prompt;
  let lastData: T | null = null;

  for (let attempt = 0; attempt <= retry.maxRetries; attempt++) {
    const data = await provider.generateJSON<T>({
      prompt: currentPrompt,
      temperature: options?.temperature ?? 0.7,
      maxTokens: options?.maxTokens,
      agentName: options?.agentName,
    });

    lastData = data;
    const result = validateLLMOutput(data, rules);

    if (result.valid) {
      return data;
    }

    // 校验失败，追加错误提示后重试
    if (attempt < retry.maxRetries) {
      currentPrompt = `${prompt}\n\n## 校验失败提示\n上一次输出存在以下问题，请修正后重新输出：\n${result.errors.map((e) => `- ${e}`).join('\n')}\n\n请确保所有字段都满足上述要求。`;
    }
  }

  // 所有重试都失败，返回最后一次数据（可能不完整）
  return lastData!;
}

/**
 * 填充缺失字段为默认值，确保输出永远不会是空值
 */
export function fillDefaults<T extends Record<string, unknown>>(data: T, defaults: Partial<T>): T {
  const result = { ...data };
  for (const [key, defaultVal] of Object.entries(defaults)) {
    const current = result[key];
    if (current == null || (typeof current === 'string' && current.trim().length === 0)) {
      (result as Record<string, unknown>)[key] = defaultVal;
    }
    if (
      Array.isArray(current) &&
      current.length === 0 &&
      Array.isArray(defaultVal) &&
      defaultVal.length > 0
    ) {
      (result as Record<string, unknown>)[key] = defaultVal;
    }
  }
  return result;
}
