import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StateBootstrap, type BootstrapOptions } from './bootstrap';
import { StateManager } from './manager';
import { RuntimeStateStore } from './runtime-store';
import * as fs from 'fs';
import * as path from 'path';

describe('StateBootstrap', () => {
  let tmpDir: string;
  const bookId = 'test-book-001';

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(process.cwd(), 'test-bootstrap-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── bootstrapBook ─────────────────────────────────────────────

  describe('bootstrapBook', () => {
    it('creates book directory structure', () => {
      const options: BootstrapOptions = {
        bookId,
        title: '测试小说',
        genre: 'xianxia',
        targetWords: 1000000,
      };

      StateBootstrap.bootstrapBook(tmpDir, options);

      expect(fs.existsSync(path.join(tmpDir, bookId))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, bookId, 'story'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, bookId, 'story', 'chapters'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, bookId, 'story', 'state'))).toBe(true);
    });

    it('creates book.json with correct metadata', () => {
      const options: BootstrapOptions = {
        bookId,
        title: '仙途',
        genre: 'xianxia',
        targetWords: 2000000,
        brief: '一个修仙者的故事',
        language: 'zh-CN',
      };

      StateBootstrap.bootstrapBook(tmpDir, options);

      const bookJson = JSON.parse(fs.readFileSync(path.join(tmpDir, bookId, 'book.json'), 'utf-8'));

      expect(bookJson.id).toBe(bookId);
      expect(bookJson.title).toBe('仙途');
      expect(bookJson.genre).toBe('xianxia');
      expect(bookJson.targetWords).toBe(2000000);
      expect(bookJson.brief).toBe('一个修仙者的故事');
      expect(bookJson.language).toBe('zh-CN');
      expect(bookJson.status).toBe('active');
      expect(bookJson.currentWords).toBe(0);
      expect(bookJson.chapterCount).toBe(0);
      expect(bookJson.createdAt).toBeDefined();
      expect(bookJson.updatedAt).toBeDefined();
    });

    it('creates manifest.json with empty initial state', () => {
      const options: BootstrapOptions = {
        bookId,
        title: '测试小说',
        genre: 'urban',
        targetWords: 500000,
      };

      StateBootstrap.bootstrapBook(tmpDir, options);

      const manifestPath = path.join(tmpDir, bookId, 'story', 'state', 'manifest.json');
      expect(fs.existsSync(manifestPath)).toBe(true);

      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      expect(manifest.bookId).toBe(bookId);
      expect(manifest.versionToken).toBe(1);
      expect(manifest.lastChapterWritten).toBe(0);
      expect(manifest.hooks).toEqual([]);
      expect(manifest.facts).toEqual([]);
      expect(manifest.characters).toEqual([]);
      expect(manifest.worldRules).toEqual([]);
      expect(manifest.updatedAt).toBeDefined();
    });

    it('creates index.json with empty chapters array', () => {
      const options: BootstrapOptions = {
        bookId,
        title: '测试小说',
        genre: 'fantasy',
        targetWords: 800000,
      };

      StateBootstrap.bootstrapBook(tmpDir, options);

      const indexPath = path.join(tmpDir, bookId, 'story', 'state', 'index.json');
      expect(fs.existsSync(indexPath)).toBe(true);

      const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      expect(index.bookId).toBe(bookId);
      expect(index.chapters).toEqual([]);
      expect(index.totalChapters).toBe(0);
    });

    it('creates initial projection Markdown files', () => {
      const options: BootstrapOptions = {
        bookId,
        title: '测试小说',
        genre: 'xianxia',
        targetWords: 1000000,
      };

      StateBootstrap.bootstrapBook(tmpDir, options);

      const stateDir = path.join(tmpDir, bookId, 'story', 'state');
      expect(fs.existsSync(path.join(stateDir, 'current_state.md'))).toBe(true);
      expect(fs.existsSync(path.join(stateDir, 'hooks.md'))).toBe(true);
      expect(fs.existsSync(path.join(stateDir, 'chapter_summaries.md'))).toBe(true);
      expect(fs.existsSync(path.join(stateDir, '.state-hash'))).toBe(true);
    });

    it('creates empty first chapter file', () => {
      const options: BootstrapOptions = {
        bookId,
        title: '测试小说',
        genre: 'xianxia',
        targetWords: 1000000,
      };

      StateBootstrap.bootstrapBook(tmpDir, options);

      const chapterPath = path.join(tmpDir, bookId, 'story', 'chapters', 'chapter-0000.md');
      expect(fs.existsSync(chapterPath)).toBe(true);
    });

    it('throws when book already exists', () => {
      const options: BootstrapOptions = {
        bookId,
        title: '测试小说',
        genre: 'xianxia',
        targetWords: 1000000,
      };

      StateBootstrap.bootstrapBook(tmpDir, options);

      expect(() => {
        StateBootstrap.bootstrapBook(tmpDir, options);
      }).toThrow(/already exists/i);
    });

    it('uses default values for optional fields', () => {
      const options: BootstrapOptions = {
        bookId,
        title: '最小配置',
        genre: 'urban',
        targetWords: 300000,
      };

      StateBootstrap.bootstrapBook(tmpDir, options);

      const bookJson = JSON.parse(fs.readFileSync(path.join(tmpDir, bookId, 'book.json'), 'utf-8'));

      expect(bookJson.language).toBe('zh-CN');
      expect(bookJson.status).toBe('active');
      expect(bookJson.promptVersion).toBe('v2');
      expect(bookJson.fanficMode).toBeNull();
    });

    it('supports fanfic mode', () => {
      const options: BootstrapOptions = {
        bookId,
        title: '同人小说',
        genre: 'fanfic',
        targetWords: 500000,
        fanficMode: {
          sourceWork: '原作名称',
          sourceAuthor: '原作作者',
          canonCharacters: ['角色A', '角色B'],
          timeline: '原作第一卷后',
        },
      };

      StateBootstrap.bootstrapBook(tmpDir, options);

      const bookJson = JSON.parse(fs.readFileSync(path.join(tmpDir, bookId, 'book.json'), 'utf-8'));

      expect(bookJson.genre).toBe('fanfic');
      expect(bookJson.fanficMode).not.toBeNull();
      expect(bookJson.fanficMode.sourceWork).toBe('原作名称');
      expect(bookJson.fanficMode.canonCharacters).toEqual(['角色A', '角色B']);
    });

    it('sets targetChapterCount when provided', () => {
      const options: BootstrapOptions = {
        bookId,
        title: '测试小说',
        genre: 'xianxia',
        targetWords: 1000000,
        targetChapterCount: 500,
      };

      StateBootstrap.bootstrapBook(tmpDir, options);

      const bookJson = JSON.parse(fs.readFileSync(path.join(tmpDir, bookId, 'book.json'), 'utf-8'));

      expect(bookJson.targetChapterCount).toBe(500);
    });
  });

  // ── bookExists ────────────────────────────────────────────────

  describe('bookExists', () => {
    it('returns false for non-existent book', () => {
      expect(StateBootstrap.bookExists(tmpDir, 'non-existent')).toBe(false);
    });

    it('returns true after bootstrap', () => {
      const options: BootstrapOptions = {
        bookId,
        title: '测试小说',
        genre: 'xianxia',
        targetWords: 1000000,
      };

      StateBootstrap.bootstrapBook(tmpDir, options);

      expect(StateBootstrap.bookExists(tmpDir, bookId)).toBe(true);
    });

    it('returns true when book.json exists', () => {
      const bookDir = path.join(tmpDir, bookId);
      fs.mkdirSync(bookDir, { recursive: true });
      fs.writeFileSync(path.join(bookDir, 'book.json'), '{}');

      expect(StateBootstrap.bookExists(tmpDir, bookId)).toBe(true);
    });
  });

  // ── End-to-end: bootstrap → load state ───────────────────────

  describe('end-to-end: bootstrap then load', () => {
    it('bootstrap creates state that StateManager can read', () => {
      const options: BootstrapOptions = {
        bookId,
        title: '测试小说',
        genre: 'xianxia',
        targetWords: 1000000,
      };

      StateBootstrap.bootstrapBook(tmpDir, options);

      const manager = new StateManager(tmpDir);
      const store = new RuntimeStateStore(manager);
      const manifest = store.loadManifest(bookId);

      expect(manifest.bookId).toBe(bookId);
      expect(manifest.versionToken).toBe(1);
      expect(manifest.facts).toEqual([]);
      expect(manifest.hooks).toEqual([]);
    });
  });
});
