import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { ReorgLock } from './reorg-lock';
import { StagingManager } from './staging-manager';
import { StateManager } from './manager';
import { RuntimeStateStore } from './runtime-store';
import type { ChapterIndex } from '../models/chapter';

// ── Helpers ────────────────────────────────────────────────────────

function makeTempDir(): string {
  return path.join(process.cwd(), 'tmp-test-reorg-' + Math.random().toString(36).slice(2, 8));
}

function setupBook(
  rootDir: string,
  bookId: string,
  chapterContents: string[]
): { stateManager: StateManager; stateStore: RuntimeStateStore } {
  const sm = new StateManager(rootDir);
  const ss = new RuntimeStateStore(sm);

  sm.ensureBookStructure(bookId);
  ss.initializeBookState(bookId);

  const metaPath = sm.getBookPath(bookId, 'meta.json');
  fs.writeFileSync(
    metaPath,
    JSON.stringify({ title: 'Test Book', genre: 'fantasy' }, null, 2),
    'utf-8'
  );

  chapterContents.forEach((content, i) => {
    const chNum = i + 1;
    const filePath = sm.getChapterFilePath(bookId, chNum);
    fs.writeFileSync(
      filePath,
      `---\ntitle: Chapter ${chNum}\nchapter: ${chNum}\nstatus: final\ncreatedAt: ${new Date().toISOString()}\n---\n\n${content}`,
      'utf-8'
    );
  });

  const index: ChapterIndex = {
    bookId,
    chapters: chapterContents.map((_, i) => ({
      number: i + 1,
      title: `Chapter ${i + 1}`,
      fileName: `chapter-${String(i + 1).padStart(4, '0')}.md`,
      wordCount: chapterContents[i].length,
      createdAt: new Date().toISOString(),
    })),
    totalChapters: chapterContents.length,
    totalWords: chapterContents.reduce((sum, c) => sum + c.length, 0),
    lastUpdated: new Date().toISOString(),
  };
  sm.writeIndex(bookId, index);

  const manifest = ss.loadManifest(bookId);
  manifest.lastChapterWritten = chapterContents.length;
  ss.saveRuntimeStateSnapshot(bookId, manifest);

  return { stateManager: sm, stateStore: ss };
}

function cleanup(dir: string) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ── ReorgLock Tests ────────────────────────────────────────────────

describe('ReorgLock', () => {
  let rootDir: string;
  let reorgLock: ReorgLock;

  beforeEach(() => {
    rootDir = makeTempDir();
    reorgLock = new ReorgLock(rootDir);
  });

  afterEach(() => {
    cleanup(rootDir);
  });

  describe('acquire', () => {
    it('acquires reorg lock successfully', () => {
      setupBook(rootDir, 'book1', ['Ch1', 'Ch2']);

      const result = reorgLock.acquire('book1', 'merge');

      expect(result.acquired).toBe(true);
      expect(result.info?.operation).toBe('merge');
      expect(result.info?.bookId).toBe('book1');
    });

    it('rejects when reorg lock is already held', () => {
      setupBook(rootDir, 'book1', ['Ch1', 'Ch2']);

      const first = reorgLock.acquire('book1', 'merge');
      expect(first.acquired).toBe(true);

      const second = reorgLock.acquire('book1', 'split');
      expect(second.acquired).toBe(false);
      expect(second.reason).toContain('重组进行中');
    });

    it('detects zombie reorg lock and allows override', () => {
      setupBook(rootDir, 'book1', ['Ch1', 'Ch2']);

      // Acquire with a fake PID that doesn't exist
      reorgLock.acquire('book1', 'merge', 999999);

      const result = reorgLock.acquire('book1', 'split');
      expect(result.acquired).toBe(false);
      expect(result.reason).toContain('僵尸锁');
    });
  });

  describe('release', () => {
    it('releases reorg lock', () => {
      setupBook(rootDir, 'book1', ['Ch1', 'Ch2']);

      reorgLock.acquire('book1', 'merge');
      reorgLock.release('book1');

      expect(reorgLock.isLocked('book1')).toBe(false);
    });

    it('releases non-existent lock without error', () => {
      expect(() => reorgLock.release('nonexistent')).not.toThrow();
    });
  });

  describe('isLocked', () => {
    it('returns false when no lock exists', () => {
      setupBook(rootDir, 'book1', ['Ch1']);
      expect(reorgLock.isLocked('book1')).toBe(false);
    });

    it('returns true when lock is held', () => {
      setupBook(rootDir, 'book1', ['Ch1']);
      reorgLock.acquire('book1', 'merge');
      expect(reorgLock.isLocked('book1')).toBe(true);
    });
  });

  describe('getLockInfo', () => {
    it('returns lock details', () => {
      setupBook(rootDir, 'book1', ['Ch1']);
      reorgLock.acquire('book1', 'merge');

      const info = reorgLock.getLockInfo('book1');
      expect(info).not.toBeNull();
      expect(info?.operation).toBe('merge');
      expect(info?.isZombie).toBe(false);
    });

    it('returns null when no lock', () => {
      setupBook(rootDir, 'book1', ['Ch1']);
      expect(reorgLock.getLockInfo('book1')).toBeNull();
    });
  });

  describe('sentinel', () => {
    it('writes sentinel file', () => {
      setupBook(rootDir, 'book1', ['Ch1', 'Ch2']);

      reorgLock.writeSentinel('book1', 'merge', { fromChapter: 1, toChapter: 2 });

      const sentinelPath = path.join(rootDir, 'book1', 'story', 'state', '.reorg_in_progress');
      expect(fs.existsSync(sentinelPath)).toBe(true);

      const data = JSON.parse(fs.readFileSync(sentinelPath, 'utf-8'));
      expect(data.operation).toBe('merge');
      expect(data.fromChapter).toBe(1);
      expect(data.toChapter).toBe(2);
    });

    it('removes sentinel file', () => {
      setupBook(rootDir, 'book1', ['Ch1', 'Ch2']);

      reorgLock.writeSentinel('book1', 'merge');
      reorgLock.removeSentinel('book1');

      const sentinelPath = path.join(rootDir, 'book1', 'story', 'state', '.reorg_in_progress');
      expect(fs.existsSync(sentinelPath)).toBe(false);
    });

    it('removes non-existent sentinel without error', () => {
      setupBook(rootDir, 'book1', ['Ch1']);
      expect(() => reorgLock.removeSentinel('book1')).not.toThrow();
    });

    it('hasSentinel returns correct state', () => {
      setupBook(rootDir, 'book1', ['Ch1', 'Ch2']);

      expect(reorgLock.hasSentinel('book1')).toBe(false);
      reorgLock.writeSentinel('book1', 'merge');
      expect(reorgLock.hasSentinel('book1')).toBe(true);
      reorgLock.removeSentinel('book1');
      expect(reorgLock.hasSentinel('book1')).toBe(false);
    });

    it('reads sentinel data back', () => {
      setupBook(rootDir, 'book1', ['Ch1', 'Ch2']);

      reorgLock.writeSentinel('book1', 'split', { chapter: 1, splitAt: 3 });

      const data = reorgLock.readSentinel('book1');
      expect(data).not.toBeNull();
      expect(data?.operation).toBe('split');
      expect(data?.chapter).toBe(1);
      expect(data?.splitAt).toBe(3);
    });

    it('returns null when no sentinel', () => {
      setupBook(rootDir, 'book1', ['Ch1']);
      expect(reorgLock.readSentinel('book1')).toBeNull();
    });
  });

  describe('scanAllReorgLocks', () => {
    it('scans all books for reorg locks', () => {
      setupBook(rootDir, 'book1', ['Ch1']);
      setupBook(rootDir, 'book2', ['Ch1']);

      reorgLock.acquire('book1', 'merge');

      const report = reorgLock.scanAllReorgLocks();
      expect(report.totalBooks).toBe(2);
      expect(report.lockedBooks).toBe(1);
      expect(report.activeLocks.length).toBe(1);
      expect(report.activeLocks[0].bookId).toBe('book1');
    });

    it('detects zombie reorg locks', () => {
      setupBook(rootDir, 'book1', ['Ch1']);

      reorgLock.acquire('book1', 'merge', 999999);

      const report = reorgLock.scanAllReorgLocks();
      expect(report.zombieLocks.length).toBe(1);
      expect(report.zombieLocks[0].bookId).toBe('book1');
    });
  });

  describe('cleanZombieReorgLocks', () => {
    it('removes zombie reorg locks', () => {
      setupBook(rootDir, 'book1', ['Ch1']);
      setupBook(rootDir, 'book2', ['Ch1']);

      reorgLock.acquire('book1', 'merge', 999999);
      reorgLock.acquire('book2', 'split'); // alive lock (current PID)

      const result = reorgLock.cleanZombieReorgLocks();
      expect(result.cleaned.length).toBe(1);
      expect(result.cleaned[0].bookId).toBe('book1');

      expect(reorgLock.isLocked('book1')).toBe(false);
      expect(reorgLock.isLocked('book2')).toBe(true);
    });

    it('dry run reports without deleting', () => {
      setupBook(rootDir, 'book1', ['Ch1']);

      reorgLock.acquire('book1', 'merge', 999999);

      const result = reorgLock.cleanZombieReorgLocks({ dryRun: true });
      expect(result.skipped).toBeUndefined(); // no skipped in non-dry
      expect(result.cleaned.length).toBe(1);
      expect(reorgLock.isLocked('book1')).toBe(true); // not deleted
    });
  });

  describe('forceUnlock', () => {
    it('force removes reorg lock', () => {
      setupBook(rootDir, 'book1', ['Ch1']);

      reorgLock.acquire('book1', 'merge');
      reorgLock.forceUnlock('book1');

      expect(reorgLock.isLocked('book1')).toBe(false);
    });
  });

  describe('getReorgStatus', () => {
    it('returns full status with sentinel and lock', () => {
      setupBook(rootDir, 'book1', ['Ch1', 'Ch2']);

      reorgLock.acquire('book1', 'merge');
      reorgLock.writeSentinel('book1', 'merge', { fromChapter: 1, toChapter: 2 });

      const status = reorgLock.getReorgStatus('book1');

      expect(status.isLocked).toBe(true);
      expect(status.hasSentinel).toBe(true);
      expect(status.operation).toBe('merge');
      expect(status.needsRecovery).toBe(false);
    });

    it('detects interrupted reorg when sentinel exists but no lock', () => {
      setupBook(rootDir, 'book1', ['Ch1', 'Ch2']);

      reorgLock.writeSentinel('book1', 'merge', { fromChapter: 1, toChapter: 2 });
      // Don't acquire lock → simulates crash after sentinel write

      const status = reorgLock.getReorgStatus('book1');
      expect(status.needsRecovery).toBe(true);
      expect(status.recoveryAction).toBe('manual_intervention');
    });

    it('returns idle status when nothing is set', () => {
      setupBook(rootDir, 'book1', ['Ch1']);

      const status = reorgLock.getReorgStatus('book1');
      expect(status.isLocked).toBe(false);
      expect(status.hasSentinel).toBe(false);
      expect(status.needsRecovery).toBe(false);
      expect(status.status).toBe('idle');
    });
  });
});

// ── StagingManager Tests ───────────────────────────────────────────

describe('StagingManager', () => {
  let rootDir: string;
  let stagingManager: StagingManager;

  beforeEach(() => {
    rootDir = makeTempDir();
    stagingManager = new StagingManager(rootDir);
  });

  afterEach(() => {
    cleanup(rootDir);
  });

  describe('createStagingArea', () => {
    it('creates staging directory', () => {
      setupBook(rootDir, 'book1', ['Ch1', 'Ch2']);

      const result = stagingManager.createStagingArea('book1');
      expect(result.success).toBe(true);
      expect(fs.existsSync(result.stagingDir!)).toBe(true);
    });

    it('fails if book directory does not exist', () => {
      const result = stagingManager.createStagingArea('nonexistent');
      expect(result.success).toBe(false);
      expect(result.error).toContain('不存在');
    });
  });

  describe('addFile', () => {
    it('adds a file to staging', () => {
      setupBook(rootDir, 'book1', ['Ch1', 'Ch2']);
      stagingManager.createStagingArea('book1');

      const result = stagingManager.addFile('book1', 'merged-chapter.md', 'merged content');
      expect(result.success).toBe(true);

      const stagingDir = stagingManager.getStagingDir('book1');
      const filePath = path.join(stagingDir!, 'merged-chapter.md');
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('merged content');
    });

    it('fails if staging area does not exist', () => {
      const result = stagingManager.addFile('book1', 'file.md', 'content');
      expect(result.success).toBe(false);
    });
  });

  describe('getStagedFiles', () => {
    it('returns list of staged files', () => {
      setupBook(rootDir, 'book1', ['Ch1', 'Ch2']);
      stagingManager.createStagingArea('book1');
      stagingManager.addFile('book1', 'file1.md', 'content1');
      stagingManager.addFile('book1', 'file2.md', 'content2');

      const files = stagingManager.getStagedFiles('book1');
      expect(files.length).toBe(2);
      expect(files.map((f) => f.name)).toContain('file1.md');
      expect(files.map((f) => f.name)).toContain('file2.md');
    });

    it('returns empty array when no staging area', () => {
      expect(stagingManager.getStagedFiles('book1')).toEqual([]);
    });
  });

  describe('hasStagingArea', () => {
    it('returns true after creation', () => {
      setupBook(rootDir, 'book1', ['Ch1']);
      stagingManager.createStagingArea('book1');
      expect(stagingManager.hasStagingArea('book1')).toBe(true);
    });

    it('returns false before creation', () => {
      setupBook(rootDir, 'book1', ['Ch1']);
      expect(stagingManager.hasStagingArea('book1')).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('removes staging directory', () => {
      setupBook(rootDir, 'book1', ['Ch1', 'Ch2']);
      stagingManager.createStagingArea('book1');
      stagingManager.addFile('book1', 'test.md', 'data');

      const result = stagingManager.cleanup('book1');
      expect(result.success).toBe(true);
      expect(stagingManager.hasStagingArea('book1')).toBe(false);
    });

    it('removes non-existent staging area without error', () => {
      setupBook(rootDir, 'book1', ['Ch1']);
      expect(() => stagingManager.cleanup('book1')).not.toThrow();
    });
  });

  describe('prepareMergePlan', () => {
    it('generates a valid merge plan', () => {
      setupBook(rootDir, 'book1', ['Chapter 1 content here', 'Chapter 2 content here']);

      const plan = stagingManager.prepareMergePlan('book1', 1, 2);

      expect(plan.success).toBe(true);
      expect(plan.bookId).toBe('book1');
      expect(plan.operation).toBe('merge');
      expect(plan.files.length).toBe(2); // replace fromChapter + delete toChapter
      expect(plan.files[0].targetPath).toContain('chapter-0001.md');
    });

    it('includes facts and hooks re-anchor instructions', () => {
      setupBook(rootDir, 'book1', ['Ch1', 'Ch2']);

      const plan = stagingManager.prepareMergePlan('book1', 1, 2);

      expect(plan.reanchorFacts).toBeDefined();
      expect(plan.reanchorHooks).toBeDefined();
    });
  });

  describe('prepareSplitPlan', () => {
    it('generates a valid split plan', () => {
      setupBook(rootDir, 'book1', ['Part A\n\nPart B\n\nPart C\n\nPart D']);

      const plan = stagingManager.prepareSplitPlan('book1', 1, 2);

      expect(plan.success).toBe(true);
      expect(plan.bookId).toBe('book1');
      expect(plan.operation).toBe('split');
      expect(plan.files.length).toBe(2); // two split parts
    });
  });

  describe('commit', () => {
    it('commits staged files to chapters directory', () => {
      const { stateManager } = setupBook(rootDir, 'book1', ['Ch1', 'Ch2']);
      stagingManager.createStagingArea('book1');

      const ch1Path = stateManager.getChapterFilePath('book1', 1);

      stagingManager.addFile('book1', 'chapter-0001.md', 'new merged content');
      stagingManager.addFile('book1', 'chapter-0002.md', ''); // will be deleted

      const result = stagingManager.commit('book1', [
        {
          stagingFile: 'chapter-0001.md',
          targetPath: stateManager.getChapterFilePath('book1', 1),
          action: 'create',
        },
        {
          stagingFile: 'chapter-0002.md',
          targetPath: stateManager.getChapterFilePath('book1', 2),
          action: 'delete',
        },
      ]);

      expect(result.success).toBe(true);

      const newContent = fs.readFileSync(ch1Path, 'utf-8');
      expect(newContent).toBe('new merged content');
      expect(fs.existsSync(stateManager.getChapterFilePath('book1', 2))).toBe(false);
    });

    it('fails if staging area does not exist', () => {
      setupBook(rootDir, 'book1', ['Ch1']);
      const result = stagingManager.commit('book1', []);
      expect(result.success).toBe(false);
      expect(result.error).toContain('staging');
    });
  });
});
