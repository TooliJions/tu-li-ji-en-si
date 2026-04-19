import { LLMProvider } from '../llm/provider';

// ─── Config ──────────────────────────────────────────────────────

export interface ReviewInput {
  content: string;
  genre: string;
  chapterNumber: number;
  bookId: string;
}

export type ReviewDecision = 'accept' | 'rewrite' | 'skip';

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

export interface AuditReport {
  issues: Array<{ severity: string; description: string }>;
  overallScore: number;
  overallStatus: 'pass' | 'warning' | 'fail';
  summary: string;
}

export interface ReviewReport {
  bookId: string;
  chapterNumber: number;
  content: string;
  decision: ReviewDecision;
  revisionCount: number;
  totalIssues: number;
  finalScore: number;
  auditReports: AuditReport[];
  error?: string;
}

export interface ReviewCycleConfig {
  provider: LLMProvider;
  maxRevisions?: number;
  minAcceptableScore?: number;
}

const MIN_CONTENT_LENGTH = 50;

// ─── ChapterReviewCycle ────────────────────────────────────────

export class ChapterReviewCycle {
  private provider: LLMProvider;
  private maxRevisions: number;
  private minAcceptableScore: number;

  constructor(config: ReviewCycleConfig) {
    this.provider = config.provider;
    this.maxRevisions = config.maxRevisions ?? 2;
    this.minAcceptableScore = config.minAcceptableScore ?? 60;
  }

  /**
   * 验证章节内容是否可审核。
   */
  validate(content: string): ValidationResult {
    if (!content || content.trim().length === 0) {
      return { valid: false, reason: '章节内容为空' };
    }
    if (content.trim().length < MIN_CONTENT_LENGTH) {
      return { valid: false, reason: '章节内容过短，无法进行有效审计' };
    }
    return { valid: true };
  }

  /**
   * 执行章节审核循环。
   *
   * 流程：审计 → 通过则 accept → 不通过则修订 → 重复 → 达到上限则 accept
   */
  async execute(input: ReviewInput): Promise<ReviewReport> {
    const validation = this.validate(input.content);
    if (!validation.valid) {
      return {
        bookId: input.bookId,
        chapterNumber: input.chapterNumber,
        content: input.content,
        decision: 'skip',
        revisionCount: 0,
        totalIssues: 0,
        finalScore: 0,
        auditReports: [],
      };
    }

    let currentContent = input.content;
    const auditReports: AuditReport[] = [];
    let revisionCount = 0;

    for (let attempt = 0; attempt <= this.maxRevisions; attempt++) {
      let auditResult: AuditReport;
      try {
        auditResult = await this.#audit(currentContent, input.genre, input.chapterNumber);
      } catch (error) {
        return {
          bookId: input.bookId,
          chapterNumber: input.chapterNumber,
          content: currentContent,
          decision: 'rewrite',
          revisionCount,
          totalIssues: 0,
          finalScore: 0,
          auditReports,
          error: error instanceof Error ? error.message : String(error),
        };
      }

      auditReports.push(auditResult);

      if (auditResult.overallStatus === 'pass' || auditResult.overallStatus === 'warning') {
        if (auditResult.overallScore >= this.minAcceptableScore) {
          return {
            bookId: input.bookId,
            chapterNumber: input.chapterNumber,
            content: currentContent,
            decision: 'accept',
            revisionCount,
            totalIssues: auditResult.issues.length,
            finalScore: auditResult.overallScore,
            auditReports,
          };
        }
      }

      // 未达到及格线，尝试修订（但不超过 maxRevisions）
      if (attempt < this.maxRevisions) {
        try {
          const reviseResult = await this.#revise(currentContent, auditResult.issues, input.genre);
          currentContent = reviseResult;
          revisionCount++;
        } catch (error) {
          return {
            bookId: input.bookId,
            chapterNumber: input.chapterNumber,
            content: currentContent,
            decision: 'rewrite',
            revisionCount,
            totalIssues: auditResult.issues.length,
            finalScore: auditResult.overallScore,
            auditReports,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }
    }

    // 用尽重试次数，降级为 accept
    const lastAudit = auditReports[auditReports.length - 1];
    return {
      bookId: input.bookId,
      chapterNumber: input.chapterNumber,
      content: currentContent,
      decision: 'accept',
      revisionCount,
      totalIssues: lastAudit?.issues.length ?? 0,
      finalScore: lastAudit?.overallScore ?? 0,
      auditReports,
    };
  }

  /**
   * 构建结构化审核报告。
   */
  buildReport(data: {
    bookId: string;
    chapterNumber: number;
    content: string;
    auditReports: AuditReport[];
    revisionCount: number;
    decision: ReviewDecision;
  }): ReviewReport {
    const lastAudit = data.auditReports[data.auditReports.length - 1];
    const allIssues = data.auditReports.flatMap((r) => r.issues);

    return {
      bookId: data.bookId,
      chapterNumber: data.chapterNumber,
      content: data.content,
      decision: data.decision,
      revisionCount: data.revisionCount,
      totalIssues: allIssues.length,
      finalScore: lastAudit?.overallScore ?? 0,
      auditReports: data.auditReports,
    };
  }

  // ── Private helpers ───────────────────────────────────────────

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

    return this.provider.generateJSON(prompt);
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

    const result = await this.provider.generate(prompt);
    return result.text;
  }
}
