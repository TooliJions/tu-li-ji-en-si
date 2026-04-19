import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StateManager } from './manager';
import * as fs from 'fs';
import * as path from 'path';

describe('StateManager', () => {
  let tmpDir: string;
  let manager: StateManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(process.cwd(), 'test-state-'));
    manager = new StateManager(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('getBookPath', () => {
    it('returns correct book root path', () => {
      const bookPath = manager.getBookPath('test-book-001');
      expect(bookPath).toBe(path.join(tmpDir, 'test-book-001'));
    });

    it('returns correct story directory path', () => {
      const storyPath = manager.getBookPath('book-123', 'story');
      expect(storyPath).toBe(path.join(tmpDir, 'book-123', 'story'));
    });

    it('returns correct state directory path', () => {
      const statePath = manager.getBookPath('book-123', 'story', 'state');
      expect(statePath).toBe(path.join(tmpDir, 'book-123', 'story', 'state'));
    });
  });

  describe('ensureBookStructure', () => {
    it('creates required directory structure for a book', () => {
      manager.ensureBookStructure('new-book');

      const expectedDirs = [
        path.join(tmpDir, 'new-book'),
        path.join(tmpDir, 'new-book', 'story'),
        path.join(tmpDir, 'new-book', 'story', 'chapters'),
        path.join(tmpDir, 'new-book', 'story', 'state'),
      ];

      for (const dir of expectedDirs) {
        expect(fs.existsSync(dir)).toBe(true);
      }
    });

    it('does not throw if structure already exists', () => {
      manager.ensureBookStructure('existing-book');
      expect(() => manager.ensureBookStructure('existing-book')).not.toThrow();
    });
  });

  describe('acquireBookLock / releaseBookLock', () => {
    it('acquires lock and returns lock info', () => {
      manager.ensureBookStructure('locked-book');
      const lock = manager.acquireBookLock('locked-book', 'write_chapter');

      expect(lock).not.toBeNull();
      expect(lock?.bookId).toBe('locked-book');
      expect(lock?.operation).toBe('write_chapter');
      expect(lock?.pid).toBe(process.pid);
    });

    it('creates .lock file on disk', () => {
      manager.ensureBookStructure('file-lock-book');
      manager.acquireBookLock('file-lock-book', 'persist');

      const lockPath = path.join(tmpDir, 'file-lock-book', '.lock');
      expect(fs.existsSync(lockPath)).toBe(true);
    });

    it('throws when lock is already held by another process', () => {
      manager.ensureBookStructure('double-lock-book');
      manager.acquireBookLock('double-lock-book', 'op1');

      expect(() => {
        manager.acquireBookLock('double-lock-book', 'op2');
      }).toThrow(/already locked/);
    });

    it('releases lock and removes .lock file', () => {
      manager.ensureBookStructure('release-book');
      manager.acquireBookLock('release-book', 'temp');

      const lockPath = path.join(tmpDir, 'release-book', '.lock');
      expect(fs.existsSync(lockPath)).toBe(true);

      manager.releaseBookLock('release-book');
      expect(fs.existsSync(lockPath)).toBe(false);
    });

    it('allows lock acquisition after release', () => {
      manager.ensureBookStructure('relock-book');
      manager.acquireBookLock('relock-book', 'first');
      manager.releaseBookLock('relock-book');

      expect(() => {
        manager.acquireBookLock('relock-book', 'second');
      }).not.toThrow();
    });
  });

  describe('readIndex / writeIndex', () => {
    it('writes and reads back index.json', () => {
      manager.ensureBookStructure('index-book');

      const index = {
        bookId: 'index-book',
        chapters: [
          {
            number: 1,
            title: '第一章',
            fileName: 'chapter-0001.md',
            wordCount: 3200,
            createdAt: new Date().toISOString(),
          },
        ],
        totalChapters: 1,
        totalWords: 3200,
        lastUpdated: new Date().toISOString(),
      };

      manager.writeIndex('index-book', index);
      const readBack = manager.readIndex('index-book');

      expect(readBack.bookId).toBe('index-book');
      expect(readBack.totalChapters).toBe(1);
      expect(readBack.chapters).toHaveLength(1);
      expect(readBack.chapters[0].title).toBe('第一章');
    });

    it('throws when reading index that does not exist', () => {
      manager.ensureBookStructure('no-index-book');
      expect(() => manager.readIndex('no-index-book')).toThrow();
    });

    it('returns empty index when no chapters written yet', () => {
      manager.ensureBookStructure('empty-book');

      const emptyIndex = {
        bookId: 'empty-book',
        chapters: [],
        totalChapters: 0,
        totalWords: 0,
        lastUpdated: new Date().toISOString(),
      };

      manager.writeIndex('empty-book', emptyIndex);
      const read = manager.readIndex('empty-book');

      expect(read.chapters).toHaveLength(0);
      expect(read.totalWords).toBe(0);
    });
  });

  describe('chapter path utilities', () => {
    it('generates correct chapter file path', () => {
      const chapterPath = manager.getChapterFilePath('book-01', 1);
      expect(chapterPath).toBe(
        path.join(tmpDir, 'book-01', 'story', 'chapters', 'chapter-0001.md')
      );
    });

    it('generates correct chapter file path for double digits', () => {
      const chapterPath = manager.getChapterFilePath('book-01', 42);
      expect(chapterPath).toBe(
        path.join(tmpDir, 'book-01', 'story', 'chapters', 'chapter-0042.md')
      );
    });
  });

  describe('end-to-end: lock → write index → read index → release', () => {
    it('completes full workflow without errors', () => {
      manager.ensureBookStructure('e2e-book');
      manager.acquireBookLock('e2e-book', 'write');

      const index = {
        bookId: 'e2e-book',
        chapters: [],
        totalChapters: 0,
        totalWords: 0,
        lastUpdated: new Date().toISOString(),
      };

      index.chapters.push({
        number: 1,
        title: '开篇',
        fileName: 'chapter-0001.md',
        wordCount: 2500,
        createdAt: new Date().toISOString(),
      });
      index.totalChapters = 1;
      index.totalWords = 2500;
      index.lastUpdated = new Date().toISOString();

      manager.writeIndex('e2e-book', index);

      const verified = manager.readIndex('e2e-book');
      expect(verified.totalChapters).toBe(1);
      expect(verified.totalWords).toBe(2500);

      manager.releaseBookLock('e2e-book');
    });
  });
});
