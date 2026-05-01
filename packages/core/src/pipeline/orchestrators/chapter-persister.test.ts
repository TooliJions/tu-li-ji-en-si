import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { DefaultChapterPersister } from './chapter-persister';
import { StateManager } from '../../state/manager';
import { RuntimeStateStore } from '../../state/runtime-store';
import type { LLMProvider } from '../../llm/provider';

describe('DefaultChapterPersister', () => {
  let tmpDir: string;
  let stateManager: StateManager;
  let stateStore: RuntimeStateStore;
  let persister: DefaultChapterPersister;

  const mockProvider: LLMProvider = {
    generate: vi.fn(),
    generateJSON: vi.fn().mockResolvedValue({
      briefSummary: '摘要',
      detailedSummary: '详细摘要',
      keyEvents: ['事件1'],
      stateChanges: null,
      emotionalArc: null,
      cliffhanger: null,
      hookImpact: null,
      consistencyScore: 80,
    }),
    generateJSONWithMeta: vi.fn(),
    generateStream: vi.fn(),
    config: { model: 'test', apiKey: 'test' },
  } as unknown as LLMProvider;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(process.env.TEMP ?? '/tmp', 'persister-test-'));
    stateManager = new StateManager(tmpDir);
    stateStore = new RuntimeStateStore(stateManager);
    persister = new DefaultChapterPersister({ stateManager, stateStore, provider: mockProvider });

    // 初始化书籍结构
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

  it('持久化章节并更新状态', async () => {
    const manifest = stateStore.loadManifest('book-1');
    const result = await persister.persist({
      bookId: 'book-1',
      chapterNumber: 1,
      title: '第一章',
      content: '这是第一章内容',
      manifest,
    });

    expect(result.success).toBe(true);

    // 验证文件写入
    const chapterPath = stateManager.getChapterFilePath('book-1', 1);
    expect(fs.existsSync(chapterPath)).toBe(true);
    const content = fs.readFileSync(chapterPath, 'utf-8');
    expect(content).toContain('这是第一章内容');
    expect(content).toContain('status: final');

    // 验证索引更新
    const index = stateManager.readIndex('book-1');
    expect(index.chapters).toHaveLength(1);
    expect(index.chapters[0].number).toBe(1);
    expect(index.chapters[0].title).toBe('第一章');
  });

  it('携带 warning 持久化', async () => {
    const manifest = stateStore.loadManifest('book-1');
    const result = await persister.persist({
      bookId: 'book-1',
      chapterNumber: 1,
      title: '第一章',
      content: '内容',
      manifest,
      warning: '存在轻微问题',
      warningCode: 'accept_with_warnings',
    });

    expect(result.success).toBe(true);
    const chapterPath = stateManager.getChapterFilePath('book-1', 1);
    const content = fs.readFileSync(chapterPath, 'utf-8');
    expect(content).toContain('accept_with_warnings');
  });
});
