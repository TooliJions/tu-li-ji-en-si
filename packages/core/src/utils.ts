/**
 * Core utils barrel entry.
 *
 * Under NodeNext module resolution, `import { x } from '../utils'` resolves
 * to this file (`utils.ts`) rather than `utils/index.ts`. Therefore this
 * file is the single source of truth for the `@cybernovelist/core` utils
 * public surface. Prefer direct imports from `utils/*` submodules in new code.
 */
export { countChineseWords, stripFrontmatter } from './utils/text';
export { extractSection, extractChapterNumber } from './utils/prompt';
export { isValidBookId, sanitizePathSegment } from './utils/validation';
export { getNestedValue, safeParse, safeStringify } from './utils/json';
export { dedupeByKey } from './utils/array';
export {
  normalizeFactCategory,
  normalizeFactConfidence,
  normalizeHookType,
  normalizeHookStatus,
  normalizeHookPriority,
  normalizeStringArray,
  normalizeChapterArray,
  toPositiveNumber,
} from './utils/normalization';
export { findChapterEntry, normalizeChapterEntry } from './utils/chapter-index';
