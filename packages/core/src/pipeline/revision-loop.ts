import type { LLMProvider } from '../llm/provider';

// ── Types ────────────────────────────────────────────────────────────

export type FallbackAction = 'accept_with_warnings' | 'pause';
export type FinalAction = 'accepted' | 'accepted_with_warnings' | 'paused';

export interface RevisionLoopConfig {
  provider: LLMProvider;
  maxRevisionRetries?: number;
  fallbackAction?: FallbackAction;
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
  readonly #fallbackAction: FallbackAction;
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
        revised = await this.#revise(currentContent, audit.issues, input.genre);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        warnings.push(msg);
        return this.#errorResult(originalContent, warnings);
      }

      revisionAttempts++;

      // Audit revised content
      let newAudit: AuditReport;
      try {
        newAudit = await this.#audit(revised, input.genre, input.chapterNumber);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        warnings.push(msg);
        return this.#errorResult(originalContent, warnings);
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
    };
  }

  // ── Private helpers ──────────────────────────────────────────────

  #passes(audit: AuditReport): boolean {
    return audit.overallScore >= this.#minPassScore;
  }

  #errorResult(originalContent: string, warnings: string[]): RevisionResult {
    return {
      action: 'paused',
      content: originalContent,
      originalContent,
      revisionAttempts: 0,
      warnings,
      isContaminated: false,
      finalScore: 0,
    };
  }

  async #audit(content: string, genre: string, chapterNumber: number): Promise<AuditReport> {
    const prompt = `你是一位专业的网络小说质量审计师。请对以下章节进行质量检测。

## 基本信息
- **章节**: 第 ${chapterNumber} 章
- **题材**: ${genre}

## 章节内容
${content.substring(0, 5000)}

## 检测要求
1. 检测逻辑连贯性
2. 检测角色一致性
3. 检测文风问题
4. 检测冗余和重复

请以 JSON 格式输出：
{
  "issues": [
    { "severity": "blocking|warning|suggestion", "description": "问题描述" }
  ],
  "overallScore": 85,
  "overallStatus": "pass|warning|fail",
  "summary": "审计总结"
}`;

    return this.#provider.generateJSON<AuditReport>({ prompt });
  }

  async #revise(
    content: string,
    issues: Array<{ severity: string; description: string }>,
    genre: string
  ): Promise<string> {
    const prompt = `请根据以下审计问题修订章节内容：

## 审计问题
${issues.map((i) => `- [${i.severity}] ${i.description}`).join('\n')}

## 题材
${genre}

## 当前内容
${content}

请修订后输出完整正文。`;

    const result = await this.#provider.generate({ prompt });
    return result.text;
  }
}
