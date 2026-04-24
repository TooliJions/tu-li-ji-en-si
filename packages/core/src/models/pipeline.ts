import { z } from 'zod';

// ─── Pipeline Step Types ─────────────────────────────────────

export const PipelineStepSchema = z.enum([
  'intent',
  'context',
  'memory',
  'draft',
  'audit',
  'revise',
  'persist',
]);

export type PipelineStep = z.infer<typeof PipelineStepSchema>;

// ─── Pipeline State ──────────────────────────────────────────

export const PipelineStateSchema = z.enum(['idle', 'running', 'paused', 'completed', 'failed']);

export type PipelineState = z.infer<typeof PipelineStateSchema>;

// ─── Fallback Action ─────────────────────────────────────────

export const FallbackActionSchema = z.enum(['accept_with_warnings', 'pause']);

export type FallbackAction = z.infer<typeof FallbackActionSchema>;

// ─── Pipeline Config ─────────────────────────────────────────

export const PipelineConfigSchema = z.object({
  maxRevisionRetries: z.number().int().min(0).default(2),
  fallbackAction: FallbackActionSchema.default('accept_with_warnings'),
  enableAudit: z.boolean().default(true),
  enableRevision: z.boolean().default(true),
});

export type PipelineRuntimeConfig = z.infer<typeof PipelineConfigSchema>;

// ─── Pipeline Step Record ────────────────────────────────────

export const PipelineStepRecordSchema = z.object({
  step: PipelineStepSchema,
  timestamp: z.string(),
  success: z.boolean(),
  error: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type PipelineStepRecord = z.infer<typeof PipelineStepRecordSchema>;

// ─── Context Drift Warning ───────────────────────────────────

export const ContextDriftWarningSchema = z.object({
  type: z.literal('context_drift'),
  message: z.string(),
  chaptersAhead: z.number(),
});

export type ContextDriftWarning = z.infer<typeof ContextDriftWarningSchema>;
