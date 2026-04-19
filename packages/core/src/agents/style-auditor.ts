import { BaseAgent, type AgentContext, type AgentResult } from './base';

export interface StyleIssue {
  category:
    | 'dialogue-uniformity'
    | 'tone-shift'
    | 'sentence-monotony'
    | 'style-drift'
    | 'repetition';
  severity: 'critical' | 'warning' | 'suggestion';
  description: string;
  affected: string[];
  suggestion: string;
}

export interface StyleConsistency {
  dialogueConsistency: 'pass' | 'warning' | 'fail';
  narrativeTone: 'pass' | 'warning' | 'fail';
  sentenceVariety: 'pass' | 'warning' | 'fail';
}

export interface CharacterVoice {
  name: string;
  voice: string;
}

export interface StyleAuditInput {
  chapterContent: string;
  chapterNumber: number;
  genre: string;
  referenceStyle?: string;
  characterVoices?: CharacterVoice[];
}

export interface StyleAuditOutput {
  issues: StyleIssue[];
  styleConsistency: StyleConsistency;
  overallStatus: 'pass' | 'warning' | 'fail';
  summary: string;
}

const GENRE_STYLE_CRITERIA: Record<string, string> = {
  xianxia: '仙侠：半文半白的对话风格、古朴雅致的叙述语调、诗意描写与战斗描写的风格切换',
  fantasy: '玄幻：史诗感叙述语调、种族语言差异化、魔法描写的视觉化风格',
  urban: '都市：口语化对话、现实感叙述、职场/生活场景的语调切换',
  'sci-fi': '科幻：理性冷静的叙述语调、科技术语的准确使用、未来感的文字氛围',
  history: '历史：文言文与现代文的融合、时代语言的一致性、礼仪用语的准确使用',
  game: '游戏：明快节奏感、战斗描写的动感、游戏术语的统一使用',
  horror: '悬疑：紧张氛围的文字营造、留白与暗示的节奏、短句与长句的交替使用',
  romance: '言情：细腻心理描写的文字风格、情感表达的含蓄与张力、对话的暗示性',
  fanfic: '同人：原作语言风格的还原、角色说话方式的一致性、原作氛围的维持',
};

export class StyleAuditor extends BaseAgent {
  readonly name = 'StyleAuditor';
  readonly temperature = 0.2;

  async execute(ctx: AgentContext): Promise<AgentResult> {
    const input = ctx.promptContext?.input as StyleAuditInput | undefined;
    if (!input) {
      return { success: false, error: '缺少文风审核输入' };
    }

    const validationError = this.#validate(input);
    if (validationError) {
      return { success: false, error: validationError };
    }

    const prompt = this.#buildPrompt(input);

    try {
      const result = await this.generateJSON<StyleAuditOutput>(prompt);

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: `文风审核失败: ${message}` };
    }
  }

  #validate(input: StyleAuditInput): string | null {
    if (!input.chapterContent || input.chapterContent.trim().length === 0) {
      return '章节内容不能为空';
    }
    if (!input.genre || input.genre.trim().length === 0) {
      return '题材不能为空';
    }
    return null;
  }

  #buildPrompt(input: StyleAuditInput): string {
    const genreHint = GENRE_STYLE_CRITERIA[input.genre] ?? '';
    const lines: string[] = [];

    lines.push(`你是一位专业的小说文风审核师。请审核以下章节的文风一致性和角色说话风格的区分度。

## 基本信息

- **章节**: 第 ${input.chapterNumber} 章
- **题材**: ${input.genre}${genreHint ? `（${genreHint}）` : ''}`);

    if (input.referenceStyle) {
      lines.push(`
## 参考文风

${input.referenceStyle}`);
    }

    if (input.characterVoices && input.characterVoices.length > 0) {
      lines.push(`
## 角色说话风格档案

${input.characterVoices.map((v) => `- ${v.name}：${v.voice}`).join('\n')}`);
    }

    lines.push(`
## 审核内容

${input.chapterContent}

## 审核维度

请从以下维度进行审核：

1. **对话区分度**（dialogue-uniformity）：不同角色的说话方式是否有辨识度，是否千篇一律
2. **叙述语调一致性**（tone-shift）：同一章节或段落之间的叙述语调是否连贯，有无突兀的风格突变
3. **句式多样性**（sentence-monotony）：句式结构是否单调重复，长短句是否合理交替
4. **文风漂移**（style-drift）：与参考文风是否有明显偏离
5. **重复表达**（repetition）：是否存在高频重复的词汇、短语或句式

## 输出要求

请以 JSON 格式输出审核结果：

{
  "issues": [
    {
      "category": "问题类别",
      "severity": "critical|warning|suggestion",
      "description": "问题描述",
      "affected": ["受影响的角色或段落"],
      "suggestion": "改进建议"
    }
  ],
  "styleConsistency": {
    "dialogueConsistency": "pass|warning|fail",
    "narrativeTone": "pass|warning|fail",
    "sentenceVariety": "pass|warning|fail"
  },
  "overallStatus": "pass|warning|fail",
  "summary": "审核总结（1-2句话）"
}

severity 分级：
- critical：严重的风格不一致（如古今语言混用）
- warning：可察觉的问题（如角色说话方式缺乏区分度）
- suggestion：可选优化（如句式可以更多样）`);

    return lines.join('\n');
  }
}
