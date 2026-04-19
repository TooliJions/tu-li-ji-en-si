import { BaseAgent, type AgentContext, type AgentResult } from './base';

export interface EntityRecord {
  name: string;
  type: 'character' | 'location' | 'item' | 'organization';
  status: 'registered' | 'unregistered' | 'ghost';
}

export interface EntityIssue {
  entity: string;
  type: string;
  severity: 'critical' | 'warning';
  description: string;
  suggestion: string;
}

export interface AuditInput {
  chapterContent: string;
  chapterNumber: number;
  genre: string;
  registeredCharacters?: string[];
  registeredLocations?: string[];
  registeredItems?: string[];
  registeredOrganizations?: string[];
}

export interface AuditOutput {
  issues: EntityIssue[];
  detectedEntities: EntityRecord[];
  overallStatus: 'pass' | 'warning' | 'fail';
  summary: string;
}

const GENRE_ENTITY_TYPES: Record<string, string> = {
  xianxia:
    '仙侠：角色（修士/凡人/灵兽）、地点（宗门/秘境/仙山）、物品（法宝/灵药/法器）、组织（宗门/世家/势力）',
  fantasy:
    '玄幻：角色（种族/职业）、地点（王国/遗迹/魔法学院）、物品（神器/魔法道具）、组织（公会/种族联盟）',
  urban: '都市：角色（人物身份）、地点（城市/建筑）、物品（现实物品）、组织（公司/机构）',
  'sci-fi':
    '科幻：角色（人类/AI/外星种族）、地点（星球/空间站）、物品（科技装备）、组织（星际联邦/企业）',
  history: '历史：角色（历史人物）、地点（城池/宫殿）、物品（历史器物）、组织（朝代/派系）',
  game: '游戏：角色（玩家/NPC）、地点（副本/主城）、物品（装备/道具）、组织（公会/阵营）',
  horror: '悬疑：角色（嫌疑人/受害者）、地点（案发现场）、物品（线索物品）、组织（秘密组织）',
  romance: '言情：角色（主要人物）、地点（场景）、物品（信物）、组织（公司/学校）',
  fanfic: '同人：原作角色、原作地点、原作物品、原作组织',
};

export class EntityAuditor extends BaseAgent {
  readonly name = 'EntityAuditor';
  readonly temperature = 0.1;

  async execute(ctx: AgentContext): Promise<AgentResult> {
    const input = ctx.promptContext?.input as AuditInput | undefined;
    if (!input) {
      return { success: false, error: '缺少实体审核输入' };
    }

    const validationError = this.#validate(input);
    if (validationError) {
      return { success: false, error: validationError };
    }

    const prompt = this.#buildPrompt(input);

    try {
      const result = await this.generateJSON<AuditOutput>(prompt);

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: `实体审核失败: ${message}` };
    }
  }

  #validate(input: AuditInput): string | null {
    if (!input.chapterContent || input.chapterContent.trim().length === 0) {
      return '章节内容不能为空';
    }
    if (!input.genre || input.genre.trim().length === 0) {
      return '题材不能为空';
    }
    return null;
  }

  #buildPrompt(input: AuditInput): string {
    const genreHint = GENRE_ENTITY_TYPES[input.genre] ?? '';
    const lines: string[] = [];

    lines.push(`你是一位专业的小说实体审核师。请从以下章节中提取所有出现的实体（角色、地点、物品、组织），并与已有的注册实体列表进行对比，找出未注册或异常的实体。

## 基本信息

- **章节**: 第 ${input.chapterNumber} 章
- **题材**: ${input.genre}${genreHint ? `（${genreHint}）` : ''}`);

    // Registered entities
    if (input.registeredCharacters && input.registeredCharacters.length > 0) {
      lines.push(`
## 已注册角色

${input.registeredCharacters.map((c) => `- ${c}`).join('\n')}`);
    }

    if (input.registeredLocations && input.registeredLocations.length > 0) {
      lines.push(`
## 已注册地点

${input.registeredLocations.map((l) => `- ${l}`).join('\n')}`);
    }

    if (input.registeredItems && input.registeredItems.length > 0) {
      lines.push(`
## 已注册物品

${input.registeredItems.map((i) => `- ${i}`).join('\n')}`);
    }

    if (input.registeredOrganizations && input.registeredOrganizations.length > 0) {
      lines.push(`
## 已注册组织

${input.registeredOrganizations.map((o) => `- ${o}`).join('\n')}`);
    }

    lines.push(`
## 审核内容

${input.chapterContent}

## 审核要求

请完成以下任务：

1. 从章节内容中提取所有出现的命名实体（角色名、地名、物品名、组织名）
2. 将提取的实体与上述已注册列表进行对比
3. 标记每个实体的状态：registered（已注册）、unregistered（未注册）、ghost（幽灵实体——可能引用了已删除的实体）

## 输出要求

请以 JSON 格式输出审核结果：

{
  "issues": [
    {
      "entity": "实体名称",
      "type": "character|location|item|organization",
      "severity": "critical|warning",
      "description": "问题描述",
      "suggestion": "建议处理方式"
    }
  ],
  "detectedEntities": [
    {
      "name": "实体名称",
      "type": "character|location|item|organization",
      "status": "registered|unregistered|ghost"
    }
  ],
  "overallStatus": "pass|warning|fail",
  "summary": "审核总结（1-2句话）"
}

severity 分级：
- critical：幽灵实体（引用了已删除的实体）
- warning：未注册实体（新增但未在注册表中登记）

overallStatus：
- pass：所有实体均已注册，无问题
- warning：存在未注册实体
- fail：存在幽灵实体或严重实体问题`);

    return lines.join('\n');
  }
}
