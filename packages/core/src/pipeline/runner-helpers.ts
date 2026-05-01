/**
 * Runner Helpers — 重新导出入口
 *
 * 原始实现已按职责拆分为以下模块：
 *   - prompt-builders.ts    : buildDraftPrompt, buildAgentDraftPrompt
 *   - chapter-io.ts         : readChapterSummary, readChapterContent
 *   - chapter-context.ts    : buildOutlineContext
 *   - persistence-helpers.ts: persistChapterAtomic, updateStateAfterChapter, loadStoredStateHash
 *   - memory-helpers.ts     : checkWorldRules, extractMemory, buildMemoryDelta
 *
 * 保留此文件以保持向后兼容，新代码请直接导入具体模块。
 */

export function warnIgnoredError(context: string, error: unknown): void {
  console.warn(
    `[PipelineRunner] ${context}: ${error instanceof Error ? error.message : String(error)}`,
  );
}

// Re-exports from split modules
export { buildDraftPrompt, buildAgentDraftPrompt } from './prompt-builders';
export { readChapterSummary, readChapterContent } from './chapter-io';
export { buildOutlineContext } from './chapter-context';
export {
  persistChapterAtomic,
  updateStateAfterChapter,
  loadStoredStateHash,
} from './persistence-helpers';
export { checkWorldRules, extractMemory, buildMemoryDelta } from './memory-helpers';
