import { BaseAgent, type AgentContext, type AgentResult } from './base';

// ── Types ────────────────────────────────────────────────────────────

export type DialogueIssueType =
  | 'no-friction'
  | 'declarative-exchange'
  | 'monologue-disguised'
  | 'weak-response';

export type IssueSeverity = 'critical' | 'warning' | 'suggestion';
export type ConflictDepth = 'none' | 'weak' | 'moderate' | 'strong';
export type DialogueQuality = 'poor' | 'acceptable' | 'good' | 'excellent';

export interface DialogueIssueLocation {
  lineStart: number;
  lineEnd: number;
}

export interface DialogueIssue {
  type: DialogueIssueType;
  severity: IssueSeverity;
  description: string;
  location: DialogueIssueLocation;
  suggestion: string;
}

export interface DialogueInput {
  chapterContent: string;
  chapterNumber: number;
  characters: string[];
  genre?: string;
}

export interface DialogueOutput {
  issues: DialogueIssue[];
  /** 0–100: 0=无阻力, 100=激烈交锋 */
  frictionScore: number;
  conflictDepth: ConflictDepth;
  overallQuality: DialogueQuality;
  summary: string;
}

// ── DialogueChecker ──────────────────────────────────────────────────

export class DialogueChecker extends BaseAgent {
  readonly name = 'DialogueChecker';
  readonly temperature = 0.3;

  async execute(ctx: AgentContext): Promise<AgentResult> {
    const input = ctx.promptContext?.input as DialogueInput | undefined;
    if (!input) {
      return { success: false, error: '缺少对话检测输入' };
    }

    const validationError = this.#validate(input);
    if (validationError) {
      return { success: false, error: validationError };
    }

    const prompt = this.#buildPrompt(input);

    try {
      const result = await this.generateJSON<DialogueOutput>(prompt);

      if (!result || typeof result !== 'object' || !Array.isArray(result.issues)) {
        return { success: false, error: 'LLM 返回数据格式异常' };
      }

      return { success: true, data: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  }

  #validate(input: DialogueInput): string | null {
    if (!input.chapterContent || input.chapterContent.trim().length === 0) {
      return '章节内容不能为空';
    }
    if (!input.characters || input.characters.length === 0) {
      return '角色列表不能为空';
    }
    return null;
  }

  #buildPrompt(input: DialogueInput): string {
    const characterList = input.characters.join('、');
    const genreLine = input.genre ? `\n- **题材**: ${input.genre}` : '';

    return `你是一位专业的网络小说对话质量审核师。请分析以下多角色场景中的对话交锋质量，重点检测对话阻力不足与纯陈述式交锋问题。

## 基本信息

- **章节**: 第 ${input.chapterNumber} 章
- **角色**: ${characterList}${genreLine}

## 对话内容

${input.chapterContent}

## 检测重点

请识别以下四类对话质量问题：

1. **无阻力对话**（no-friction）：角色过度配合、无意见分歧、你说什么他都同意，缺少真实的交锋动力
2. **纯陈述式交锋**（declarative-exchange）：角色仅相互传递世界观信息，对话变成百科全书式问答，无情感碰撞
3. **伪装成对话的独白**（monologue-disguised）：某角色连续发言超过三轮，对方仅用一两个字回应，实质上是单方独白
4. **软弱回应**（weak-response）：角色在压力下毫无抵抗，立场瞬间崩溃，缺乏应有的防御或反击

## 评分说明

- **frictionScore**（0–100）：0=完全无阻力，100=激烈冲突
- **conflictDepth**：none / weak / moderate / strong
- **overallQuality**：poor / acceptable / good / excellent

## 输出格式（JSON）

{
  "issues": [
    {
      "type": "no-friction | declarative-exchange | monologue-disguised | weak-response",
      "severity": "critical | warning | suggestion",
      "description": "具体问题描述",
      "location": { "lineStart": 1, "lineEnd": 3 },
      "suggestion": "具体修改建议"
    }
  ],
  "frictionScore": 0,
  "conflictDepth": "none",
  "overallQuality": "poor",
  "summary": "总体评价"
}

若未发现问题，issues 返回空数组。`;
  }
}
