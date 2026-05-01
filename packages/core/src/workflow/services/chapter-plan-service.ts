import { randomUUID } from 'node:crypto';
import {
  CreateChapterPlanInputSchema,
  ChapterPlanSchema,
  UpdateChapterPlanPatchSchema,
  type CreateChapterPlanInput,
  type ChapterPlanRecord,
  type ChapterPlanStatus,
} from '../contracts/chapter-plan';

export interface ChapterPlanService {
  createPlan(input: CreateChapterPlanInput): ChapterPlanRecord;
  updatePlan(plan: ChapterPlanRecord, patch: unknown): ChapterPlanRecord;
  setStatus(plan: ChapterPlanRecord, status: ChapterPlanStatus): ChapterPlanRecord;
  parsePlan(input: unknown): ChapterPlanRecord;
  canEnterWriting(plan: ChapterPlanRecord): boolean;
}

export interface ChapterPlanServiceOptions {
  idGenerator?: () => string;
  now?: () => string;
}

export class DefaultChapterPlanService implements ChapterPlanService {
  readonly #idGenerator: () => string;
  readonly #now: () => string;

  constructor(options: ChapterPlanServiceOptions = {}) {
    this.#idGenerator = options.idGenerator ?? (() => `plan_${randomUUID()}`);
    this.#now = options.now ?? (() => new Date().toISOString());
  }

  createPlan(input: CreateChapterPlanInput): ChapterPlanRecord {
    const parsedInput = CreateChapterPlanInputSchema.parse(input);
    const now = this.#now();

    return ChapterPlanSchema.parse({
      id: this.#idGenerator(),
      blueprintId: parsedInput.blueprintId,
      chapterNumber: parsedInput.chapterNumber,
      title: parsedInput.title.trim(),
      goal: parsedInput.goal.trim(),
      characters: normalizeUniqueTextList(parsedInput.characters),
      keyEvents: normalizeUniqueTextList(parsedInput.keyEvents),
      hooks: normalizeUniqueTextList(parsedInput.hooks),
      dependencies: parsedInput.dependencies,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    });
  }

  updatePlan(plan: ChapterPlanRecord, patch: unknown): ChapterPlanRecord {
    const parsedPlan = ChapterPlanSchema.parse(plan);
    const parsedPatch = UpdateChapterPlanPatchSchema.parse(patch);

    return ChapterPlanSchema.parse({
      ...parsedPlan,
      ...parsedPatch,
      title: parsedPatch.title?.trim() ? parsedPatch.title.trim() : parsedPlan.title,
      goal: parsedPatch.goal?.trim() ? parsedPatch.goal.trim() : parsedPlan.goal,
      characters: parsedPatch.characters
        ? normalizeUniqueTextList(parsedPatch.characters)
        : parsedPlan.characters,
      keyEvents: parsedPatch.keyEvents
        ? normalizeUniqueTextList(parsedPatch.keyEvents)
        : parsedPlan.keyEvents,
      hooks: parsedPatch.hooks ? normalizeUniqueTextList(parsedPatch.hooks) : parsedPlan.hooks,
      dependencies: parsedPatch.dependencies ?? parsedPlan.dependencies,
      updatedAt: this.#now(),
    });
  }

  setStatus(plan: ChapterPlanRecord, status: ChapterPlanStatus): ChapterPlanRecord {
    return this.updatePlan(plan, { status });
  }

  parsePlan(input: unknown): ChapterPlanRecord {
    return ChapterPlanSchema.parse(input);
  }

  canEnterWriting(plan: ChapterPlanRecord): boolean {
    // 防御式校验：类型系统已保证结构，但运行时仍可能传入边界对象
    if (plan.status !== 'ready') return false;
    if (plan.title.trim().length === 0) return false;
    if (plan.goal.trim().length === 0) return false;
    if (plan.characters.length === 0) return false;
    if (plan.keyEvents.length === 0) return false;
    return true;
  }
}

function normalizeUniqueTextList(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
