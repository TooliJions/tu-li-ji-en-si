import { describe, it, expect } from 'vitest';
import { isValidBookId, assertSafeBookId, sanitizePathSegment } from './validation';
import { SecurityError } from '../errors';

describe('isValidBookId', () => {
  it('returns true for valid IDs', () => {
    expect(isValidBookId('book_001')).toBe(true);
    expect(isValidBookId('my-book')).toBe(true);
    expect(isValidBookId('ABC123')).toBe(true);
  });

  it('returns false for empty string', () => {
    expect(isValidBookId('')).toBe(false);
  });

  it('returns false for path separators', () => {
    expect(isValidBookId('a/b')).toBe(false);
    expect(isValidBookId('a\\b')).toBe(false);
  });

  it('returns false for dot paths', () => {
    expect(isValidBookId('.')).toBe(false);
    expect(isValidBookId('..')).toBe(false);
  });

  it('returns false for absolute paths', () => {
    expect(isValidBookId('/etc/passwd')).toBe(false);
    expect(isValidBookId('C:\\Windows')).toBe(false);
  });
});

describe('assertSafeBookId', () => {
  it('does not throw for valid bookId', () => {
    expect(() => assertSafeBookId('valid-book')).not.toThrow();
  });

  it('throws SecurityError for empty string', () => {
    expect(() => assertSafeBookId('')).toThrow(SecurityError);
  });

  it('throws SecurityError for nullish value', () => {
    expect(() => assertSafeBookId(undefined as unknown as string)).toThrow(SecurityError);
    expect(() => assertSafeBookId(null as unknown as string)).toThrow(SecurityError);
  });

  it('throws SecurityError for path traversal', () => {
    expect(() => assertSafeBookId('../etc')).toThrow(SecurityError);
    expect(() => assertSafeBookId('..')).toThrow(SecurityError);
  });

  it('throws SecurityError for absolute path', () => {
    expect(() => assertSafeBookId('/etc/passwd')).toThrow(SecurityError);
  });

  it('error message contains bookId', () => {
    expect(() => assertSafeBookId('bad/id')).toThrow(/bad\/id/);
  });
});

describe('sanitizePathSegment', () => {
  it('replaces forward slashes', () => {
    expect(sanitizePathSegment('a/b')).toBe('a_b');
  });

  it('replaces back slashes', () => {
    expect(sanitizePathSegment('a\\b')).toBe('a_b');
  });

  it('returns plain text unchanged', () => {
    expect(sanitizePathSegment('safe_name')).toBe('safe_name');
  });
});
