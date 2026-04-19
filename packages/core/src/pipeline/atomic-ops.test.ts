import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LLMProvider } from '../llm/provider';
import {
  AtomicPipelineOps,
  type DraftChapterInput,
} from './atomic-ops';

// Mock fs module
vi.mock('fs', () => ({
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn((filePath: string) => {
    if (filePath.includes('meta.json')) {
      return JSON.stringify({ title: 'Test Novel', genre: 'xianxia' });
    }
    if (filePath.includes('index.json')) {
      return JSON.stringify({
        bookId: 'test-book',
        chapters: [],
        totalChapters: 0,
        totalWords: 0,
        lastUpdated: new Date().toISOString(),
      });
    }
    return JSON.stringify({
      bookId: 'test-book',
      versionToken: 1,
      lastChapterWritten: 0,
      hooks: [],
      facts: [],
      characters: [],
      worldRules: [],
      updatedAt: new Date().toISOString(),
    });
  }),
  openSync: vi.fn(() => 1),
  closeSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

vi.mock('path', () => ({
  default: { join: (...args: string[]) => args.join('/') },
  join: (...args: string[]) => args.join('/'),
}));

import * as fs from 'fs';

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

describe('AtomicPipelineOps', () => {
  let mockProvider: ReturnType<typeof createMockProvider>;
  let ops: AtomicPipelineOps;

  beforeEach(() => {
    vi.clearAllMocks();
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (fs.readFileSync as ReturnType<typeof vi.fn>).mockImplementation((filePath: string) => {
      if (filePath.includes('meta.json')) {
        return JSON.stringify({ title: 'Test Novel', genre: 'xianxia' });
      }
      if (filePath.includes('index.json')) {
        return JSON.stringify({
          bookId: 'test-book',
          chapters: [],
          totalChapters: 0,
          totalWords: 0,
          lastUpdated: new Date().toISOString(),
        });
      }
      return JSON.stringify({
        bookId: 'test-book',
        versionToken: 1,
        lastChapterWritten: 0,
        hooks: [],
        facts: [],
        characters: [],
        worldRules: [],
        updatedAt: new Date().toISOString(),
      });
    });

    mockProvider = createMockProvider();
    ops = new AtomicPipelineOps({
      rootDir: '/tmp/test-books',
      provider: mockProvider,
    });
  });

  // ── draftChapter() ─────────────────────────────────────────

  describe('draftChapter()', () => {
    it('generates a draft chapter and returns content', async () => {
      mockProvider.generate.mockResolvedValue({
        text: '林风走进大厅，只见人头攒动。',
        usage: { promptTokens: 500, completionTokens: 300, totalTokens: 800 },
        model: 'test-model',
      });

      const input: DraftChapterInput = {
        bookId: 'test-book',
        chapterNumber: 1,
        title: '初入大厅',
        genre: 'xianxia',
        sceneDescription: '林风出场',
      };

      const result = await ops.draftChapter(input);

      expect(result.success).toBe(true);
      expect(result.content).toContain('林风');
      expect(result.operation).toBe('draft_chapter');
      expect(result.usage).toBeDefined();
    });

    it('passes prompt inside LLM request object', async () => {
      mockProvider.generate.mockResolvedValue({
        text: '草稿内容',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'test-model',
      });

      await ops.draftChapter({
        bookId: 'test-book',
        chapterNumber: 2,
        title: '第二章',
        genre: 'xianxia',
        sceneDescription: '林风继续前进',
      });

      expect(mockProvider.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining('第二章'),
        })
      );
    });

    it('does not persist to filesystem', async () => {
      mockProvider.generate.mockResolvedValue({
        text: '草稿内容',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'test-model',
      });

      vi.clearAllMocks();
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);

      await ops.draftChapter({
        bookId: 'test-book',
        chapterNumber: 1,
        title: '草稿',
        genre: 'xianxia',
        sceneDescription: '测试',
      });

      const writeCalls = (fs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls;
      expect(writeCalls).toHaveLength(0);
    });

    it('returns error when generation fails', async () => {
      mockProvider.generate.mockRejectedValue(new Error('API timeout'));

      const result = await ops.draftChapter({
        bookId: 'test-book',
        chapterNumber: 1,
        title: '失败',
        genre: 'xianxia',
        sceneDescription: '测试',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('API timeout');
      expect(result.operation).toBe('draft_chapter');
    });
  });

  // ── auditChapter() ─────────────────────────────────────────

  describe('auditChapter()', () => {
    it('audits chapter content and returns issues', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [{ severity: 'warning', description: '角色对话略显生硬' }],
        overallScore: 75,
        status: 'pass',
        summary: '整体质量可接受',
      });

      const result = await ops.auditChapter({
        bookId: 'test-book',
        chapterNumber: 1,
        content: '林风走进大厅。',
        genre: 'xianxia',
      });

      expect(result.success).toBe(true);
      expect(result.operation).toBe('audit_chapter');
      expect(result.issues).toHaveLength(1);
      expect(result.overallScore).toBe(75);
      expect(result.status).toBe('pass');
    });

    it('returns blocking issues when quality is poor', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [{ severity: 'blocking', description: '逻辑矛盾：角色已死却出场' }],
        overallScore: 30,
        status: 'fail',
        summary: '存在严重问题',
      });

      const result = await ops.auditChapter({
        bookId: 'test-book',
        chapterNumber: 1,
        content: '林风走进大厅。',
        genre: 'xianxia',
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('fail');
      expect(result.issues?.some((i) => i.severity === 'blocking')).toBe(true);
    });

    it('returns error when audit fails', async () => {
      mockProvider.generateJSON.mockRejectedValue(new Error('LLM error'));

      const result = await ops.auditChapter({
        bookId: 'test-book',
        chapterNumber: 1,
        content: '内容',
        genre: 'xianxia',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('LLM error');
      expect(result.operation).toBe('audit_chapter');
    });

    it('passes audit prompt inside LLM request object', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [],
        overallScore: 90,
        status: 'pass',
        summary: '通过',
      });

      await ops.auditChapter({
        bookId: 'test-book',
        chapterNumber: 2,
        content: '审计内容',
        genre: 'xianxia',
      });

      expect(mockProvider.generateJSON).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining('审计内容'),
        })
      );
    });
  });

  // ── reviseChapter() ────────────────────────────────────────

  describe('reviseChapter()', () => {
    it('revises chapter based on audit issues', async () => {
      mockProvider.generate.mockResolvedValue({
        text: '修订后的内容',
        usage: { promptTokens: 400, completionTokens: 200, totalTokens: 600 },
        model: 'test-model',
      });

      const result = await ops.reviseChapter({
        bookId: 'test-book',
        chapterNumber: 1,
        content: '初稿内容',
        genre: 'xianxia',
        issues: [{ severity: 'warning', description: '角色对话略显生硬' }],
      });

      expect(result.success).toBe(true);
      expect(result.operation).toBe('revise_chapter');
      expect(result.content).toContain('修订');
      expect(result.usage).toBeDefined();
    });

    it('returns error when revision fails', async () => {
      mockProvider.generate.mockRejectedValue(new Error('API error'));

      const result = await ops.reviseChapter({
        bookId: 'test-book',
        chapterNumber: 1,
        content: '初稿',
        genre: 'xianxia',
        issues: [{ severity: 'blocking', description: '问题' }],
      });

      expect(result.success).toBe(false);
      expect(result.operation).toBe('revise_chapter');
    });
  });

  // ── persistChapter() ───────────────────────────────────────

  describe('persistChapter()', () => {
    it('persists chapter content to file with final status', async () => {
      const result = await ops.persistChapter({
        bookId: 'test-book',
        chapterNumber: 1,
        title: '第一章',
        content: '持久化内容',
        status: 'final',
      });

      expect(result.success).toBe(true);
      expect(result.operation).toBe('persist_chapter');
      expect(result.persisted).toBe(true);

      const writeCalls = (fs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls;
      const chapterWrite = writeCalls.find((call: unknown[]) => {
        const filePath = String(call[0]);
        return filePath.includes('chapter-0001');
      });
      expect(chapterWrite).toBeDefined();
      expect(String(chapterWrite![1]).includes('status: final')).toBe(true);
    });

    it('persists with draft status when specified', async () => {
      const result = await ops.persistChapter({
        bookId: 'test-book',
        chapterNumber: 1,
        title: '草稿章',
        content: '草稿内容',
        status: 'draft',
      });

      expect(result.success).toBe(true);
      expect(result.persisted).toBe(true);

      const writeCalls = (fs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls;
      const chapterWrite = writeCalls.find((call: unknown[]) => {
        const filePath = String(call[0]);
        return filePath.includes('chapter-0001');
      });
      expect(String(chapterWrite![1]).includes('status: draft')).toBe(true);
    });

    it('updates index after persisting', async () => {
      const result = await ops.persistChapter({
        bookId: 'test-book',
        chapterNumber: 5,
        title: '第五章',
        content: '内容',
        status: 'final',
      });

      expect(result.success).toBe(true);

      // 验证 index.json 被更新
      const writeCalls = (fs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls;
      const indexWrite = writeCalls.find((call: unknown[]) => {
        const filePath = String(call[0]);
        return filePath.includes('index.json');
      });
      expect(indexWrite).toBeDefined();
    });

    it('writes index using canonical chapter index fields', async () => {
      await ops.persistChapter({
        bookId: 'test-book',
        chapterNumber: 3,
        title: '第三章',
        content: '章节内容',
        status: 'final',
      });

      const writeCalls = (fs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls;
      const indexWrite = writeCalls.find((call: unknown[]) => String(call[0]).includes('index.json'));
      expect(indexWrite).toBeDefined();

      const payload = JSON.parse(String(indexWrite![1])) as {
        chapters: Array<Record<string, unknown>>;
        lastUpdated: string;
      };

      expect(payload.chapters[0]).toEqual(
        expect.objectContaining({
          number: 3,
          title: '第三章',
          fileName: 'chapter-0003.md',
        })
      );
      expect(payload.chapters[0]).not.toHaveProperty('chapterNumber');
      expect(payload).toHaveProperty('lastUpdated');
      expect(payload).not.toHaveProperty('updatedAt');
    });
  });

  // ── Chained usage ──────────────────────────────────────────

  describe('chained operations', () => {
    it('can draft, audit, revise, and persist in sequence', async () => {
      // Draft
      mockProvider.generate.mockResolvedValueOnce({
        text: '初稿',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'test',
      });

      const draft = await ops.draftChapter({
        bookId: 'test-book',
        chapterNumber: 1,
        title: '测试',
        genre: 'xianxia',
        sceneDescription: '测试',
      });
      expect(draft.success).toBe(true);

      // Audit
      mockProvider.generateJSON.mockResolvedValueOnce({
        issues: [],
        overallScore: 85,
        status: 'pass',
        summary: '通过',
      });

      const audit = await ops.auditChapter({
        bookId: 'test-book',
        chapterNumber: 1,
        content: '初稿',
        genre: 'xianxia',
      });
      expect(audit.success).toBe(true);
      expect(audit.status).toBe('pass');

      // Persist
      const persist = await ops.persistChapter({
        bookId: 'test-book',
        chapterNumber: 1,
        title: '测试',
        content: '初稿',
        status: 'final',
      });
      expect(persist.success).toBe(true);
    });
  });
});
