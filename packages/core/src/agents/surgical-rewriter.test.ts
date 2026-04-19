import { describe, it, expect, beforeEach } from 'vitest';
import { SurgicalRewriter, type RewriteInput, type RewriteOutput } from './surgical-rewriter';

// ── Helpers ────────────────────────────────────────────────────────

function makeInput(overrides: Partial<RewriteInput> = {}): RewriteInput {
  return {
    chapterContent: `老槐树下，张大爷摇着蒲扇，慢悠悠地讲起了年轻时候的事。
"那年夏天特别热，河水都浅了不少。"他眯着眼，目光越过院墙，
落在远处那片已经变成停车场的稻田上。

李婶在一旁择菜，偶尔插上一两句嘴。
孩子们在巷口追逐嬉戏，笑声回荡在夏日的午后。`,
    chapterNumber: 5,
    genre: 'urban',
    strategy: 'local-replace',
    issues: [],
    ...overrides,
  };
}

// ── Mock Provider ──────────────────────────────────────────────────

import type { LLMProvider, LLMRequest, LLMResponse } from '../llm/provider';

function makeMockProvider(response: string): LLMProvider {
  return {
    generate: async (_req: LLMRequest): Promise<LLMResponse> => ({
      text: response,
      usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
    }),
    generateJSON: async <T>(_req: LLMRequest): Promise<T> => ({}) as T,
  } as LLMProvider;
}

// ── Tests ──────────────────────────────────────────────────────────

describe('SurgicalRewriter', () => {
  let rewriter: SurgicalRewriter;
  let mockProvider: LLMProvider;

  beforeEach(() => {
    mockProvider = makeMockProvider('mock rewritten content');
    rewriter = new SurgicalRewriter(mockProvider);
  });

  // ── execute validation ────────────────────────────────────────

  describe('execute', () => {
    it('rejects empty content', async () => {
      const result = await rewriter.execute({
        promptContext: { input: makeInput({ chapterContent: '' }) },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('内容');
    });

    it('rejects empty genre', async () => {
      const result = await rewriter.execute({
        promptContext: { input: makeInput({ genre: '' }) },
      });

      expect(result.success).toBe(false);
    });

    it('rejects missing strategy', async () => {
      const result = await rewriter.execute({
        promptContext: {
          input: {
            chapterContent: 'test',
            chapterNumber: 1,
            genre: 'urban',
            strategy: undefined as unknown as string,
            issues: [],
          },
        },
      });

      expect(result.success).toBe(false);
    });

    it('rejects unknown strategy', async () => {
      const result = await rewriter.execute({
        promptContext: { input: makeInput({ strategy: 'unknown-strategy' as string }) },
      });

      expect(result.success).toBe(false);
    });
  });

  // ── local-replace ─────────────────────────────────────────────

  describe('local-replace strategy', () => {
    it('calls LLM with local-replace prompt', async () => {
      const input = makeInput({
        strategy: 'local-replace',
        issues: [
          {
            description: '套话检测',
            category: 'cliche-phrase',
            suggestion: '替换为更具体的描写',
            affectedText: '日新月异的时代',
          },
        ],
      });

      mockProvider = makeMockProvider(
        `老槐树下，张大爷摇着蒲扇，慢悠悠地讲起了年轻时候的事。
"那年夏天特别热，河水都浅了不少。"他眯着眼，目光越过院墙，
落在远处那片已经变成停车场的稻田上。

李婶在一旁择菜，偶尔插上一两句嘴。
孩子们在巷口追逐嬉戏，笑声回荡在闷热的午后。`
      );
      rewriter = new SurgicalRewriter(mockProvider);

      const result = await rewriter.execute({ promptContext: { input } });

      expect(result.success).toBe(true);
      const data = result.data as RewriteOutput;
      expect(data.rewrittenContent.length).toBeGreaterThan(0);
      expect(data.wordCount).toBeGreaterThan(0);
      expect(data.strategy).toBe('local-replace');
    });

    it('preserves content structure for local-replace', async () => {
      const originalContent = `第一段保持不变。
第二段有套话需要替换。
第三段保持不变。`;

      const input = makeInput({
        chapterContent: originalContent,
        strategy: 'local-replace',
        issues: [
          {
            description: '套话',
            category: 'cliche-phrase',
            suggestion: '具体化',
            affectedText: '套话',
          },
        ],
      });

      // Mock provider returns content with same structure
      mockProvider = makeMockProvider(
        `第一段保持不变。
第二段已替换为具体描写。
第三段保持不变。`
      );
      rewriter = new SurgicalRewriter(mockProvider);

      const result = await rewriter.execute({ promptContext: { input } });

      expect(result.success).toBe(true);
      const data = result.data as RewriteOutput;
      // First and third paragraphs preserved
      expect(data.rewrittenContent).toContain('第一段保持不变');
      expect(data.rewrittenContent).toContain('第三段保持不变');
    });
  });

  // ── paragraph-reorder ─────────────────────────────────────────

  describe('paragraph-reorder strategy', () => {
    it('calls LLM with paragraph-reorder prompt', async () => {
      const input = makeInput({
        strategy: 'paragraph-reorder',
        issues: [
          {
            description: '句式单调',
            category: 'monotonous-syntax',
            suggestion: '调整段落结构和句型',
          },
        ],
      });

      mockProvider = makeMockProvider(`孩子们在巷口追逐嬉戏，笑声回荡在夏日的午后。

李婶在一旁择菜，偶尔插上一两句嘴。

老槐树下，张大爷摇着蒲扇，慢悠悠地讲起了年轻时候的事。
"那年夏天特别热，河水都浅了不少。"他眯着眼，目光越过院墙，
落在远处那片已经变成停车场的稻田上。`);
      rewriter = new SurgicalRewriter(mockProvider);

      const result = await rewriter.execute({ promptContext: { input } });

      expect(result.success).toBe(true);
      const data = result.data as RewriteOutput;
      expect(data.strategy).toBe('paragraph-reorder');
    });

    it('preserves all original content after reordering', async () => {
      const input = makeInput({
        strategy: 'paragraph-reorder',
        issues: [{ description: '节奏失衡', category: 'pacing', suggestion: '调整段落顺序' }],
      });

      mockProvider = makeMockProvider(
        `老槐树下，张大爷摇着蒲扇，慢悠悠地讲起了年轻时候的事。
"那年夏天特别热，河水都浅了不少。"他眯着眼，目光越过院墙，
落在远处那片已经变成停车场的稻田上。

孩子们在巷口追逐嬉戏，笑声回荡在夏日的午后。

李婶在一旁择菜，偶尔插上一两句嘴。`
      );
      rewriter = new SurgicalRewriter(mockProvider);

      const result = await rewriter.execute({ promptContext: { input } });

      expect(result.success).toBe(true);
      const data = result.data as RewriteOutput;
      // All original content should still be present
      expect(data.rewrittenContent).toContain('张大爷');
      expect(data.rewrittenContent).toContain('李婶');
      expect(data.rewrittenContent).toContain('孩子们');
    });
  });

  // ── beat-rewrite ──────────────────────────────────────────────

  describe('beat-rewrite strategy', () => {
    it('calls LLM with beat-rewrite prompt including scene guidance', async () => {
      const input = makeInput({
        strategy: 'beat-rewrite',
        issues: [{ description: '逻辑跳跃', category: 'logic-gap', suggestion: '补充过渡铺垫' }],
        targetScene: 'scene-2',
        sceneContent: '他推开门，发现桌上有一封信。他立刻明白了所有的真相。',
      });

      mockProvider = makeMockProvider(
        `他推开门，目光落在桌上那封信上。信封已经泛黄，
邮戳显示是十年前寄出的。他小心地拆开信封，
随着信纸展开，一段被尘封的往事渐渐浮出水面。`
      );
      rewriter = new SurgicalRewriter(mockProvider);

      const result = await rewriter.execute({ promptContext: { input } });

      expect(result.success).toBe(true);
      const data = result.data as RewriteOutput;
      expect(data.strategy).toBe('beat-rewrite');
      expect(data.wordCount).toBeGreaterThan(0);
    });
  });

  // ── chapter-rewrite ───────────────────────────────────────────

  describe('chapter-rewrite strategy', () => {
    it('calls LLM with chapter-rewrite prompt', async () => {
      const input = makeInput({
        strategy: 'chapter-rewrite',
        issues: [
          {
            description: '角色身份矛盾',
            category: 'character-state',
            tier: 'blocker',
            suggestion: '修正角色设定',
          },
          {
            description: '时间线冲突',
            category: 'timeline',
            tier: 'blocker',
            suggestion: '修正时间线',
          },
          { description: 'POV 非法切换', category: 'pov', tier: 'blocker', suggestion: '统一视角' },
        ],
        chapterOutline: '本章应写主角发现秘密并做出关键决定',
        previousChapterSummary: '上一章主角收到神秘信件',
      });

      mockProvider = makeMockProvider(`收到信件的第二天清晨，主角早早醒来。
窗外的阳光透过窗帘洒在书桌上，那封信就静静地躺在那里。
他拿起信，再次仔细阅读每一句话，试图找出隐藏的线索。`);
      rewriter = new SurgicalRewriter(mockProvider);

      const result = await rewriter.execute({ promptContext: { input } });

      expect(result.success).toBe(true);
      const data = result.data as RewriteOutput;
      expect(data.strategy).toBe('chapter-rewrite');
    });
  });

  // ── output metadata ───────────────────────────────────────────

  describe('output metadata', () => {
    it('includes change summary in output', async () => {
      const input = makeInput({
        strategy: 'local-replace',
        issues: [
          {
            description: '套话',
            category: 'cliche-phrase',
            suggestion: '替换',
            affectedText: '套话',
          },
        ],
      });

      mockProvider = makeMockProvider(makeInput().chapterContent);
      rewriter = new SurgicalRewriter(mockProvider);

      const result = await rewriter.execute({ promptContext: { input } });

      expect(result.success).toBe(true);
      const data = result.data as RewriteOutput;
      expect(data.changeSummary.length).toBeGreaterThan(0);
    });

    it('reports word count change', async () => {
      const input = makeInput({
        strategy: 'local-replace',
        issues: [{ description: '套话', category: 'cliche-phrase', suggestion: '替换' }],
      });

      mockProvider = makeMockProvider('这是新的内容，字数完全不同。');
      rewriter = new SurgicalRewriter(mockProvider);

      const result = await rewriter.execute({ promptContext: { input } });

      expect(result.success).toBe(true);
      const data = result.data as RewriteOutput;
      expect(data.wordCount).toBeGreaterThan(0);
      expect(data.originalWordCount).toBeGreaterThan(0);
    });
  });
});
