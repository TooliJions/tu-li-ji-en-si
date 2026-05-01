import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  CreatePlanningBriefInputSchema,
  PlanningBriefSchema,
  type CreatePlanningBriefInput,
  type PlanningBrief,
  type PlanningStageStatus,
} from '../contracts/planning';

const UpdatePlanningBriefPatchSchema = CreatePlanningBriefInputSchema.partial().extend({
  status: z.enum(['draft', 'ready', 'approved']).optional(),
});

export type UpdatePlanningBriefPatch = z.infer<typeof UpdatePlanningBriefPatchSchema>;

export interface PlanningService {
  createBrief(input: CreatePlanningBriefInput): PlanningBrief;
  updateBrief(brief: PlanningBrief, patch: UpdatePlanningBriefPatch): PlanningBrief;
  setStatus(brief: PlanningBrief, status: PlanningStageStatus): PlanningBrief;
  parseBrief(input: unknown): PlanningBrief;
}

export interface PlanningServiceOptions {
  idGenerator?: () => string;
  now?: () => string;
}

export class DefaultPlanningService implements PlanningService {
  readonly #idGenerator: () => string;
  readonly #now: () => string;

  constructor(options: PlanningServiceOptions = {}) {
    this.#idGenerator = options.idGenerator ?? (() => `brief_${randomUUID()}`);
    this.#now = options.now ?? (() => new Date().toISOString());
  }

  createBrief(input: CreatePlanningBriefInput): PlanningBrief {
    const parsedInput = CreatePlanningBriefInputSchema.parse(input);
    const now = this.#now();

    return PlanningBriefSchema.parse({
      id: this.#idGenerator(),
      seedId: parsedInput.seedId,
      audience: parsedInput.audience.trim(),
      genreStrategy: parsedInput.genreStrategy.trim(),
      styleTarget: parsedInput.styleTarget.trim(),
      lengthTarget: parsedInput.lengthTarget.trim(),
      tabooRules: normalizeUniqueTextList(parsedInput.tabooRules),
      marketGoals: normalizeUniqueTextList(parsedInput.marketGoals),
      creativeConstraints: normalizeUniqueTextList(parsedInput.creativeConstraints),
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    });
  }

  updateBrief(brief: PlanningBrief, patch: UpdatePlanningBriefPatch): PlanningBrief {
    const parsedBrief = PlanningBriefSchema.parse(brief);
    const parsedPatch = UpdatePlanningBriefPatchSchema.parse(patch);

    return PlanningBriefSchema.parse({
      ...parsedBrief,
      ...parsedPatch,
      audience: parsedPatch.audience?.trim() ?? parsedBrief.audience,
      genreStrategy: parsedPatch.genreStrategy?.trim() ?? parsedBrief.genreStrategy,
      styleTarget: parsedPatch.styleTarget?.trim() ?? parsedBrief.styleTarget,
      lengthTarget: parsedPatch.lengthTarget?.trim() ?? parsedBrief.lengthTarget,
      tabooRules: parsedPatch.tabooRules
        ? normalizeUniqueTextList(parsedPatch.tabooRules)
        : parsedBrief.tabooRules,
      marketGoals: parsedPatch.marketGoals
        ? normalizeUniqueTextList(parsedPatch.marketGoals)
        : parsedBrief.marketGoals,
      creativeConstraints: parsedPatch.creativeConstraints
        ? normalizeUniqueTextList(parsedPatch.creativeConstraints)
        : parsedBrief.creativeConstraints,
      updatedAt: this.#now(),
    });
  }

  setStatus(brief: PlanningBrief, status: PlanningStageStatus): PlanningBrief {
    return this.updateBrief(brief, { status });
  }

  parseBrief(input: unknown): PlanningBrief {
    return PlanningBriefSchema.parse(input);
  }
}

function normalizeUniqueTextList(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
