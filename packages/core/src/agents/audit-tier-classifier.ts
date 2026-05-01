import { BaseAgent, type AgentContext, type AgentResult } from './base';
import { z } from 'zod';

export interface ClassifiedIssue {
  description: string;
  tier: 'blocker' | 'warning' | 'suggestion';
  category: string;
  severity: 'critical' | 'warning' | 'suggestion';
  suggestion: string;
}

export interface TierSummary {
  blocker: number;
  warning: number;
  suggestion: number;
}

export interface AuditInput {
  chapterContent: string;
  chapterNumber: number;
  genre: string;
  existingAuditResults?: string[];
}

export interface AuditOutput {
  classified: ClassifiedIssue[];
  tierSummary: TierSummary;
  overallVerdict: 'pass' | 'warning' | 'fail';
  summary: string;
}

const AuditOutputSchema = z
  .object({
    classified: z.array(
      z
        .object({
          description: z.string(),
          tier: z.enum(['blocker', 'warning', 'suggestion']),
          category: z.string(),
          severity: z.enum(['critical', 'warning', 'suggestion']),
          suggestion: z.string(),
        })
        .passthrough(),
    ),
    tierSummary: z
      .object({
        blocker: z.number(),
        warning: z.number(),
        suggestion: z.number(),
      })
      .passthrough(),
    overallVerdict: z.enum(['pass', 'warning', 'fail']),
    summary: z.string(),
  })
  .passthrough();

const GENRE_AUDIT_FOCUS: Record<string, string> = {
  xianxia: '仙侠：事实一致性（功法/境界/法宝设定）、人物关系、门派设定、世界观规则',
  fantasy: '玄幻：种族设定、血脉传承、地图设定、能力体系一致性',
  urban: '都市：人物身份、职场设定、社会关系、时间线一致性',
  'sci-fi': '科幻：科技设定、物理规则、时间线、AI能力边界',
  history: '历史：历史事件、人物身份、官职制度、地理设定',
  game: '游戏：系统规则、数据设定、任务逻辑、装备属性',
  horror: '悬疑：线索逻辑、时间线、凶手行为合理性、反转铺垫',
  romance: '言情：人物性格、情感发展逻辑、关系变化合理性',
  fanfic: '同人：原作设定、角色性格、时间线收束',
};

export class AuditTierClassifier extends BaseAgent {
  readonly name = 'AuditTierClassifier';
  readonly temperature = 0.2;

  async execute(ctx: AgentContext): Promise<AgentResult> {
    const input = ctx.promptContext?.input as AuditInput | undefined;
    if (!input) {
      return { success: false, error: '缺少审计分级输入' };
    }

    const validationError = this.#validate(input);
    if (validationError) {
      return { success: false, error: validationError };
    }

    const prompt = this.#buildPrompt(input);

    try {
      const result = await this.generateJSONWithSchema<AuditOutput>(prompt, AuditOutputSchema);

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: `审计分级失败: ${message}` };
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
    const genreHint = GENRE_AUDIT_FOCUS[input.genre] ?? '';
    const lines: string[] = [];

    lines.push(`你是一位专业的审计分级分类器。请分析以下章节内容及已有审计结果，将所有发现的问题按照严重程度分为三个层级：阻断级、警告级、建议级。

## 基本信息

- **章节**: 第 ${input.chapterNumber} 章
- **题材**: ${input.genre}${genreHint ? `（${genreHint}）` : ''}`);

    if (input.existingAuditResults && input.existingAuditResults.length > 0) {
      lines.push(`
## 已有审计结果

${input.existingAuditResults.map((r) => `- ${r}`).join('\n')}`);
    }

    lines.push(`
## 本章内容

${input.chapterContent}

## 分级标准

### 阻断级（blocker）— 必须修复，否则章节不能通过
- 事实矛盾（与已有设定/伏笔/世界观冲突）
- 逻辑错误（时间线矛盾、人物行为不合理）
- 角色身份混乱（名字/身份/关系不一致）
- 严重偏离大纲（与本章预期内容严重不符）
- 合规问题（违规内容、版权风险）

### 警告级（warning）— 建议修复，但章节可通过
- 节奏问题（过快/过慢、段落单调）
- 风格不一致（语气突变、叙事视角混乱）
- 句式重复（连续使用相同句式）
- 描写不足或缺乏细节
- 对话生硬或缺乏个性

### 建议级（suggestion）— 可选优化
- 可增加环境描写增强氛围
- 可优化用词或修辞
- 可增加人物心理活动
- 可调整段落顺序提升流畅度
- 其他提升阅读体验的建议

## 输出要求

请以 JSON 格式输出分类结果：

{
  "classified": [
    {
      "description": "问题描述",
      "tier": "blocker|warning|suggestion",
      "category": "问题类别",
      "severity": "critical|warning|suggestion",
      "suggestion": "修复建议"
    }
  ],
  "tierSummary": {
    "blocker": 阻断级数量,
    "warning": 警告级数量,
    "suggestion": 建议级数量
  },
  "overallVerdict": "pass|warning|fail",
  "summary": "审计总结（1-2句话）"
}

overallVerdict 判定规则：
- fail：存在至少1个阻断级问题
- warning：无阻断级，但有至少1个警告级问题
- pass：仅有建议级问题或无任何问题`);

    return lines.join('\n');
  }
}

import { agentRegistry } from './registry';
agentRegistry.register('audit-tier-classifier', (p) => new AuditTierClassifier(p));
