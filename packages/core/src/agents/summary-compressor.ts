import { BaseAgent, type AgentContext, type AgentResult } from './base';
import { generateJSONWithValidation, type LLMOutputRule } from '../llm/output-validator';

// ─── Input / Output Types ───────────────────────────────────────

export interface SummaryCompressorInput {
  /** 起始章节号 */
  startChapter: number;
  /** 结束章节号 */
  endChapter: number;
  /** 该区间内各章的 brief 摘要 */
  chapterSummaries: Array<{ chapter: number; brief: string; emotionalArc?: string | null }>;
  /** 题材 */
  genre: string;
  /** 书名 */
  title: string;
}

export interface SummaryCompressorOutput {
  /** 压缩后的卷轴概要（80-120 字） */
  arcSummary: string;
  /** 本区间覆盖的核心情节线 */
  plotThreads: string[];
  /** 本区间内主角的关键变化 */
  protagonistGrowth: string;
}

// ─── Agent ──────────────────────────────────────────────────────

export class SummaryCompressor extends BaseAgent {
  readonly name = 'SummaryCompressor';
  readonly temperature = 0.3;

  async execute(ctx: AgentContext): Promise<AgentResult> {
    const input = ctx.promptContext?.input as SummaryCompressorInput | undefined;
    if (!input) {
      return { success: false, error: '缺少摘要压缩输入' };
    }

    const validationError = this.#validate(input);
    if (validationError) {
      return { success: false, error: validationError };
    }

    const prompt = this.#buildPrompt(input);

    try {
      const rules: LLMOutputRule[] = [
        { field: 'arcSummary', type: 'min_string_length', min: 20 },
        { field: 'plotThreads', type: 'min_array_length', min: 1 },
        { field: 'protagonistGrowth', type: 'min_string_length', min: 5 },
      ];

      const raw = await generateJSONWithValidation<SummaryCompressorOutput>(
        this.provider,
        prompt,
        rules,
        {
          temperature: this.temperature,
          maxTokens: 1024,
          agentName: this.name,
          retry: { maxRetries: 1, retryDelayMs: 500 },
        },
      );

      const output = this.#sanitizeOutput(raw);
      return { success: true, data: output };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: `摘要压缩失败: ${message}` };
    }
  }

  // ── Validation ────────────────────────────────────────────────

  #validate(input: SummaryCompressorInput): string | null {
    if (!input.chapterSummaries || input.chapterSummaries.length === 0) {
      return '待压缩摘要列表不能为空';
    }
    if (!input.genre || input.genre.trim().length === 0) {
      return '题材不能为空';
    }
    return null;
  }

  // ── Prompt Builder ────────────────────────────────────────────

  #buildPrompt(input: SummaryCompressorInput): string {
    const count = input.chapterSummaries.length;

    const summariesText = input.chapterSummaries
      .map(
        (s) =>
          `- 第 ${s.chapter} 章：${s.brief}${s.emotionalArc ? ` [情感：${s.emotionalArc}]` : ''}`,
      )
      .join('\n');

    return `你是一位专业的小说编辑。请将以下连续 ${count} 章的摘要压缩成一段高度凝练的「卷轴概要」，用于长篇小说后续章节的远距上下文注入。

## 作品信息

- **书名**: ${input.title}
- **题材**: ${input.genre}
- **压缩区间**: 第 ${input.startChapter} 章 ~ 第 ${input.endChapter} 章

## 逐章摘要

${summariesText}

## 输出要求

请以 JSON 格式输出：

- **arcSummary**: 卷轴概要（80-120 字）。要求：
  - 只保留贯穿这 ${count} 章的核心情节线和人物变化；
  - 删除具体场景、对话、感官描写；
  - 必须能让没读过这 ${count} 章的写手理解「这段时间发生了什么」。
- **plotThreads**: 本区间覆盖的核心情节线数组（2-4 条），每条用一句话概括。
- **protagonistGrowth**: 主角在这 ${count} 章内的关键成长或转变（1-2 句话）。

### 关键约束
1. 卷轴概要不是流水账，是「提炼后的因果链」。
2. 禁止添加摘要列表中未提及的情节。
3. 字数严格控制在 80-120 字，因为它将被注入后续章节的上下文窗口。`;
  }

  // ── Sanitize ──────────────────────────────────────────────────

  #sanitizeOutput(raw: Partial<SummaryCompressorOutput>): SummaryCompressorOutput {
    return {
      arcSummary: raw.arcSummary ?? '情节推进中',
      plotThreads:
        Array.isArray(raw.plotThreads) && raw.plotThreads.length > 0
          ? raw.plotThreads
          : ['情节推进'],
      protagonistGrowth:
        raw.protagonistGrowth && raw.protagonistGrowth.trim().length > 0
          ? raw.protagonistGrowth
          : '主角持续成长',
    };
  }
}

import { agentRegistry } from './registry';
agentRegistry.register('summary-compressor', (p) => new SummaryCompressor(p));
