/**
 * 校验与验证工具
 */

/**
 * 验证 bookId 格式：仅允许字母、数字、下划线和连字符
 */
export function isValidBookId(bookId: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(bookId);
}

/**
 * 安全校验路径片段，防止路径遍历攻击
 */
export function sanitizePathSegment(segment: string): string {
  return segment.replace(/[\\/]/g, '_');
}
