import { BaseAgent, type AgentContext, type AgentResult } from './base';
import type { Fact } from '../models/state';
import type { ChapterPlan } from './chapter-planner';
import { generateJSONWithValidation, type LLMOutputRule } from '../llm/output-validator';

// ─── Input / Output Types ───────────────────────────────────────

export interface ChapterSummarizerInput {
  chapterNumber: number;
  title: string;
  content: string;
  genre: string;
  plan?: ChapterPlan;
  extractedFacts: Fact[];
  prevSummary?: string;
}

export interface ChapterSummaryOutput {
  brief: string;
  detailed: string;
  keyEvents: string[];
  stateChanges: {
    characters: Array<{ name: string; change: string }>;
    relationships: Array<{ pair: string; change: string }>;
    world: Array<{ item: string; change: string }>;
  };
  emotionalArc: string;
  cliffhanger: string;
  hookImpact: string[];
  consistencyScore: number;
}

// ─── Agent ──────────────────────────────────────────────────────

export class ChapterSummarizer extends BaseAgent {
  readonly name = 'ChapterSummarizer';
  readonly temperature = 0.3;

  async execute(ctx: AgentContext): Promise<AgentResult> {
    const input = ctx.promptContext?.input as ChapterSummarizerInput | undefined;
    if (!input) {
      return { success: false, error: '缺少章节摘要输入' };
    }

    const validationError = this.#validate(input);
    if (validationError) {
      return { success: false, error: validationError };
    }

    const prompt = this.#buildPrompt(input);

    try {
      const rules: LLMOutputRule[] = [
        { field: 'brief', type: 'min_string_length', min: 10 },
        { field: 'detailed', type: 'min_string_length', min: 20 },
        { field: 'keyEvents', type: 'min_array_length', min: 1 },
        { field: 'emotionalArc', type: 'min_string_length', min: 2 },
        { field: 'cliffhanger', type: 'min_string_length', min: 2 },
        { field: 'consistencyScore', type: 'required' },
      ];

      const raw = await generateJSONWithValidation<ChapterSummaryOutput>(
        this.provider,
        prompt,
        rules,
        {
          temperature: this.temperature,
          maxTokens: 2048,
          agentName: this.name,
          retry: { maxRetries: 2, retryDelayMs: 500 },
        },
      );

      const output = this.#sanitizeOutput(raw);

      // 一致性校验：用 facts 验证摘要是否出现幻觉
      const validation = this.#validateConsistency(output, input.extractedFacts);
      if (!validation.valid && output.consistencyScore >= 70) {
        output.consistencyScore = Math.min(69, output.consistencyScore);
      }

      return { success: true, data: output };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: `章节摘要生成失败: ${message}` };
    }
  }

  // ── Validation ────────────────────────────────────────────────

  #validate(input: ChapterSummarizerInput): string | null {
    if (!input.content || input.content.trim().length === 0) {
      return '章节内容不能为空';
    }
    if (!input.genre || input.genre.trim().length === 0) {
      return '题材不能为空';
    }
    if (!input.chapterNumber || input.chapterNumber < 1) {
      return '章节号必须大于 0';
    }
    return null;
  }

  // ── Prompt Builder ────────────────────────────────────────────

  #buildPrompt(input: ChapterSummarizerInput): string {
    const contentForSummary =
      input.content.length > 6000
        ? input.content.substring(0, 6000) + '\n...(后文省略)'
        : input.content;

    const factsText =
      input.extractedFacts.length > 0
        ? input.extractedFacts.map((f) => `- [${f.confidence}] ${f.content}`).join('\n')
        : '（暂无已提取事实）';

    let prompt = `你是一位专业的小说审读编辑。请仔细阅读以下章节正文，生成一份结构化的章节摘要。摘要将用于：
1. 帮助作者快速回顾本章内容；
2. 作为后续章节的上下文参考，保证情节连贯。

## 章节信息

- **书名**: ${input.title}
- **章节**: 第 ${input.chapterNumber} 章
- **题材**: ${input.genre}`;

    if (input.plan) {
      prompt += `
- **原计划意图**: ${input.plan.intention}
- **原计划关键事件**: ${input.plan.keyEvents.join('；')}
- **情感节拍**: ${input.plan.emotionalBeat}`;
    }

    prompt += `

## 已提取事实清单（摘要必须与这些事实一致，禁止编造未出现的内容）

${factsText}`;

    if (input.prevSummary) {
      prompt += `

## 上一章摘要（用于检查衔接是否自然）

${input.prevSummary}`;
    }

    prompt += `

## 章节正文

${contentForSummary}

## 输出要求

请以 JSON 格式输出，包含以下字段：

- **brief**: 短摘要（50-80 字），供后续章节作为上下文注入。必须包含：谁+做了什么+结果/悬念。
- **detailed**: 详细摘要（150-250 字），供人类阅读。包含情节推进、人物变化、关键转折。
- **keyEvents**: 关键事件数组（3-5 条），每条用一句话描述本章内完成的动作。
- **stateChanges**: 状态变更对象
  - characters: 角色变化数组，每项 { name: "角色名", change: "具体变化" }
  - relationships: 关系变化数组，每项 { pair: "角色A/角色B", change: "关系如何改变" }
  - world: 世界状态变化数组，每项 { item: "物品/设定名", change: "如何变化" }
- **emotionalArc**: 情感弧线，用 2-4 个词描述本章情绪曲线，如"平静→紧张→释然"。
- **cliffhanger**: 结尾钩子（30-50 字），描述本章结尾如何引向下一章。
- **hookImpact**: 本章对哪些已有伏笔产生了推进或回应（字符串数组）。
- **consistencyScore**: 一致性自评 0-100。请对照「已提取事实清单」检查：摘要中每一句话是否都能在正文中找到依据？有无添加正文未提及的细节？

### 关键约束
1. **严禁幻觉**：摘要中提到的每个事实、每个角色行为，都必须在「已提取事实清单」或正文中能找到依据。
2. **严禁泄露后续**：只总结本章已发生的内容，不要预测未来情节。
3. **brief 必须极简**：后续章节会把它塞进上下文窗口，字数严格控制在 50-80 字。
4. **stateChanges 必须具体**：不要写"主角成长了"，要写"主角决定放弃退婚念头，主动调查父亲死因"。`;

    return prompt;
  }

  // ── Sanitize ──────────────────────────────────────────────────

  #sanitizeOutput(raw: Partial<ChapterSummaryOutput>): ChapterSummaryOutput {
    return {
      brief: raw.brief ?? '本章情节推进',
      detailed: raw.detailed ?? raw.brief ?? '本章情节推进',
      keyEvents:
        Array.isArray(raw.keyEvents) && raw.keyEvents.length > 0 ? raw.keyEvents : ['情节推进'],
      stateChanges: {
        characters: raw.stateChanges?.characters ?? [],
        relationships: raw.stateChanges?.relationships ?? [],
        world: raw.stateChanges?.world ?? [],
      },
      emotionalArc: raw.emotionalArc ?? '平稳',
      cliffhanger: raw.cliffhanger ?? '悬念待续',
      hookImpact: Array.isArray(raw.hookImpact) ? raw.hookImpact : [],
      consistencyScore:
        typeof raw.consistencyScore === 'number'
          ? Math.max(0, Math.min(100, raw.consistencyScore))
          : 0,
    };
  }

  // ── Consistency Validation ────────────────────────────────────

  #validateConsistency(
    output: ChapterSummaryOutput,
    facts: Fact[],
  ): { valid: boolean; issues: string[] } {
    const issues: string[] = [];
    const allText = `${output.brief} ${output.detailed} ${output.keyEvents.join(' ')}`;

    // 轻量启发式检查：如果 facts 中有明确提到的人名/物品名，摘要中应至少出现一次
    const factNames = new Set<string>();
    for (const f of facts) {
      const match = f.content.match(/([^，。！？\s]{2,6})(?:获得|发现|决定|得知|遇到)/);
      if (match) factNames.add(match[1]);
    }

    for (const name of factNames) {
      if (!allText.includes(name)) {
        issues.push(`摘要未提及事实中的关键实体「${name}」`);
      }
    }

    return { valid: issues.length === 0, issues };
  }
}

import { agentRegistry } from './registry';
agentRegistry.register('chapter-summarizer', (p) => new ChapterSummarizer(p));
