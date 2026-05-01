import { randomUUID } from 'node:crypto';
import {
  CreateExportJobInputSchema,
  ExportJobSchema,
  UpdateExportJobPatchSchema,
  type CreateExportJobInput,
  type ExportJob,
  type ExportJobStatus,
} from '../contracts/export';

export interface ExportService {
  createJob(input: CreateExportJobInput): ExportJob;
  updateJob(job: ExportJob, patch: unknown): ExportJob;
  setStatus(job: ExportJob, status: ExportJobStatus): ExportJob;
  setResult(job: ExportJob, filePath: string, fileSize?: number): ExportJob;
  setError(job: ExportJob, error: string): ExportJob;
  parseJob(input: unknown): ExportJob;
  canDownload(job: ExportJob): boolean;
  isFailed(job: ExportJob): boolean;
}

export interface ExportServiceOptions {
  idGenerator?: () => string;
  now?: () => string;
}

export class DefaultExportService implements ExportService {
  readonly #idGenerator: () => string;
  readonly #now: () => string;

  constructor(options: ExportServiceOptions = {}) {
    this.#idGenerator = options.idGenerator ?? (() => `export_${randomUUID()}`);
    this.#now = options.now ?? (() => new Date().toISOString());
  }

  createJob(input: CreateExportJobInput): ExportJob {
    const parsedInput = CreateExportJobInputSchema.parse(input);
    const now = this.#now();

    return ExportJobSchema.parse({
      id: this.#idGenerator(),
      bookId: parsedInput.bookId,
      format: parsedInput.format,
      chapterFrom: parsedInput.chapterFrom,
      chapterTo: parsedInput.chapterTo,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    });
  }

  updateJob(job: ExportJob, patch: unknown): ExportJob {
    const parsedJob = ExportJobSchema.parse(job);
    const parsedPatch = UpdateExportJobPatchSchema.parse(patch);

    return ExportJobSchema.parse({
      ...parsedJob,
      ...parsedPatch,
      updatedAt: this.#now(),
    });
  }

  setStatus(job: ExportJob, status: ExportJobStatus): ExportJob {
    return this.updateJob(job, { status });
  }

  setResult(job: ExportJob, filePath: string, fileSize?: number): ExportJob {
    return this.updateJob(job, {
      status: 'completed',
      filePath,
      fileSize,
      error: undefined,
    });
  }

  setError(job: ExportJob, error: string): ExportJob {
    return this.updateJob(job, {
      status: 'failed',
      error,
      filePath: undefined,
      fileSize: undefined,
    });
  }

  parseJob(input: unknown): ExportJob {
    return ExportJobSchema.parse(input);
  }

  canDownload(job: ExportJob): boolean {
    const parsed = ExportJobSchema.parse(job);
    return parsed.status === 'completed' && Boolean(parsed.filePath);
  }

  isFailed(job: ExportJob): boolean {
    const parsed = ExportJobSchema.parse(job);
    return parsed.status === 'failed' || Boolean(parsed.error);
  }
}
