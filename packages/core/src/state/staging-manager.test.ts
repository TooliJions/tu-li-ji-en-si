import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StagingManager } from './staging-manager';
import * as fs from 'fs';

// Mock fs module
vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(() => ''),
  renameSync: vi.fn(),
  unlinkSync: vi.fn(),
  rmSync: vi.fn(),
  readdirSync: vi.fn(() => []),
  statSync: vi.fn(),
}));

vi.mock('path', () => ({
  default: {
    join: (...args: string[]) => args.join('/'),
    dirname: (p: string) => p.split('/').slice(0, -1).join('/'),
  },
  join: (...args: string[]) => args.join('/'),
  dirname: (p: string) => p.split('/').slice(0, -1).join('/'),
}));

describe('StagingManager', () => {
  let manager: StagingManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new StagingManager('/tmp/test-books');
  });

  describe('createStagingArea', () => {
    it('creates staging directory when book exists', () => {
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);

      const result = manager.createStagingArea('book-001');

      expect(result.success).toBe(true);
      expect(result.stagingDir).toContain('staging');
      expect(fs.mkdirSync).toHaveBeenCalled();
    });

    it('returns error when book directory does not exist', () => {
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);

      const result = manager.createStagingArea('nonexistent');

      expect(result.success).toBe(false);
      expect(result.error).toContain('不存在');
    });
  });

  describe('getStagingDir', () => {
    it('returns staging dir when it exists', () => {
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);

      const dir = manager.getStagingDir('book-001');

      expect(dir).toBeDefined();
      expect(dir).toContain('staging');
    });

    it('returns undefined when staging dir does not exist', () => {
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);

      const dir = manager.getStagingDir('book-001');

      expect(dir).toBeUndefined();
    });
  });

  describe('hasStagingArea', () => {
    it('returns true when staging dir exists', () => {
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
      expect(manager.hasStagingArea('book-001')).toBe(true);
    });

    it('returns false when staging dir does not exist', () => {
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);
      expect(manager.hasStagingArea('book-001')).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('removes staging directory when it exists', () => {
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);

      const result = manager.cleanup('book-001');

      expect(result.success).toBe(true);
      expect(fs.rmSync).toHaveBeenCalled();
    });

    it('succeeds silently when staging dir does not exist', () => {
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);

      const result = manager.cleanup('book-001');

      expect(result.success).toBe(true);
      expect(fs.rmSync).not.toHaveBeenCalled();
    });
  });

  describe('addFile', () => {
    it('writes file to staging directory', () => {
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);

      const result = manager.addFile('book-001', 'chapter-0001.md', '章节内容');

      expect(result.success).toBe(true);
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('returns error when staging directory does not exist', () => {
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);

      const result = manager.addFile('book-001', 'chapter-0001.md', '内容');

      expect(result.success).toBe(false);
      expect(result.error).toContain('staging');
    });
  });

  describe('getStagedFiles', () => {
    it('returns list of staged files', () => {
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (fs.readdirSync as ReturnType<typeof vi.fn>).mockReturnValue([
        'chapter-0001.md',
        'chapter-0002.md',
      ]);
      (fs.statSync as ReturnType<typeof vi.fn>).mockReturnValue({
        isFile: () => true,
        size: 1024,
        birthtime: new Date('2026-04-19T00:00:00.000Z'),
      });

      const files = manager.getStagedFiles('book-001');

      expect(files).toHaveLength(2);
      expect(files[0].name).toBe('chapter-0001.md');
      expect(files[0].size).toBe(1024);
    });

    it('returns empty array when staging dir does not exist', () => {
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);

      const files = manager.getStagedFiles('book-001');

      expect(files).toHaveLength(0);
    });

    it('skips directories in staging', () => {
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (fs.readdirSync as ReturnType<typeof vi.fn>).mockReturnValue(['subdir']);
      (fs.statSync as ReturnType<typeof vi.fn>).mockReturnValue({
        isFile: () => false,
        size: 0,
        birthtime: new Date(),
      });

      const files = manager.getStagedFiles('book-001');

      expect(files).toHaveLength(0);
    });
  });

  describe('commit', () => {
    it('creates file by renaming from staging to target', () => {
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);

      const result = manager.commit('book-001', [
        {
          stagingFile: 'chapter-0001.md',
          targetPath: '/tmp/books/chapter-0001.md',
          action: 'create',
        },
      ]);

      expect(result.success).toBe(true);
      expect(result.applied).toHaveLength(1);
      expect(fs.renameSync).toHaveBeenCalled();
    });

    it('replaces file by renaming from staging to target', () => {
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);

      const result = manager.commit('book-001', [
        {
          stagingFile: 'chapter-0001.md',
          targetPath: '/tmp/books/chapter-0001.md',
          action: 'replace',
        },
      ]);

      expect(result.success).toBe(true);
      expect(fs.mkdirSync).toHaveBeenCalled();
    });

    it('deletes target file and removes from staging', () => {
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);

      const result = manager.commit('book-001', [
        {
          stagingFile: 'chapter-0002.md',
          targetPath: '/tmp/books/chapter-0002.md',
          action: 'delete',
        },
      ]);

      expect(result.success).toBe(true);
      expect(fs.unlinkSync).toHaveBeenCalled();
    });

    it('skips delete when target does not exist', () => {
      const stagingDirPath = '/tmp/test-books/book-001/story/staging';
      (fs.existsSync as ReturnType<typeof vi.fn>).mockImplementation((p: string) => {
        // Only staging dir itself exists; not target file or staging file
        return p === stagingDirPath;
      });

      const result = manager.commit('book-001', [
        {
          stagingFile: 'nonexistent.md',
          targetPath: '/tmp/books/nonexistent.md',
          action: 'delete',
        },
      ]);

      expect(result.success).toBe(true);
      expect(fs.unlinkSync).not.toHaveBeenCalled();
    });

    it('returns error when staging directory does not exist', () => {
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);

      const result = manager.commit('book-001', [
        {
          stagingFile: 'chapter-0001.md',
          targetPath: '/tmp/books/chapter-0001.md',
          action: 'create',
        },
      ]);

      expect(result.success).toBe(false);
      expect(result.error).toContain('staging');
    });

    it('handles partial failures during commit', () => {
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (fs.mkdirSync as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
        throw new Error('disk full');
      });

      const result = manager.commit('book-001', [
        {
          stagingFile: 'chapter-0001.md',
          targetPath: '/tmp/books/chapter-0001.md',
          action: 'create',
        },
        {
          stagingFile: 'chapter-0002.md',
          targetPath: '/tmp/books/chapter-0002.md',
          action: 'create',
        },
      ]);

      expect(result.success).toBe(false);
      expect(result.error).toContain('提交失败');
    });
  });

  describe('prepareMergePlan', () => {
    it('generates merge plan with file operations', () => {
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);

      const plan = manager.prepareMergePlan('book-001', 3, 4);

      expect(plan.success).toBe(true);
      expect(plan.operation).toBe('merge');
      expect(plan.files).toHaveLength(2);
      expect(plan.files[0].action).toBe('replace'); // fromChapter replaced
      expect(plan.files[1].action).toBe('delete'); // toChapter deleted
      expect(plan.reanchorFacts).toHaveLength(1);
      expect(plan.reanchorFacts[0].fromChapter).toBe(4);
      expect(plan.reanchorFacts[0].toChapter).toBe(3);
    });

    it('detects subsequent chapters needing renumbering', () => {
      // chapters 3, 4, 5, 6 exist
      let callCount = 0;
      (fs.existsSync as ReturnType<typeof vi.fn>).mockImplementation((p: string) => {
        callCount++;
        // First call: book dir exists
        if (callCount === 1) return true;
        // Check for chapter files (ch 5, 6, 7...)
        return String(p).includes('0005') || String(p).includes('0006');
      });

      const plan = manager.prepareMergePlan('book-001', 3, 4);

      expect(plan.success).toBe(true);
      expect(plan.renumberChapters).toHaveLength(2);
      expect(plan.renumberChapters![0]).toEqual({ oldNumber: 5, newNumber: 4 });
      expect(plan.renumberChapters![1]).toEqual({ oldNumber: 6, newNumber: 5 });
    });

    it('returns error when book does not exist', () => {
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);

      const plan = manager.prepareMergePlan('nonexistent', 1, 2);

      expect(plan.success).toBe(false);
      expect(plan.error).toContain('不存在');
    });
  });

  describe('prepareSplitPlan', () => {
    it('generates split plan with file operations', () => {
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);

      const plan = manager.prepareSplitPlan('book-001', 3, 10);

      expect(plan.success).toBe(true);
      expect(plan.operation).toBe('split');
      expect(plan.files).toHaveLength(2);
      expect(plan.files[0].action).toBe('replace'); // original chapter replaced
      expect(plan.files[1].action).toBe('create'); // new chapter created
      expect(plan.reanchorFacts).toHaveLength(1);
      expect(plan.reanchorFacts[0].fromChapter).toBe(3);
      expect(plan.reanchorFacts[0].toChapter).toBe(4);
    });

    it('detects subsequent chapters needing renumbering (+1)', () => {
      let callCount = 0;
      (fs.existsSync as ReturnType<typeof vi.fn>).mockImplementation((p: string) => {
        callCount++;
        if (callCount === 1) return true;
        // chapters 4, 5 exist
        return String(p).includes('0004') || String(p).includes('0005');
      });

      const plan = manager.prepareSplitPlan('book-001', 3, 10);

      expect(plan.success).toBe(true);
      expect(plan.renumberChapters).toHaveLength(2);
      expect(plan.renumberChapters![0]).toEqual({ oldNumber: 4, newNumber: 5 });
      expect(plan.renumberChapters![1]).toEqual({ oldNumber: 5, newNumber: 6 });
    });

    it('returns error when book does not exist', () => {
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);

      const plan = manager.prepareSplitPlan('nonexistent', 1, 5);

      expect(plan.success).toBe(false);
      expect(plan.error).toContain('不存在');
    });
  });
});
