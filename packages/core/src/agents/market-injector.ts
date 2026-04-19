import { BaseAgent, type AgentContext, type AgentResult } from './base';

export interface MarketSuggestion {
  element: string;
  type: 'hook' | 'satisfaction' | 'emotional' | 'conflict' | 'mystery' | 'pacing' | 'character';
  description: string;
  insertPosition: 'early-chapter' | 'mid-chapter' | 'chapter-end' | 'dialogue' | 'narration';
  expectedImpact: number;
}

export interface MarketInput {
  chapterContent: string;
  chapterNumber: number;
  genre: string;
  marketTrends?: string[];
  targetAudience?: string;
}

export interface MarketOutput {
  suggestions: MarketSuggestion[];
  marketAlignment: number;
  overallStatus: 'pass' | 'suggestion';
  summary: string;
}

const GENRE_MARKET_FOCUS: Record<string, string> = {
  xianxia: '仙侠：金手指/升级流/打脸爽点、扮猪吃虎、师徒互动、秘境探险、宗门斗争',
  fantasy: '玄幻：血脉觉醒、越级战斗、种族宿命、神器传承、地图探索',
  urban: '都市：逆袭爽点、职场升职、身世揭秘、商战博弈、人际关系',
  'sci-fi': '科幻：科技突破、AI觉醒、未来社会、星际探索、科技伦理冲突',
  history: '历史：权谋博弈、逆袭翻盘、历史人物互动、战争谋略',
  game: '游戏：隐藏任务、装备获取、对手碾压、排行榜竞争、系统升级',
  horror: '悬疑：反转铺垫、凶手暗示、时间线错位、心理惊悚、线索揭示',
  romance: '言情：甜宠互动、误会解除、第三者危机、家庭阻力、情感升温',
  fanfic: '同人：原作彩蛋、角色互动、时间线收束、跨作品联动',
};

export class MarketInjector extends BaseAgent {
  readonly name = 'MarketInjector';
  readonly temperature = 0.7;

  async execute(ctx: AgentContext): Promise<AgentResult> {
    const input = ctx.promptContext?.input as MarketInput | undefined;
    if (!input) {
      return { success: false, error: '缺少市场元素输入' };
    }

    const validationError = this.#validate(input);
    if (validationError) {
      return { success: false, error: validationError };
    }

    const prompt = this.#buildPrompt(input);

    try {
      const result = await this.generateJSON<MarketOutput>(prompt);

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: `市场元素注入失败: ${message}` };
    }
  }

  #validate(input: MarketInput): string | null {
    if (!input.chapterContent || input.chapterContent.trim().length === 0) {
      return '章节内容不能为空';
    }
    if (!input.genre || input.genre.trim().length === 0) {
      return '题材不能为空';
    }
    return null;
  }

  #buildPrompt(input: MarketInput): string {
    const genreHint = GENRE_MARKET_FOCUS[input.genre] ?? '';
    const lines: string[] = [];

    lines.push(`你是一位专业的网络小说市场元素分析。请分析以下章节内容，识别缺失的市场热门元素，并建议可以插入的吸引力元素以提升读者粘性和阅读量。

## 基本信息

- **章节**: 第 ${input.chapterNumber} 章
- **题材**: ${input.genre}${genreHint ? `（${genreHint}）` : ''}`);

    if (input.marketTrends && input.marketTrends.length > 0) {
      lines.push(`
## 当前市场趋势

${input.marketTrends.map((t) => `- ${t}`).join('\n')}`);
    }

    if (input.targetAudience) {
      lines.push(`
## 目标读者群

${input.targetAudience}`);
    }

    lines.push(`
## 本章内容

${input.chapterContent}

## 分析维度

请从以下维度分析市场元素的缺失和建议：

1. **爽点设计**（satisfaction）：打脸/逆袭/越级战斗/扮猪吃虎等让读者感到爽快的元素
2. **悬念钩子**（hook）：章末悬念、未解之谜、暗示等吸引读者继续阅读的元素
3. **情感共鸣**（emotional）：师徒/友情/亲情/爱情等能引起读者情感共鸣的元素
4. **冲突升级**（conflict）：矛盾激化、反派威胁、危机临近等推动情节的元素
5. **悬疑铺垫**（mystery）：身份暗示、秘密揭示、时间线错位等制造悬疑感的元素
6. **节奏优化**（pacing）：是否需要加快或放慢节奏以适应市场偏好
7. **角色魅力**（character）：角色个性化言行、标志动作、口头禅等增强角色魅力的元素

## 输出要求

请以 JSON 格式输出分析结果：

{
  "suggestions": [
    {
      "element": "元素名称",
      "type": "元素类型",
      "description": "建议描述",
      "insertPosition": "建议插入位置",
      "expectedImpact": 预期影响力(0-100)
    }
  ],
  "marketAlignment": 当前章节市场适配度(0-100),
  "overallStatus": "pass|suggestion",
  "summary": "分析总结（1-2句话）"
}

insertPosition 可选值：
- early-chapter：章节开头
- mid-chapter：章节中部
- chapter-end：章节末尾（适合悬念钩子）
- dialogue：对话中
- narration：叙述中

marketAlignment 评分：
- 80-100：市场适配度优秀，当前元素已足够
- 60-79：市场适配度良好，有少量优化空间
- 40-59：市场适配度一般，建议补充热门元素
- 0-39：市场适配度较差，需要显著增加吸引力

overallStatus：
- pass：marketAlignment >= 70，无需额外建议
- suggestion：marketAlignment < 70，有改进建议

注意：如果章节已具有良好的市场元素，suggestions 可以为空数组。`);

    return lines.join('\n');
  }
}
