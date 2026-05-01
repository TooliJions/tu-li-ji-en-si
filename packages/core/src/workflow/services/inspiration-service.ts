import { randomUUID } from 'node:crypto';
import {
  CreateInspirationSeedInputSchema,
  InspirationSeedSchema,
  type CreateInspirationSeedInput,
  type InspirationSeed,
} from '../contracts/inspiration';

export interface InspirationService {
  createSeed(input: CreateInspirationSeedInput): InspirationSeed;
  parseSeed(input: unknown): InspirationSeed;
}

export interface InspirationServiceOptions {
  idGenerator?: () => string;
  now?: () => string;
}

export class DefaultInspirationService implements InspirationService {
  readonly #idGenerator: () => string;
  readonly #now: () => string;

  constructor(options: InspirationServiceOptions = {}) {
    this.#idGenerator = options.idGenerator ?? (() => `seed_${randomUUID()}`);
    this.#now = options.now ?? (() => new Date().toISOString());
  }

  createSeed(input: CreateInspirationSeedInput): InspirationSeed {
    const parsedInput = CreateInspirationSeedInputSchema.parse(input);

    return InspirationSeedSchema.parse({
      id: this.#idGenerator(),
      sourceText: parsedInput.sourceText.trim(),
      genre: parsedInput.genre?.trim() || undefined,
      theme: parsedInput.theme?.trim() || undefined,
      conflict: parsedInput.conflict?.trim() || undefined,
      tone: parsedInput.tone?.trim() || undefined,
      constraints: normalizeUniqueTextList(parsedInput.constraints),
      sourceType: parsedInput.sourceType,
      createdAt: this.#now(),
    });
  }

  parseSeed(input: unknown): InspirationSeed {
    return InspirationSeedSchema.parse(input);
  }
}

function normalizeUniqueTextList(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
