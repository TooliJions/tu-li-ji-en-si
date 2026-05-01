import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '../../agents/auto-register';
import * as fs from 'fs';
import * as path from 'path';
import { DefaultDraftManager } from './draft-manager';
import { StateManager } from '../../state/manager';
import { RuntimeStateStore } from '../../state/runtime-store';
import type { LLMProvider } from '../../llm/provider';
import type { TelemetryLogger } from '../../telemetry/logger';

describe('DefaultDraftManager', () => {
  let tmpDir: string;
  let stateManager: StateManager;
  let stateStore: RuntimeStateStore;
  let draftManager: DefaultDraftManager;

  const mockProvider: LLMProvider = {
    generate: vi.fn().mockResolvedValue({
      text: '草稿内容',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    }),
    generateJSON: vi.fn(),
    generateJSONWithMeta: vi.fn(),
    generateStream: vi.fn(),
    config: { model: 'test', apiKey: 'test' },
  } as unknown as LLMProvider;

  const mockTelemetry: TelemetryLogger = {
    record: vi.fn(),
    read: vi.fn(),
    listBookTelemetry: vi.fn(),
  };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(process.env.TEMP ?? '/tmp', 'draft-test-'));
    stateManager = new StateManager(tmpDir);
    stateStore = new RuntimeStateStore(stateManager);
    draftManager = new DefaultDraftManager({
      provider: mockProvider,
      stateManager,
      stateStore,
      telemetryLogger: mockTelemetry,
    });

    stateManager.ensureBookStructure('book-1');
    stateStore.initializeBookState('book-1');
    stateManager.writeIndex('book-1', {
      bookId: 'book-1',
      chapters: [],
      totalChapters: 0,
      totalWords: 0,
      lastUpdated: new Date().toISOString(),
    });
    fs.writeFileSync(
      stateManager.getBookPath('book-1', 'meta.json'),
      JSON.stringify({ genre: 'xianxia', title: '测试', synopsis: '' }),
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('writeDraft', () => {
    it('成功创建草稿', async () => {
      const result = await draftManager.writeDraft({
        bookId: 'book-1',
        chapterNumber: 1,
        title: '第一章',
        genre: 'xianxia',
        sceneDescription: '场景描述',
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('draft');
      expect(result.content).toBe('草稿内容');

      const chapterPath = stateManager.getChapterFilePath('book-1', 1);
      expect(fs.existsSync(chapterPath)).toBe(true);
    });

    it('书籍不存在返回错误', async () => {
      const result = await draftManager.writeDraft({
        bookId: 'no-book',
        chapterNumber: 1,
        title: '第一章',
        genre: 'xianxia',
        sceneDescription: '场景',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('不存在');
    });
  });

  describe('writeFastDraft', () => {
    it('快速草稿不持久化', async () => {
      const result = await draftManager.writeFastDraft({
        bookId: 'book-1',
        chapterNumber: 1,
        title: '第一章',
        genre: 'xianxia',
        sceneDescription: '场景',
      });

      expect(result.success).toBe(true);
      expect(result.persisted).toBe(false);
    });
  });

  describe('upgradeDraft', () => {
    it('草稿不存在返回错误', async () => {
      const result = await draftManager.upgradeDraft({
        bookId: 'book-1',
        chapterNumber: 99,
        userIntent: '升级',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('草稿不存在');
    });

    it('章节号无效返回错误', async () => {
      const result = await draftManager.upgradeDraft({
        bookId: 'book-1',
        chapterNumber: 0,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('必须从 1 开始');
    });
  });
});
