import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LLMProvider } from '../llm/provider';
import type { TelemetryLogger } from '../telemetry/logger';

// Mock fs module — factory is hoisted, so we use inline functions
vi.mock('fs', () => ({
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn((filePath: string) => {
    // Return different data based on path
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
    // Default: manifest data
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

import { PipelineRunner } from './runner';
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

function createNoopTelemetryLogger(): TelemetryLogger {
  return {
    record: vi.fn(),
    read: vi.fn(() => null),
    listBookTelemetry: vi.fn(() => []),
  } as unknown as TelemetryLogger;
}

describe('PipelineRunner', () => {
  let mockProvider: ReturnType<typeof createMockProvider>;
  let runner: PipelineRunner;

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

    runner = new PipelineRunner({
      rootDir: '/tmp/test-books',
      provider: mockProvider,
      maxRevisionRetries: 2,
      fallbackAction: 'accept_with_warnings',
      telemetryLogger: createNoopTelemetryLogger(),
    });
  });

  // ── Constructor ───────────────────────────────────────────

  describe('constructor', () => {
    it('initializes with valid config', () => {
      expect(runner).toBeDefined();
    });

    it('uses default maxRevisionRetries when not specified', () => {
      const defaultRunner = new PipelineRunner({
        rootDir: '/tmp/test',
        llmConfig: { apiKey: 'key', baseURL: 'url', model: 'model' },
      });
      expect(defaultRunner).toBeDefined();
    });

    it('throws when neither provider nor llmConfig is provided', () => {
      expect(() => new PipelineRunner({ rootDir: '/tmp/test' })).toThrow(
        '必须提供 provider 或 llmConfig'
      );
    });
  });

  // ── initBook() ────────────────────────────────────────────

  describe('initBook()', () => {
    it('validates required fields — empty bookId', async () => {
      const result = await runner.initBook({
        bookId: '',
        title: '测试小说',
        genre: 'xianxia',
        synopsis: '一个修仙故事',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('bookId');
    });

    it('validates required fields — empty title', async () => {
      const result = await runner.initBook({
        bookId: 'test-book',
        title: '',
        genre: 'xianxia',
        synopsis: '简介',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('书名');
    });

    it('validates required fields — empty genre', async () => {
      const result = await runner.initBook({
        bookId: 'test-book',
        title: '测试',
        genre: '',
        synopsis: '简介',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('题材');
    });

    it('validates required fields — empty synopsis', async () => {
      const result = await runner.initBook({
        bookId: 'test-book',
        title: '测试',
        genre: 'xianxia',
        synopsis: '',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('简介');
    });
  });

  // ── writeDraft() ──────────────────────────────────────────

  describe('writeDraft()', () => {
    it('generates a draft chapter', async () => {
      mockProvider.generate.mockResolvedValue({
        text: '林风走进大厅，只见人头攒动。',
        usage: { promptTokens: 500, completionTokens: 300, totalTokens: 800 },
        model: 'test-model',
      });

      const result = await runner.writeDraft({
        bookId: 'test-book',
        chapterNumber: 1,
        title: '初入大厅',
        genre: 'xianxia',
        sceneDescription: '林风走进热闹的大厅',
      });

      expect(result.success).toBe(true);
      expect(result.content).toBeTruthy();
    });

    it('passes draft prompt inside LLM request object', async () => {
      mockProvider.generate.mockResolvedValue({
        text: '草稿内容',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'test-model',
      });

      await runner.writeDraft({
        bookId: 'test-book',
        chapterNumber: 2,
        title: '第二章',
        genre: 'xianxia',
        sceneDescription: '林风调查异常',
      });

      expect(mockProvider.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining('林风调查异常'),
        })
      );
    });

    it('marks chapter as draft status', async () => {
      mockProvider.generate.mockResolvedValue({
        text: '草稿内容',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'test-model',
      });

      const result = await runner.writeDraft({
        bookId: 'test-book',
        chapterNumber: 1,
        title: '草稿章',
        genre: 'xianxia',
        sceneDescription: '简单场景',
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('draft');
    });

    it('returns error when book does not exist', async () => {
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);

      const result = await runner.writeDraft({
        bookId: 'nonexistent-book',
        chapterNumber: 1,
        title: '不存在',
        genre: 'xianxia',
        sceneDescription: '测试',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('不存在');
    });

    it('returns error when generation fails', async () => {
      mockProvider.generate.mockRejectedValue(new Error('API timeout'));

      const result = await runner.writeDraft({
        bookId: 'test-book',
        chapterNumber: 1,
        title: '失败章',
        genre: 'xianxia',
        sceneDescription: '会失败',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it('persists chapter to file with draft status', async () => {
      mockProvider.generate.mockResolvedValue({
        text: '持久化草稿内容',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'test-model',
      });

      await runner.writeDraft({
        bookId: 'test-book',
        chapterNumber: 5,
        title: '第五章',
        genre: 'xianxia',
        sceneDescription: '测试持久化',
      });

      // 验证 writeFileSync 被调用（文件写入 chapters 目录）
      const writeCalls = (fs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls;
      expect(writeCalls.length).toBeGreaterThan(0);
      const chapterWrite = writeCalls.find((call: unknown[]) => {
        const filePath = String(call[0]);
        return filePath.includes('chapters') && filePath.includes('chapter-0005');
      });
      expect(chapterWrite).toBeDefined();
      expect(String(chapterWrite![1]).includes('status: draft')).toBe(true);
    });

    it('releases lock even when generation fails', async () => {
      mockProvider.generate.mockRejectedValue(new Error('API timeout'));

      await runner.writeDraft({
        bookId: 'test-book',
        chapterNumber: 1,
        title: '失败',
        genre: 'xianxia',
        sceneDescription: '测试锁释放',
      });

      // 验证 unlinkSync 被调用（锁释放）
      const unlinkCalls = (fs.unlinkSync as ReturnType<typeof vi.fn>).mock.calls;
      expect(unlinkCalls.length).toBeGreaterThan(0);
    });

    it('overwrites existing draft without error', async () => {
      mockProvider.generate.mockResolvedValue({
        text: '新版草稿',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'test-model',
      });

      // 第一次写入
      const result1 = await runner.writeDraft({
        bookId: 'test-book',
        chapterNumber: 1,
        title: '草稿',
        genre: 'xianxia',
        sceneDescription: '第一次',
      });

      // 第二次覆盖
      mockProvider.generate.mockResolvedValue({
        text: '更新版草稿',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'test-model',
      });

      const result2 = await runner.writeDraft({
        bookId: 'test-book',
        chapterNumber: 1,
        title: '草稿',
        genre: 'xianxia',
        sceneDescription: '第二次',
      });

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
    });
  });

  // ── writeFastDraft() ──────────────────────────────────────

  describe('writeFastDraft()', () => {
    it('generates a fast draft without persisting', async () => {
      mockProvider.generate.mockResolvedValue({
        text: '快速草稿内容',
        usage: { promptTokens: 200, completionTokens: 100, totalTokens: 300 },
        model: 'test-model',
      });

      const result = await runner.writeFastDraft({
        bookId: 'test-book',
        chapterNumber: 1,
        title: '快速草稿',
        genre: 'xianxia',
        sceneDescription: '快速生成一段内容',
      });

      expect(result.success).toBe(true);
      expect(result.content).toBeTruthy();
      expect(result.persisted).toBe(false);
    });

    it('returns error when generation fails', async () => {
      mockProvider.generate.mockRejectedValue(new Error('API timeout'));

      const result = await runner.writeFastDraft({
        bookId: 'test-book',
        chapterNumber: 1,
        title: '测试',
        genre: 'xianxia',
        sceneDescription: '测试',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it('does not write to filesystem', async () => {
      mockProvider.generate.mockResolvedValue({
        text: '不持久化内容',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'test-model',
      });

      vi.clearAllMocks();
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);

      await runner.writeFastDraft({
        bookId: 'test-book',
        chapterNumber: 1,
        title: '测试',
        genre: 'xianxia',
        sceneDescription: '测试',
      });

      // writeFastDraft 不应该调用 writeFileSync（不持久化）
      const writeCalls = (fs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls;
      expect(writeCalls).toHaveLength(0);
    });

    it('does not acquire book lock', async () => {
      mockProvider.generate.mockResolvedValue({
        text: '无锁内容',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'test-model',
      });

      vi.clearAllMocks();
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (fs.openSync as ReturnType<typeof vi.fn>).mockReturnValue(1);

      await runner.writeFastDraft({
        bookId: 'test-book',
        chapterNumber: 1,
        title: '测试',
        genre: 'xianxia',
        sceneDescription: '测试',
      });

      // writeFastDraft 不应该获取锁（openSync 不应被调用）
      const openCalls = (fs.openSync as ReturnType<typeof vi.fn>).mock.calls;
      expect(openCalls).toHaveLength(0);
    });

    it('returns content from LLM response', async () => {
      mockProvider.generate.mockResolvedValue({
        text: '李长老走进青云门大殿，只见人头攒动。',
        usage: { promptTokens: 300, completionTokens: 200, totalTokens: 500 },
        model: 'test-model',
      });

      const result = await runner.writeFastDraft({
        bookId: 'test-book',
        chapterNumber: 3,
        title: '初入大殿',
        genre: 'xianxia',
        sceneDescription: '李长老出场',
      });

      expect(result.content).toContain('李长老');
      expect(result.chapterNumber).toBe(3);
    });
  });

  // ── writeNextChapter() — full pipeline ────────────────────

  describe('writeNextChapter()', () => {
    it('completes full pipeline for next chapter', async () => {
      mockProvider.generateJSON.mockResolvedValueOnce({
        summary: '上一章摘要',
        activeHooks: ['hook-1'],
        characterStates: ['林风：状态良好'],
        locationContext: '青云门',
      });

      mockProvider.generateJSON.mockResolvedValueOnce({
        chapterGoal: '展现主角成长',
        keyScenes: ['修炼场景', '突破境界'],
        emotionalArc: '从困惑到顿悟',
        hookProgression: ['hook-1 推进'],
      });

      mockProvider.generate.mockResolvedValueOnce({
        text: '林风盘膝而坐，开始修炼。灵气涌入体内。',
        usage: { promptTokens: 500, completionTokens: 400, totalTokens: 900 },
        model: 'test-model',
      });

      mockProvider.generate.mockResolvedValueOnce({
        text: '林风盘膝静坐，灵气涌动。',
        usage: { promptTokens: 300, completionTokens: 200, totalTokens: 500 },
        model: 'test-model',
      });

      mockProvider.generateJSON.mockResolvedValueOnce({
        issues: [],
        overallScore: 85,
        status: 'pass',
        summary: '质量良好',
      });

      const result = await runner.writeNextChapter({
        bookId: 'test-book',
        chapterNumber: 1,
        title: '修炼之路',
        genre: 'xianxia',
        userIntent: '写一章主角修炼突破的内容',
      });

      expect(result.success).toBe(true);
      expect(result.chapterNumber).toBe(1);
      expect(result.content).toBeTruthy();
    });

    it('retries on audit failure then passes', async () => {
      mockProvider.generateJSON.mockResolvedValueOnce({
        summary: '上一章',
        activeHooks: [],
        characterStates: [],
        locationContext: '某处',
      });
      mockProvider.generateJSON.mockResolvedValueOnce({
        chapterGoal: '目标',
        keyScenes: [],
        emotionalArc: '',
        hookProgression: [],
      });
      mockProvider.generate.mockResolvedValueOnce({
        text: '初稿',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'test',
      });
      mockProvider.generate.mockResolvedValueOnce({
        text: '润色稿',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'test',
      });
      mockProvider.generateJSON.mockResolvedValueOnce({
        issues: [{ severity: 'blocking', description: '问题' }],
        overallScore: 40,
        status: 'fail',
        summary: '失败',
      });
      mockProvider.generate.mockResolvedValueOnce({
        text: '修订稿',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'test',
      });
      mockProvider.generateJSON.mockResolvedValueOnce({
        issues: [],
        overallScore: 80,
        status: 'pass',
        summary: '通过',
      });

      const result = await runner.writeNextChapter({
        bookId: 'test-book',
        chapterNumber: 2,
        title: '重试章',
        genre: 'xianxia',
        userIntent: '测试重试机制',
      });

      expect(result.success).toBe(true);
    });

    it('falls back to accept_with_warnings after max retries', async () => {
      mockProvider.generateJSON.mockResolvedValueOnce({
        summary: '上一章',
        activeHooks: [],
        characterStates: [],
        locationContext: '某处',
      });
      mockProvider.generateJSON.mockResolvedValueOnce({
        chapterGoal: '目标',
        keyScenes: [],
        emotionalArc: '',
        hookProgression: [],
      });
      mockProvider.generate.mockResolvedValueOnce({
        text: '初稿',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'test',
      });
      mockProvider.generate.mockResolvedValueOnce({
        text: '润色稿',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'test',
      });

      for (let i = 0; i < 3; i++) {
        mockProvider.generateJSON.mockResolvedValueOnce({
          issues: [{ severity: 'blocking', description: `问题 ${i}` }],
          overallScore: 30 + i * 5,
          status: 'fail',
          summary: '失败',
        });
        mockProvider.generate.mockResolvedValueOnce({
          text: `修订稿 ${i}`,
          usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
          model: 'test',
        });
      }

      const result = await runner.writeNextChapter({
        bookId: 'test-book',
        chapterNumber: 3,
        title: '审计失败章',
        genre: 'xianxia',
        userIntent: '测试审计不通过',
      });

      expect(result.success).toBe(true);
      expect(result.content).toBeTruthy();
      expect(result.warningCode).toBe('accept_with_warnings');
      expect(result.error).toBeUndefined();

      const writeCalls = (fs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls;
      const chapterWrite = writeCalls.find((call: unknown[]) =>
        String(call[0]).includes('chapter-0003.md')
      );
      expect(String(chapterWrite?.[1] ?? '')).toContain('warningCode: accept_with_warnings');
    });

    it('returns error on fallbackAction=pause after max retries', async () => {
      const pausingRunner = new PipelineRunner({
        rootDir: '/tmp/test-books',
        provider: mockProvider,
        maxRevisionRetries: 2,
        fallbackAction: 'pause',
        telemetryLogger: createNoopTelemetryLogger(),
      });

      mockProvider.generateJSON.mockResolvedValueOnce({
        summary: '上一章',
        activeHooks: [],
        characterStates: [],
        locationContext: '某处',
      });
      mockProvider.generateJSON.mockResolvedValueOnce({
        chapterGoal: '目标',
        keyScenes: [],
        emotionalArc: '',
        hookProgression: [],
      });
      mockProvider.generate.mockResolvedValueOnce({
        text: '初稿',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'test',
      });
      mockProvider.generate.mockResolvedValueOnce({
        text: '润色稿',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'test',
      });

      // 3 audit failures (max retries + 1) — all fail
      for (let i = 0; i < 3; i++) {
        mockProvider.generateJSON.mockResolvedValueOnce({
          issues: [{ severity: 'blocking', description: `问题 ${i}` }],
          overallScore: 30,
          status: 'fail',
          summary: '失败',
        });
        mockProvider.generate.mockResolvedValueOnce({
          text: `修订稿 ${i}`,
          usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
          model: 'test',
        });
      }

      // composeChapter catches the throw and returns error result
      const result = await pausingRunner.writeNextChapter({
        bookId: 'test-book',
        chapterNumber: 10,
        title: '暂停章',
        genre: 'xianxia',
        userIntent: '测试 pause 降级',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('修订次数用尽');
    });

    it('continues pipeline even when memory extraction fails', async () => {
      mockProvider.generateJSON.mockResolvedValueOnce({
        summary: '上一章',
        activeHooks: [],
        characterStates: [],
        locationContext: '某处',
      });
      mockProvider.generateJSON.mockResolvedValueOnce({
        chapterGoal: '目标',
        keyScenes: [],
        emotionalArc: '',
        hookProgression: [],
      });
      mockProvider.generate.mockResolvedValueOnce({
        text: '记忆提取失败测试',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'test',
      });
      mockProvider.generate.mockResolvedValueOnce({
        text: '润色稿',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'test',
      });
      mockProvider.generateJSON.mockResolvedValueOnce({
        issues: [],
        overallScore: 80,
        status: 'pass',
        summary: '通过',
      });
      // Memory extraction throws
      mockProvider.generateJSON.mockRejectedValueOnce(new Error('memory extract failed'));

      const result = await runner.writeNextChapter({
        bookId: 'test-book',
        chapterNumber: 11,
        title: '记忆失败章',
        genre: 'xianxia',
        userIntent: '测试记忆提取失败',
      });

      // Pipeline should still succeed — memory extraction is non-blocking
      expect(result.success).toBe(true);
      expect(result.persisted).toBe(true);
    });

    it('persists extracted facts and hooks into manifest state', async () => {
      mockProvider.generateJSON.mockResolvedValueOnce({
        summary: '上一章',
        activeHooks: [],
        characterStates: [],
        locationContext: '某处',
      });
      mockProvider.generateJSON.mockResolvedValueOnce({
        chapterGoal: '目标',
        keyScenes: [],
        emotionalArc: '',
        hookProgression: [],
      });
      mockProvider.generate.mockResolvedValueOnce({
        text: '记忆落盘测试',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'test',
      });
      mockProvider.generate.mockResolvedValueOnce({
        text: '润色稿',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'test',
      });
      mockProvider.generateJSON.mockResolvedValueOnce({
        issues: [],
        overallScore: 85,
        status: 'pass',
        summary: '通过',
      });
      mockProvider.generateJSON.mockResolvedValueOnce({
        facts: [
          { content: '林风获得黑色玉佩', category: 'plot', confidence: 'high' },
        ],
        newHooks: [
          {
            id: 'hook-black-jade',
            description: '黑色玉佩的来历',
            type: 'plot',
            priority: 'major',
          },
        ],
        updatedHooks: [],
      });

      const result = await runner.writeNextChapter({
        bookId: 'test-book',
        chapterNumber: 12,
        title: '记忆落盘章',
        genre: 'xianxia',
        userIntent: '测试记忆落盘',
      });

      expect(result.success).toBe(true);

      const writeCalls = (fs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls;
      const manifestWrites = writeCalls.filter((call: unknown[]) =>
        String(call[0]).includes('manifest.json')
      );
      expect(manifestWrites.length).toBeGreaterThan(0);

      const finalManifest = JSON.parse(String(manifestWrites.at(-1)![1])) as {
        lastChapterWritten: number;
        facts: Array<{ content: string; chapterNumber: number }>;
        hooks: Array<{ id: string; description: string }>;
      };

      expect(finalManifest.lastChapterWritten).toBe(12);
      expect(finalManifest.facts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            content: '林风获得黑色玉佩',
            chapterNumber: 12,
          }),
        ])
      );
      expect(finalManifest.hooks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'hook-black-jade',
            description: '黑色玉佩的来历',
          }),
        ])
      );
    });

    it('updates existing chapter status in index when chapter already exists', async () => {
      mockProvider.generateJSON.mockResolvedValueOnce({
        summary: '上一章',
        activeHooks: [],
        characterStates: [],
        locationContext: '某处',
      });
      mockProvider.generateJSON.mockResolvedValueOnce({
        chapterGoal: '目标',
        keyScenes: [],
        emotionalArc: '',
        hookProgression: [],
      });
      mockProvider.generate.mockResolvedValueOnce({
        text: '已存在章节内容',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'test',
      });
      mockProvider.generate.mockResolvedValueOnce({
        text: '润色稿',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'test',
      });
      mockProvider.generateJSON.mockResolvedValueOnce({
        issues: [],
        overallScore: 80,
        status: 'pass',
        summary: '通过',
      });
      mockProvider.generateJSON.mockResolvedValueOnce({
        facts: [],
        newHooks: [],
        updatedHooks: [],
      });

      // Simulate chapter already in index
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockImplementation((filePath: string) => {
        if (String(filePath).includes('meta.json')) {
          return JSON.stringify({ title: 'Test Novel', genre: 'xianxia' });
        }
        if (String(filePath).includes('index.json')) {
          return JSON.stringify({
            bookId: 'test-book',
            chapters: [{ chapterNumber: 11, title: '已存在章', status: 'planned' }],
            totalChapters: 1,
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

      const result = await runner.writeNextChapter({
        bookId: 'test-book',
        chapterNumber: 11,
        title: '更新索引章',
        genre: 'xianxia',
        userIntent: '测试索引更新',
      });

      expect(result.success).toBe(true);

      // Verify legacy chapter entry was normalized instead of duplicated
      const writeCalls = (fs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls;
      const indexWrite = writeCalls.find((call: unknown[]) => {
        const fp = String(call[0]);
        return fp.includes('index.json');
      });
      expect(indexWrite).toBeDefined();
      const indexPayload = JSON.parse(String(indexWrite![1])) as {
        chapters: Array<Record<string, unknown>>;
      };
      expect(indexPayload.chapters).toHaveLength(1);
      expect(indexPayload.chapters[0]).toEqual(
        expect.objectContaining({
          number: 11,
          title: '更新索引章',
          fileName: 'chapter-0011.md',
        })
      );
      expect(indexPayload.chapters[0]).not.toHaveProperty('chapterNumber');
      expect(indexPayload.chapters[0]).not.toHaveProperty('status');
    });

    it('records telemetry for writer/composer/auditor channels after completion', async () => {
      const recordFn = vi.fn();
      const spyLogger = {
        record: recordFn,
        read: vi.fn(() => null),
        listBookTelemetry: vi.fn(() => []),
      } as unknown as TelemetryLogger;

      const runnerWithSpy = new PipelineRunner({
        rootDir: '/tmp/test-books',
        provider: mockProvider,
        maxRevisionRetries: 2,
        fallbackAction: 'accept_with_warnings',
        telemetryLogger: spyLogger,
      });

      mockProvider.generateJSON.mockResolvedValueOnce({
        summary: '上一章',
        activeHooks: [],
        characterStates: [],
        locationContext: '某处',
      });
      mockProvider.generateJSON.mockResolvedValueOnce({
        chapterGoal: '目标',
        keyScenes: [],
        emotionalArc: '',
        hookProgression: [],
      });
      mockProvider.generate.mockResolvedValueOnce({
        text: '初稿',
        usage: { promptTokens: 500, completionTokens: 400, totalTokens: 900 },
        model: 'test',
      });
      mockProvider.generate.mockResolvedValueOnce({
        text: '润色稿',
        usage: { promptTokens: 300, completionTokens: 200, totalTokens: 500 },
        model: 'test',
      });
      mockProvider.generateJSON.mockResolvedValueOnce({
        issues: [],
        overallScore: 85,
        status: 'pass',
        summary: '通过',
      });

      const result = await runnerWithSpy.writeNextChapter({
        bookId: 'book-telemetry',
        chapterNumber: 1,
        title: '遥测章',
        genre: 'xianxia',
        userIntent: '测试遥测落盘',
      });

      expect(result.success).toBe(true);

      const calls = recordFn.mock.calls;
      const channels = calls.map((call) => call[2] as string);
      expect(channels).toContain('writer');
      expect(channels).toContain('composer');

      const writerCall = calls.find((call) => call[2] === 'writer');
      expect(writerCall?.[3]).toEqual(
        expect.objectContaining({ totalTokens: 900 })
      );
      const composerCall = calls.find((call) => call[2] === 'composer');
      expect(composerCall?.[3]).toEqual(
        expect.objectContaining({ totalTokens: 500 })
      );
    });

    it('records reviser channel telemetry when revision loop runs', async () => {
      const recordFn = vi.fn();
      const spyLogger = {
        record: recordFn,
        read: vi.fn(() => null),
        listBookTelemetry: vi.fn(() => []),
      } as unknown as TelemetryLogger;

      const runnerWithSpy = new PipelineRunner({
        rootDir: '/tmp/test-books',
        provider: mockProvider,
        maxRevisionRetries: 2,
        fallbackAction: 'accept_with_warnings',
        telemetryLogger: spyLogger,
      });

      mockProvider.generateJSON.mockResolvedValueOnce({
        summary: '上一章',
        activeHooks: [],
        characterStates: [],
        locationContext: '某处',
      });
      mockProvider.generateJSON.mockResolvedValueOnce({
        chapterGoal: '目标',
        keyScenes: [],
        emotionalArc: '',
        hookProgression: [],
      });
      mockProvider.generate.mockResolvedValueOnce({
        text: '初稿',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'test',
      });
      mockProvider.generate.mockResolvedValueOnce({
        text: '润色稿',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'test',
      });
      mockProvider.generateJSON.mockResolvedValueOnce({
        issues: [{ severity: 'blocking', description: '需要修订' }],
        overallScore: 40,
        status: 'fail',
        summary: '需修订',
      });
      mockProvider.generate.mockResolvedValueOnce({
        text: '修订稿',
        usage: { promptTokens: 120, completionTokens: 80, totalTokens: 200 },
        model: 'test',
      });
      mockProvider.generateJSON.mockResolvedValueOnce({
        issues: [],
        overallScore: 80,
        status: 'pass',
        summary: '通过',
      });

      const result = await runnerWithSpy.writeNextChapter({
        bookId: 'book-telemetry-revise',
        chapterNumber: 2,
        title: '修订章',
        genre: 'xianxia',
        userIntent: '测试修订遥测',
      });

      expect(result.success).toBe(true);

      const channels = recordFn.mock.calls.map((call) => call[2] as string);
      expect(channels).toContain('reviser');
      const reviserCall = recordFn.mock.calls.find((call) => call[2] === 'reviser');
      expect(reviserCall?.[3]).toEqual(
        expect.objectContaining({ totalTokens: 200 })
      );
    });

    it('records writer telemetry on writeDraft', async () => {
      const recordFn = vi.fn();
      const spyLogger = {
        record: recordFn,
        read: vi.fn(() => null),
        listBookTelemetry: vi.fn(() => []),
      } as unknown as TelemetryLogger;

      const runnerWithSpy = new PipelineRunner({
        rootDir: '/tmp/test-books',
        provider: mockProvider,
        telemetryLogger: spyLogger,
      });

      mockProvider.generate.mockResolvedValueOnce({
        text: '草稿',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'test',
      });

      await runnerWithSpy.writeDraft({
        bookId: 'test-book',
        chapterNumber: 7,
        title: '草稿章',
        genre: 'xianxia',
        sceneDescription: '草稿测试',
      });

      const writerCall = recordFn.mock.calls.find((call) => call[2] === 'writer');
      expect(writerCall).toBeDefined();
      expect(writerCall?.[1]).toBe(7);
      expect(writerCall?.[3]).toEqual(
        expect.objectContaining({ totalTokens: 150 })
      );
    });

    it('returns error when composeChapter throws unexpected exception', async () => {
      mockProvider.generateJSON.mockResolvedValueOnce({
        summary: '上一章',
        activeHooks: [],
        characterStates: [],
        locationContext: '某处',
      });
      mockProvider.generateJSON.mockResolvedValueOnce({
        chapterGoal: '目标',
        keyScenes: [],
        emotionalArc: '',
        hookProgression: [],
      });
      mockProvider.generate.mockResolvedValueOnce({
        text: '初稿',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'test',
      });
      mockProvider.generate.mockRejectedValueOnce(new Error('ScenePolisher crash'));

      const result = await runner.writeNextChapter({
        bookId: 'test-book',
        chapterNumber: 12,
        title: '异常章',
        genre: 'xianxia',
        userIntent: '测试异常处理',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('章节创作失败');
      // Lock should be released
      const unlinkCalls = (fs.unlinkSync as ReturnType<typeof vi.fn>).mock.calls;
      expect(unlinkCalls.length).toBeGreaterThan(0);
    });
  });

  // ── planChapter() ─────────────────────────────────────────

  describe('planChapter()', () => {
    it('validates chapter number', async () => {
      const result = await runner.planChapter({
        bookId: 'test-book',
        chapterNumber: 0,
        outlineContext: 'invalid',
      });

      expect(result.success).toBe(false);
    });

    it('plans a chapter with outline and chapter plan', async () => {
      mockProvider.generateJSON
        .mockResolvedValueOnce({
          chapterNumber: 1,
          title: '第一章',
          summary: '主角出场',
          keyEvents: ['林风登场', '发现灵剑'],
          targetWordCount: 3000,
          hooks: [],
        })
        .mockResolvedValueOnce({
          scenes: [
            { description: '林风走进大厅', targetWords: 1000, mood: '紧张' },
            { description: '发现神秘玉佩', targetWords: 1000, mood: '神秘' },
          ],
          characters: ['林风'],
          hooks: [],
        });

      const result = await runner.planChapter({
        bookId: 'test-book',
        chapterNumber: 1,
        outlineContext: '主角首次出场',
      });

      expect(result.success).toBe(true);
      expect(result.chapterNumber).toBe(1);
      expect(result.title).toBe('第一章');
    });

    it('writes planned chapter entries using canonical index fields', async () => {
      mockProvider.generateJSON.mockResolvedValueOnce({
        chapterNumber: 2,
        title: '第二章',
        summary: '第二章概要',
        keyEvents: ['事件一'],
        targetWordCount: 3000,
        hooks: [],
      });

      mockProvider.generateJSON.mockResolvedValueOnce({
        scenes: [{ description: '场景', targetWords: 1000, mood: '紧张' }],
        characters: ['林风'],
        hooks: [],
      });

      await runner.planChapter({
        bookId: 'test-book',
        chapterNumber: 2,
        outlineContext: '进入第二章',
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
          number: 2,
          title: '第二章',
          fileName: 'chapter-0002.md',
        })
      );
      expect(payload.chapters[0]).not.toHaveProperty('chapterNumber');
      expect(payload).toHaveProperty('lastUpdated');
    });
  });

  // ── upgradeDraft() ──────────────────────────────────────────

  describe('upgradeDraft()', () => {
    it('validates chapter number', async () => {
      const result = await runner.upgradeDraft({
        bookId: 'test-book',
        chapterNumber: 0,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('章节号');
    });

    it('returns error when book does not exist', async () => {
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);

      const result = await runner.upgradeDraft({
        bookId: 'nonexistent-book',
        chapterNumber: 1,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('不存在');
    });

    it('returns error when draft chapter does not exist', async () => {
      // Book exists but chapter file doesn't
      (fs.existsSync as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(true) // meta.json
        .mockReturnValueOnce(false); // chapter file

      const result = await runner.upgradeDraft({
        bookId: 'test-book',
        chapterNumber: 99,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('草稿');
    });

    it('detects versionToken drift and reports warning', async () => {
      // Simulate: manifest versionToken changed since draft was written
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockImplementation((filePath: string) => {
        if (String(filePath).includes('meta.json')) {
          return JSON.stringify({ title: 'Test Novel', genre: 'xianxia' });
        }
        if (String(filePath).includes('index.json')) {
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
          versionToken: 2,
          lastChapterWritten: 0,
          hooks: [],
          facts: [],
          characters: [],
          worldRules: [],
          updatedAt: new Date().toISOString(),
        });
      });

      mockProvider.generate.mockResolvedValue({
        text: '润色后的转正内容',
        usage: { promptTokens: 200, completionTokens: 100, totalTokens: 300 },
        model: 'test-model',
      });

      const result = await runner.upgradeDraft({
        bookId: 'test-book',
        chapterNumber: 1,
        userIntent: '将草稿转正',
      });

      // Should succeed but include a warning about context drift
      expect(result.success).toBe(true);
      expect(result.warningCode).toBe('context_drift');
      expect(result.warning).toContain('上下文版本变化');
      expect(result.error).toBeUndefined();

      const writeCalls = (fs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls;
      const chapterWrite = writeCalls.find((call: unknown[]) =>
        String(call[0]).includes('chapter-0001.md')
      );
      expect(String(chapterWrite?.[1] ?? '')).toContain('warningCode: context_drift');
    });

    it('regenerates content via ScenePolisher and persists as final', async () => {
      mockProvider.generate.mockResolvedValue({
        text: '重新润色后的正式内容',
        usage: { promptTokens: 300, completionTokens: 150, totalTokens: 450 },
        model: 'test-model',
      });

      const result = await runner.upgradeDraft({
        bookId: 'test-book',
        chapterNumber: 1,
        userIntent: '将草稿转正并润色',
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('final');
      expect(result.persisted).toBe(true);
      expect(result.content).toContain('重新润色');
    });

    it('acquires and releases book lock', async () => {
      mockProvider.generate.mockResolvedValue({
        text: '锁测试内容',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'test-model',
      });

      vi.clearAllMocks();
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (fs.openSync as ReturnType<typeof vi.fn>).mockReturnValue(1);
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockImplementation((filePath: string) => {
        if (String(filePath).includes('meta.json')) {
          return JSON.stringify({ title: 'Test Novel', genre: 'xianxia' });
        }
        if (String(filePath).includes('index.json')) {
          return JSON.stringify({
            bookId: 'test-book',
            chapters: [],
            totalChapters: 0,
            totalWords: 0,
            updatedAt: new Date().toISOString(),
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

      await runner.upgradeDraft({
        bookId: 'test-book',
        chapterNumber: 1,
        userIntent: '测试锁',
      });

      const openCalls = (fs.openSync as ReturnType<typeof vi.fn>).mock.calls;
      expect(openCalls.length).toBeGreaterThan(0);
      const unlinkCalls = (fs.unlinkSync as ReturnType<typeof vi.fn>).mock.calls;
      expect(unlinkCalls.length).toBeGreaterThan(0);
    });

    it('releases lock even when regeneration fails', async () => {
      mockProvider.generate.mockRejectedValue(new Error('API timeout'));

      await runner.upgradeDraft({
        bookId: 'test-book',
        chapterNumber: 1,
        userIntent: '会失败',
      });

      const unlinkCalls = (fs.unlinkSync as ReturnType<typeof vi.fn>).mock.calls;
      expect(unlinkCalls.length).toBeGreaterThan(0);
    });

    it('updates chapter status to written in index', async () => {
      mockProvider.generate.mockResolvedValue({
        text: '转正内容',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'test-model',
      });

      await runner.upgradeDraft({
        bookId: 'test-book',
        chapterNumber: 1,
        userIntent: '转正',
      });

      // 验证 index.json 被更新
      const writeCalls = (fs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls;
      const indexWrite = writeCalls.find((call: unknown[]) => {
        const filePath = String(call[0]);
        return filePath.includes('index.json');
      });
      expect(indexWrite).toBeDefined();
    });
  });

  // ── ChapterResult structure ───────────────────────────────

  describe('ChapterResult', () => {
    it('returns structured result with metadata', async () => {
      mockProvider.generate.mockResolvedValue({
        text: '内容',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'test-model',
      });

      const result = await runner.writeDraft({
        bookId: 'test-book',
        chapterNumber: 1,
        title: '测试',
        genre: 'xianxia',
        sceneDescription: '测试',
      });

      expect(result.bookId).toBe('test-book');
      expect(result.chapterNumber).toBe(1);
      expect(typeof result.success).toBe('boolean');
      expect(result.usage).toBeDefined();
    });
  });
});
