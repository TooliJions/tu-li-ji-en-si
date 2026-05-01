import { BaseAgent, type AgentContext, type AgentResult } from './base';
import type { StyleFingerprint } from './style-fingerprint';

export { type StyleFingerprint } from './style-fingerprint';

export interface StyleRefineInput {
  draftContent: string;
  chapterNumber: number;
  genre: string;
  styleFingerprint?: StyleFingerprint;
  previousChapterContent?: string;
}

export interface StyleRefineOutput {
  refinedContent: string;
  styleAnalysis: string;
  improvementScore: number;
}

const GENRE_GUIDANCE: Record<string, string> = {
  xianxia: '仙侠文风：句式长短交替，斗法时短句营造紧张感，描写时可用四字词和典故，对话古朴雅致',
  fantasy: '玄幻文风：注重宏大叙事感，描写要有史诗气质，种族语言风格要有区分度',
  urban: '都市文风：口语化但不粗俗，对话贴近现代职场语言，描写简洁明快',
  'sci-fi': '科幻文风：理性冷静的叙述语调，科技术语准确，未来感描写要具体',
  history: '历史文风：文言文与现代文结合，对话符合时代背景，注重礼仪用词',
  game: '游戏文风：节奏明快，战斗描写充满动感，术语使用统一',
  horror: '悬疑文风：短句制造紧张感，留白和暗示多于直白描写，节奏由慢到快',
  romance: '言情文风：细腻的心理描写，对话含蓄而有张力，注重情感细节',
  fanfic: '同人文风：保持原作叙述风格，角色说话方式与原作一致',
};

export class StyleRefiner extends BaseAgent {
  readonly name = 'StyleRefiner';
  readonly temperature = 0.4;

  async execute(ctx: AgentContext): Promise<AgentResult> {
    const input = ctx.promptContext?.input as StyleRefineInput | undefined;
    if (!input) {
      return { success: false, error: '缺少风格精炼输入' };
    }

    const validationError = this.#validate(input);
    if (validationError) {
      return { success: false, error: validationError };
    }

    const prompt = this.#buildPrompt(input);

    try {
      const refined = await this.generate(prompt);

      return {
        success: true,
        data: {
          refinedContent: refined,
          styleAnalysis: this.#generateStyleAnalysis(input),
          improvementScore: this.#estimateImprovement(input.draftContent, refined),
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: `风格精炼失败: ${message}` };
    }
  }

  #validate(input: StyleRefineInput): string | null {
    if (!input.draftContent || input.draftContent.trim().length === 0) {
      return '草稿内容不能为空';
    }
    if (!input.genre || input.genre.trim().length === 0) {
      return '题材不能为空';
    }
    return null;
  }

  #buildPrompt(input: StyleRefineInput): string {
    const genreHint = GENRE_GUIDANCE[input.genre] ?? '';
    const lines: string[] = [];

    lines.push(`你是一位专业的网络小说文风精炼师。请对以下章节进行风格优化和文字精炼。

## 基本信息

- **章节**: 第 ${input.chapterNumber} 章
- **题材**: ${input.genre}${genreHint ? `（${genreHint}）` : ''}`);

    // Style fingerprint
    if (input.styleFingerprint) {
      const fp = input.styleFingerprint;
      lines.push(`
## 当前文风特征

- 平均句长: ${fp.avgSentenceLength} 字
- 对话占比: ${(fp.dialogueRatio * 100).toFixed(0)}%
- 描写占比: ${(fp.descriptionRatio * 100).toFixed(0)}%
- 动作占比: ${(fp.actionRatio * 100).toFixed(0)}%
- 高频词汇: ${fp.commonPhrases.join('、')}`);
    }

    // Previous chapter style reference
    if (input.previousChapterContent) {
      lines.push(`
## 上一章文风参考

${input.previousChapterContent.substring(0, 1000)}`);
      lines.push('请保持文风与上一章的一致性。');
    }

    lines.push(`
## 待精炼内容

${input.draftContent}

## 精炼要求

1. **句式多样化**：避免连续使用相同句式，长短句交替
2. **词汇丰富性**：替换重复用词，使用更精准的表达
3. **对话个性化**：每个角色说话方式要有区分度
4. **节奏控制**：紧张场景用短句，舒缓场景可适当拉长
5. **画面感**：用具体动作和细节代替抽象形容
6. **文风统一**：与题材风格和上一章保持一致

请先简要分析当前文本的风格问题，然后输出精炼后的正文。
格式：先用一行"【风格分析】"开头，说明主要问题和改进方向，然后空一行，输出精炼正文。`);

    return lines.join('\n');
  }

  #generateStyleAnalysis(input: StyleRefineInput): string {
    const draft = input.draftContent;
    const sentences = draft.split(/[。！？；\n]/).filter((s) => s.trim().length > 0);
    const avgLen = sentences.length > 0 ? Math.round(draft.length / sentences.length) : 0;
    const uniqueWords = new Set(draft.split('')).size;
    const diversity = draft.length > 0 ? (uniqueWords / draft.length).toFixed(2) : '0';

    return `当前文本分析：共 ${sentences.length} 句，平均句长 ${avgLen} 字，字符多样性 ${diversity}。`;
  }

  #estimateImprovement(original: string, refined: string): number {
    const originalLen = original.length;
    const refinedLen = refined.length;
    if (originalLen === 0) return 0;

    // Simple heuristic: more diverse vocabulary + better sentence variety = higher score
    const originalUnique = new Set(original.split('')).size / originalLen;
    const refinedUnique = new Set(refined.split('')).size / refinedLen;
    const ratio = refinedUnique / originalUnique;

    return Math.min(Math.round(ratio * 80), 100);
  }
}

import { agentRegistry } from './registry';
agentRegistry.register('style-refiner', (p) => new StyleRefiner(p));
