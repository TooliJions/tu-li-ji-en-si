import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  CreateStoryBlueprintInputSchema,
  StoryBlueprintSchema,
  type CreateStoryBlueprintInput,
  type StoryBlueprint,
  type OutlineBase,
  type TypeSpecific,
  type OutlineMeta,
} from '../contracts/outline';
import { GENRE_TO_ARCHITECTURE, GENRE_TO_TYPE_SPECIFIC } from '../../agents/genre-guidance';
import { OutlineGenerator, type OutlineGeneratorInput } from '../../agents/outline-generator';
import type { LLMProvider } from '../../llm/provider';
import type { InspirationSeed } from '../contracts/inspiration';
import type { PlanningBrief } from '../contracts/planning';

export const UpdateStoryBlueprintPatchSchema = z.object({
  meta: CreateStoryBlueprintInputSchema.shape.meta.partial().optional(),
  base: CreateStoryBlueprintInputSchema.shape.base.partial().optional(),
  typeSpecific: CreateStoryBlueprintInputSchema.shape.typeSpecific.optional(),
});

export type UpdateStoryBlueprintPatch = z.infer<typeof UpdateStoryBlueprintPatchSchema>;

export type ValidationSeverity = 'critical' | 'warning';

export interface OutlineValidationIssue {
  rule: 'R-01' | 'R-02' | 'R-03' | 'R-04' | 'R-05';
  severity: ValidationSeverity;
  description: string;
}

export class OutlineValidationError extends Error {
  readonly issues: OutlineValidationIssue[];

  constructor(issues: OutlineValidationIssue[]) {
    super(`总纲一致性校验失败: ${issues.length} 个问题`);
    this.name = 'OutlineValidationError';
    this.issues = issues;
  }
}

export interface OutlineService {
  createBlueprint(input: CreateStoryBlueprintInput): StoryBlueprint;
  updateBlueprint(blueprint: StoryBlueprint, patch: UpdateStoryBlueprintPatch): StoryBlueprint;
  parseBlueprint(input: unknown): StoryBlueprint;
  validateBlueprint(blueprint: StoryBlueprint): OutlineValidationIssue[];
  generateBlueprint(args: GenerateBlueprintArgs): Promise<StoryBlueprint>;
}

export interface GenerateBlueprintArgs {
  seed: InspirationSeed;
  brief: PlanningBrief;
  provider: LLMProvider;
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

    const blueprint = StoryBlueprintSchema.parse({
      id: this.#idGenerator(),
      planningBriefId: parsedInput.planningBriefId,
      meta: parsedInput.meta,
      base: parsedInput.base,
      typeSpecific: parsedInput.typeSpecific,
      createdAt: now,
      updatedAt: now,
    });

    const issues = this.validateBlueprint(blueprint);
    const blockingIssues = issues.filter((issue) => issue.severity === 'critical');
    if (blockingIssues.length > 0) {
      throw new OutlineValidationError(issues);
    }

    return blueprint;
  }

  updateBlueprint(blueprint: StoryBlueprint, patch: UpdateStoryBlueprintPatch): StoryBlueprint {
    const parsedBlueprint = StoryBlueprintSchema.parse(blueprint);
    const parsedPatch = UpdateStoryBlueprintPatchSchema.parse(patch);

    const merged = StoryBlueprintSchema.parse({
      ...parsedBlueprint,
      meta: parsedPatch.meta
        ? { ...parsedBlueprint.meta, ...parsedPatch.meta }
        : parsedBlueprint.meta,
      base: parsedPatch.base
        ? mergeBase(parsedBlueprint.base, parsedPatch.base)
        : parsedBlueprint.base,
      typeSpecific: parsedPatch.typeSpecific ?? parsedBlueprint.typeSpecific,
      updatedAt: this.#now(),
    });

    const issues = this.validateBlueprint(merged);
    const blockingIssues = issues.filter((issue) => issue.severity === 'critical');
    if (blockingIssues.length > 0) {
      throw new OutlineValidationError(issues);
    }

    return merged;
  }

  parseBlueprint(input: unknown): StoryBlueprint {
    return StoryBlueprintSchema.parse(input);
  }

  validateBlueprint(blueprint: StoryBlueprint): OutlineValidationIssue[] {
    return runValidationRules(blueprint.meta, blueprint.base, blueprint.typeSpecific);
  }

  async generateBlueprint(args: GenerateBlueprintArgs): Promise<StoryBlueprint> {
    const generator = new OutlineGenerator(args.provider);
    const generatorInput: OutlineGeneratorInput = {
      sourceText: args.seed.sourceText,
      genre: args.seed.genre,
      theme: args.seed.theme,
      conflict: args.seed.conflict,
      tone: args.seed.tone,
      audience: args.brief.audience,
      genreStrategy: args.brief.genreStrategy,
      styleTarget: args.brief.styleTarget,
      lengthTarget: args.brief.lengthTarget,
      tabooRules: args.brief.tabooRules,
      marketGoals: args.brief.marketGoals,
      creativeConstraints: args.brief.creativeConstraints,
    };

    const result = await generator.execute({ promptContext: { input: generatorInput } });
    if (!result.success || !result.data) {
      throw new Error(result.error ?? '总纲生成失败');
    }

    const draft = result.data as Omit<CreateStoryBlueprintInput, 'planningBriefId'>;
    return this.createBlueprint({
      planningBriefId: args.brief.id,
      meta: draft.meta,
      base: draft.base,
      typeSpecific: draft.typeSpecific,
    });
  }
}

// ─── 5 条一致性校验规则 ───────────────────────────────────

function runValidationRules(
  meta: OutlineMeta,
  base: OutlineBase,
  typeSpecific: TypeSpecific,
): OutlineValidationIssue[] {
  const issues: OutlineValidationIssue[] = [];

  // R-01: 架构模式与小说类型必须匹配
  const expectedArch = GENRE_TO_ARCHITECTURE[meta.novelType];
  if (expectedArch && meta.architectureMode !== expectedArch) {
    issues.push({
      rule: 'R-01',
      severity: 'critical',
      description: `小说类型 ${meta.novelType} 应使用架构模式 ${expectedArch},当前为 ${meta.architectureMode}`,
    });
  }
  if (expectedArch && base.outlineArchitecture.mode !== meta.architectureMode) {
    issues.push({
      rule: 'R-01',
      severity: 'critical',
      description: `meta.architectureMode (${meta.architectureMode}) 与 base.outlineArchitecture.mode (${base.outlineArchitecture.mode}) 不一致`,
    });
  }
  if (base.outlineArchitecture.data.kind !== meta.architectureMode) {
    issues.push({
      rule: 'R-01',
      severity: 'critical',
      description: `outlineArchitecture.data.kind (${base.outlineArchitecture.data.kind}) 与架构模式 (${meta.architectureMode}) 不一致`,
    });
  }

  // R-02: typeSpecific.kind 与 novelType 必须匹配
  const expectedKind = GENRE_TO_TYPE_SPECIFIC[meta.novelType];
  if (expectedKind && typeSpecific.kind !== expectedKind) {
    issues.push({
      rule: 'R-02',
      severity: 'critical',
      description: `小说类型 ${meta.novelType} 应使用 typeSpecific.kind=${expectedKind},当前为 ${typeSpecific.kind}`,
    });
  }

  // R-03: relationships 引用必须存在于 characters
  const characterIds = new Set(base.characters.map((c) => c.id));
  for (const rel of base.relationships) {
    if (!characterIds.has(rel.fromId)) {
      issues.push({
        rule: 'R-03',
        severity: 'warning',
        description: `relationships 中引用的 fromId="${rel.fromId}" 不存在于角色档案`,
      });
    }
    if (!characterIds.has(rel.toId)) {
      issues.push({
        rule: 'R-03',
        severity: 'warning',
        description: `relationships 中引用的 toId="${rel.toId}" 不存在于角色档案`,
      });
    }
  }

  // R-04: 至少有 1 个 protagonist
  const hasProtagonist = base.characters.some((c) => c.role === 'protagonist');
  if (!hasProtagonist) {
    issues.push({
      rule: 'R-04',
      severity: 'critical',
      description: '至少需要一个 role=protagonist 的主角',
    });
  }

  // R-05: meta.endingType 与 base.completionDesign.endingType 必须一致
  if (meta.endingType !== base.completionDesign.endingType) {
    issues.push({
      rule: 'R-05',
      severity: 'warning',
      description: `meta.endingType (${meta.endingType}) 与 completionDesign.endingType (${base.completionDesign.endingType}) 不一致`,
    });
  }

  return issues;
}

function mergeBase(current: OutlineBase, patch: Partial<OutlineBase>): OutlineBase {
  return {
    ...current,
    ...patch,
    sellingPoints: patch.sellingPoints ?? current.sellingPoints,
    theme: patch.theme ?? current.theme,
    goldenOpening: patch.goldenOpening ?? current.goldenOpening,
    writingStyle: patch.writingStyle ?? current.writingStyle,
    characters: patch.characters ?? current.characters,
    relationships: patch.relationships ?? current.relationships,
    outlineArchitecture: patch.outlineArchitecture ?? current.outlineArchitecture,
    foreshadowingSeed: patch.foreshadowingSeed ?? current.foreshadowingSeed,
    completionDesign: patch.completionDesign ?? current.completionDesign,
  };
}
