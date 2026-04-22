/**
 * 共享工具函数
 * 统一管理跨模块复用的工具函数，避免在多个文件中重复定义。
 */

/**
 * 中文友好的字数统计：中文字符按 1 字计，英文单词按 1 字计
 */
export function countChineseWords(text: string): number {
  const cjk = text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g)?.length ?? 0;
  const words = text.match(/[a-zA-Z0-9]+/g)?.length ?? 0;
  return cjk + words;
}

/**
 * 验证 bookId 格式：仅允许字母、数字、下划线和连字符
 */
export function isValidBookId(bookId: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(bookId);
}

/**
 * 从 frontmatter 格式的 Markdown 中提取正文内容
 */
export function stripFrontmatter(rawContent: string): string {
  const match = rawContent.match(/^---\n[\s\S]*?\n---\n?/);
  return match ? rawContent.slice(match[0].length).trim() : rawContent.trim();
}

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
