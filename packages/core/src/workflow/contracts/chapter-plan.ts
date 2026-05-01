import { z } from 'zod';

export const ChapterPlanDependencySchema = z.object({
  chapterNumber: z.number().int().positive(),
  reason: z.string().trim().min(1),
});

export const ChapterPlanStatusSchema = z.enum(['draft', 'ready', 'writing', 'published']);

export const ChapterPlanSchema = z.object({
  id: z.string().min(1),
  blueprintId: z.string().min(1),
  chapterNumber: z.number().int().positive(),
  title: z.string().trim().min(1),
  goal: z.string().trim().min(1),
  characters: z.array(z.string()).default([]),
  keyEvents: z.array(z.string()).default([]),
  hooks: z.array(z.string()).default([]),
  dependencies: z.array(ChapterPlanDependencySchema).default([]),
  status: ChapterPlanStatusSchema.default('draft'),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const CreateChapterPlanInputSchema = z.object({
  blueprintId: z.string().min(1),
  chapterNumber: z.number().int().positive(),
  title: z.string().trim().min(1),
  goal: z.string().trim().min(1),
  characters: z.array(z.string()).default([]),
  keyEvents: z.array(z.string()).default([]),
  hooks: z.array(z.string()).default([]),
  dependencies: z.array(ChapterPlanDependencySchema).default([]),
});

export const UpdateChapterPlanPatchSchema = z.object({
  blueprintId: z.string().min(1).optional(),
  chapterNumber: z.number().int().positive().optional(),
  title: z.string().optional(),
  goal: z.string().optional(),
  characters: z.array(z.string()).optional(),
  keyEvents: z.array(z.string()).optional(),
  hooks: z.array(z.string()).optional(),
  dependencies: z.array(ChapterPlanDependencySchema).optional(),
  status: ChapterPlanStatusSchema.optional(),
});

export type ChapterPlanDependency = z.infer<typeof ChapterPlanDependencySchema>;
export type ChapterPlanStatus = z.infer<typeof ChapterPlanStatusSchema>;
export type ChapterPlanRecord = z.infer<typeof ChapterPlanSchema>;
export type CreateChapterPlanInput = z.infer<typeof CreateChapterPlanInputSchema>;
export type UpdateChapterPlanPatch = z.infer<typeof UpdateChapterPlanPatchSchema>;
