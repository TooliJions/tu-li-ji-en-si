import { BaseAgent, type AgentContext, type AgentResult } from './base';

export interface TitleVoiceIssue {
  category: 'title-mismatch' | 'title-pattern-break' | 'voice-drift' | 'tone-inconsistency';
  severity: 'warning' | 'suggestion';
  description: string;
  affected: string[];
  suggestion: string;
  suggestionDetail: string;
}

export interface TitleVoiceInput {
  chapterTitle: string;
  chapterContent: string;
  bookTitle: string;
  chapterNumber: number;
  genre: string;
  previousTitles?: string[];
  authorVoiceReference?: string;
}

export interface TitleVoiceOutput {
  issues: TitleVoiceIssue[];
  titleScore: number;
  voiceConsistency: 'pass' | 'warning' | 'fail';
  overallStatus: 'pass' | 'warning' | 'fail';
  summary: string;
}

const GENRE_TITLE_STYLE: Record<string, string> = {
  xianxia: '仙侠：标题多用四字词或短句（如"拜入仙门"、"筑基突破"），风格古朴典雅',
  fantasy: '玄幻：标题注重气势和史诗感（如"血脉觉醒"、"种族之战"）',
  urban: '都市：标题贴近生活、简洁明快（如"入职第一天"、"意外相遇"）',
  'sci-fi': '科幻：标题注重科技感和未来感（如"跃迁启动"、"深空信号"）',
  history: '历史：标题符合历史语境、庄重典雅（如"城破之日"、"朝堂风云"）',
  game: '游戏：标题注重动作感和游戏感（如"副本首通"、"等级突破"）',
  horror: '悬疑：标题制造悬念和紧张感（如"深夜异响"、"失踪的钥匙"）',
  romance: '言情：标题注重情感色彩和意境（如"初遇"、"心动时刻"）',
  fanfic: '同人：标题与原作风格一致、注重原作梗或名场景的呼应',
};

export class TitleVoiceAuditor extends BaseAgent {
  readonly name = 'TitleVoiceAuditor';
  readonly temperature = 0.2;

  async execute(ctx: AgentContext): Promise<AgentResult> {
    const input = ctx.promptContext?.input as TitleVoiceInput | undefined;
    if (!input) {
      return { success: false, error: '缺少标题与声音审核输入' };
    }

    const validationError = this.#validate(input);
    if (validationError) {
      return { success: false, error: validationError };
    }

    const prompt = this.#buildPrompt(input);

    try {
      const result = await this.generateJSON<TitleVoiceOutput>(prompt);

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: `标题与声音审核失败: ${message}` };
    }
  }

  #validate(input: TitleVoiceInput): string | null {
    if (!input.chapterTitle || input.chapterTitle.trim().length === 0) {
      return '章节标题不能为空';
    }
    if (!input.bookTitle || input.bookTitle.trim().length === 0) {
      return '书名不能为空';
    }
    if (!input.genre || input.genre.trim().length === 0) {
      return '题材不能为空';
    }
    return null;
  }

  #buildPrompt(input: TitleVoiceInput): string {
    const genreHint = GENRE_TITLE_STYLE[input.genre] ?? '';
    const lines: string[] = [];

    lines.push(`你是一位专业的小说标题与作者声音审核师。请审核以下章节标题是否与书名、题材风格一致，以及章节内容中的作者"声音"是否连贯统一。

## 基本信息

- **书名**: ${input.bookTitle}
- **章节**: 第 ${input.chapterNumber} 章 — ${input.chapterTitle}
- **题材**: ${input.genre}${genreHint ? `（${genreHint}）` : ''}`);

    if (input.previousTitles && input.previousTitles.length > 0) {
      lines.push(`
## 前几章标题

${input.previousTitles.map((t) => `- ${t}`).join('\n')}`);
    }

    if (input.authorVoiceReference) {
      lines.push(`
## 作者声音参考

${input.authorVoiceReference}`);
    }

    lines.push(`
## 章节内容（用于检测作者声音）

${input.chapterContent.substring(0, 2000)}`);

    lines.push(`
## 审核要求

请从以下维度进行审核：

1. **标题-题材匹配度**（title-mismatch）：章节标题是否符合该文类的命名惯例和审美风格
2. **标题格式一致性**（title-pattern-break）：与前面章节标题的格式、长度、风格是否一致
3. **作者声音漂移**（voice-drift）：章节内容的叙述风格是否与作者一贯风格有明显偏离
4. **语调连贯性**（tone-inconsistency）：本章的叙述语调是否与全书基调一致

## 输出要求

请以 JSON 格式输出审核结果：

{
  "issues": [
    {
      "category": "问题类别",
      "severity": "warning|suggestion",
      "description": "问题描述",
      "affected": ["受影响的元素"],
      "suggestion": "改进建议",
      "suggestionDetail": "具体建议说明"
    }
  ],
  "titleScore": 0-100的标题评分,
  "voiceConsistency": "pass|warning|fail",
  "overallStatus": "pass|warning|fail",
  "summary": "审核总结（1-2句话）"
}

overallStatus：
- pass：标题和声音均一致，无明显问题
- warning：存在可察觉的不一致
- fail：存在严重的标题风格偏离或声音漂移`);

    return lines.join('\n');
  }
}
