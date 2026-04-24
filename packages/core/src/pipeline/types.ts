import type { LLMConfig, LLMProvider } from '../llm/provider';
import type { TelemetryLogger } from '../telemetry/logger';

// ─── Configuration ──────────────────────────────────────────────

export interface PipelineRunnerConfig {
  rootDir: string;
  llmConfig?: LLMConfig;
  provider?: LLMProvider;
  maxRevisionRetries?: number;
  fallbackAction?: 'accept_with_warnings' | 'pause';
  telemetryLogger?: TelemetryLogger;
}

// ─── Input / Output Types ───────────────────────────────────────

export interface InitBookInput {
  bookId: string;
  title: string;
  genre: string;
  synopsis: string;
  /** 目标章节数（可选，不传则由 LLM 或大纲决定） */
  targetChapters?: number;
  tone?: string;
  targetAudience?: string;
  platform?: string;
}

export interface InitBookResult {
  success: boolean;
  bookId: string;
  bookDir?: string;
  error?: string;
}

export interface PlanChapterInput {
  bookId: string;
  chapterNumber: number;
  outlineContext: string;
}

export interface PlanChapterResult {
  success: boolean;
  chapterNumber: number;
  title?: string;
  /** 章节意图（原 summary，语义修正） */
  intention?: string;
  keyEvents?: string[];
  characters?: string[];
  hooks?: Array<{ description: string; type: string; priority: string }>;
  error?: string;
}

export interface WriteDraftInput {
  bookId: string;
  chapterNumber: number;
  title: string;
  genre: string;
  sceneDescription: string;
  previousChapterContent?: string;
  bookContext?: string;
}

export interface UpgradeDraftInput {
  bookId: string;
  chapterNumber: number;
  userIntent?: string;
}

export interface WriteNextChapterInput {
  bookId: string;
  chapterNumber: number;
  title: string;
  genre: string;
  userIntent: string;
  previousChapterContent?: string;
}

export interface ChapterResult {
  success: boolean;
  bookId: string;
  chapterNumber: number;
  content?: string;
  status?: 'draft' | 'final';
  error?: string;
  warning?: string;
  warningCode?: 'accept_with_warnings' | 'context_drift';
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    /** 各阶段 token 用量明细 */
    breakdown?: Record<
      string,
      { promptTokens: number; completionTokens: number; totalTokens: number }
    >;
  };
  persisted?: boolean;
}

export interface AuditDraftInput {
  bookId: string;
  chapterNumber: number;
  content: string;
  genre: string;
}

/** 审计结果条目（runner 内部使用，避免与 models/quality.ts 中的 Zod 推断类型冲突） */
export interface RunnerAuditIssue {
  severity: 'blocking' | 'warning' | 'suggestion';
  dimension: string;
  description: string;
}

export interface AuditResult {
  success: boolean;
  bookId: string;
  chapterNumber: number;
  overallScore: number;
  overallStatus: 'pass' | 'warning' | 'fail';
  issues: RunnerAuditIssue[];
  summary: string;
  aiTraceScore?: number;
}

export interface ReviseDraftInput {
  bookId: string;
  chapterNumber: number;
  content: string;
  genre: string;
  auditIssues?: RunnerAuditIssue[];
}

// 复用 restructurer.ts 中已定义的类型，避免导出冲突
export { MergeChaptersInput, SplitChapterInput, RestructureResult } from './restructurer';

// ─── Shared Utilities ─────────────────────────────────────────────

/**
 * 归一化 HookPlan → Store 格式。
 * 共享工具函数，供 pipeline.ts 等外部模块复用，消除 hooks 归一化逻辑的重复实现。
 */
export function normalizeHookPlan(h: unknown): {
  description: string;
  type: string;
  priority: string;
} {
  return {
    description:
      typeof h === 'object' && h !== null && 'description' in h
        ? String((h as Record<string, unknown>).description)
        : String(h),
    type:
      typeof h === 'object' && h !== null && 'type' in h
        ? String((h as Record<string, unknown>).type)
        : 'plot',
    priority:
      typeof h === 'object' && h !== null && 'priority' in h
        ? String((h as Record<string, unknown>).priority)
        : 'minor',
  };
}
