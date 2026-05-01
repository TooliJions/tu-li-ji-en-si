import { randomUUID } from 'node:crypto';
import {
  CreateQualityGateResultInputSchema,
  QualityGateResultSchema,
  UpdateQualityGateResultPatchSchema,
  QualityGateRepairActionSchema,
  type CreateQualityGateResultInput,
  type QualityGateResult,
} from '../contracts/quality';

export interface QualityService {
  createAudit(input: CreateQualityGateResultInput): QualityGateResult;
  updateAudit(audit: QualityGateResult, patch: unknown): QualityGateResult;
  setFinalDecision(
    audit: QualityGateResult,
    decision: QualityGateResult['finalDecision'],
  ): QualityGateResult;
  addRepairAction(audit: QualityGateResult, action: unknown): QualityGateResult;
  canPublish(audit: QualityGateResult): boolean;
  hasBlockers(audit: QualityGateResult): boolean;
  parseAudit(input: unknown): QualityGateResult;
}

export interface QualityServiceOptions {
  idGenerator?: () => string;
  now?: () => string;
}

export class DefaultQualityService implements QualityService {
  readonly #idGenerator: () => string;
  readonly #now: () => string;

  constructor(options: QualityServiceOptions = {}) {
    this.#idGenerator = options.idGenerator ?? (() => `audit_${randomUUID()}`);
    this.#now = options.now ?? (() => new Date().toISOString());
  }

  createAudit(input: CreateQualityGateResultInput): QualityGateResult {
    const parsedInput = CreateQualityGateResultInputSchema.parse(input);
    const now = this.#now();

    const decision = this.#computeDecision(parsedInput);

    return QualityGateResultSchema.parse({
      id: this.#idGenerator(),
      draftId: parsedInput.draftId,
      scoreSummary: parsedInput.scoreSummary,
      blockerIssues: parsedInput.blockerIssues,
      warningIssues: parsedInput.warningIssues,
      suggestionIssues: parsedInput.suggestionIssues,
      repairActions: parsedInput.repairActions,
      finalDecision: decision,
      createdAt: now,
      updatedAt: now,
    });
  }

  updateAudit(audit: QualityGateResult, patch: unknown): QualityGateResult {
    const parsedAudit = QualityGateResultSchema.parse(audit);
    const parsedPatch = UpdateQualityGateResultPatchSchema.parse(patch);

    const updated: QualityGateResult = {
      ...parsedAudit,
      ...parsedPatch,
      updatedAt: this.#now(),
    };

    // 若 issues 被更新，自动重新计算 finalDecision
    if (parsedPatch.blockerIssues !== undefined || parsedPatch.warningIssues !== undefined) {
      updated.finalDecision = this.#computeDecision(updated);
    }

    return QualityGateResultSchema.parse(updated);
  }

  setFinalDecision(
    audit: QualityGateResult,
    decision: QualityGateResult['finalDecision'],
  ): QualityGateResult {
    return this.updateAudit(audit, { finalDecision: decision });
  }

  addRepairAction(audit: QualityGateResult, action: unknown): QualityGateResult {
    const parsedAudit = QualityGateResultSchema.parse(audit);
    const parsedAction = QualityGateRepairActionSchema.parse(action);

    return this.updateAudit(audit, {
      repairActions: [...parsedAudit.repairActions, parsedAction],
    });
  }

  canPublish(audit: QualityGateResult): boolean {
    const parsed = QualityGateResultSchema.parse(audit);
    if (parsed.finalDecision === 'fail') return false;
    if (parsed.blockerIssues.length > 0) return false;
    return parsed.finalDecision === 'pass' || parsed.finalDecision === 'warning';
  }

  hasBlockers(audit: QualityGateResult): boolean {
    const parsed = QualityGateResultSchema.parse(audit);
    return parsed.blockerIssues.length > 0;
  }

  parseAudit(input: unknown): QualityGateResult {
    return QualityGateResultSchema.parse(input);
  }

  #computeDecision(input: {
    blockerIssues: unknown[];
    warningIssues: unknown[];
  }): QualityGateResult['finalDecision'] {
    if (input.blockerIssues.length > 0) return 'fail';
    if (input.warningIssues.length > 0) return 'warning';
    return 'pass';
  }
}
