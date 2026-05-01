import { BaseAgent, type AgentContext, type AgentResult } from './base';
import { generateJSONWithValidation, type LLMOutputRule } from '../llm/output-validator';
import { GENRE_CHARACTER_GUIDANCE as GENRE_GUIDANCE, GENRE_CONSTRAINTS } from './genre-guidance';

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
    const eraContext = ctx.promptContext?.eraContext as string | undefined;
    const prompt = this.#buildPrompt(brief, outline, eraContext);

    try {
      const CHARACTER_RULES: LLMOutputRule[] = [
        { field: 'characters', type: 'min_array_length', min: brief.characterCount ?? 2 },
      ];

      const result = await generateJSONWithValidation<CharacterDesignResult>(
        this.provider,
        prompt,
        CHARACTER_RULES,
        {
          temperature: this.temperature,
          agentName: this.name,
          retry: { maxRetries: 2, retryDelayMs: 500 },
        },
      );

      // 兜底：确保角色列表不为空
      if (!Array.isArray(result.characters) || result.characters.length === 0) {
        result.characters = [
          {
            name: '主角',
            role: 'protagonist',
            traits: ['坚韧', '机智'],
            background: '穿越到新世界的现代人',
            abilities: ['适应力强', '善于利用资源'],
            relationships: {},
            arc: '从迷茫到坚定，逐步成长为真正的强者',
          },
        ];
      }

      const normalized = result.characters.map((char) => ({
        ...char,
        name: !char.name || char.name.trim().length === 0 ? '无名角色' : char.name,
        role: char.role || 'supporting',
        traits:
          !Array.isArray(char.traits) || char.traits.length === 0 ? ['性格待定'] : char.traits,
        arc: !char.arc || char.arc.trim().length === 0 ? '角色成长轨迹待展开' : char.arc,
      }));

      return { success: true, data: { ...result, characters: normalized } };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: `LLM 调用失败: ${message}` };
    }
  }

  #buildPrompt(brief: CharacterDesignBrief, outline?: string, eraContext?: string): string {
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

    const constraints = GENRE_CONSTRAINTS[brief.genre];
    if (constraints && constraints.length > 0) {
      prompt += `

## 题材约束

${brief.genre === 'history' && eraContext ? `本书设定在以下历史时期：${eraContext}\n\n` : ''}角色设计必须严格遵循以下${brief.genre}题材规则：
${constraints.map((c) => `- ${c}`).join('\n')}`;
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

import { agentRegistry } from './registry';
agentRegistry.register('character', (p) => new CharacterDesigner(p));
