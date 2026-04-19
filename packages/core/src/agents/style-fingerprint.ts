import { BaseAgent, type AgentContext, type AgentResult } from './base';

export interface StyleFingerprint {
  avgSentenceLength: number;
  dialogueRatio: number;
  descriptionRatio: number;
  actionRatio: number;
  commonPhrases: string[];
  sentencePatternPreference: string;
  wordUsageHabit: string;
  rhetoricTendency: string;
}

export interface StyleFingerprintInput {
  referenceText: string;
  genre: string;
}

export interface StyleFingerprintOutput {
  fingerprint: StyleFingerprint;
}

const GENRE_ANALYSIS_GUIDANCE: Record<string, string> = {
  xianxia: '仙侠：关注修炼描写句式、斗法场景短句、四字词和典故使用、对话古朴程度',
  fantasy: '玄幻：关注宏大叙事句式、种族语言差异、史诗感营造手法',
  urban: '都市：关注口语化程度、职场用语、对话自然度和现代感',
  'sci-fi': '科幻：关注科技术语使用频率、理性叙述语调、未来感描写手法',
  history: '历史：关注文言文与现代文比例、时代用词准确性、礼仪用词',
  game: '游戏：关注节奏感、战斗描写动感、术语统一性',
  horror: '悬疑：关注短句使用频率、留白手法、节奏变化模式',
  romance: '言情：关注心理描写句式、对话含蓄度、情感细节描写手法',
  fanfic: '同人：关注原作风格保持度、角色说话方式一致性',
};

export class StyleFingerprinter extends BaseAgent {
  readonly name = 'StyleFingerprinter';
  readonly temperature = 0.2;

  async execute(ctx: AgentContext): Promise<AgentResult> {
    const input = ctx.promptContext?.input as StyleFingerprintInput | undefined;
    if (!input) {
      return { success: false, error: '缺少风格指纹输入' };
    }

    const validationError = this.#validate(input);
    if (validationError) {
      return { success: false, error: validationError };
    }

    const prompt = this.#buildPrompt(input);

    try {
      const fingerprint = await this.generateJSON<StyleFingerprint>(prompt);

      return {
        success: true,
        data: { fingerprint },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: `风格指纹提取失败: ${message}` };
    }
  }

  /**
   * 启发式分析参考文本，提取风格指纹（不依赖 LLM）。
   */
  analyze(referenceText: string): StyleFingerprint {
    if (!referenceText || referenceText.trim().length === 0) {
      return {
        avgSentenceLength: 0,
        dialogueRatio: 0,
        descriptionRatio: 0,
        actionRatio: 0,
        commonPhrases: [],
        sentencePatternPreference: '',
        wordUsageHabit: '',
        rhetoricTendency: '',
      };
    }

    const sentences = referenceText.split(/[。！？；\n]/).filter((s) => s.trim().length > 0);
    const avgSentenceLength =
      sentences.length > 0 ? Math.round(referenceText.length / sentences.length) : 0;

    const dialogueSegments = referenceText.match(/["""'][^""""'"]*["""']/g) || [];
    const dialogueRatio =
      referenceText.length > 0 ? dialogueSegments.join('').length / referenceText.length : 0;

    const descriptionMarkers = ['是', '有', '像', '如', '般', '的'];
    const descriptionCount = descriptionMarkers.filter((m) => referenceText.includes(m)).length;
    const descriptionRatio = Math.min(descriptionCount / Math.max(sentences.length, 1), 1);

    const actionVerbs = ['走', '跑', '飞', '打', '杀', '冲', '跳', '挥', '斩', '击'];
    const actionCount = actionVerbs.filter((v) => referenceText.includes(v)).length;
    const actionRatio = Math.min(actionCount / Math.max(sentences.length, 1), 1);

    const commonPhrases = this.#extractCommonPhrases(referenceText);

    return {
      avgSentenceLength,
      dialogueRatio: Math.round(dialogueRatio * 100) / 100,
      descriptionRatio: Math.round(descriptionRatio * 100) / 100,
      actionRatio: Math.round(actionRatio * 100) / 100,
      commonPhrases,
      sentencePatternPreference: '',
      wordUsageHabit: '',
      rhetoricTendency: '',
    };
  }

  #validate(input: StyleFingerprintInput): string | null {
    if (!input.referenceText || input.referenceText.trim().length === 0) {
      return '参考文本不能为空';
    }
    if (input.referenceText.trim().length < 50) {
      return '参考文本过短，至少需要 50 字';
    }
    if (!input.genre || input.genre.trim().length === 0) {
      return '题材不能为空';
    }
    return null;
  }

  #buildPrompt(input: StyleFingerprintInput): string {
    const genreGuidance = GENRE_ANALYSIS_GUIDANCE[input.genre] ?? '';
    const text = input.referenceText.substring(0, 5000);

    return `你是一位专业的网络小说风格分析师。请分析以下参考文本，提取结构化风格指纹。

## 基本信息

- **题材**: ${input.genre}${genreGuidance ? `（${genreGuidance}）` : ''}

## 参考文本

${text}

## 分析要求

请分析以下维度并以 JSON 格式输出：

1. **avgSentenceLength**（number）：平均句长（字数）
2. **dialogueRatio**（number, 0-1）：对话占比
3. **descriptionRatio**（number, 0-1）：描写占比
4. **actionRatio**（number, 0-1）：动作占比
5. **commonPhrases**（string[]）：高频词汇和短语（5-10 个）
6. **sentencePatternPreference**（string）：句式偏好描述
7. **wordUsageHabit**（string）：用词习惯描述
8. **rhetoricTendency**（string）：修辞倾向描述

只输出 JSON，不要其他内容。`;
  }

  #extractCommonPhrases(text: string): string[] {
    const candidates = [
      '只见',
      '不禁',
      '心中',
      '微微',
      '突然',
      '瞬间',
      '于是',
      '然而',
      '接着',
      '然后',
      '仿佛',
      '似乎',
    ];
    return candidates.filter((phrase) => {
      const regex = new RegExp(phrase, 'g');
      const matches = text.match(regex);
      return matches && matches.length >= 2;
    });
  }
}
