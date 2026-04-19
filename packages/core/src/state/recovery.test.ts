import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionRecovery, type RecoveryReport, type RecoveryOptions } from './recovery';
import { StateManager } from './manager';
import { StateBootstrap, type BootstrapOptions } from './bootstrap';
import { MemoryDB } from './memory-db';
import type { ChapterIndexEntry } from '../models/chapter';
import * as fs from 'fs';
import * as path from 'path';

// ── Helpers ───────────────────────────────────────────────────────────

function makeIndexEntry(number: number, wordCount: number): ChapterIndexEntry {
  const padded = String(number).padStart(4, '0');
  return {
    number,
    title: null,
    fileName: `chapter-${padded}.md`,
    wordCount,
    createdAt: new Date().toISOString(),
  };
}

describe('SessionRecovery', () => {
  let tmpDir: string;
  let bookId: string;
  let manager: StateManager;
  let memDb: MemoryDB;
  let dbPath: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(process.cwd(), 'test-recovery-'));
    bookId = 'recovery-book-001';

    const options: BootstrapOptions = {
      bookId,
      title: '测试小说',
      genre: 'xianxia',
      targetWords: 1000000,
    };
    StateBootstrap.bootstrapBook(tmpDir, options);

    manager = new StateManager(tmpDir);

    dbPath = path.join(tmpDir, bookId, 'story', 'state', 'memory.db');
    memDb = await MemoryDB.create(dbPath);
  });

  afterEach(() => {
    memDb.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── recover ──────────────────────────────────────────────────

  describe('recover', () => {
    it('returns clean report when everything is consistent', async () => {
      const recovery = new SessionRecovery(manager, memDb);
      const report = await recovery.recover(bookId);

      expect(report.bookId).toBe(bookId);
      expect(report.isClean).toBe(true);
      expect(report.issues).toHaveLength(0);
    });

    it('detects and cleans zombie locks', async () => {
      const lockPath = path.join(tmpDir, bookId, '.lock');
      const fakeLock = {
        bookId,
        pid: 999999,
        createdAt: new Date().toISOString(),
        operation: 'write_chapter',
      };
      fs.writeFileSync(lockPath, JSON.stringify(fakeLock, null, 2));

      const recovery = new SessionRecovery(manager, memDb);
      const report = await recovery.recover(bookId, { fixLocks: true });

      expect(report.issues.some((i) => i.type === 'zombie_lock')).toBe(true);
      expect(fs.existsSync(lockPath)).toBe(false);
    });

    it('refuses to touch active locks (process still running)', async () => {
      const lockPath = path.join(tmpDir, bookId, '.lock');
      const activeLock = {
        bookId,
        pid: process.pid,
        createdAt: new Date().toISOString(),
        operation: 'write_chapter',
      };
      fs.writeFileSync(lockPath, JSON.stringify(activeLock, null, 2));

      const recovery = new SessionRecovery(manager, memDb);
      const report = await recovery.recover(bookId, { fixLocks: true });

      expect(report.issues.some((i) => i.type === 'active_lock')).toBe(true);
      expect(fs.existsSync(lockPath)).toBe(true);
    });

    it('detects chapter file without SQLite record (residual cleanup)', async () => {
      const chapterPath = manager.getChapterFilePath(bookId, 1);
      fs.writeFileSync(chapterPath, '# 第一章\n\n这是一章内容');

      const index = manager.readIndex(bookId);
      index.chapters.push(makeIndexEntry(1, 20));
      index.totalChapters = 1;
      index.lastUpdated = new Date().toISOString();
      manager.writeIndex(bookId, index);

      // NOT inserting into SQLite → simulate crash before commit

      const recovery = new SessionRecovery(manager, memDb);
      const report = await recovery.recover(bookId, { autoRepair: true });

      expect(report.issues.some((i) => i.type === 'orphan_chapter')).toBe(true);
      expect(fs.existsSync(chapterPath)).toBe(false);
    });

    it('detects index.json entry for missing chapter file', async () => {
      const index = manager.readIndex(bookId);
      index.chapters.push(makeIndexEntry(3, 100));
      index.totalChapters = 1;
      index.lastUpdated = new Date().toISOString();
      manager.writeIndex(bookId, index);

      // No actual chapter-0003.md file exists

      const recovery = new SessionRecovery(manager, memDb);
      const report = await recovery.recover(bookId, { autoRepair: true });

      expect(report.issues.some((i) => i.type === 'missing_chapter_file')).toBe(true);
      const updatedIndex = manager.readIndex(bookId);
      expect(updatedIndex.chapters).toHaveLength(0);
    });

    it('detects SQLite chapter_summary without index.json entry', async () => {
      memDb.insertChapterSummary({
        chapter: 2,
        summary: '第二章摘要',
        keyEvents: ['事件'],
      });

      const recovery = new SessionRecovery(manager, memDb);
      const report = await recovery.recover(bookId);

      expect(report.issues.some((i) => i.type === 'orphan_summary')).toBe(true);
    });

    it('detects hook state inconsistency', async () => {
      memDb.insertHook({
        planted_ch: 1,
        description: 'SQLite only hook',
        status: 'open',
        priority: 'major',
      });

      const recovery = new SessionRecovery(manager, memDb);
      const report = await recovery.recover(bookId);

      expect(report.issues.some((i) => i.type === 'hook_mismatch')).toBe(true);
    });

    it('auto-repair removes orphan chapter and rolls back index', async () => {
      const chapterPath = manager.getChapterFilePath(bookId, 5);
      fs.writeFileSync(chapterPath, '# 第五章\n\n内容');

      const index = manager.readIndex(bookId);
      index.chapters.push(makeIndexEntry(5, 50));
      index.totalChapters = 1;
      index.lastUpdated = new Date().toISOString();
      manager.writeIndex(bookId, index);

      const recovery = new SessionRecovery(manager, memDb);
      await recovery.recover(bookId, { autoRepair: true });

      const updatedIndex = manager.readIndex(bookId);
      expect(updatedIndex.chapters).toHaveLength(0);
      expect(fs.existsSync(chapterPath)).toBe(false);
    });

    it('skip repair when autoRepair is false', async () => {
      const chapterPath = manager.getChapterFilePath(bookId, 1);
      fs.writeFileSync(chapterPath, '# 第一章\n\n残留内容');

      const index = manager.readIndex(bookId);
      index.chapters.push(makeIndexEntry(1, 10));
      index.totalChapters = 1;
      index.lastUpdated = new Date().toISOString();
      manager.writeIndex(bookId, index);

      const recovery = new SessionRecovery(manager, memDb);
      await recovery.recover(bookId, { autoRepair: false });

      expect(fs.existsSync(chapterPath)).toBe(true);
    });

    it('reports missing chapter file as unresolved when autoRepair is false', async () => {
      const index = manager.readIndex(bookId);
      index.chapters.push(makeIndexEntry(7, 100));
      index.totalChapters = 1;
      index.lastUpdated = new Date().toISOString();
      manager.writeIndex(bookId, index);

      const recovery = new SessionRecovery(manager, memDb);
      const report = await recovery.recover(bookId, { autoRepair: false });

      const missingIssue = report.issues.find((i) => i.type === 'missing_chapter_file');
      expect(missingIssue).toBeDefined();
      expect(missingIssue!.resolved).toBe(false);
      expect(missingIssue!.severity).toBe('error');
    });

    it('handles corrupt index.json gracefully during summary consistency check', async () => {
      const indexPath = path.join(tmpDir, bookId, 'story', 'index.json');
      fs.writeFileSync(indexPath, 'NOT VALID JSON');

      memDb.insertChapterSummary({
        chapter: 99,
        summary: '孤儿摘要',
        keyEvents: [],
      });

      const recovery = new SessionRecovery(manager, memDb);
      const report = await recovery.recover(bookId);

      // Should not throw — summary consistency check should return early
      expect(report).toBeDefined();
    });
  });

  // ── Reorg sentinel ─────────────────────────────────────────

  describe('reorg sentinel', () => {
    it('skips recovery when .reorg_in_progress exists', async () => {
      const sentinelPath = path.join(tmpDir, bookId, '.reorg_in_progress');
      fs.writeFileSync(sentinelPath, 'merge_chapters_1_2');

      const recovery = new SessionRecovery(manager, memDb);
      const report = await recovery.recover(bookId);

      expect(report.skipped).toBe(true);
      expect(report.skipReason).toContain('reorg');
    });

    it('normal recovery when no sentinel', async () => {
      const recovery = new SessionRecovery(manager, memDb);
      const report = await recovery.recover(bookId);

      expect(report.skipped).toBe(false);
    });
  });

  // ── WAL check ──────────────────────────────────────────────

  describe('WAL detection', () => {
    it('detects WAL file presence', async () => {
      const recovery = new SessionRecovery(manager, memDb);
      const report = await recovery.recover(bookId);

      expect(report.walStatus).toBeDefined();
    });
  });

  // ── Multiple issues ────────────────────────────────────────

  describe('multiple issues detection', () => {
    it('reports all issues in a single recovery run', async () => {
      const lockPath = path.join(tmpDir, bookId, '.lock');
      fs.writeFileSync(
        lockPath,
        JSON.stringify({
          bookId,
          pid: 999999,
          createdAt: new Date().toISOString(),
          operation: 'write',
        })
      );

      const chapterPath = manager.getChapterFilePath(bookId, 1);
      fs.writeFileSync(chapterPath, '# 第一章');
      const index = manager.readIndex(bookId);
      index.chapters.push(makeIndexEntry(1, 5));
      index.totalChapters = 1;
      index.lastUpdated = new Date().toISOString();
      manager.writeIndex(bookId, index);

      const recovery = new SessionRecovery(manager, memDb);
      const report = await recovery.recover(bookId, { fixLocks: true });

      expect(report.issues.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ── Recovery report format ─────────────────────────────────

  describe('recovery report', () => {
    it('contains summary information', async () => {
      const recovery = new SessionRecovery(manager, memDb);
      const report = await recovery.recover(bookId);

      expect(report.bookId).toBe(bookId);
      expect(report.timestamp).toBeDefined();
      expect(report.issues).toBeDefined();
      expect(Array.isArray(report.issues)).toBe(true);
    });

    it('issue has type, severity, and description', async () => {
      const lockPath = path.join(tmpDir, bookId, '.lock');
      fs.writeFileSync(
        lockPath,
        JSON.stringify({
          bookId,
          pid: 999999,
          createdAt: new Date().toISOString(),
          operation: 'write',
        })
      );

      const recovery = new SessionRecovery(manager, memDb);
      const report = await recovery.recover(bookId, { fixLocks: true });

      const zombieIssue = report.issues.find((i) => i.type === 'zombie_lock');
      expect(zombieIssue).toBeDefined();
      expect(zombieIssue!.severity).toBeDefined();
      expect(zombieIssue!.description).toBeDefined();
      expect(zombieIssue!.resolved).toBe(true);
    });
  });
});
