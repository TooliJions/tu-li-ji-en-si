import { BaseAgent, type AgentContext, type AgentResult } from './base';

export interface OutlineBrief {
  title: string;
  genre: string;
  brief: string;
  targetChapters?: number;
}

export interface ChapterBeat {
  chapterNumber: number;
  title: string;
  summary: string;
}

export interface ActOutline {
  actNumber: number;
  title: string;
  summary: string;
  chapters: ChapterBeat[];
}

export interface OutlineResult {
  acts: ActOutline[];
}

const GENRE_GUIDANCE: Record<string, string> = {
  xianxia: '仙侠题材：注意修炼体系、宗门势力、法宝灵药的设定，体现修仙者的道心与劫难',
  fantasy: '玄幻题材：注重世界观构建、魔法/异能体系、种族冲突的层次感',
  urban: '都市题材：贴近现实生活，注重人物情感纠葛、职场商战、社会百态',
  'sci-fi': '科幻题材：科技设定需自洽，注重未来社会的逻辑推演与人性探讨',
  history: '历史题材：尊重历史背景，人物与事件需符合时代特征',
  game: '游戏题材：注重游戏规则、等级体系、副本设计的趣味性',
  horror: '悬疑题材：注重悬念铺垫、线索埋设、反转设计的合理性',
  romance: '言情题材：注重情感发展节奏、人物心理刻画、冲突与和解',
  fanfic: '同人体裁：保持原作角色性格一致性，合理延续或重构世界观',
};

export class OutlinePlanner extends BaseAgent {
  readonly name = 'OutlinePlanner';
  readonly temperature = 0.8;

  async execute(ctx: AgentContext): Promise<AgentResult> {
    const brief = ctx.promptContext?.brief as OutlineBrief | undefined;
    if (!brief) {
      return { success: false, error: '缺少创作简报' };
    }

    // Validate required fields
    if (!brief.title || brief.title.trim().length === 0) {
      return { success: false, error: '书名不能为空' };
    }
    if (!brief.brief || brief.brief.trim().length === 0) {
      return { success: false, error: '作品简介不能为空' };
    }

    const prompt = this.#buildPrompt(brief);

    try {
      const outline = await this.generateJSON<OutlineResult>(prompt);
      return { success: true, data: outline };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: `LLM 调用失败: ${message}` };
    }
  }

  #buildPrompt(brief: OutlineBrief): string {
    const genreHint = GENRE_GUIDANCE[brief.genre] ?? '';

    let prompt = `你是一位专业的网络小说大纲策划师。请根据以下创作简报，生成三幕结构的大纲。

## 创作简报

- **书名**: ${brief.title}
- **题材**: ${brief.genre}${genreHint ? `（${genreHint}）` : ''}
- **简介**: ${brief.brief}`;

    if (brief.targetChapters) {
      prompt += `
- **目标章节数**: ${brief.targetChapters} 章`;
    }

    prompt += `

## 输出要求

请以 JSON 格式输出三幕结构大纲，包含以下字段：
- acts: 数组，包含三个幕（第一幕：开端/引入、第二幕：发展/冲突、第三幕：高潮/结局）
  - actNumber: 幕序号（1-3）
  - title: 幕标题
  - summary: 幕概要（1-2句话描述）
  - chapters: 该幕包含的章节列表
    - chapterNumber: 章节号
    - title: 章节标题
    - summary: 章节内容摘要

请合理分配章节到三个幕中，确保故事节奏有张有弛，伏笔有铺设和回收的空间。`;

    return prompt;
  }
}
