import { z } from 'zod';

export const StoryPhaseMilestoneSchema = z.object({
  label: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  targetChapters: z.array(z.number().int().positive()).default([]),
});

export const StoryCharacterArcSchema = z.object({
  characterName: z.string().trim().min(1),
  startState: z.string().trim().min(1),
  growthPath: z.string().trim().min(1),
  endState: z.string().trim().min(1),
});

export const StoryBlueprintSchema = z.object({
  id: z.string().min(1),
  planningBriefId: z.string().min(1),
  premise: z.string().trim().min(1),
  worldRules: z.array(z.string().min(1)).default([]),
  protagonistArc: StoryCharacterArcSchema,
  supportingArcs: z.array(StoryCharacterArcSchema).default([]),
  majorConflicts: z.array(z.string().min(1)).default([]),
  phaseMilestones: z.array(StoryPhaseMilestoneSchema).default([]),
  endingDirection: z.string().trim().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const CreateStoryBlueprintInputSchema = z.object({
  planningBriefId: z.string().min(1),
  premise: z.string().trim().min(1),
  worldRules: z.array(z.string().min(1)).default([]),
  protagonistArc: StoryCharacterArcSchema,
  supportingArcs: z.array(StoryCharacterArcSchema).default([]),
  majorConflicts: z.array(z.string().min(1)).default([]),
  phaseMilestones: z.array(StoryPhaseMilestoneSchema).default([]),
  endingDirection: z.string().trim().min(1),
});

export type StoryPhaseMilestone = z.infer<typeof StoryPhaseMilestoneSchema>;
export type StoryCharacterArc = z.infer<typeof StoryCharacterArcSchema>;
export type StoryBlueprint = z.infer<typeof StoryBlueprintSchema>;
export type CreateStoryBlueprintInput = z.infer<typeof CreateStoryBlueprintInputSchema>;
