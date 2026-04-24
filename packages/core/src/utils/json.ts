/**
 * JSON 与对象操作工具
 */

/**
 * 安全获取嵌套对象属性
 */
export function getNestedValue<T = unknown>(obj: unknown, path: string[]): T | undefined {
  let current: unknown = obj;
  for (const key of path) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current as T;
}

/**
 * 安全解析 JSON，失败时返回 fallback
 */
export function safeParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

/**
 * 安全序列化为 JSON，失败时返回 fallback
 */
export function safeStringify<T>(value: T, fallback = '{}'): string {
  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}
