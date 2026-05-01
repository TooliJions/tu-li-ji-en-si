// ─── Pipeline Scheduler Types ──────────────────────────────────────
// 提取共享类型以避免 scheduler.ts ↔ stage-executor.ts 循环依赖

/** Stage execution status. */
export enum StageStatus {
  Pending = 'pending',
  Running = 'running',
  Completed = 'completed',
  Failed = 'failed',
  Skipped = 'skipped',
}

/** A single pipeline stage. */
export interface PipelineStage {
  id: string;
  name: string;
  dependencies: string[];
  /** Main execution function. Receives and may mutate context.data. */
  execute: (ctx: PipelineContext) => Promise<void>;
  /** If present and returns true, the stage is skipped. */
  precondition?: (ctx: PipelineContext) => boolean;
}

/** Shared context passed through the pipeline. */
export interface PipelineContext {
  bookId: string;
  chapterNumber: number;
  data: Record<string, unknown>;
}

/** Result of a single stage execution. */
export interface StageExecutionResult {
  id: string;
  name: string;
  status: StageStatus;
  durationMs: number;
  error?: string;
}

/** Overall pipeline execution result. */
export interface PipelineExecutionResult {
  success: boolean;
  stages: StageExecutionResult[];
  failedStage?: string;
  totalDurationMs: number;
}

/** Pipeline configuration from a preset. */
export interface PipelineConfig {
  name: string;
  stages: PipelineStage[];
  disabledStages: string[];
}
