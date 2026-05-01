import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ChapterSummarizer,
  type ChapterSummarizerInput,
  type ChapterSummaryOutput,
} from './chapter-summarizer';
import type { LLMProvider } from '../llm/provider';
import type { Fact } from '../models/state';

function createMockProvider(): LLMProvider & {
  generate: ReturnType<typeof vi.fn>;
  generateJSON: ReturnType<typeof vi.fn>;
} {
  return {
    generate: vi.fn(),
    generateJSON: vi.fn(),
  } as unknown as LLMProvider & {
    generate: ReturnType<typeof vi.fn>;
    generateJSON: ReturnType<typeof vi.fn>;
  };
}

function validInput(): ChapterSummarizerInput {
  return {
    chapterNumber: 3,
    title: '修仙之路',
    content:
      '林风在青云门外门修炼已有三月。这一日，他在后山练剑时，意外触发玉佩中的远古神识。神识告诉他，玉佩乃是上古大战遗留之物，蕴含着颠覆修仙界的秘密。林风决定深入调查，却不料被师兄赵恒暗中跟踪。',
    genre: 'xianxia',
    extractedFacts: [
      {
        id: 'f1',
        content: '林风在青云门外门修炼三月',
        chapterNumber: 3,
        confidence: 'high',
        category: 'character',
        createdAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'f2',
        content: '玉佩触发远古神识',
        chapterNumber: 3,
        confidence: 'high',
        category: 'plot',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ],
  };
}

function mockOutput(): ChapterSummaryOutput {
  return {
    brief: '林风修炼三月后触发玉佩神识，得知上古秘密，决定调查却被师兄跟踪。',
    detailed:
      '林风在青云门外门修炼三月，于后山练剑时意外触发玉佩中的远古神识。神识揭示玉佩是上古大战遗留之物，蕴含颠覆修仙界的秘密。林风决定深入调查，却被师兄赵恒暗中跟踪。',
    keyEvents: ['林风触发玉佩神识', '神识揭示玉佩来历', '林风决定调查', '赵恒暗中跟踪'],
    stateChanges: {
      characters: [{ name: '林风', change: '得知玉佩秘密，决定主动调查' }],
      relationships: [],
      world: [],
    },
    emotionalArc: '平静→震惊→决意→紧张',
    cliffhanger: '赵恒的跟踪意味着什么？',
    hookImpact: ['玉佩来历伏笔推进'],
    consistencyScore: 85,
  };
}

describe('ChapterSummarizer', () => {
  let mockProvider: ReturnType<typeof createMockProvider>;
  let summarizer: ChapterSummarizer;

  beforeEach(() => {
    mockProvider = createMockProvider();
    summarizer = new ChapterSummarizer(mockProvider);
  });

  // ── Properties ────────────────────────────────────────────

  describe('abstract properties', () => {
    it('has correct agent name', () => {
      expect(summarizer.name).toBe('ChapterSummarizer');
    });

    it('uses low temperature (0.3 for analytical summary)', () => {
      expect(summarizer.temperature).toBe(0.3);
    });
  });

  // ── execute() — happy path ────────────────────────────────

  describe('execute()', () => {
    it('returns structured summary from chapter content', async () => {
      mockProvider.generateJSON.mockResolvedValue(mockOutput());

      const result = await summarizer.execute({
        promptContext: { input: validInput() },
      });

      expect(result.success).toBe(true);
      const data = result.data as ChapterSummaryOutput;
      expect(data.brief).toBeTruthy();
      expect(data.detailed).toBeTruthy();
      expect(data.keyEvents.length).toBeGreaterThanOrEqual(1);
      expect(data.consistencyScore).toBeGreaterThanOrEqual(0);
      expect(data.consistencyScore).toBeLessThanOrEqual(100);
    });

    it('includes chapter info in prompt', async () => {
      mockProvider.generateJSON.mockResolvedValue(mockOutput());

      await summarizer.execute({ promptContext: { input: validInput() } });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('第 3 章');
      expect(callArgs.prompt).toContain('修仙之路');
      expect(callArgs.prompt).toContain('xianxia');
    });

    it('includes extracted facts in prompt', async () => {
      mockProvider.generateJSON.mockResolvedValue(mockOutput());

      await summarizer.execute({ promptContext: { input: validInput() } });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('林风在青云门外门修炼三月');
      expect(callArgs.prompt).toContain('玉佩触发远古神识');
    });

    it('includes previous summary when provided', async () => {
      mockProvider.generateJSON.mockResolvedValue(mockOutput());

      await summarizer.execute({
        promptContext: {
          input: { ...validInput(), prevSummary: '上一章林风进入青云门' },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('上一章林风进入青云门');
    });

    it('includes plan when provided', async () => {
      mockProvider.generateJSON.mockResolvedValue(mockOutput());

      await summarizer.execute({
        promptContext: {
          input: {
            ...validInput(),
            plan: {
              chapterNumber: 3,
              title: '玉佩觉醒',
              intention: '触发玉佩秘密',
              wordCountTarget: 3000,
              characters: ['林风'],
              keyEvents: ['触发玉佩'],
              hooks: [],
              worldRules: [],
              emotionalBeat: '平静→震惊',
              sceneTransition: 'transition',
            },
          },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('原计划意图');
      expect(callArgs.prompt).toContain('触发玉佩秘密');
    });

    it('passes correct temperature and maxTokens', async () => {
      mockProvider.generateJSON.mockResolvedValue(mockOutput());

      await summarizer.execute({ promptContext: { input: validInput() } });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.temperature).toBe(0.3);
      expect(callArgs.maxTokens).toBe(2048);
      expect(callArgs.agentName).toBe('ChapterSummarizer');
    });

    it('truncates content longer than 6000 chars', async () => {
      mockProvider.generateJSON.mockResolvedValue(mockOutput());

      const longContent = '林风在后山修炼剑法，触发玉佩异象。'.repeat(400);
      expect(longContent.length).toBeGreaterThan(6000);
      await summarizer.execute({
        promptContext: {
          input: { ...validInput(), content: longContent },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('...(后文省略)');
    });
  });

  // ── execute() — validation ────────────────────────────────

  describe('execute() — validation', () => {
    it('returns error when input is missing', async () => {
      const result = await summarizer.execute({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('输入');
    });

    it('returns error when content is empty', async () => {
      const result = await summarizer.execute({
        promptContext: {
          input: { ...validInput(), content: '' },
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('内容');
    });

    it('returns error when genre is missing', async () => {
      const result = await summarizer.execute({
        promptContext: {
          input: { ...validInput(), genre: '' },
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('题材');
    });

    it('returns error when chapter number is invalid', async () => {
      const result = await summarizer.execute({
        promptContext: {
          input: { ...validInput(), chapterNumber: 0 },
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('章节号');
    });
  });

  // ── execute() — LLM errors ────────────────────────────────

  describe('execute() — LLM errors', () => {
    it('returns error when LLM call fails', async () => {
      mockProvider.generateJSON.mockRejectedValue(new Error('timeout'));

      const result = await summarizer.execute({
        promptContext: { input: validInput() },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    });
  });

  // ── execute() — sanitize fallback ─────────────────────────

  describe('execute() — sanitize fallback', () => {
    it('fills default values when LLM returns partial output', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        brief: '简短摘要',
      });

      const result = await summarizer.execute({
        promptContext: { input: validInput() },
      });

      expect(result.success).toBe(true);
      const data = result.data as ChapterSummaryOutput;
      expect(data.brief).toBe('简短摘要');
      expect(data.detailed).toBe('简短摘要');
      expect(data.keyEvents).toEqual(['情节推进']);
      expect(data.emotionalArc).toBe('平稳');
      expect(data.cliffhanger).toBe('悬念待续');
      expect(data.hookImpact).toEqual([]);
      expect(data.consistencyScore).toBe(0);
      expect(data.stateChanges).toEqual({ characters: [], relationships: [], world: [] });
    });

    it('clamps consistencyScore to 0-100 range', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        ...mockOutput(),
        consistencyScore: 150,
      });

      const result = await summarizer.execute({
        promptContext: { input: validInput() },
      });

      const data = result.data as ChapterSummaryOutput;
      expect(data.consistencyScore).toBe(100);
    });

    it('sets consistencyScore to 0 when missing', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        ...mockOutput(),
        consistencyScore: undefined,
      });

      const result = await summarizer.execute({
        promptContext: { input: validInput() },
      });

      const data = result.data as ChapterSummaryOutput;
      expect(data.consistencyScore).toBe(0);
    });
  });

  // ── execute() — consistency validation ────────────────────

  describe('execute() — consistency validation', () => {
    it('caps consistencyScore below 70 when heuristic detects missing facts', async () => {
      const output = mockOutput();
      output.consistencyScore = 85;
      // 正则匹配「2-6 个非标点字符」+「获得|发现|决定|得知|遇到」
      // 使用「赵恒决定跟踪林风」可提取出「赵恒」
      const facts: Fact[] = [
        {
          id: 'f1',
          content: '赵恒决定跟踪林风',
          chapterNumber: 3,
          confidence: 'high',
          category: 'plot',
          createdAt: '2026-01-01T00:00:00Z',
        },
      ];

      mockProvider.generateJSON.mockResolvedValue({
        ...output,
        brief: '林风修炼时触发神识。', // 不包含「赵恒」
        detailed: '林风触发神识得知秘密。',
        keyEvents: ['林风触发神识'],
      });

      const result = await summarizer.execute({
        promptContext: { input: { ...validInput(), extractedFacts: facts } },
      });

      const data = result.data as ChapterSummaryOutput;
      // 摘要中没有出现「赵恒」，一致性分数应该被压低到 < 70
      expect(data.consistencyScore).toBeLessThan(70);
    });

    it('keeps consistencyScore when heuristic passes', async () => {
      const output = mockOutput();
      output.consistencyScore = 85;

      mockProvider.generateJSON.mockResolvedValue(output);

      const result = await summarizer.execute({
        promptContext: { input: validInput() },
      });

      const data = result.data as ChapterSummaryOutput;
      expect(data.consistencyScore).toBe(85);
    });
  });
});
