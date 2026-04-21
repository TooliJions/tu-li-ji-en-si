import { z } from 'zod';

// ─── Audit Severity ──────────────────────────────────────────

export const AuditSeveritySchema = z.enum(['blocking', 'warning', 'suggestion']);

export type AuditSeverity = z.infer<typeof AuditSeveritySchema>;

// ─── Repair Strategy ─────────────────────────────────────────

export const RepairStrategySchema = z.enum([
  'local_replace',
  'paragraph_reorder',
  'beat_rewrite',
  'chapter_rewrite',
]);

export type RepairStrategy = z.infer<typeof RepairStrategySchema>;

// ─── Audit Issue ─────────────────────────────────────────────

export const AuditIssueSchema = z.object({
  dimension: z.string(),
  severity: AuditSeveritySchema,
  message: z.string(),
  suggestion: z.string().optional(),
  location: z
    .object({
      paragraph: z.number().optional(),
      sentence: z.number().optional(),
    })
    .optional(),
});

export type AuditIssue = z.infer<typeof AuditIssueSchema>;

// ─── Audit Report ────────────────────────────────────────────

export const AuditReportSchema = z.object({
  chapterNumber: z.number(),
  overallPass: z.boolean(),
  issues: z.array(AuditIssueSchema),
  dimensions: z.record(z.string(), z.unknown()),
  timestamp: z.string(),
  blockedBy: z.array(z.string()).default([]),
  warnedBy: z.array(z.string()).default([]),
});

export type AuditReport = z.infer<typeof AuditReportSchema>;

// ─── Quality Baseline Record ─────────────────────────────────

export const QualityBaselineRecordSchema = z.object({
  bookId: z.string(),
  chapterNumber: z.number(),
  scores: z.record(z.string(), z.number()),
  timestamp: z.string(),
});

export type QualityBaselineRecord = z.infer<typeof QualityBaselineRecordSchema>;

// ─── Repair Config ───────────────────────────────────────────

export const RepairConfigSchema = z.object({
  strategy: RepairStrategySchema,
  maxRetries: z.number().int().min(1).default(2),
  scope: z.enum(['sentence', 'paragraph', 'section', 'chapter']),
});

export type RepairConfig = z.infer<typeof RepairConfigSchema>;
