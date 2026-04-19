import { BaseAgent, type AgentContext, type AgentResult } from './base';

export interface OpenHook {
  description: string;
  type: string;
  priority: string;
  plantedChapter: number;
  expectedResolutionChapter?: number;
}

export interface HookAuditIssue {
  hookDescription: string;
  severity: 'critical' | 'warning' | 'suggestion';
  category: 'forgotten' | 'inconsistent' | 'overdue' | 'premature' | 'abandoned-without-reason';
  description: string;
  chaptersSinceMentioned: number;
  suggestion: string;
}

export interface HookSummary {
  planted: string[];
  progressed: string[];
  resolved: string[];
  abandoned: string[];
}

export interface HookAuditInput {
  chapterContent: string;
  chapterNumber: number;
  genre: string;
  openHooks?: OpenHook[];
  previouslyResolvedHooks?: string[];
}

export interface HookAuditOutput {
  issues: HookAuditIssue[];
  hookSummary: HookSummary;
  overallStatus: 'pass' | 'warning' | 'fail';
  summary: string;
}

const GENRE_HOOK_FOCUS: Record<string, string> = {
  xianxia: '仙侠：法宝/功法/身世的伏笔、宗门阴谋、师徒关系伏笔、秘境探险线索',
  fantasy: '玄幻：血脉传承伏笔、种族命运线索、地图探索伏笔、神器宿命',
  urban: '都市：人际关系伏笔、职场暗线、身世之谜、商业竞争伏笔',
  'sci-fi': '科幻：科技秘密伏笔、AI觉醒线索、外星文明信号、未来社会暗线',
  history: '历史：政治阴谋伏笔、历史人物命运、战争暗线、权谋布局',
  game: '游戏：隐藏任务线索、装备来历伏笔、对手背景伏笔、系统秘密',
  horror: '悬疑：线索伏笔、凶手身份暗示、时间线伏笔、反转铺垫',
  romance: '言情：情感误会伏笔、第三者暗线、家庭阻力伏笔、过去经历伏笔',
  fanfic: '同人：原作事件呼应、角色命运伏笔、时间线收束',
};

export class HookAuditor extends BaseAgent {
  readonly name = 'HookAuditor';
  readonly temperature = 0.2;

  async execute(ctx: AgentContext): Promise<AgentResult> {
    const input = ctx.promptContext?.input as HookAuditInput | undefined;
    if (!input) {
      return { success: false, error: '缺少伏笔审核输入' };
    }

    const validationError = this.#validate(input);
    if (validationError) {
      return { success: false, error: validationError };
    }

    const prompt = this.#buildPrompt(input);

    try {
      const result = await this.generateJSON<HookAuditOutput>(prompt);

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: `伏笔审核失败: ${message}` };
    }
  }

  #validate(input: HookAuditInput): string | null {
    if (!input.chapterContent || input.chapterContent.trim().length === 0) {
      return '章节内容不能为空';
    }
    if (!input.genre || input.genre.trim().length === 0) {
      return '题材不能为空';
    }
    return null;
  }

  #buildPrompt(input: HookAuditInput): string {
    const genreHint = GENRE_HOOK_FOCUS[input.genre] ?? '';
    const lines: string[] = [];

    lines.push(`你是一位专业的小说伏笔审核师。请审核以下章节中伏笔的埋设、推进和回收情况，找出被遗忘的伏笔、前后矛盾的伏笔以及不合理的伏笔处理。

## 基本信息

- **章节**: 第 ${input.chapterNumber} 章
- **题材**: ${input.genre}${genreHint ? `（${genreHint}）` : ''}`);

    if (input.openHooks && input.openHooks.length > 0) {
      lines.push(`
## 进行中伏笔

${input.openHooks.map((h) => `- [${h.priority}] ${h.description}（埋设于第 ${h.plantedChapter} 章${h.expectedResolutionChapter ? `，预期回收于第 ${h.expectedResolutionChapter} 章` : ''})`).join('\n')}`);
    }

    if (input.previouslyResolvedHooks && input.previouslyResolvedHooks.length > 0) {
      lines.push(`
## 已回收伏笔

${input.previouslyResolvedHooks.map((h) => `- ${h}`).join('\n')}`);
    }

    lines.push(`
## 审核内容

${input.chapterContent}

## 审核要求

请完成以下任务：

1. **检测伏笔埋设**：本章是否埋设了新的伏笔？
2. **检测伏笔推进**：本章是否对已有的伏笔有所推进或暗示？
3. **检测伏笔回收**：本章是否回收（解答/揭示）了已有伏笔？
4. **检测被遗忘的伏笔**：是否有伏笔超过5章未被提及或推进？
5. **检测伏笔不一致**：本章描述是否与已有伏笔设定矛盾？
6. **检测超期伏笔**：是否有伏笔超过了预期回收窗口仍未解决？
7. **检测过早回收**：是否有重要伏笔在铺垫不足的情况下就被回收？

## 输出要求

请以 JSON 格式输出审核结果：

{
  "issues": [
    {
      "hookDescription": "伏笔描述",
      "severity": "critical|warning|suggestion",
      "category": "forgotten|inconsistent|overdue|premature|abandoned-without-reason",
      "description": "问题描述",
      "chaptersSinceMentioned": 距离上次提及的章节数,
      "suggestion": "处理建议"
    }
  ],
  "hookSummary": {
    "planted": ["本章新埋设的伏笔"],
    "progressed": ["本章有所推进的伏笔"],
    "resolved": ["本章回收的伏笔"],
    "abandoned": ["被遗弃但未给出理由的伏笔"]
  },
  "overallStatus": "pass|warning|fail",
  "summary": "审核总结（1-2句话）"
}

问题类别：
- forgotten：伏笔被遗忘（超过5章未提及）
- inconsistent：伏笔前后矛盾
- overdue：伏笔超期未回收
- premature：伏笔回收过早
- abandoned-without-reason：伏笔被遗弃但未给出合理理由

overallStatus：
- pass：伏笔管理良好，无明显问题
- warning：存在需要注意的伏笔问题
- fail：存在严重的伏笔不一致或遗漏`);

    return lines.join('\n');
  }
}
