import { z } from 'zod';

export const PlanningStageStatusSchema = z.enum(['draft', 'ready', 'approved']);

export const PlanningBriefSchema = z.object({
  id: z.string().min(1),
  seedId: z.string().min(1),
  audience: z.string().trim().min(1),
  genreStrategy: z.string().trim().min(1),
  styleTarget: z.string().trim().min(1),
  lengthTarget: z.string().trim().min(1),
  tabooRules: z.array(z.string().min(1)).default([]),
  marketGoals: z.array(z.string().min(1)).default([]),
  creativeConstraints: z.array(z.string().min(1)).default([]),
  status: PlanningStageStatusSchema.default('draft'),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const CreatePlanningBriefInputSchema = z.object({
  seedId: z.string().min(1),
  audience: z.string().trim().min(1),
  genreStrategy: z.string().trim().min(1),
  styleTarget: z.string().trim().min(1),
  lengthTarget: z.string().trim().min(1),
  tabooRules: z.array(z.string().min(1)).default([]),
  marketGoals: z.array(z.string().min(1)).default([]),
  creativeConstraints: z.array(z.string().min(1)).default([]),
});

export type PlanningStageStatus = z.infer<typeof PlanningStageStatusSchema>;
export type PlanningBrief = z.infer<typeof PlanningBriefSchema>;
export type CreatePlanningBriefInput = z.infer<typeof CreatePlanningBriefInputSchema>;
