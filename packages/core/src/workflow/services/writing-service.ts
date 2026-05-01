import { randomUUID } from 'node:crypto';
import {
  CreateWritingSessionInputSchema,
  WritingSessionSchema,
  UpdateWritingSessionPatchSchema,
  type CreateWritingSessionInput,
  type WritingSession,
  type WritingPersistedStatus,
} from '../contracts/writing';

export interface WritingService {
  createSession(input: CreateWritingSessionInput): WritingSession;
  updateSession(session: WritingSession, patch: unknown): WritingSession;
  setDraft(session: WritingSession, draft: string): WritingSession;
  setStatus(session: WritingSession, status: WritingPersistedStatus): WritingSession;
  validateContextToken(session: WritingSession, token: string): boolean;
  needsAudit(session: WritingSession): boolean;
}

export interface WritingServiceOptions {
  idGenerator?: () => string;
  now?: () => string;
}

export class DefaultWritingService implements WritingService {
  readonly #idGenerator: () => string;
  readonly #now: () => string;

  constructor(options: WritingServiceOptions = {}) {
    this.#idGenerator = options.idGenerator ?? (() => `writing_${randomUUID()}`);
    this.#now = options.now ?? (() => new Date().toISOString());
  }

  createSession(input: CreateWritingSessionInput): WritingSession {
    const parsedInput = CreateWritingSessionInputSchema.parse(input);
    const now = this.#now();

    return WritingSessionSchema.parse({
      id: this.#idGenerator(),
      chapterPlanId: parsedInput.chapterPlanId,
      contextVersionToken: parsedInput.contextVersionToken,
      mode: parsedInput.mode,
      generatedDraft: '',
      persistedStatus: 'none',
      auditRequirement: parsedInput.auditRequirement,
      createdAt: now,
      updatedAt: now,
    });
  }

  updateSession(session: WritingSession, patch: unknown): WritingSession {
    const parsedSession = WritingSessionSchema.parse(session);
    const parsedPatch = UpdateWritingSessionPatchSchema.parse(patch);

    return WritingSessionSchema.parse({
      ...parsedSession,
      ...parsedPatch,
      generatedDraft: parsedPatch.generatedDraft ?? parsedSession.generatedDraft,
      updatedAt: this.#now(),
    });
  }

  setDraft(session: WritingSession, draft: string): WritingSession {
    return this.updateSession(session, { generatedDraft: draft });
  }

  setStatus(session: WritingSession, status: WritingPersistedStatus): WritingSession {
    return this.updateSession(session, { persistedStatus: status });
  }

  validateContextToken(session: WritingSession, token: string): boolean {
    const parsed = WritingSessionSchema.parse(session);
    return parsed.contextVersionToken === token;
  }

  needsAudit(session: WritingSession): boolean {
    const parsed = WritingSessionSchema.parse(session);
    if (!parsed.auditRequirement) return false;
    if (parsed.mode === 'quick_draft') return false;
    return parsed.persistedStatus !== 'audited' && parsed.persistedStatus !== 'published';
  }
}
