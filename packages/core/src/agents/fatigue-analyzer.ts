import { BaseAgent, type AgentContext, type AgentResult } from './base';

export interface FatigueIssue {
  category:
    | 'repetition'
    | 'description-overload'
    | 'dialogue-fatigue'
    | 'pacing'
    | 'info-dump'
    | 'cross-chapter-repetition';
  severity: 'critical' | 'warning' | 'suggestion';
  description: string;
  suggestion: string;
}

export interface FatigueInput {
  chapterContent: string;
  chapterNumber: number;
  genre: string;
  previousChapterContent?: string;
}

export interface FatigueOutput {
  issues: FatigueIssue[];
  fatigueScore: number;
  riskLevel: 'low' | 'medium' | 'high';
  overallStatus: 'pass' | 'warning' | 'fail';
  summary: string;
}

const GENRE_FATIGUE_FOCUS: Record<string, string> = {
  xianxia: '仙侠：修炼流程重复感、战斗模式套路化、法宝描述单调、升级节奏疲劳',
  fantasy: '玄幻：战斗模板重复、种族描述单一、地图探索疲劳、能力升级套路',
  urban: '都市：日常流水账感、职场桥段重复、社交场景单调',
  'sci-fi': '科幻：技术说明堆砌、设定解释疲劳、科学术语密集',
  history: '历史：政治讨论冗长、战争描写重复、人物对话模式化',
  game: '游戏：数据面板重复出现、战斗流程模板化、装备说明堆砌',
  horror: '悬疑：恐怖氛围堆叠疲劳、惊吓点模式重复、线索揭示节奏单调',
  romance: '言情：情感纠葛重复、误会套路循环、甜蜜场景过度密集',
  fanfic: '同人：原作梗过度使用、角色互动模式重复',
};

export class FatigueAnalyzer extends BaseAgent {
  readonly name = 'FatigueAnalyzer';
  readonly temperature = 0.3;

  async execute(ctx: AgentContext): Promise<AgentResult> {
    const input = ctx.promptContext?.input as FatigueInput | undefined;
    if (!input) {
      return { success: false, error: '缺少疲劳分析输入' };
    }

    const validationError = this.#validate(input);
    if (validationError) {
      return { success: false, error: validationError };
    }

    const prompt = this.#buildPrompt(input);

    try {
      const result = await this.generateJSON<FatigueOutput>(prompt);

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: `疲劳分析失败: ${message}` };
    }
  }

  #validate(input: FatigueInput): string | null {
    if (!input.chapterContent || input.chapterContent.trim().length === 0) {
      return '章节内容不能为空';
    }
    if (!input.genre || input.genre.trim().length === 0) {
      return '题材不能为空';
    }
    return null;
  }

  #buildPrompt(input: FatigueInput): string {
    const genreHint = GENRE_FATIGUE_FOCUS[input.genre] ?? '';
    const lines: string[] = [];

    lines.push(`你是一位专业的小说阅读疲劳分析。请分析以下章节内容，检测可能导致读者产生阅读疲劳的模式和问题。

## 基本信息

- **章节**: 第 ${input.chapterNumber} 章
- **题材**: ${input.genre}${genreHint ? `（${genreHint}）` : ''}`);

    if (input.previousChapterContent) {
      lines.push(`
## 上一章内容（供跨章对比）

${input.previousChapterContent}`);
    }

    lines.push(`
## 本章内容

${input.chapterContent}

## 分析维度

请从以下维度检测阅读疲劳风险：

1. **句式重复**（repetition）：连续使用相同句式结构或开头模式
2. **描写过载**（description-overload）：连续多段纯环境/外貌描写，缺乏情节推进
3. **对话疲劳**（dialogue-fatigue）：对话占比过高且缺乏动作/环境穿插
4. **节奏单调**（pacing）：连续章节节奏模式相似（如连续平淡或连续高潮）
5. **设定堆砌**（info-dump）：大段设定/世界观说明打断叙事节奏
6. **跨章重复**（cross-chapter-repetition）：与上一章在开头、结尾或段落结构上高度相似

## 输出要求

请以 JSON 格式输出分析结果：

{
  "issues": [
    {
      "category": "问题类别",
      "severity": "critical|warning|suggestion",
      "description": "问题描述",
      "suggestion": "改善建议"
    }
  ],
  "fatigueScore": 0-100的疲劳分数,
  "riskLevel": "low|medium|high",
  "overallStatus": "pass|warning|fail",
  "summary": "分析总结（1-2句话）"
}

fatigueScore 评分：
- 0-25：低疲劳，节奏良好
- 26-50：轻度疲劳，有小问题
- 51-75：中度疲劳，需调整
- 76-100：严重疲劳，读者可能放弃阅读

riskLevel：
- low：fatigueScore < 30，整体安全
- medium：30 <= fatigueScore < 70，存在疲劳风险
- high：fatigueScore >= 70，严重疲劳需要修改

overallStatus：
- pass：fatigueScore < 30，通过
- warning：30 <= fatigueScore < 70，通过但有风险
- fail：fatigueScore >= 70，不通过，建议重写`);

    return lines.join('\n');
  }
}
