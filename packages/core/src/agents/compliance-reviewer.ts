import { BaseAgent, type AgentContext, type AgentResult } from './base';
import { z } from 'zod';

export interface ComplianceIssueLocation {
  paragraph?: number;
  sentence?: number;
  quote?: string;
}

export interface ComplianceIssue {
  category:
    | 'violence'
    | 'explicit'
    | 'political'
    | 'copyright'
    | 'sensitive-topic'
    | 'discrimination'
    | 'illegal-activity';
  severity: 'critical' | 'warning' | 'suggestion';
  description: string;
  location: ComplianceIssueLocation;
  suggestion: string;
}

export interface ComplianceInput {
  chapterContent: string;
  chapterNumber: number;
  genre: string;
  platformRules?: string[];
}

export interface ComplianceOutput {
  issues: ComplianceIssue[];
  riskLevel: 'low' | 'medium' | 'high';
  overallStatus: 'pass' | 'warning' | 'fail';
  summary: string;
}

const ComplianceOutputSchema = z
  .object({
    issues: z.array(
      z
        .object({
          category: z.enum([
            'violence',
            'explicit',
            'political',
            'copyright',
            'sensitive-topic',
            'discrimination',
            'illegal-activity',
          ]),
          severity: z.enum(['critical', 'warning', 'suggestion']),
          description: z.string(),
          location: z
            .object({
              paragraph: z.number().optional(),
              sentence: z.number().optional(),
              quote: z.string().optional(),
            })
            .passthrough(),
          suggestion: z.string(),
        })
        .passthrough(),
    ),
    riskLevel: z.enum(['low', 'medium', 'high']),
    overallStatus: z.enum(['pass', 'warning', 'fail']),
    summary: z.string(),
  })
  .passthrough();

const GENRE_COMPLIANCE_FOCUS: Record<string, string> = {
  xianxia: '仙侠：战斗场景的暴力程度描写、门派斗争的尺度、修炼描写是否涉及不当内容',
  fantasy: '玄幻：种族描写的刻板印象问题、战争场面的暴力程度、黑暗元素的尺度',
  urban: '都市：职场潜规则描写、社会问题涉及、犯罪手法的具体程度',
  'sci-fi': '科幻：科技伦理问题、AI歧视描写、反乌托邦元素',
  history: '历史：历史事件的政治敏感性、战争描写的残酷程度、民族关系',
  game: '游戏：虚拟暴力的描写程度、赌博元素的呈现',
  horror: '悬疑：恐怖元素的尺度、血腥描写、心理惊悚的程度',
  romance: '言情：亲密关系描写的尺度、权力不对等关系的呈现',
  fanfic: '同人：原作版权合规性、角色二次创作的边界',
};

export class ComplianceReviewer extends BaseAgent {
  readonly name = 'ComplianceReviewer';
  readonly temperature = 0.1;

  async execute(ctx: AgentContext): Promise<AgentResult> {
    const input = ctx.promptContext?.input as ComplianceInput | undefined;
    if (!input) {
      return { success: false, error: '缺少合规审核输入' };
    }

    const validationError = this.#validate(input);
    if (validationError) {
      return { success: false, error: validationError };
    }

    const prompt = this.#buildPrompt(input);

    try {
      const result = await this.generateJSONWithSchema<ComplianceOutput>(
        prompt,
        ComplianceOutputSchema,
      );

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: `合规审核失败: ${message}` };
    }
  }

  #validate(input: ComplianceInput): string | null {
    if (!input.chapterContent || input.chapterContent.trim().length === 0) {
      return '章节内容不能为空';
    }
    return null;
  }

  #buildPrompt(input: ComplianceInput): string {
    const genreHint = GENRE_COMPLIANCE_FOCUS[input.genre] ?? '';
    const lines: string[] = [];

    lines.push(`你是一位专业的内容合规审核师。请审核以下章节内容，检查是否存在违反内容安全规范、平台规则或法律法规的元素。

## 基本信息

- **章节**: 第 ${input.chapterNumber} 章
- **题材**: ${input.genre}${genreHint ? `（${genreHint}）` : ''}`);

    if (input.platformRules && input.platformRules.length > 0) {
      lines.push(`
## 平台特定规则

${input.platformRules.map((r) => `- ${r}`).join('\n')}`);
    }

    lines.push(`
## 审核内容

${input.chapterContent}

## 审核范围

请检查以下类别的合规风险：

1. **暴力描写**（violence）：过度血腥、残忍的暴力场景、虐待描写
2. **不当内容**（explicit）：色情或性暗示内容、过度亲密描写
3. **政治敏感**（political）：涉及现实政治人物或事件、敏感议题
4. **版权风险**（copyright）：未经授权引用他人作品、商标名或版权内容
5. **敏感话题**（sensitive-topic）：宗教、种族、性别等敏感议题的不当处理
6. **歧视内容**（discrimination）：对特定群体的歧视性描写或刻板印象
7. **违法行为**（illegal-activity）：具体犯罪手法的详细描写、违法教程

## 输出要求

请以 JSON 格式输出审核结果：

{
  "issues": [
    {
      "category": "问题类别",
      "severity": "critical|warning|suggestion",
      "description": "问题描述",
      "location": { "paragraph": 段落号, "quote": "原文引用" },
      "suggestion": "修改建议"
    }
  ],
  "riskLevel": "low|medium|high",
  "overallStatus": "pass|warning|fail",
  "summary": "审核总结（1-2句话）"
}

severity 分级：
- critical：必须修改的违规内容（暴力、色情、政治敏感等）
- warning：可能存在风险的内容（建议调整表述）
- suggestion：可选优化（降低潜在争议）

riskLevel：
- low：整体安全，无显著风险
- medium：存在需要注意的潜在风险
- high：存在明确的合规问题，需要修改

overallStatus：
- pass：通过，可发布
- warning：通过但有风险项，建议修改
- fail：不通过，必须修改`);

    return lines.join('\n');
  }
}

import { agentRegistry } from './registry';
agentRegistry.register('compliance-reviewer', (p) => new ComplianceReviewer(p));
