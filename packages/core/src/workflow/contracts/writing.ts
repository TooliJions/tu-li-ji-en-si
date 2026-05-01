import { z } from 'zod';

export const WritingModeSchema = z.enum(['quick_draft', 'draft', 'compose']);

export const WritingPersistedStatusSchema = z.enum([
  'none',
  'draft',
  'pending_audit',
  'audited',
  'published',
]);

export const WritingSessionSchema = z.object({
  id: z.string().min(1),
  chapterPlanId: z.string().min(1),
  contextVersionToken: z.string().min(1),
  mode: WritingModeSchema,
  generatedDraft: z.string().default(''),
  persistedStatus: WritingPersistedStatusSchema.default('none'),
  auditRequirement: z.boolean().default(true),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const CreateWritingSessionInputSchema = z.object({
  chapterPlanId: z.string().min(1),
  contextVersionToken: z.string().min(1),
  mode: WritingModeSchema,
  auditRequirement: z.boolean().default(true),
});

export const UpdateWritingSessionPatchSchema = z.object({
  chapterPlanId: z.string().min(1).optional(),
  contextVersionToken: z.string().min(1).optional(),
  mode: WritingModeSchema.optional(),
  generatedDraft: z.string().optional(),
  persistedStatus: WritingPersistedStatusSchema.optional(),
  auditRequirement: z.boolean().optional(),
});

export type WritingMode = z.infer<typeof WritingModeSchema>;
export type WritingPersistedStatus = z.infer<typeof WritingPersistedStatusSchema>;
export type WritingSession = z.infer<typeof WritingSessionSchema>;
export type CreateWritingSessionInput = z.infer<typeof CreateWritingSessionInputSchema>;
export type UpdateWritingSessionPatch = z.infer<typeof UpdateWritingSessionPatchSchema>;
