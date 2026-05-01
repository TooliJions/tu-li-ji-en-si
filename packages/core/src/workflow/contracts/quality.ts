import { z } from 'zod';

export const QualityGateIssueSchema = z.object({
  id: z.string().min(1),
  description: z.string().trim().min(1),
  tier: z.enum(['blocker', 'warning', 'suggestion']),
  category: z.string().trim().min(1),
  suggestion: z.string().trim().min(1),
  location: z.string().optional(),
});

export const QualityGateScoreSummarySchema = z.object({
  overall: z.number().min(0).max(1),
  dimensions: z.record(z.number().min(0).max(1)).default({}),
});

export const QualityGateRepairActionSchema = z.object({
  type: z.enum(['local_replace', 'paragraph_reorder', 'beat_rewrite', 'full_rewrite']),
  targetIssueIds: z.array(z.string().min(1)).default([]),
  description: z.string().trim().min(1),
});

export const QualityGateResultSchema = z.object({
  id: z.string().min(1),
  draftId: z.string().min(1),
  scoreSummary: QualityGateScoreSummarySchema,
  blockerIssues: z.array(QualityGateIssueSchema).default([]),
  warningIssues: z.array(QualityGateIssueSchema).default([]),
  suggestionIssues: z.array(QualityGateIssueSchema).default([]),
  repairActions: z.array(QualityGateRepairActionSchema).default([]),
  finalDecision: z.enum(['pass', 'warning', 'fail', 'pending']).default('pending'),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const CreateQualityGateResultInputSchema = z.object({
  draftId: z.string().min(1),
  scoreSummary: QualityGateScoreSummarySchema,
  blockerIssues: z.array(QualityGateIssueSchema).default([]),
  warningIssues: z.array(QualityGateIssueSchema).default([]),
  suggestionIssues: z.array(QualityGateIssueSchema).default([]),
  repairActions: z.array(QualityGateRepairActionSchema).default([]),
});

export const UpdateQualityGateResultPatchSchema = z.object({
  scoreSummary: QualityGateScoreSummarySchema.optional(),
  blockerIssues: z.array(QualityGateIssueSchema).optional(),
  warningIssues: z.array(QualityGateIssueSchema).optional(),
  suggestionIssues: z.array(QualityGateIssueSchema).optional(),
  repairActions: z.array(QualityGateRepairActionSchema).optional(),
  finalDecision: z.enum(['pass', 'warning', 'fail', 'pending']).optional(),
});

export type QualityGateIssue = z.infer<typeof QualityGateIssueSchema>;
export type QualityGateScoreSummary = z.infer<typeof QualityGateScoreSummarySchema>;
export type QualityGateRepairAction = z.infer<typeof QualityGateRepairActionSchema>;
export type QualityGateResult = z.infer<typeof QualityGateResultSchema>;
export type CreateQualityGateResultInput = z.infer<typeof CreateQualityGateResultInputSchema>;
export type UpdateQualityGateResultPatch = z.infer<typeof UpdateQualityGateResultPatchSchema>;
