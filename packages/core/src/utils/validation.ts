/**
 * 校验与验证工具
 */

import { SecurityError } from '../errors';

/**
 * 验证 bookId 格式：仅允许字母、数字、下划线和连字符
 */
export function isValidBookId(bookId: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(bookId);
}

/**
 * 安全断言 bookId 格式，无效时抛出 SecurityError
 */
export function assertSafeBookId(bookId: string): void {
  if (!bookId || typeof bookId !== 'string') {
    throw new SecurityError('bookId 不能为空');
  }
  if (!isValidBookId(bookId)) {
    throw new SecurityError(`非法的 bookId: ${bookId}`);
  }
}

/**
 * 安全校验路径片段，防止路径遍历攻击
 */
export function sanitizePathSegment(segment: string): string {
  return segment.replace(/[\\/]/g, '_');
}
