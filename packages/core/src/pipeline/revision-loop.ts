import type { LLMProvider } from '../llm/provider';
import { buildAuditPrompt, buildRevisePrompt } from '../prompts/audit-prompts';

// ── Types ────────────────────────────────────────────────────────────

export type RevisionFallbackAction = 'accept_with_warnings' | 'pause';
export type FinalAction = 'accepted' | 'accepted_with_warnings' | 'paused';

export interface RevisionLoopConfig {
  provider: LLMProvider;
  maxRevisionRetries?: number;
  fallbackAction?: RevisionFallbackAction;
  /** Minimum audit score to accept without warnings (default: 60) */
  minPassScore?: number;
}

export interface RevisionInput {
  content: string;
  bookId: string;
  chapterNumber: number;
  genre: string;
}

export interface RevisionResult {
  action: FinalAction;
  /** Final content — rolled back to last clean version if contaminated */
  content: string;
  /** Always the initial input content */
  originalContent: string;
  revisionAttempts: number;
  warnings: string[];
  isContaminated: boolean;
  finalScore: number;
  /** Accumulated usage from all revision generate calls */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

interface AuditReport {
  issues: Array<{ severity: string; description: string }>;
  overallScore: number;
  overallStatus: 'pass' | 'warning' | 'fail';
  summary: string;
}

// ── RevisionLoop ──────────────────────────────────────────────────────

export class RevisionLoop {
  readonly #provider: LLMProvider;
  readonly #maxRevisionRetries: number;
  readonly #fallbackAction: RevisionFallbackAction;
  readonly #minPassScore: number;

  constructor(config: RevisionLoopConfig) {
    this.#provider = config.provider;
    this.#maxRevisionRetries = config.maxRevisionRetries ?? 2;
    this.#fallbackAction = config.fallbackAction ?? 'accept_with_warnings';
    this.#minPassScore = config.minPassScore ?? 60;
  }

  async run(input: RevisionInput): Promise<RevisionResult> {
    const originalContent = input.content;
    let currentContent = input.content;
    let lastCleanContent = input.content;
    let lastCleanScore = -1;
    let revisionAttempts = 0;
    let isContaminated = false;
    const warnings: string[] = [];
    const usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

    // ── initial audit ────────────────────────────────────────────
    let audit: AuditReport;
    try {
      audit = await this.#audit(currentContent, input.genre, input.chapterNumber);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(msg);
      return this.#errorResult(originalContent, warnings);
    }

    // ── early accept ─────────────────────────────────────────────
    if (this.#passes(audit)) {
      return {
        action: 'accepted',
        content: currentContent,
        originalContent,
        revisionAttempts: 0,
        warnings: [],
        isContaminated: false,
        finalScore: audit.overallScore,
      };
    }

    lastCleanScore = audit.overallScore;

    // ── revision loop ─────────────────────────────────────────────
    for (let attempt = 0; attempt < this.#maxRevisionRetries; attempt++) {
      // Revise
      let revised: string;
      try {
        const reviseResult = await this.#revise(currentContent, audit.issues, input.genre);
        revised = reviseResult.text;
        if (reviseResult.usage) {
          usage.promptTokens += reviseResult.usage.promptTokens;
          usage.completionTokens += reviseResult.usage.completionTokens;
          usage.totalTokens += reviseResult.usage.totalTokens;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        warnings.push(msg);
        return this.#errorResult(originalContent, warnings, usage);
      }

      revisionAttempts++;

      // Audit revised content
      let newAudit: AuditReport;
      try {
        newAudit = await this.#audit(revised, input.genre, input.chapterNumber);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        warnings.push(msg);
        return this.#errorResult(originalContent, warnings, usage);
      }

      // Contamination check — revision made things worse
      if (newAudit.overallScore < lastCleanScore) {
        isContaminated = true;
        // Roll back: do not update currentContent or lastCleanContent
        audit = newAudit; // keep audit for warnings extraction
        break;
      }

      // Revision is clean — promote
      lastCleanContent = revised;
      lastCleanScore = newAudit.overallScore;
      currentContent = revised;
      audit = newAudit;

      // Check if now passing
      if (this.#passes(newAudit)) {
        return {
          action: 'accepted',
          content: currentContent,
          originalContent,
          revisionAttempts,
          warnings: [],
          isContaminated: false,
          finalScore: newAudit.overallScore,
          usage: usage.totalTokens > 0 ? usage : undefined,
        };
      }
    }

    // ── retries exhausted or contamination detected ──────────────
    const finalIssues = audit.issues.map((i) => i.description);
    warnings.push(...finalIssues);

    const finalContent = isContaminated ? lastCleanContent : currentContent;

    const action: FinalAction =
      this.#fallbackAction === 'pause' ? 'paused' : 'accepted_with_warnings';

    return {
      action,
      content: finalContent,
      originalContent,
      revisionAttempts,
      warnings,
      isContaminated,
      finalScore: lastCleanScore,
      usage: usage.totalTokens > 0 ? usage : undefined,
    };
  }

  // ── Private helpers ──────────────────────────────────────────────

  #passes(audit: AuditReport): boolean {
    return audit.overallScore >= this.#minPassScore;
  }

  #errorResult(
    originalContent: string,
    warnings: string[],
    usage?: { promptTokens: number; completionTokens: number; totalTokens: number }
  ): RevisionResult {
    return {
      action: 'paused',
      content: originalContent,
      originalContent,
      revisionAttempts: 0,
      warnings,
      isContaminated: false,
      finalScore: 0,
      usage: usage && usage.totalTokens > 0 ? usage : undefined,
    };
  }

  async #audit(content: string, genre: string, chapterNumber: number): Promise<AuditReport> {
    const prompt = buildAuditPrompt({
      content,
      genre,
      chapterNumber,
      format: 'withOverallStatus',
    });

    return this.#provider.generateJSON<AuditReport>({ prompt });
  }

  async #revise(
    content: string,
    issues: Array<{ severity: string; description: string }>,
    genre: string
  ): Promise<{
    text: string;
    usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  }> {
    const prompt = buildRevisePrompt({ content, issues, genre });

    const result = await this.#provider.generate({ prompt });
    return result;
  }
}
