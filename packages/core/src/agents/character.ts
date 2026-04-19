import { BaseAgent, type AgentContext, type AgentResult } from './base';

export interface CharacterDesignBrief {
  title: string;
  genre: string;
  brief: string;
  characterCount?: number;
}

export interface CharacterProfile {
  name: string;
  role: 'protagonist' | 'antagonist' | 'supporting' | 'minor';
  traits: string[];
  background: string;
  abilities: string[];
  relationships: Record<string, string>;
  arc: string;
}

export interface CharacterDesignResult {
  characters: CharacterProfile[];
}

const GENRE_GUIDANCE: Record<string, string> = {
  xianxia: '仙侠题材：角色应体现修炼者的道心、劫难、境界追求，注重师徒关系、宗门归属',
  fantasy: '玄幻题材：注重种族多样性（人/精灵/龙族等）、魔法天赋、血脉传承',
  urban: '都市题材：贴近现实的人物背景，职场身份、社会关系、性格反差',
  'sci-fi': '科幻题材：未来社会角色，科技能力、AI/机械增强、星际背景',
  history: '历史题材：符合时代背景的人物，注重历史人物性格考据',
  game: '游戏题材：注重角色的职业定位、技能树、成长路线',
  horror: '悬疑题材：角色应有神秘感、隐藏动机、不可告人的秘密',
  romance: '言情题材：注重角色的情感表达方式、性格互补、成长变化',
  fanfic: '同人体裁：保持原作角色性格一致性（不OOC），合理扩展原作未涉及的角色',
};

export class CharacterDesigner extends BaseAgent {
  readonly name = 'CharacterDesigner';
  readonly temperature = 0.7;

  async execute(ctx: AgentContext): Promise<AgentResult> {
    const brief = ctx.promptContext?.brief as CharacterDesignBrief | undefined;
    if (!brief) {
      return { success: false, error: '缺少创作简报' };
    }

    if (!brief.title || brief.title.trim().length === 0) {
      return { success: false, error: '书名不能为空' };
    }
    if (!brief.brief || brief.brief.trim().length === 0) {
      return { success: false, error: '作品简介不能为空' };
    }

    const outline = ctx.promptContext?.outline as string | undefined;
    const prompt = this.#buildPrompt(brief, outline);

    try {
      const result = await this.generateJSON<CharacterDesignResult>(prompt);
      return { success: true, data: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: `LLM 调用失败: ${message}` };
    }
  }

  #buildPrompt(brief: CharacterDesignBrief, outline?: string): string {
    const genreHint = GENRE_GUIDANCE[brief.genre] ?? '';

    let prompt = `你是一位专业的网络小说角色设计师。请根据以下创作简报，设计角色档案。

## 创作简报

- **书名**: ${brief.title}
- **题材**: ${brief.genre}${genreHint ? `（${genreHint}）` : ''}
- **简介**: ${brief.brief}`;

    if (brief.characterCount) {
      prompt += `
- **目标角色数**: ${brief.characterCount} 个`;
    }

    if (outline) {
      prompt += `

## 故事大纲

${outline}`;
    }

    prompt += `

## 输出要求

请以 JSON 格式输出角色设计，每个角色包含以下字段：
- characters: 角色数组（至少包含主角和反派）
  - name: 角色姓名
  - role: 角色类型（protagonist=主角, antagonist=反派, supporting=配角, minor=路人）
  - traits: 性格特征数组（3-5个）
  - background: 角色背景（1-2句话描述身世和动机）
  - abilities: 能力/技能数组（2-4个）
  - relationships: 与其他角色的关系（对象，键为角色名，值为关系描述）
  - arc: 角色弧光（角色从开始到结束的成长/变化轨迹）

角色设计应鲜明、有辨识度，避免脸谱化。为主角设计完整的成长弧光，为反派设计合理的动机。`;

    return prompt;
  }
}
