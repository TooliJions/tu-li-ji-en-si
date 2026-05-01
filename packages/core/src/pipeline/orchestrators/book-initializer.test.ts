import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { DefaultBookInitializer } from './book-initializer';
import { StateManager } from '../../state/manager';
import { RuntimeStateStore } from '../../state/runtime-store';
import '../../agents/auto-register';

function mockProvider(): import('../../llm/provider').LLMProvider {
  return {
    generate: vi
      .fn()
      .mockResolvedValue({
        text: '',
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      }),
    generateJSON: vi.fn(),
    getLastUsage: vi.fn(),
  } as unknown as import('../../llm/provider').LLMProvider;
}

describe('DefaultBookInitializer', () => {
  let tmpDir: string;
  let stateManager: StateManager;
  let stateStore: RuntimeStateStore;
  let initializer: DefaultBookInitializer;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(process.env.TEMP ?? '/tmp', 'book-init-test-'));
    stateManager = new StateManager(tmpDir);
    stateStore = new RuntimeStateStore(stateManager);
    initializer = new DefaultBookInitializer({
      stateManager,
      stateStore,
      provider: mockProvider(),
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('成功初始化新书', async () => {
    const result = await initializer.initBook({
      bookId: 'test-book',
      title: '测试书籍',
      genre: 'xianxia',
      synopsis: '这是一本测试书',
    });

    expect(result.success).toBe(true);
    expect(result.bookId).toBe('test-book');

    // 验证目录结构
    const bookPath = path.join(tmpDir, 'test-book');
    expect(fs.existsSync(bookPath)).toBe(true);
    expect(fs.existsSync(path.join(bookPath, 'story', 'state'))).toBe(true);
    expect(fs.existsSync(path.join(bookPath, 'story', 'chapters'))).toBe(true);

    // 验证 meta.json
    const meta = JSON.parse(fs.readFileSync(path.join(bookPath, 'meta.json'), 'utf-8'));
    expect(meta.title).toBe('测试书籍');
    expect(meta.genre).toBe('xianxia');

    // 验证 book.json
    const bookData = JSON.parse(fs.readFileSync(path.join(bookPath, 'book.json'), 'utf-8'));
    expect(bookData.title).toBe('测试书籍');
    expect(bookData.status).toBe('active');

    // 验证 index.json
    const index = JSON.parse(
      fs.readFileSync(path.join(bookPath, 'story', 'state', 'index.json'), 'utf-8'),
    );
    expect(index.bookId).toBe('test-book');
    expect(index.chapters).toHaveLength(0);
  });

  it('空 bookId 返回错误', async () => {
    const result = await initializer.initBook({
      bookId: '',
      title: '测试',
      genre: 'xianxia',
      synopsis: '简介',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('bookId 不能为空');
  });

  it('无效 bookId 返回错误', async () => {
    const result = await initializer.initBook({
      bookId: '../../etc/passwd',
      title: '测试',
      genre: 'xianxia',
      synopsis: '简介',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('格式无效');
  });

  it('空书名返回错误', async () => {
    const result = await initializer.initBook({
      bookId: 'test',
      title: '',
      genre: 'xianxia',
      synopsis: '简介',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('书名不能为空');
  });

  it('空题材返回错误', async () => {
    const result = await initializer.initBook({
      bookId: 'test',
      title: '测试',
      genre: '',
      synopsis: '简介',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('题材不能为空');
  });

  it('空简介返回错误', async () => {
    const result = await initializer.initBook({
      bookId: 'test',
      title: '测试',
      genre: 'xianxia',
      synopsis: '',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('简介不能为空');
  });

  it('重复 bookId 返回错误', async () => {
    await initializer.initBook({
      bookId: 'dup-book',
      title: '测试',
      genre: 'xianxia',
      synopsis: '简介',
    });

    const result = await initializer.initBook({
      bookId: 'dup-book',
      title: '测试2',
      genre: 'urban',
      synopsis: '简介2',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('已存在');
  });
});
