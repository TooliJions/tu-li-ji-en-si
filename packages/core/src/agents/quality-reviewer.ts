import { BaseAgent, type AgentContext, type AgentResult } from './base';

export interface QualityIssueLocation {
  paragraph?: number;
  sentence?: number;
  quote?: string;
}

export interface QualityIssue {
  severity: 'critical' | 'warning' | 'suggestion';
  category: string;
  description: string;
  suggestion: string;
  location: QualityIssueLocation;
}

export interface ChapterPlanContext {
  intention: string;
  keyEvents: string[];
  emotionalBeat: string;
}

export interface ReviewInput {
  chapterContent: string;
  chapterNumber: number;
  genre: string;
  chapterPlan?: ChapterPlanContext;
  intentGuidance?: string;
}

export interface ReviewOutput {
  issues: QualityIssue[];
  overallScore: number;
  summary: string;
}

const GENRE_CRITERIA: Record<string, string> = {
  xianxia: '仙侠：修炼描写是否准确、斗法场景气势、师徒/同门情谊、用词古朴度',
  fantasy: '玄幻：世界观展现是否完整、能力觉醒的震撼感、种族文化差异',
  urban: '都市：对话是否贴近现实、职场细节真实性、人际关系微妙变化',
  'sci-fi': '科幻：科技设定严谨性、未来感营造、术语使用准确性',
  history: '历史：时代语言一致性、历史场景还原度、权谋斗争逻辑性',
  game: '游戏：游戏机制描写趣味性、升级爽感、竞技对抗紧张感',
  horror: '悬疑：氛围营造、细节暗示密度、节奏控制、反转铺垫',
  romance: '言情：心理描写细腻度、情感细节、对话暗示和留白',
  fanfic: '同人：原作风格一致性、角色说话方式还原、正典呼应',
};

export class QualityReviewer extends BaseAgent {
  readonly name = 'QualityReviewer';
  readonly temperature = 0.2;

  async execute(ctx: AgentContext): Promise<AgentResult> {
    const input = ctx.promptContext?.input as ReviewInput | undefined;
    if (!input) {
      return { success: false, error: '缺少质量审核输入' };
    }

    const validationError = this.#validate(input);
    if (validationError) {
      return { success: false, error: validationError };
    }

    const prompt = this.#buildPrompt(input);

    try {
      const result = await this.generateJSON<ReviewOutput>(prompt);

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: `质量审核失败: ${message}` };
    }
  }

  #validate(input: ReviewInput): string | null {
    if (!input.chapterContent || input.chapterContent.trim().length === 0) {
      return '章节内容不能为空';
    }
    if (!input.genre || input.genre.trim().length === 0) {
      return '题材不能为空';
    }
    return null;
  }

  #buildPrompt(input: ReviewInput): string {
    const genreHint = GENRE_CRITERIA[input.genre] ?? '';
    const lines: string[] = [];

    lines.push(`你是一位专业的网络小说质量审核师。请对以下章节内容进行多维度质量审核，找出需要改进的问题。

## 基本信息

- **章节**: 第 ${input.chapterNumber} 章
- **题材**: ${input.genre}${genreHint ? `（${genreHint}）` : ''}`);

    if (input.chapterPlan) {
      const plan = input.chapterPlan;
      lines.push(`
## 章节计划

- **意图**: ${plan.intention}
- **关键事件**: ${plan.keyEvents.join('、')}
- **情感节拍**: ${plan.emotionalBeat}`);
    }

    if (input.intentGuidance) {
      lines.push(`
## 创作指导

${input.intentGuidance}`);
    }

    lines.push(`
## 审核内容

${input.chapterContent}

## 审核维度

请从以下维度进行检查：

1. **一致性**（critical）：角色名字/性格/关系前后一致、世界观设定不冲突
2. **重复性**（warning）：同义词重复、句式单调、高频词堆积
3. **节奏感**（warning）：段落长短失衡、紧张/舒缓段落安排不当
4. **逻辑性**（critical）：情节漏洞、行为不合理、时间线矛盾
5. **画面感**（suggestion）：抽象叙述过多、缺乏具体细节、场景描写单薄
6. **对话质量**（warning）：对话生硬、角色说话方式无区分度、信息交代不自然
7. **题材适配**（suggestion）：是否符合该文类的读者期待和写作惯例

## 输出要求

请以 JSON 格式输出审核结果：

{
  "issues": [
    {
      "severity": "critical|warning|suggestion",
      "category": "问题类别",
      "description": "问题描述",
      "suggestion": "改进建议",
      "location": { "paragraph": 段落号, "quote": "原文引用" }
    }
  ],
  "overallScore": 0-100的整体质量评分,
  "summary": "审核总结（1-2句话）"
}

severity 分级：
- critical：必须修复的问题（一致性问题、逻辑漏洞）
- warning：建议修复的问题（重复用词、对话生硬）
- suggestion：可选优化（画面感增强、节奏调整）`);

    return lines.join('\n');
  }
}

import { agentRegistry } from './registry';
agentRegistry.register('quality-reviewer', (p) => new QualityReviewer(p));
