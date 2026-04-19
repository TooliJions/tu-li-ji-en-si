import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ContextCard,
  type ContextCardInput,
  type ContextCardOutput,
  type ContextDataSources,
} from './context-card';
import type { LLMProvider } from '../llm/provider';

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

describe('ContextCard', () => {
  let mockProvider: ReturnType<typeof createMockProvider>;
  let card: ContextCard;

  const validInput: ContextCardInput = {
    bookId: 'book-001',
    chapterNumber: 3,
    title: '修仙之路',
    genre: 'xianxia',
  };

  beforeEach(() => {
    mockProvider = createMockProvider();
    card = new ContextCard(mockProvider);
  });

  // ── Properties ────────────────────────────────────────────

  describe('abstract properties', () => {
    it('has correct agent name', () => {
      expect(card.name).toBe('ContextCard');
    });

    it('uses low temperature (0.2 for factual retrieval)', () => {
      expect(card.temperature).toBe(0.2);
    });
  });

  // ── execute() — happy path ────────────────────────────────

  describe('execute()', () => {
    const validInput: ContextCardInput = {
      bookId: 'book-001',
      chapterNumber: 3,
      title: '修仙之路',
      genre: 'xianxia',
    };

    it('returns context card with all sections', async () => {
      const sources: ContextDataSources = {
        getManifest: vi.fn().mockResolvedValue({
          characters: [
            {
              id: 'c1',
              name: '林风',
              role: 'protagonist',
              traits: ['冷静', '坚韧'],
              relationships: {},
              arc: '从弟子到宗师',
            },
          ],
          hooks: [
            {
              id: 'h1',
              description: '神秘玉佩',
              type: 'narrative',
              status: 'open',
              priority: 'critical',
              plantedChapter: 1,
              relatedCharacters: [],
              relatedChapters: [],
              createdAt: '2026-01-01T00:00:00Z',
              updatedAt: '2026-01-01T00:00:00Z',
            },
          ],
          facts: [
            {
              id: 'f1',
              content: '青云门是正道第一大宗',
              chapterNumber: 1,
              confidence: 'high',
              category: 'world',
              createdAt: '2026-01-01T00:00:00Z',
            },
          ],
          worldRules: [
            {
              id: 'r1',
              category: 'magic-system',
              rule: '修炼分为炼气、筑基、金丹三个阶段',
              exceptions: [],
            },
          ],
          currentFocus: '主角即将拜入仙门',
        }),
        getPreviousChapterSummary: vi
          .fn()
          .mockResolvedValue('上一章：林风在打猎时救了青云门外门弟子'),
        getChapterContext: vi.fn().mockResolvedValue(''),
      };

      const result = await card.execute({
        promptContext: { input: validInput, sources },
      });

      expect(result.success).toBe(true);
      const data = result.data as ContextCardOutput;
      expect(data.characters).toHaveLength(1);
      expect(data.hooks).toHaveLength(1);
      expect(data.facts).toHaveLength(1);
      expect(data.worldRules).toHaveLength(1);
    });

    it('includes previous chapter summary in output', async () => {
      const sources: ContextDataSources = {
        getManifest: vi.fn().mockResolvedValue({
          characters: [],
          hooks: [],
          facts: [],
          worldRules: [],
        }),
        getPreviousChapterSummary: vi.fn().mockResolvedValue('上一章的摘要内容'),
        getChapterContext: vi.fn().mockResolvedValue(''),
      };

      const result = await card.execute({
        promptContext: { input: validInput, sources },
      });

      const data = result.data as ContextCardOutput;
      expect(data.previousChapterSummary).toBe('上一章的摘要内容');
    });

    it('includes current focus in output', async () => {
      const sources: ContextDataSources = {
        getManifest: vi.fn().mockResolvedValue({
          characters: [],
          hooks: [],
          facts: [],
          worldRules: [],
          currentFocus: '当前关注点',
        }),
        getPreviousChapterSummary: vi.fn().mockResolvedValue(''),
        getChapterContext: vi.fn().mockResolvedValue(''),
      };

      const result = await card.execute({
        promptContext: { input: validInput, sources },
      });

      const data = result.data as ContextCardOutput;
      expect(data.currentFocus).toBe('当前关注点');
    });

    it('filters hooks to only open/progressing', async () => {
      const sources: ContextDataSources = {
        getManifest: vi.fn().mockResolvedValue({
          characters: [],
          hooks: [
            {
              id: 'h1',
              description: '开放伏笔',
              type: 'narrative',
              status: 'open',
              priority: 'major',
              plantedChapter: 1,
              relatedCharacters: [],
              relatedChapters: [],
              createdAt: '2026-01-01T00:00:00Z',
              updatedAt: '2026-01-01T00:00:00Z',
            },
            {
              id: 'h2',
              description: '进行中伏笔',
              type: 'plot',
              status: 'progressing',
              priority: 'critical',
              plantedChapter: 2,
              relatedCharacters: [],
              relatedChapters: [],
              createdAt: '2026-01-01T00:00:00Z',
              updatedAt: '2026-01-01T00:00:00Z',
            },
            {
              id: 'h3',
              description: '已回收伏笔',
              type: 'narrative',
              status: 'resolved',
              priority: 'minor',
              plantedChapter: 1,
              relatedCharacters: [],
              relatedChapters: [],
              createdAt: '2026-01-01T00:00:00Z',
              updatedAt: '2026-01-01T00:00:00Z',
            },
          ],
          facts: [],
          worldRules: [],
        }),
        getPreviousChapterSummary: vi.fn().mockResolvedValue(''),
        getChapterContext: vi.fn().mockResolvedValue(''),
      };

      const result = await card.execute({
        promptContext: { input: validInput, sources },
      });

      const data = result.data as ContextCardOutput;
      expect(data.hooks).toHaveLength(2);
      expect(data.hooks.every((h) => h.status === 'open' || h.status === 'progressing')).toBe(true);
    });

    it('calls getChapterContext with chapter number', async () => {
      const sources: ContextDataSources = {
        getManifest: vi.fn().mockResolvedValue({
          characters: [],
          hooks: [],
          facts: [],
          worldRules: [],
        }),
        getPreviousChapterSummary: vi.fn().mockResolvedValue(''),
        getChapterContext: vi.fn().mockResolvedValue(''),
      };

      await card.execute({
        promptContext: { input: validInput, sources },
      });

      expect(sources.getChapterContext).toHaveBeenCalledWith(3);
    });
  });

  // ── execute() — formatting ────────────────────────────────

  describe('execute() — formatted output', () => {
    it('produces formatted text representation', async () => {
      const sources: ContextDataSources = {
        getManifest: vi.fn().mockResolvedValue({
          characters: [
            {
              id: 'c1',
              name: '林风',
              role: 'protagonist',
              traits: ['冷静', '坚韧'],
              relationships: { 师父: '养父' },
              arc: '成长弧光',
            },
          ],
          hooks: [],
          facts: [],
          worldRules: [
            {
              id: 'r1',
              category: 'magic-system',
              rule: '修炼分三个阶段',
              exceptions: ['天灵根除外'],
            },
          ],
        }),
        getPreviousChapterSummary: vi.fn().mockResolvedValue('上一章摘要'),
        getChapterContext: vi.fn().mockResolvedValue(''),
      };

      const result = await card.execute({
        promptContext: {
          input: { bookId: 'book-001', chapterNumber: 3, title: '修仙之路', genre: 'xianxia' },
          sources,
        },
      });

      const data = result.data as ContextCardOutput;
      expect(data.formattedText).toBeTruthy();
      expect(data.formattedText).toContain('林风');
      expect(data.formattedText).toContain('修炼分三个阶段');
    });
  });

  // ── execute() — empty data ────────────────────────────────

  describe('execute() — empty data', () => {
    it('handles empty manifest gracefully', async () => {
      const sources: ContextDataSources = {
        getManifest: vi.fn().mockResolvedValue({
          characters: [],
          hooks: [],
          facts: [],
          worldRules: [],
        }),
        getPreviousChapterSummary: vi.fn().mockResolvedValue(''),
        getChapterContext: vi.fn().mockResolvedValue(''),
      };

      const result = await card.execute({
        promptContext: { input: validInput, sources },
      });

      expect(result.success).toBe(true);
      const data = result.data as ContextCardOutput;
      expect(data.characters).toHaveLength(0);
      expect(data.formattedText).toBeDefined();
    });
  });

  // ── execute() — validation ────────────────────────────────

  describe('execute() — validation', () => {
    it('returns error when input is missing', async () => {
      const result = await card.execute({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('输入');
    });

    it('returns error when bookId is missing', async () => {
      const result = await card.execute({
        promptContext: {
          input: { chapterNumber: 1, title: 'Test', genre: 'xianxia' } as ContextCardInput,
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('bookId');
    });

    it('returns error when chapter number is missing', async () => {
      const result = await card.execute({
        promptContext: {
          input: { bookId: 'book-1', title: 'Test', genre: 'xianxia' } as ContextCardInput,
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('章节号');
    });

    it('returns error when sources are missing', async () => {
      const result = await card.execute({
        promptContext: {
          input: { bookId: 'book-1', chapterNumber: 1, title: 'Test', genre: 'xianxia' },
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('数据源');
    });
  });

  // ── execute() — data source errors ────────────────────────

  describe('execute() — data source errors', () => {
    it('returns error when getManifest fails', async () => {
      const sources: ContextDataSources = {
        getManifest: vi.fn().mockRejectedValue(new Error('SQLite error')),
        getPreviousChapterSummary: vi.fn(),
        getChapterContext: vi.fn(),
      };

      const result = await card.execute({
        promptContext: {
          input: validInput,
          sources,
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('SQLite error');
    });

    it('continues when getPreviousChapterSummary fails (non-critical)', async () => {
      const sources: ContextDataSources = {
        getManifest: vi.fn().mockResolvedValue({
          characters: [],
          hooks: [],
          facts: [],
          worldRules: [],
        }),
        getPreviousChapterSummary: vi.fn().mockRejectedValue(new Error('No previous chapter')),
        getChapterContext: vi.fn().mockResolvedValue(''),
      };

      const result = await card.execute({
        promptContext: {
          input: validInput,
          sources,
        },
      });

      expect(result.success).toBe(true);
      const data = result.data as ContextCardOutput;
      expect(data.previousChapterSummary).toBe('');
    });

    it('continues when getChapterContext fails (non-critical)', async () => {
      const sources: ContextDataSources = {
        getManifest: vi.fn().mockResolvedValue({
          characters: [],
          hooks: [],
          facts: [],
          worldRules: [],
        }),
        getPreviousChapterSummary: vi.fn().mockResolvedValue(''),
        getChapterContext: vi.fn().mockRejectedValue(new Error('Context error')),
      };

      const result = await card.execute({
        promptContext: {
          input: validInput,
          sources,
        },
      });

      expect(result.success).toBe(true);
    });
  });

  // ── execute() — genre context ─────────────────────────────

  describe('execute() — genre context', () => {
    it('includes genre-specific guidance in formatted text', async () => {
      const sources: ContextDataSources = {
        getManifest: vi.fn().mockResolvedValue({
          characters: [],
          hooks: [],
          facts: [],
          worldRules: [],
        }),
        getPreviousChapterSummary: vi.fn().mockResolvedValue(''),
        getChapterContext: vi.fn().mockResolvedValue(''),
      };

      const result = await card.execute({
        promptContext: {
          input: { bookId: 'book-1', chapterNumber: 1, title: '仙侠', genre: 'xianxia' },
          sources,
        },
      });

      const data = result.data as ContextCardOutput;
      expect(data.formattedText).toContain('仙侠');
    });
  });
});
