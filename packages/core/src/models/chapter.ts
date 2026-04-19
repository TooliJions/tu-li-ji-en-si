import { z } from 'zod';

// ─── Chapter Schemas ────────────────────────────────────────────

export const ChapterStatusSchema = z.enum(['draft', 'published', 'accepted_with_warnings']);

export const AuditStatusSchema = z.enum(['passed', 'failed', 'pending', 'skipped']);

export const ChapterQualityFlagSchema = z.enum([
  'force_accepted',
  'revision_limit_reached',
  'exclude_from_training',
  'context_stale',
]);

export const RevisionHistoryEntrySchema = z.object({
  attempt: z.number().int().positive(),
  issues: z.number().int().nonnegative(),
  strategy: z.string(),
});

export const ChapterMetadataSchema = z.object({
  status: ChapterStatusSchema,
  flags: z.array(ChapterQualityFlagSchema).default([]),
  revisionHistory: z.array(RevisionHistoryEntrySchema).default([]),
  fallbackReason: z.string().optional(),
  requiresManualReview: z.boolean().default(false),
  confidence: z.enum(['high', 'medium', 'low']).default('high'),
  excludeFromBaseline: z.boolean().default(false),
  draftContextSnapshotId: z.string().optional(),
});

export const ChapterSchema = z.object({
  number: z.number().int().positive(),
  title: z.string().nullable().default(null),
  status: ChapterStatusSchema,
  wordCount: z.number().int().nonnegative(),
  qualityScore: z.number().min(0).max(100).nullable().default(null),
  aiTraceScore: z.number().min(0).max(1).nullable().default(null),
  auditStatus: AuditStatusSchema,
  metadata: ChapterMetadataSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const ChapterCreateSchema = z.object({
  title: z.string().optional(),
  content: z.string().min(1),
});

export type Chapter = z.infer<typeof ChapterSchema>;
export type ChapterCreate = z.infer<typeof ChapterCreateSchema>;
export type ChapterMetadata = z.infer<typeof ChapterMetadataSchema>;

// ─── Chapter Index Schemas ──────────────────────────────────────

export const ChapterIndexEntrySchema = z.object({
  number: z.number().int().positive(),
  title: z.string().nullable(),
  fileName: z.string(),
  wordCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
});

export const ChapterIndexSchema = z.object({
  bookId: z.string(),
  chapters: z.array(ChapterIndexEntrySchema),
  totalChapters: z.number().int().nonnegative(),
  totalWords: z.number().int().nonnegative(),
  lastUpdated: z.string().datetime(),
});

export type ChapterIndex = z.infer<typeof ChapterIndexSchema>;
export type ChapterIndexEntry = z.infer<typeof ChapterIndexEntrySchema>;
