import { BaseAgent, type AgentContext, type AgentResult } from './base';

export interface FactConflict {
  fact: string;
  contradiction: string;
  severity: 'critical' | 'warning';
  suggestion: string;
}

export interface FactCheckInput {
  chapterContent: string;
  chapterNumber: number;
  genre: string;
  establishedFacts?: string[];
  characterProfiles?: Array<{ name: string; role: string; traits: string[] }>;
  worldRules?: string[];
  openHooks?: string[];
}

export interface FactCheckOutput {
  conflicts: FactConflict[];
  verifiedFacts: string[];
  overallStatus: 'pass' | 'warning' | 'fail';
  summary: string;
}

const GENRE_FOCUS: Record<string, string> = {
  xianxia: '仙侠：修炼境界一致性、宗门势力设定、法宝/灵药设定、师徒关系',
  fantasy: '玄幻：种族设定一致性、魔法体系规则、血脉传承设定、世界地理',
  urban: '都市：现实逻辑一致性、职业设定、社会关系、时间线',
  'sci-fi': '科幻：科技设定自洽性、未来社会规则、AI行为逻辑、物理法则',
  history: '历史：历史时间线准确性、人物考据、政治格局、时代风貌',
  game: '游戏：游戏机制一致性、等级体系、副本规则、装备设定',
  horror: '悬疑：线索一致性、时间线逻辑、人物动机、伏笔前后呼应',
  romance: '言情：情感发展逻辑、角色心理一致性、关系进展合理性',
  fanfic: '同人：原作正典一致性、角色性格还原、时间线对齐',
};

export class FactChecker extends BaseAgent {
  readonly name = 'FactChecker';
  readonly temperature = 0.1;

  async execute(ctx: AgentContext): Promise<AgentResult> {
    const input = ctx.promptContext?.input as FactCheckInput | undefined;
    if (!input) {
      return { success: false, error: '缺少事实核查输入' };
    }

    const validationError = this.#validate(input);
    if (validationError) {
      return { success: false, error: validationError };
    }

    const prompt = this.#buildPrompt(input);

    try {
      const result = await this.generateJSON<FactCheckOutput>(prompt);

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: `事实核查失败: ${message}` };
    }
  }

  #validate(input: FactCheckInput): string | null {
    if (!input.chapterContent || input.chapterContent.trim().length === 0) {
      return '章节内容不能为空';
    }
    if (!input.genre || input.genre.trim().length === 0) {
      return '题材不能为空';
    }
    return null;
  }

  #buildPrompt(input: FactCheckInput): string {
    const genreHint = GENRE_FOCUS[input.genre] ?? '';
    const lines: string[] = [];

    lines.push(`你是一位专业的小说事实核查师。请将以下章节内容与已有的设定进行对比，找出任何事实冲突或不一致之处。

## 基本信息

- **章节**: 第 ${input.chapterNumber} 章
- **题材**: ${input.genre}${genreHint ? `（${genreHint}）` : ''}`);

    if (input.establishedFacts && input.establishedFacts.length > 0) {
      lines.push(`
## 已有事实

${input.establishedFacts.map((f) => `- ${f}`).join('\n')}`);
    }

    if (input.characterProfiles && input.characterProfiles.length > 0) {
      lines.push(`
## 角色档案

${input.characterProfiles.map((c) => `- ${c.name}（${c.role}）：性格 ${c.traits.join('、')}`).join('\n')}`);
    }

    if (input.worldRules && input.worldRules.length > 0) {
      lines.push(`
## 世界规则

${input.worldRules.map((r) => `- ${r}`).join('\n')}`);
    }

    if (input.openHooks && input.openHooks.length > 0) {
      lines.push(`
## 进行中伏笔

${input.openHooks.map((h) => `- ${h}`).join('\n')}`);
    }

    lines.push(`
## 待核查内容

${input.chapterContent}

## 核查要求

请将章节内容与上述已有设定进行逐项对比，检查以下方面：

1. **世界设定一致性**：修炼体系/科技规则/魔法系统等是否与已有规则冲突
2. **角色一致性**：角色姓名/身份/性格/关系是否与档案一致
3. **时间线一致性**：事件发生顺序是否合理，是否与已有事实矛盾
4. **伏笔一致性**：对伏笔的描述是否与之前设定一致
5. **新增事实**：本章是否引入了新的事实（需要记录）

## 输出要求

请以 JSON 格式输出核查结果：

{
  "conflicts": [
    {
      "fact": "冲突的已有事实",
      "contradiction": "文中的矛盾之处",
      "severity": "critical|warning",
      "suggestion": "修改建议"
    }
  ],
  "verifiedFacts": ["在本章中得到验证的事实列表"],
  "overallStatus": "pass|warning|fail",
  "summary": "核查总结（1-2句话）"
}

severity 分级：
- critical：世界规则冲突、角色身份矛盾（必须修复）
- warning：细节不一致、轻微的逻辑问题（建议修复）

如果没有冲突，conflicts 返回空数组，overallStatus 为 "pass"。`);

    return lines.join('\n');
  }
}
