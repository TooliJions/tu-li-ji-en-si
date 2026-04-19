import { BaseAgent, type AgentContext, type AgentResult } from './base';

// ─── Types ─────────────────────────────────────────────────────────

export interface RewriteIssue {
  description: string;
  category: string;
  suggestion: string;
  affectedText?: string;
  tier?: 'blocker' | 'warning' | 'suggestion';
}

export interface RewriteInput {
  chapterContent: string;
  chapterNumber: number;
  genre: string;
  strategy: string;
  issues: RewriteIssue[];
  targetScene?: string;
  sceneContent?: string;
  chapterOutline?: string;
  previousChapterSummary?: string;
}

export interface RewriteOutput {
  rewrittenContent: string;
  wordCount: number;
  originalWordCount: number;
  strategy: string;
  changeSummary: string;
}

const VALID_STRATEGIES = ['local-replace', 'paragraph-reorder', 'beat-rewrite', 'chapter-rewrite'];

const STRATEGY_LABELS: Record<string, string> = {
  'local-replace': '局部替换',
  'paragraph-reorder': '段落重排',
  'beat-rewrite': '节拍重写',
  'chapter-rewrite': '整章重写',
};

// ─── SurgicalRewriter ──────────────────────────────────────────────
/**
 * 精确重写器。根据修复策略决策，对章节内容进行不同粒度的重写。
 * 策略包括：
 *   - local-replace: 局部替换，保留原文结构，仅替换问题短语
 *   - paragraph-reorder: 段落重排，调整段落顺序和句型结构
 *   - beat-rewrite: 节拍重写，针对场景/节拍级逻辑问题进行重写
 *   - chapter-rewrite: 整章重写，严重问题下的全面重写
 */
export class SurgicalRewriter extends BaseAgent {
  readonly name = 'SurgicalRewriter';
  readonly temperature = 0.7;

  async execute(ctx: AgentContext): Promise<AgentResult> {
    const input = ctx.promptContext?.input as RewriteInput | undefined;
    if (!input) {
      return { success: false, error: '缺少重写输入' };
    }

    const validationError = this.#validate(input);
    if (validationError) {
      return { success: false, error: validationError };
    }

    const prompt = this.#buildPrompt(input);

    try {
      const rewrittenContent = await this.generate(prompt);

      const output: RewriteOutput = {
        rewrittenContent,
        wordCount: this.#countWords(rewrittenContent),
        originalWordCount: this.#countWords(input.chapterContent),
        strategy: input.strategy,
        changeSummary: this.#buildChangeSummary(input),
      };

      return {
        success: true,
        data: output,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: `精确重写失败: ${message}` };
    }
  }

  #validate(input: RewriteInput): string | null {
    if (!input.chapterContent || input.chapterContent.trim().length === 0) {
      return '章节内容不能为空';
    }
    if (!input.genre || input.genre.trim().length === 0) {
      return '题材不能为空';
    }
    if (!input.strategy || input.strategy.trim().length === 0) {
      return '策略不能为空';
    }
    if (!VALID_STRATEGIES.includes(input.strategy)) {
      return `未知策略: ${input.strategy}，有效策略为: ${VALID_STRATEGIES.join(', ')}`;
    }
    return null;
  }

  #buildPrompt(input: RewriteInput): string {
    const lines: string[] = [];

    lines.push(`你是一位专业的网络小说编辑。请根据以下检测结果，对章节内容进行精确重写。

## 基本信息

- **章节**: 第 ${input.chapterNumber} 章
- **题材**: ${input.genre}
- **策略**: ${STRATEGY_LABELS[input.strategy] ?? input.strategy}（${input.strategy}）

## 问题列表

`);

    for (let i = 0; i < input.issues.length; i++) {
      const issue = input.issues[i];
      lines.push(`${i + 1}. **${issue.description}**`);
      lines.push(`   - 类别: ${issue.category}`);
      lines.push(`   - 建议: ${issue.suggestion}`);
      if (issue.affectedText) {
        lines.push(`   - 影响文本: "${issue.affectedText}"`);
      }
      lines.push('');
    }

    // Strategy-specific sections
    switch (input.strategy) {
      case 'local-replace':
        lines.push(this.#localReplaceGuidance(input));
        break;
      case 'paragraph-reorder':
        lines.push(this.#paragraphReorderGuidance(input));
        break;
      case 'beat-rewrite':
        lines.push(this.#beatRewriteGuidance(input));
        break;
      case 'chapter-rewrite':
        lines.push(this.#chapterRewriteGuidance(input));
        break;
    }

    lines.push(`
## 原文内容

${input.chapterContent}

## 输出要求

请直接输出重写后的正文内容，不要包含任何解释、标题或标记。`);

    return lines.join('\n');
  }

  #localReplaceGuidance(input: RewriteInput): string {
    return `
## 重写指引（局部替换）

当前策略为**局部替换**。请在保持原文整体结构和内容不变的前提下，仅对标记的问题短语进行替换。

**注意事项：**
- 保留原文的段落结构和叙事顺序
- 仅替换标记出的套话、重复用语或空洞描写
- 替换后的文本应在语义上等价但表达更加具体生动
- 未标记的部分应完全保留原文
`;
  }

  #paragraphReorderGuidance(_input: RewriteInput): string {
    return `
## 重写指引（段落重排）

当前策略为**段落重排**。请在保留全部原文内容的前提下，调整段落顺序和句型结构。

**注意事项：**
- 保留原文的全部信息和情节内容
- 调整段落顺序以改善节奏和阅读体验
- 变换重复的句型结构，增加句式多样性
- 注意段落之间的过渡和衔接要自然流畅
`;
  }

  #beatRewriteGuidance(input: RewriteInput): string {
    const extra: string[] = [];

    if (input.targetScene) {
      extra.push(`- **目标场景**: ${input.targetScene}`);
    }
    if (input.sceneContent) {
      extra.push(`- **场景内容**: ${input.sceneContent}`);
    }

    return `
## 重写指引（节拍重写）

当前策略为**节拍重写**。请针对场景中的逻辑/节奏/情感弧线问题进行重写。

${extra.length > 0 ? extra.join('\n') + '\n' : ''}
**注意事项：**
- 补充缺失的过渡和铺垫，使情节推进更加自然
- 修正时间线和逻辑上的跳跃
- 修复情感弧线的断裂，使情感变化有合理的铺垫
- 保留场景的核心事件和关键信息
`;
  }

  #chapterRewriteGuidance(input: RewriteInput): string {
    const extra: string[] = [];

    if (input.previousChapterSummary) {
      extra.push(`
## 上一章摘要

${input.previousChapterSummary}`);
    }

    if (input.chapterOutline) {
      extra.push(`
## 本章大纲

${input.chapterOutline}`);
    }

    return `
## 重写指引（整章重写）

当前策略为**整章重写**。由于检测到严重的结构或逻辑问题，请根据大纲和上文对整章内容进行重写。

${extra.join('\n')}

**注意事项：**
- 严格遵循本章大纲的要求和方向
- 与上一章内容保持连贯，不要重复已写过的内容
- 修正所有检测到的阻断级问题（角色状态、时间线、视角等）
- 保持角色性格和行为的一致性
- 保留原文中可用的核心创意和亮点
`;
  }

  #countWords(text: string): number {
    // Count CJK characters + words
    const cjk = text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g);
    const cjkCount = cjk ? cjk.length : 0;
    const nonCjk = text
      .replace(/[\u4e00-\u9fff\u3400-\u4dbf\s\n\r\t，。！？；：""''（）【】《》、]/g, '')
      .trim();
    const nonCjkWords =
      nonCjk.length > 0 ? nonCjk.split(/\s+/).filter((w) => w.length > 0).length : 0;
    return cjkCount + nonCjkWords;
  }

  #buildChangeSummary(input: RewriteInput): string {
    const strategyLabel = STRATEGY_LABELS[input.strategy] ?? input.strategy;
    const issueCount = input.issues.length;
    const categories = [...new Set(input.issues.map((i) => i.category))];

    if (input.strategy === 'local-replace') {
      const affectedTexts = input.issues
        .filter((i) => i.affectedText)
        .map((i) => `"${i.affectedText}"`);
      if (affectedTexts.length > 0) {
        return `局部替换了 ${affectedTexts.length} 处问题短语：${affectedTexts.slice(0, 3).join('、')}${affectedTexts.length > 3 ? ' 等' : ''}`;
      }
    }

    return `${strategyLabel}：处理了 ${issueCount} 个问题（${categories.slice(0, 3).join('、')}${categories.length > 3 ? ' 等' : ''}）`;
  }
}
