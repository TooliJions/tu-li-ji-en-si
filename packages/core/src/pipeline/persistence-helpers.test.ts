import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  persistChapterAtomic,
  updateStateAfterChapter,
  loadStoredStateHash,
} from './persistence-helpers';
import { StateManager } from '../state/manager';
import { RuntimeStateStore } from '../state/runtime-store';

describe('persistence-helpers', () => {
  let tmpDir: string;
  let stateManager: StateManager;
  let stateStore: RuntimeStateStore;
  const bookId = 'book-test-001';

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(process.env.TEMP ?? '/tmp', 'persist-test-'));
    stateManager = new StateManager(tmpDir);
    stateStore = new RuntimeStateStore(stateManager);
    stateManager.ensureBookStructure(bookId);
    stateStore.initializeBookState(bookId);
    stateManager.writeIndex(bookId, {
      bookId,
      chapters: [],
      totalChapters: 0,
      totalWords: 0,
      lastUpdated: new Date().toISOString(),
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── persistChapterAtomic ──────────────────────────────────────

  describe('persistChapterAtomic', () => {
    it('writes chapter file with frontmatter', () => {
      persistChapterAtomic('正文内容', bookId, 1, '第一章', 'final', undefined, stateManager);

      const filePath = stateManager.getChapterFilePath(bookId, 1);
      const raw = fs.readFileSync(filePath, 'utf-8');
      expect(raw).toContain('---');
      expect(raw).toContain('title: 第一章');
      expect(raw).toContain('chapter: 1');
      expect(raw).toContain('status: final');
      expect(raw).toContain('正文内容');
    });

    it('writes draft status correctly', () => {
      persistChapterAtomic('草稿内容', bookId, 2, '第二章', 'draft', undefined, stateManager);

      const filePath = stateManager.getChapterFilePath(bookId, 2);
      const raw = fs.readFileSync(filePath, 'utf-8');
      expect(raw).toContain('status: draft');
    });

    it('includes warning metadata when provided', () => {
      persistChapterAtomic(
        '内容',
        bookId,
        1,
        '第一章',
        'final',
        { warning: '有质量问题', warningCode: 'accept_with_warnings' },
        stateManager,
      );

      const filePath = stateManager.getChapterFilePath(bookId, 1);
      const raw = fs.readFileSync(filePath, 'utf-8');
      expect(raw).toContain('warningCode: accept_with_warnings');
      expect(raw).toContain('warning: 有质量问题');
    });

    it('sanitizes newlines in warning', () => {
      persistChapterAtomic(
        '内容',
        bookId,
        1,
        '第一章',
        'final',
        { warning: '多行\n警告\r\n文本' },
        stateManager,
      );

      const filePath = stateManager.getChapterFilePath(bookId, 1);
      const raw = fs.readFileSync(filePath, 'utf-8');
      expect(raw).not.toContain('\n警告');
    });
  });

  // ── updateStateAfterChapter ───────────────────────────────────

  describe('updateStateAfterChapter', () => {
    it('新增章节到索引', () => {
      updateStateAfterChapter(bookId, 1, '第一章', '内容文本', stateManager, stateStore);

      const index = stateManager.readIndex(bookId);
      expect(index.chapters).toHaveLength(1);
      expect(index.chapters[0].number).toBe(1);
      expect(index.chapters[0].title).toBe('第一章');
      expect(index.totalChapters).toBe(1);
    });

    it('更新已有章节', () => {
      updateStateAfterChapter(bookId, 1, '第一章', '旧内容', stateManager, stateStore);
      updateStateAfterChapter(bookId, 1, '更新标题', '新内容更多字数', stateManager, stateStore);

      const index = stateManager.readIndex(bookId);
      expect(index.chapters).toHaveLength(1);
      expect(index.chapters[0].title).toBe('更新标题');
    });

    it('不修改原始索引对象', () => {
      const indexBefore = stateManager.readIndex(bookId);
      const chaptersBefore = indexBefore.chapters;

      updateStateAfterChapter(bookId, 1, '第一章', '内容', stateManager, stateStore);

      expect(chaptersBefore).toHaveLength(0);
    });

    it('更新总字数统计', () => {
      updateStateAfterChapter(bookId, 1, '第一章', '这是一段测试内容', stateManager, stateStore);

      const index = stateManager.readIndex(bookId);
      expect(index.totalWords).toBeGreaterThan(0);
    });
  });

  // ── loadStoredStateHash ───────────────────────────────────────

  describe('loadStoredStateHash', () => {
    it('returns hash when file exists', () => {
      const stateDir = stateManager.getBookPath(bookId, 'story', 'state');
      fs.writeFileSync(path.join(stateDir, '.state-hash'), 'abc123hash');

      const hash = loadStoredStateHash(stateDir);
      expect(hash).toBe('abc123hash');
    });

    it('returns null when file does not exist', () => {
      const hash = loadStoredStateHash('/nonexistent/path');
      expect(hash).toBeNull();
    });

    it('trims whitespace from hash', () => {
      const stateDir = stateManager.getBookPath(bookId, 'story', 'state');
      fs.writeFileSync(path.join(stateDir, '.state-hash'), '  hash-with-spaces  \n');

      const hash = loadStoredStateHash(stateDir);
      expect(hash).toBe('hash-with-spaces');
    });
  });
});
