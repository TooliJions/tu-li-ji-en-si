/**
 * PipelineRunner Golden Path Integration Test
 *
 * 目的：锁定 writeNextChapter 的完整链路输出结构和副作用，
 * 作为后续重构的零回归红线。此测试不验证业务逻辑（由 runner.test.ts
 * 覆盖），而是验证返回结构、文件副作用和调用链不变。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LLMProvider } from '../llm/provider';
import type { TelemetryLogger } from '../telemetry/logger';

// ─── Mock fs / path ─────────────────────────────────────────────

vi.mock('fs', () => ({
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  renameSync: vi.fn(),
  readFileSync: vi.fn((filePath: string) => {
    if (filePath.includes('meta.json')) {
      return JSON.stringify({
        title: 'Golden Test Novel',
        genre: 'xianxia',
        synopsis: '一部修仙小说的简介',
      });
    }
    if (filePath.includes('index.json')) {
      return JSON.stringify({
        bookId: 'golden-book',
        chapters: [],
        totalChapters: 0,
        totalWords: 0,
        lastUpdated: new Date().toISOString(),
      });
    }
    // Default: manifest
    return JSON.stringify({
      bookId: 'golden-book',
      versionToken: 1,
      lastChapterWritten: 0,
      hooks: [],
      facts: [],
      characters: [],
      worldRules: [],
      chapterPlans: {},
      outline: [],
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

// ─── Helpers ────────────────────────────────────────────────────

function createMockProvider(): LLMProvider & {
  generate: ReturnType<typeof vi.fn>;
  generateJSON: ReturnType<typeof vi.fn>;
  generateJSONWithMeta: ReturnType<typeof vi.fn>;
} {
  return {
    generate: vi.fn(),
    generateJSON: vi.fn(),
    generateJSONWithMeta: vi.fn(),
  } as unknown as LLMProvider & {
    generate: ReturnType<typeof vi.fn>;
    generateJSON: ReturnType<typeof vi.fn>;
    generateJSONWithMeta: ReturnType<typeof vi.fn>;
  };
}

function createNoopTelemetryLogger(): TelemetryLogger {
  return {
    record: vi.fn(),
    read: vi.fn(() => null),
    listBookTelemetry: vi.fn(() => []),
  } as unknown as TelemetryLogger;
}

/**
 * 设置黄金路径的完整 LLM Mock 链。
 * 调用顺序（与 chapter-composer 内部一致）：
 * 1. IntentDirector → generateJSON
 * 2. ChapterExecutor.generateScene → provider.generate
 * 3. ScenePolisher → provider.generate
 * 4. RevisionLoop (Audit) → generateJSON
 * 5. Memory extraction → generateJSON
 */
function setupGoldenMockChain(provider: ReturnType<typeof createMockProvider>) {
  // 1. IntentDirector
  provider.generateJSON.mockResolvedValueOnce({
    narrativeGoal: '展现主角突破境界',
    emotionalTone: '紧张→兴奋',
    keyBeats: ['灵气汇聚', '突破成功'],
    focusCharacters: ['林风'],
    styleNotes: '注重修炼细节',
  });

  // 2. ChapterExecutor (generateScene callback → provider.generate)
  provider.generate.mockResolvedValueOnce({
    text: '林风盘膝而坐，四周灵气疯狂涌入体内。他感受到经脉在扩张，境界壁垒在松动。\n\n轰！\n\n一道金光从他体内爆发，突破成功！',
    usage: { promptTokens: 800, completionTokens: 600, totalTokens: 1400 },
    model: 'test-model',
  });

  // 3. ScenePolisher
  provider.generate.mockResolvedValueOnce({
    text: '林风盘膝静坐于石台之上，四周灵气如百川归海般疯狂涌入体内。他清晰地感受到经脉在扩张，境界壁垒在一点点松动。\n\n轰然一声！\n\n一道璀璨金光从他体内爆发而出，突破成功！',
    usage: { promptTokens: 400, completionTokens: 300, totalTokens: 700 },
    model: 'test-model',
  });

  // 4. Audit (RevisionLoop)
  provider.generateJSON.mockResolvedValueOnce({
    issues: [],
    overallScore: 88,
    status: 'pass',
    summary: '质量良好，无阻塞问题',
  });

  // 5. Memory extraction
  provider.generateJSON.mockResolvedValueOnce({
    facts: [{ content: '林风突破到筑基期', category: 'plot', confidence: 'high' }],
    newHooks: [],
    updatedHooks: [],
  });
}

// ─── Tests ──────────────────────────────────────────────────────

describe('PipelineRunner golden path', () => {
  let provider: ReturnType<typeof createMockProvider>;
  let runner: PipelineRunner;

  beforeEach(() => {
    vi.clearAllMocks();
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);

    provider = createMockProvider();
    runner = new PipelineRunner({
      rootDir: '/tmp/golden-books',
      provider,
      maxRevisionRetries: 2,
      fallbackAction: 'accept_with_warnings',
      telemetryLogger: createNoopTelemetryLogger(),
    });
  });

  it('writeNextChapter 返回结构锁定', async () => {
    setupGoldenMockChain(provider);

    const result = await runner.writeNextChapter({
      bookId: 'golden-book',
      chapterNumber: 1,
      title: '突破',
      genre: 'xianxia',
      userIntent: '写一章主角突破境界的内容',
    });

    // ── 输出结构锁定 ──────────────────────────────────────
    expect(result).toMatchObject({
      success: true,
      bookId: 'golden-book',
      chapterNumber: 1,
      content: expect.any(String),
      status: 'final',
      persisted: true,
    });

    // 失败字段不应存在
    expect(result.error).toBeUndefined();

    // content 应为润色后的正文（包含 ScenePolisher 的输出特征）
    expect(result.content).toContain('突破成功');

    // usage 结构锁定
    expect(result.usage).toEqual(
      expect.objectContaining({
        promptTokens: expect.any(Number),
        completionTokens: expect.any(Number),
        totalTokens: expect.any(Number),
      })
    );
    expect(result.usage!.totalTokens).toBeGreaterThan(0);
  });

  it('writeNextChapter 文件副作用锁定', async () => {
    setupGoldenMockChain(provider);

    await runner.writeNextChapter({
      bookId: 'golden-book',
      chapterNumber: 1,
      title: '突破',
      genre: 'xianxia',
      userIntent: '写一章主角突破境界的内容',
    });

    const writeCalls = (fs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls;

    // 1. 章节文件必须被写入
    const chapterWrites = writeCalls.filter((call) =>
      String(call[0]).includes('/chapters/chapter-0001.md')
    );
    expect(chapterWrites.length).toBeGreaterThanOrEqual(1);

    const chapterContent = String(chapterWrites[0]![1]);
    expect(chapterContent).toContain('---');
    expect(chapterContent).toContain('title: 突破');
    expect(chapterContent).toContain('chapter: 1');
    expect(chapterContent).toContain('status: final');
    expect(chapterContent).toContain('突破成功');

    // 2. manifest.json 必须被更新
    const manifestWrites = writeCalls.filter((call) => String(call[0]).includes('manifest.json'));
    expect(manifestWrites.length).toBeGreaterThanOrEqual(1);

    const lastManifest = JSON.parse(String(manifestWrites.at(-1)![1]));
    expect(lastManifest).toMatchObject({
      bookId: 'golden-book',
      lastChapterWritten: 1,
      facts: expect.arrayContaining([expect.objectContaining({ content: '林风突破到筑基期' })]),
    });

    // 3. index.json 必须被更新
    const indexWrites = writeCalls.filter((call) => String(call[0]).includes('index.json'));
    expect(indexWrites.length).toBeGreaterThanOrEqual(1);

    const lastIndex = JSON.parse(String(indexWrites.at(-1)![1]));
    expect(lastIndex).toMatchObject({
      bookId: 'golden-book',
      totalChapters: 1,
      chapters: expect.arrayContaining([
        expect.objectContaining({
          number: 1,
          title: '突破',
          fileName: 'chapter-0001.md',
        }),
      ]),
    });
    expect(lastIndex.totalWords).toBeGreaterThan(0);
  });

  it('writeNextChapter 锁生命周期锁定', async () => {
    setupGoldenMockChain(provider);

    await runner.writeNextChapter({
      bookId: 'golden-book',
      chapterNumber: 1,
      title: '突破',
      genre: 'xianxia',
      userIntent: '写一章主角突破境界的内容',
    });

    // 锁文件必须被创建（openSync）和释放（unlinkSync / closeSync）
    expect(fs.openSync).toHaveBeenCalled();
    expect(fs.unlinkSync).toHaveBeenCalled();
  });

  it('writeNextChapter 失败路径返回 usage 结构', async () => {
    // 让 IntentDirector 抛异常，触发 composeChapter 失败路径
    provider.generateJSON.mockRejectedValueOnce(new Error('intent generation failed'));

    const result = await runner.writeNextChapter({
      bookId: 'golden-book',
      chapterNumber: 1,
      title: '突破',
      genre: 'xianxia',
      userIntent: '写一章主角突破境界的内容',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();

    // 失败路径也必须返回 usage（即使是零值）
    expect(result.usage).toEqual(
      expect.objectContaining({
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      })
    );
  });

  it('writeNextChapter 第 2 章同样结构正确', async () => {
    // 为第 2 章重新设置 mock（manifest 中已有第 1 章）
    (fs.readFileSync as ReturnType<typeof vi.fn>).mockImplementation((filePath: string) => {
      if (filePath.includes('meta.json')) {
        return JSON.stringify({
          title: 'Golden Test Novel',
          genre: 'xianxia',
          synopsis: '一部修仙小说的简介',
        });
      }
      if (filePath.includes('index.json')) {
        return JSON.stringify({
          bookId: 'golden-book',
          chapters: [
            {
              number: 1,
              title: '突破',
              fileName: 'chapter-0001.md',
              wordCount: 1500,
              createdAt: new Date().toISOString(),
            },
          ],
          totalChapters: 1,
          totalWords: 1500,
          lastUpdated: new Date().toISOString(),
        });
      }
      return JSON.stringify({
        bookId: 'golden-book',
        versionToken: 1,
        lastChapterWritten: 1,
        hooks: [],
        facts: [],
        characters: [],
        worldRules: [],
        chapterPlans: {},
        outline: [],
        updatedAt: new Date().toISOString(),
      });
    });

    setupGoldenMockChain(provider);

    const result = await runner.writeNextChapter({
      bookId: 'golden-book',
      chapterNumber: 2,
      title: '历练',
      genre: 'xianxia',
      userIntent: '写一章主角下山历练的内容',
    });

    expect(result).toMatchObject({
      success: true,
      bookId: 'golden-book',
      chapterNumber: 2,
      content: expect.any(String),
      status: 'final',
      persisted: true,
    });

    // 验证 index.json 现在包含两章
    const writeCalls = (fs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls;
    const indexWrites = writeCalls.filter((call) => String(call[0]).includes('index.json'));
    const lastIndex = JSON.parse(String(indexWrites.at(-1)![1]));
    expect(lastIndex.totalChapters).toBe(2);
    expect(lastIndex.chapters).toHaveLength(2);
  });
});
