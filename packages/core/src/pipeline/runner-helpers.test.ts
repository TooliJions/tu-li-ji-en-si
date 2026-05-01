import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { updateStateAfterChapter, buildDraftPrompt, warnIgnoredError } from './runner-helpers';
import { StateManager } from '../state/manager';
import { RuntimeStateStore } from '../state/runtime-store';

describe('runner-helpers', () => {
  describe('warnIgnoredError', () => {
    it('输出警告日志', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      warnIgnoredError('测试上下文', new Error('测试错误'));
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('测试上下文'));
      warnSpy.mockRestore();
    });
  });

  describe('buildDraftPrompt', () => {
    it('生成包含基本信息的 prompt', () => {
      const prompt = buildDraftPrompt({
        bookId: 'book-1',
        chapterNumber: 1,
        title: '第一章',
        genre: 'xianxia',
        sceneDescription: '主角登场',
      });
      expect(prompt).toContain('第一章');
      expect(prompt).toContain('xianxia');
      expect(prompt).toContain('主角登场');
    });
  });

  describe('updateStateAfterChapter', () => {
    let tmpDir: string;
    let stateManager: StateManager;
    let stateStore: RuntimeStateStore;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(process.env.TEMP ?? '/tmp', 'helpers-test-'));
      stateManager = new StateManager(tmpDir);
      stateStore = new RuntimeStateStore(stateManager);
      stateManager.ensureBookStructure('book-1');
      stateStore.initializeBookState('book-1');
      stateManager.writeIndex('book-1', {
        bookId: 'book-1',
        chapters: [],
        totalChapters: 0,
        totalWords: 0,
        lastUpdated: new Date().toISOString(),
      });
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('新增章节到索引（不可变更新）', () => {
      updateStateAfterChapter('book-1', 1, '第一章', '内容文本', stateManager, stateStore);

      const index = stateManager.readIndex('book-1');
      expect(index.chapters).toHaveLength(1);
      expect(index.chapters[0].number).toBe(1);
      expect(index.chapters[0].title).toBe('第一章');
      expect(index.totalChapters).toBe(1);
    });

    it('更新已有章节（不可变更新）', () => {
      updateStateAfterChapter('book-1', 1, '第一章', '旧内容', stateManager, stateStore);
      updateStateAfterChapter('book-1', 1, '更新标题', '新内容更多字数', stateManager, stateStore);

      const index = stateManager.readIndex('book-1');
      expect(index.chapters).toHaveLength(1);
      expect(index.chapters[0].title).toBe('更新标题');
    });

    it('不修改原始索引对象', () => {
      const indexBefore = stateManager.readIndex('book-1');
      const chaptersBefore = indexBefore.chapters;

      updateStateAfterChapter('book-1', 1, '第一章', '内容', stateManager, stateStore);

      // 原始对象不应被修改
      expect(chaptersBefore).toHaveLength(0);
    });
  });
});
