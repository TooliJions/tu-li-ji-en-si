import re

with open('packages/core/src/pipeline/runner.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Add import for runner-helpers after the ProjectionRenderer import
old_import = """import { ProjectionRenderer } from '../state/projections';

// ─── Configuration ──────────────────────────────────────────────"""
new_import = """import { ProjectionRenderer } from '../state/projections';
import {
  buildDraftPrompt,
  buildAgentDraftPrompt,
  readChapterSummary,
  readChapterContent,
  persistChapterAtomic,
  updateStateAfterChapter,
  checkWorldRules,
  extractMemory,
  buildMemoryDelta,
  loadStoredStateHash,
  warnIgnoredError,
} from './runner-helpers';

// ─── Configuration ──────────────────────────────────────────────"""
content = content.replace(old_import, new_import)

# Replace type definitions with re-exports
old_types_start = content.find('// ─── Configuration')
old_types_end = content.find('// ─── PipelineRunner')
old_types = content[old_types_start:old_types_end]
new_types = """// Re-export all pipeline types for backward compatibility
export {
  type PipelineConfig,
  type InitBookInput,
  type InitBookResult,
  type PlanChapterInput,
  type PlanChapterResult,
  type WriteDraftInput,
  type UpgradeDraftInput,
  type WriteNextChapterInput,
  type ChapterResult,
  type AuditDraftInput,
  type RunnerAuditIssue,
  type AuditResult,
  type ReviseDraftInput,
  MergeChaptersInput,
  SplitChapterInput,
  RestructureResult,
  normalizeHookPlan,
} from './types';

import type {
  PipelineConfig,
  InitBookInput,
  InitBookResult,
  PlanChapterInput,
  PlanChapterResult,
  WriteDraftInput,
  UpgradeDraftInput,
  WriteNextChapterInput,
  ChapterResult,
  AuditDraftInput,
  AuditResult,
  ReviseDraftInput,
  RunnerAuditIssue,
} from './types';
import { normalizeHookPlan } from './types';

"""
content = content.replace(old_types, new_types)

with open('packages/core/src/pipeline/runner.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print('Done')
