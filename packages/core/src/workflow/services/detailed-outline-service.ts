import { randomUUID } from 'node:crypto';
import {
  CreateDetailedOutlineInputSchema,
  DetailedOutlineSchema,
  UpdateDetailedOutlinePatchSchema,
  type ContextForWriter,
  type CreateDetailedOutlineInput,
  type DetailedOutline,
  type UpdateDetailedOutlinePatch,
  type VolumeEntry,
} from '../contracts/detailed-outline';
import type { StoryBlueprint } from '../contracts/outline';
import {
  DetailedOutlineGenerator,
  type DetailedOutlineGeneratorInput,
} from '../../agents/detailed-outline-generator';
import type { LLMProvider } from '../../llm/provider';

export interface GenerateDetailedOutlineArgs {
  blueprint: StoryBlueprint;
  provider: LLMProvider;
  totalChapters?: number;
  chaptersPerVolume?: number;
}

export interface DetailedOutlineService {
  createOutline(input: CreateDetailedOutlineInput): DetailedOutline;
  updateOutline(outline: DetailedOutline, patch: UpdateDetailedOutlinePatch): DetailedOutline;
  parseOutline(input: unknown): DetailedOutline;
  generateOutline(args: GenerateDetailedOutlineArgs): Promise<DetailedOutline>;
  getChapterContext(outline: DetailedOutline, chapterNumber: number): ContextForWriter | null;
}

export interface DetailedOutlineServiceOptions {
  idGenerator?: () => string;
  now?: () => string;
}

export class DefaultDetailedOutlineService implements DetailedOutlineService {
  readonly #idGenerator: () => string;
  readonly #now: () => string;

  constructor(options: DetailedOutlineServiceOptions = {}) {
    this.#idGenerator = options.idGenerator ?? (() => `detailed_${randomUUID()}`);
    this.#now = options.now ?? (() => new Date().toISOString());
  }

  createOutline(input: CreateDetailedOutlineInput): DetailedOutline {
    const parsed = CreateDetailedOutlineInputSchema.parse(input);
    const now = this.#now();

    return DetailedOutlineSchema.parse({
      id: this.#idGenerator(),
      storyBlueprintId: parsed.storyBlueprintId,
      totalChapters: parsed.totalChapters,
      estimatedTotalWords: parsed.estimatedTotalWords,
      volumes: parsed.volumes,
      createdAt: now,
      updatedAt: now,
    });
  }

  updateOutline(outline: DetailedOutline, patch: UpdateDetailedOutlinePatch): DetailedOutline {
    const parsedOutline = DetailedOutlineSchema.parse(outline);
    const parsedPatch = UpdateDetailedOutlinePatchSchema.parse(patch);

    const merged: DetailedOutline = {
      ...parsedOutline,
      estimatedTotalWords: parsedPatch.estimatedTotalWords ?? parsedOutline.estimatedTotalWords,
      volumes: parsedPatch.volumes ?? parsedOutline.volumes,
      totalChapters: parsedPatch.volumes
        ? parsedPatch.volumes.reduce((sum, v) => sum + v.chapterCount, 0)
        : parsedOutline.totalChapters,
      updatedAt: this.#now(),
    };

    return DetailedOutlineSchema.parse(merged);
  }

  parseOutline(input: unknown): DetailedOutline {
    return DetailedOutlineSchema.parse(input);
  }

  async generateOutline(args: GenerateDetailedOutlineArgs): Promise<DetailedOutline> {
    const generator = new DetailedOutlineGenerator(args.provider);
    const generatorInput: DetailedOutlineGeneratorInput = {
      blueprint: args.blueprint,
      totalChapters: args.totalChapters,
      chaptersPerVolume: args.chaptersPerVolume,
    };

    const result = await generator.execute({ promptContext: { input: generatorInput } });
    if (!result.success || !result.data) {
      throw new Error(result.error ?? '细纲生成失败');
    }

    const draft = result.data as Omit<CreateDetailedOutlineInput, 'storyBlueprintId'>;
    return this.createOutline({
      storyBlueprintId: args.blueprint.id,
      totalChapters: draft.totalChapters,
      estimatedTotalWords: draft.estimatedTotalWords,
      volumes: draft.volumes,
    });
  }

  getChapterContext(outline: DetailedOutline, chapterNumber: number): ContextForWriter | null {
    const chapter = findChapter(outline.volumes, chapterNumber);
    return chapter?.contextForWriter ?? null;
  }
}

function findChapter(volumes: VolumeEntry[], chapterNumber: number) {
  for (const vol of volumes) {
    if (chapterNumber >= vol.startChapter && chapterNumber <= vol.endChapter) {
      return vol.chapters.find((ch) => ch.chapterNumber === chapterNumber);
    }
  }
  return undefined;
}
