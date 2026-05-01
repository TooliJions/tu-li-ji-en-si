import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  CreateStoryBlueprintInputSchema,
  StoryBlueprintSchema,
  type CreateStoryBlueprintInput,
  type StoryBlueprint,
} from '../contracts/outline';

const UpdateStoryBlueprintPatchSchema = CreateStoryBlueprintInputSchema.partial();

export type UpdateStoryBlueprintPatch = z.infer<typeof UpdateStoryBlueprintPatchSchema>;

export interface OutlineService {
  createBlueprint(input: CreateStoryBlueprintInput): StoryBlueprint;
  updateBlueprint(blueprint: StoryBlueprint, patch: UpdateStoryBlueprintPatch): StoryBlueprint;
  parseBlueprint(input: unknown): StoryBlueprint;
}

export interface OutlineServiceOptions {
  idGenerator?: () => string;
  now?: () => string;
}

export class DefaultOutlineService implements OutlineService {
  readonly #idGenerator: () => string;
  readonly #now: () => string;

  constructor(options: OutlineServiceOptions = {}) {
    this.#idGenerator = options.idGenerator ?? (() => `outline_${randomUUID()}`);
    this.#now = options.now ?? (() => new Date().toISOString());
  }

  createBlueprint(input: CreateStoryBlueprintInput): StoryBlueprint {
    const parsedInput = CreateStoryBlueprintInputSchema.parse(input);
    const now = this.#now();

    return StoryBlueprintSchema.parse({
      id: this.#idGenerator(),
      planningBriefId: parsedInput.planningBriefId,
      premise: parsedInput.premise.trim(),
      worldRules: normalizeUniqueTextList(parsedInput.worldRules),
      protagonistArc: parsedInput.protagonistArc,
      supportingArcs: parsedInput.supportingArcs,
      majorConflicts: normalizeUniqueTextList(parsedInput.majorConflicts),
      phaseMilestones: parsedInput.phaseMilestones,
      endingDirection: parsedInput.endingDirection.trim(),
      createdAt: now,
      updatedAt: now,
    });
  }

  updateBlueprint(blueprint: StoryBlueprint, patch: UpdateStoryBlueprintPatch): StoryBlueprint {
    const parsedBlueprint = StoryBlueprintSchema.parse(blueprint);
    const parsedPatch = UpdateStoryBlueprintPatchSchema.parse(patch);

    return StoryBlueprintSchema.parse({
      ...parsedBlueprint,
      ...parsedPatch,
      premise: parsedPatch.premise?.trim() ?? parsedBlueprint.premise,
      worldRules: parsedPatch.worldRules
        ? normalizeUniqueTextList(parsedPatch.worldRules)
        : parsedBlueprint.worldRules,
      majorConflicts: parsedPatch.majorConflicts
        ? normalizeUniqueTextList(parsedPatch.majorConflicts)
        : parsedBlueprint.majorConflicts,
      endingDirection: parsedPatch.endingDirection?.trim() ?? parsedBlueprint.endingDirection,
      updatedAt: this.#now(),
    });
  }

  parseBlueprint(input: unknown): StoryBlueprint {
    return StoryBlueprintSchema.parse(input);
  }
}

function normalizeUniqueTextList(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
