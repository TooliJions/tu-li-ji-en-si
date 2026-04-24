import type { LLMProvider } from '../../llm/provider';
import type { RuntimeStateStore } from '../../state/runtime-store';
import { RevisionLoop } from '../revision-loop';
import type {
  AuditDraftInput,
  AuditResult,
  ReviseDraftInput,
  ChapterResult,
  RunnerAuditIssue,
} from '../types';

export interface AuditOrchestrator {
  auditDraft(input: AuditDraftInput): Promise<AuditResult>;
  reviseDraft(input: ReviseDraftInput): Promise<ChapterResult>;
}

export interface AuditOrchestratorDeps {
  provider: LLMProvider;
  stateStore: RuntimeStateStore;
  maxRevisionRetries: number;
  fallbackAction: 'accept_with_warnings' | 'pause';
}

export class DefaultAuditOrchestrator implements AuditOrchestrator {
  constructor(private deps: AuditOrchestratorDeps) {}

  async auditDraft(input: AuditDraftInput): Promise<AuditResult> {
    try {
      const auditReport = await this.#runContinuityAudit(
        input.content,
        input.bookId,
        input.chapterNumber,
        input.genre
      );

      const aiTrace = await this.#runAIDetection(input.content, input.genre);

      const overallScore = Math.round((auditReport.overallScore + (1 - aiTrace) * 100) / 2);
      const overallStatus = overallScore >= 80 ? 'pass' : overallScore >= 60 ? 'warning' : 'fail';

      return {
        success: true,
        bookId: input.bookId,
        chapterNumber: input.chapterNumber,
        overallScore,
        overallStatus,
        issues: auditReport.issues,
        summary: auditReport.summary,
        aiTraceScore: aiTrace,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        bookId: input.bookId,
        chapterNumber: input.chapterNumber,
        overallScore: 0,
        overallStatus: 'fail',
        issues: [],
        summary: `审计失败: ${message}`,
      };
    }
  }

  async reviseDraft(input: ReviseDraftInput): Promise<ChapterResult> {
    try {
      const loop = new RevisionLoop({
        provider: this.deps.provider,
        maxRevisionRetries: this.deps.maxRevisionRetries,
        fallbackAction: this.deps.fallbackAction,
      });

      const result = await loop.run({
        content: input.content,
        bookId: input.bookId,
        chapterNumber: input.chapterNumber,
        genre: input.genre,
      });

      const success = result.action === 'accepted';
      const warning =
        result.action === 'accepted_with_warnings'
          ? `修订后仍存在问题，已降级接受: ${result.warnings.join('; ')}`
          : undefined;
      const warningCode =
        result.action === 'accepted_with_warnings' ? 'accept_with_warnings' : undefined;

      return {
        success,
        bookId: input.bookId,
        chapterNumber: input.chapterNumber,
        content: result.content,
        status: 'final',
        warning,
        warningCode,
        error: result.action === 'paused' ? '修订触发降级暂停，需要人工介入' : undefined,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        bookId: input.bookId,
        chapterNumber: input.chapterNumber,
        error: `修订失败: ${message}`,
      };
    }
  }

  async #runContinuityAudit(
    content: string,
    bookId: string,
    chapterNumber: number,
    genre: string
  ): Promise<{
    overallScore: number;
    overallStatus: string;
    issues: RunnerAuditIssue[];
    summary: string;
  }> {
    const manifest = this.deps.stateStore.loadManifest(bookId);

    const prompt = `你是一位专业的网络小说质量审计师。请对以下章节进行 33 维连续性审计。

## 章节信息
- 章节: 第 ${chapterNumber} 章
- 题材: ${genre}

## 角色设定
${manifest.characters.map((c) => `- ${c.name}(${c.role}): ${Array.isArray(c.traits) ? c.traits.join('、') : c.traits}`).join('\n') || '无角色数据'}

## 活跃伏笔
${
  manifest.hooks
    .filter((h) => ['open', 'progressing'].includes(h.status))
    .map((h) => `- [${h.priority}] ${h.description}`)
    .join('\n') || '无活跃伏笔'
}

## 世界规则
${manifest.worldRules.map((r) => `- [${r.category}] ${r.rule}`).join('\n') || '无世界规则'}

## 章节内容（前 5000 字）
${content.slice(0, 5000)}

请以 JSON 格式输出审计报告：
{
  "overallScore": 0-100的数字,
  "overallStatus": "pass|warning|fail",
  "issues": [{"severity": "blocker|warning|suggestion", "dimension": "审计维度", "description": "问题描述"}],
  "summary": "一句话总结"
}`;

    try {
      const report = await this.deps.provider.generateJSON<{
        overallScore: number;
        overallStatus: string;
        issues: Array<{ severity: string; dimension: string; description: string }>;
        summary: string;
      }>({ prompt, agentName: 'Auditor' });

      return {
        overallScore: report.overallScore ?? 70,
        overallStatus: report.overallStatus ?? 'warning',
        issues: (report.issues ?? []).map((i) => ({
          severity: (i.severity as RunnerAuditIssue['severity']) || 'warning',
          dimension: i.dimension || 'general',
          description: i.description,
        })),
        summary: report.summary || '审计完成',
      };
    } catch {
      return {
        overallScore: 70,
        overallStatus: 'warning',
        issues: [],
        summary: '审计调用失败，使用默认评分',
      };
    }
  }

  async #runAIDetection(content: string, _genre: string): Promise<number> {
    const prompt = `你是一位 AI 文本检测专家。请检测以下文本中的人工智能生成痕迹。

## 检测维度
1. AI 套话模式（"不可否认"、"值得注意的是"等）
2. 句式单调（句子长度/结构过于一致）
3. 元叙事（作者直接介入评论）
4. 意象重复（相同意象反复出现）
5. 语义重复（同义反复）
6. 逻辑跳跃（缺乏过渡）
7. 情感虚假（情感描写不自然）
8. 描述空洞（缺乏具体细节）
9. 过渡生硬（场景切换不自然）

## 待检测文本
${content.slice(0, 5000)}

请返回 0-1 之间的数字表示 AI 痕迹程度（0=完全自然，1=明显 AI 生成）。只返回数字，不要其他内容。`;

    try {
      const result = await this.deps.provider.generate({ prompt, agentName: 'Auditor' });
      const score = parseFloat(result.text.trim());
      return Number.isFinite(score) ? Math.max(0, Math.min(1, score)) : 0.15;
    } catch {
      return 0.15;
    }
  }
}
