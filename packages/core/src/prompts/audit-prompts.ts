/**
 * 共享审计与修订 prompt 构建器
 *
 * 消除 revision-loop / review-cycle / atomic-ops 中重复的 prompt 模板。
 * 所有审计/修订逻辑统一使用此模块的输出，确保 prompt 修改只需一处。
 */

/** 审计 prompt 输出格式选项 */
export type AuditOutputFormat = 'standard' | 'withOverallStatus';

/** 审计 prompt 构建参数 */
export interface AuditPromptParams {
  /** 章节内容（将被截断至前 5000 字） */
  content: string;
  /** 题材类型 */
  genre: string;
  /** 章节号 */
  chapterNumber: number;
  /** 输出格式：standard 使用 "status"，withOverallStatus 使用 "overallStatus" + "overallStatus" 字段 */
  format?: AuditOutputFormat;
}

/**
 * 构建质量审计 prompt。
 *
 * 统一输出格式：
 * - standard: `{ issues: [{ severity, description }], overallScore, status, summary }`
 * - withOverallStatus: `{ issues: [{ severity, description }], overallScore, overallStatus, summary }`
 */
export function buildAuditPrompt(params: AuditPromptParams): string {
  const { content, genre, chapterNumber, format = 'standard' } = params;
  const truncatedContent = content.length > 5000 ? content.substring(0, 5000) : content;

  if (format === 'withOverallStatus') {
    return `你是一位专业的网络小说质量审计师。请对以下章节进行质量检测。

## 基本信息
- **章节**: 第 ${chapterNumber} 章
- **题材**: ${genre}

## 章节内容
${truncatedContent}

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
  }

  // standard 格式（用于 atomic-ops 等旧接口）
  return `你是一位专业的网络小说质量审计师。请对以下章节进行质量检测。

## 基本信息
- **章节**: 第 ${chapterNumber} 章
- **题材**: ${genre}

## 章节内容
${truncatedContent}

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
  "status": "pass|fail",
  "summary": "审计总结"
}`;
}

/** 修订 prompt 构建参数 */
export interface RevisePromptParams {
  /** 当前章节内容 */
  content: string;
  /** 审计发现的问题列表 */
  issues: Array<{ severity: string; description: string }>;
  /** 题材 */
  genre?: string;
}

/**
 * 构建修订 prompt。
 */
export function buildRevisePrompt(params: RevisePromptParams): string {
  const { content, issues, genre } = params;
  const issuesText = issues.map((i) => `- [${i.severity}] ${i.description}`).join('\n');

  return `请根据以下审计问题修订章节内容：

## 审计问题
${issuesText}
${genre ? `\n## 题材风格\n${genre}\n` : ''}

## 当前章节内容
${content.substring(0, 8000)}

修订要求：
1. 必须解决所有 blocking 级别的问题
2. 尽可能解决 warning 级别的问题
3. 保持原有叙事风格不变
4. 不要改变原有情节走向
5. 直接输出修订后的完整正文，不要添加任何解释或说明`;
}
