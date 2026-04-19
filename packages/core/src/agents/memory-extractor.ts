import { BaseAgent, type AgentContext, type AgentResult } from './base';

export interface MemoryInput {
  chapterContent: string;
  chapterNumber: number;
  genre: string;
  existingFacts?: string[];
  openHooks?: string[];
  knownCharacters?: string[];
}

export interface RelationshipChange {
  character: string;
  relatedTo: string;
  relationship: string;
}

export interface HookProgress {
  hookDescription: string;
  progress: string;
}

export interface MemoryOutput {
  newFacts: string[];
  relationshipChanges: RelationshipChange[];
  hookProgress: HookProgress[];
  characterDevelopment: string[];
  worldbuildingAdditions: string[];
  chapterNumber: number;
}

const GENRE_GUIDANCE: Record<string, string> = {
  xianxia: '仙侠：关注修炼境界变化、宗门归属、法宝获得、师徒关系、灵力突破',
  fantasy: '玄幻：关注能力觉醒、种族互动、地图探索、血脉发现',
  urban: '都市：关注人际关系发展、职位变化、社会资源获取、现实事件',
  'sci-fi': '科幻：关注科技发现、新星球/技术、AI交互、社会制度变化',
  history: '历史：关注政治立场变化、历史事件参与、人脉关系、权力地位',
  game: '游戏：关注等级突破、副本成就、装备获得、公会关系',
  horror: '悬疑：关注新线索发现、嫌疑人动向、时间线变化、动机揭示',
  romance: '言情：关注情感进展、误会与和解、关系定义、心理变化',
  fanfic: '同人：关注原作事件呼应、角色互动、时间线对齐',
};

export class MemoryExtractor extends BaseAgent {
  readonly name = 'MemoryExtractor';
  readonly temperature = 0.3;

  async execute(ctx: AgentContext): Promise<AgentResult> {
    const input = ctx.promptContext?.input as MemoryInput | undefined;
    if (!input) {
      return { success: false, error: '缺少记忆提取输入' };
    }

    const validationError = this.#validate(input);
    if (validationError) {
      return { success: false, error: validationError };
    }

    const prompt = this.#buildPrompt(input);

    try {
      const result = await this.generateJSON<{
        newFacts: string[];
        relationshipChanges: RelationshipChange[];
        hookProgress: HookProgress[];
        characterDevelopment: string[];
        worldbuildingAdditions: string[];
      }>(prompt);

      return {
        success: true,
        data: {
          ...result,
          chapterNumber: input.chapterNumber,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: `记忆提取失败: ${message}` };
    }
  }

  #validate(input: MemoryInput): string | null {
    if (!input.chapterContent || input.chapterContent.trim().length === 0) {
      return '章节内容不能为空';
    }
    if (!input.genre || input.genre.trim().length === 0) {
      return '题材不能为空';
    }
    return null;
  }

  #buildPrompt(input: MemoryInput): string {
    const genreHint = GENRE_GUIDANCE[input.genre] ?? '';
    const lines: string[] = [];

    lines.push(`你是一位专业的小说记忆提取师。请从以下章节内容中提取关键记忆信息，供后续章节参考。

## 基本信息

- **章节**: 第 ${input.chapterNumber} 章
- **题材**: ${input.genre}${genreHint ? `（${genreHint}）` : ''}`);

    if (input.existingFacts && input.existingFacts.length > 0) {
      lines.push(`
## 已有事实

${input.existingFacts.map((f) => `- ${f}`).join('\n')}`);
    }

    if (input.openHooks && input.openHooks.length > 0) {
      lines.push(`
## 进行中伏笔

${input.openHooks.map((h) => `- ${h}`).join('\n')}`);
    }

    if (input.knownCharacters && input.knownCharacters.length > 0) {
      lines.push(`
## 已知角色

${input.knownCharacters.join('、')}`);
    }

    lines.push(`
## 章节内容

${input.chapterContent}

## 提取要求

请以 JSON 格式输出以下五类记忆信息：

{
  "newFacts": ["本章新出现的事实1", "事实2"],
  "relationshipChanges": [{"character": "角色名", "relatedTo": "关联角色", "relationship": "关系描述"}],
  "hookProgress": [{"hookDescription": "伏笔描述", "progress": "进展说明"}],
  "characterDevelopment": ["角色发展1", "发展2"],
  "worldbuildingAdditions": ["世界观补充1", "补充2"]
}

注意：
- newFacts：提取章节中新出现的、需要在后续章节记住的事实
- relationshipChanges：本章新建立或改变的角色关系
- hookProgress：本章对进行中伏笔的推进或回应
- characterDevelopment：角色在本章的成长、变化或决定
- worldbuildingAdditions：本章新增的世界观/设定信息

如果某类别没有内容，请返回空数组。`);

    return lines.join('\n');
  }
}
