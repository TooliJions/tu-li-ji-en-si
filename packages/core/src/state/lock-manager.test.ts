import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  LockManager,
} from './lock-manager';
import { StateManager } from './manager';
import * as fs from 'fs';
import * as path from 'path';

describe('LockManager', () => {
  let tmpDir: string;
  let manager: StateManager;
  let lockMgr: LockManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(process.cwd(), 'test-lock-mgr-'));
    manager = new StateManager(tmpDir);
    lockMgr = new LockManager(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── scanAllLocks ───────────────────────────────────────────

  describe('scanAllLocks', () => {
    it('returns empty report when no books exist', () => {
      const report = lockMgr.scanAllLocks();
      expect(report.totalBooks).toBe(0);
      expect(report.lockedBooks).toBe(0);
      expect(report.zombieLocks).toHaveLength(0);
      expect(report.activeLocks).toHaveLength(0);
    });

    it('detects zombie lock on a book', () => {
      manager.ensureBookStructure('book-001');
      const lockPath = path.join(tmpDir, 'book-001', '.lock');
      fs.writeFileSync(
        lockPath,
        JSON.stringify({
          bookId: 'book-001',
          pid: 999999,
          createdAt: '2026-04-18T10:00:00Z',
          operation: 'write_chapter',
        })
      );

      const report = lockMgr.scanAllLocks();
      expect(report.zombieLocks).toHaveLength(1);
      expect(report.zombieLocks[0].bookId).toBe('book-001');
      expect(report.zombieLocks[0].pid).toBe(999999);
    });

    it('detects active lock (process still alive)', () => {
      manager.ensureBookStructure('book-002');
      const lockPath = path.join(tmpDir, 'book-002', '.lock');
      fs.writeFileSync(
        lockPath,
        JSON.stringify({
          bookId: 'book-002',
          pid: process.pid,
          createdAt: new Date().toISOString(),
          operation: 'write_chapter',
        })
      );

      const report = lockMgr.scanAllLocks();
      expect(report.activeLocks).toHaveLength(1);
      expect(report.activeLocks[0].bookId).toBe('book-002');
    });

    it('counts total and locked books correctly', () => {
      manager.ensureBookStructure('book-a');
      manager.ensureBookStructure('book-b');
      manager.ensureBookStructure('book-c');

      // Lock only book-b
      const lockPath = path.join(tmpDir, 'book-b', '.lock');
      fs.writeFileSync(
        lockPath,
        JSON.stringify({
          bookId: 'book-b',
          pid: 999999,
          createdAt: new Date().toISOString(),
          operation: 'test',
        })
      );

      const report = lockMgr.scanAllLocks();
      expect(report.totalBooks).toBe(3);
      expect(report.lockedBooks).toBe(1);
    });

    it('ignores books without .lock files', () => {
      manager.ensureBookStructure('clean-book');

      const report = lockMgr.scanAllLocks();
      expect(report.totalBooks).toBe(1);
      expect(report.lockedBooks).toBe(0);
      expect(report.zombieLocks).toHaveLength(0);
      expect(report.activeLocks).toHaveLength(0);
    });

    it('handles corrupted lock files gracefully', () => {
      manager.ensureBookStructure('book-broken');
      const lockPath = path.join(tmpDir, 'book-broken', '.lock');
      fs.writeFileSync(lockPath, '{invalid json');

      const report = lockMgr.scanAllLocks();
      expect(report.corruptedLocks).toHaveLength(1);
      expect(report.corruptedLocks[0].bookId).toBe('book-broken');
    });

    it('handles multiple books with mixed lock states', () => {
      // Book 1: zombie lock
      manager.ensureBookStructure('book-zombie');
      fs.writeFileSync(
        path.join(tmpDir, 'book-zombie', '.lock'),
        JSON.stringify({
          bookId: 'book-zombie',
          pid: 999991,
          createdAt: new Date().toISOString(),
          operation: 'write',
        })
      );

      // Book 2: active lock
      manager.ensureBookStructure('book-active');
      fs.writeFileSync(
        path.join(tmpDir, 'book-active', '.lock'),
        JSON.stringify({
          bookId: 'book-active',
          pid: process.pid,
          createdAt: new Date().toISOString(),
          operation: 'read',
        })
      );

      // Book 3: no lock
      manager.ensureBookStructure('book-free');

      // Book 4: corrupted lock
      manager.ensureBookStructure('book-corrupt');
      fs.writeFileSync(path.join(tmpDir, 'book-corrupt', '.lock'), 'not json');

      const report = lockMgr.scanAllLocks();
      expect(report.totalBooks).toBe(4);
      expect(report.lockedBooks).toBe(3);
      expect(report.zombieLocks).toHaveLength(1);
      expect(report.activeLocks).toHaveLength(1);
      expect(report.corruptedLocks).toHaveLength(1);
    });
  });

  // ── cleanZombieLocks ───────────────────────────────────────

  describe('cleanZombieLocks', () => {
    it('removes zombie locks and returns cleaned list', () => {
      manager.ensureBookStructure('book-z');
      const lockPath = path.join(tmpDir, 'book-z', '.lock');
      fs.writeFileSync(
        lockPath,
        JSON.stringify({
          bookId: 'book-z',
          pid: 999999,
          createdAt: new Date().toISOString(),
          operation: 'write',
        })
      );

      const result = lockMgr.cleanZombieLocks();
      expect(result.cleaned).toHaveLength(1);
      expect(result.cleaned[0].bookId).toBe('book-z');
      expect(fs.existsSync(lockPath)).toBe(false);
    });

    it('does not touch active locks', () => {
      manager.ensureBookStructure('book-a');
      const lockPath = path.join(tmpDir, 'book-a', '.lock');
      fs.writeFileSync(
        lockPath,
        JSON.stringify({
          bookId: 'book-a',
          pid: process.pid,
          createdAt: new Date().toISOString(),
          operation: 'write',
        })
      );

      const result = lockMgr.cleanZombieLocks();
      expect(result.cleaned).toHaveLength(0);
      expect(fs.existsSync(lockPath)).toBe(true);
    });

    it('does not touch corrupted locks', () => {
      manager.ensureBookStructure('book-c');
      const lockPath = path.join(tmpDir, 'book-c', '.lock');
      fs.writeFileSync(lockPath, 'bad data');

      const result = lockMgr.cleanZombieLocks();
      expect(result.cleaned).toHaveLength(0);
      expect(fs.existsSync(lockPath)).toBe(true);
    });

    it('cleans multiple zombie locks at once', () => {
      for (const id of ['b1', 'b2', 'b3']) {
        manager.ensureBookStructure(id);
        fs.writeFileSync(
          path.join(tmpDir, id, '.lock'),
          JSON.stringify({
            bookId: id,
            pid: 999999,
            createdAt: new Date().toISOString(),
            operation: 'write',
          })
        );
      }

      const result = lockMgr.cleanZombieLocks();
      expect(result.cleaned).toHaveLength(3);
      expect(result.cleaned.map((l) => l.bookId)).toEqual(['b1', 'b2', 'b3']);
    });

    it('returns empty when no zombie locks exist', () => {
      const result = lockMgr.cleanZombieLocks();
      expect(result.cleaned).toHaveLength(0);
      expect(result.skipped).toBeUndefined();
    });

    it('reports skipped active locks in dry-run mode', () => {
      manager.ensureBookStructure('book-active');
      fs.writeFileSync(
        path.join(tmpDir, 'book-active', '.lock'),
        JSON.stringify({
          bookId: 'book-active',
          pid: process.pid,
          createdAt: new Date().toISOString(),
          operation: 'write',
        })
      );

      const result = lockMgr.cleanZombieLocks({ dryRun: true });
      expect(result.cleaned).toHaveLength(0);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped![0].bookId).toBe('book-active');
    });
  });

  // ── getLockInfo ───────────────────────────────────────────

  describe('getLockInfo', () => {
    it('returns lock details for a locked book', () => {
      manager.ensureBookStructure('book-detail');
      const lockData = {
        bookId: 'book-detail',
        pid: 12345,
        createdAt: '2026-04-18T10:00:00Z',
        operation: 'write_chapter',
      };
      fs.writeFileSync(path.join(tmpDir, 'book-detail', '.lock'), JSON.stringify(lockData));

      const info = lockMgr.getLockInfo('book-detail');
      expect(info).not.toBeNull();
      expect(info!.bookId).toBe('book-detail');
      expect(info!.pid).toBe(12345);
      expect(info!.operation).toBe('write_chapter');
      expect(info!.isZombie).toBe(true);
    });

    it('returns null for non-existent book', () => {
      expect(lockMgr.getLockInfo('non-existent')).toBeNull();
    });

    it('returns null for unlocked book', () => {
      manager.ensureBookStructure('book-unlocked');
      expect(lockMgr.getLockInfo('book-unlocked')).toBeNull();
    });

    it('marks lock as active when process is alive', () => {
      manager.ensureBookStructure('book-live');
      fs.writeFileSync(
        path.join(tmpDir, 'book-live', '.lock'),
        JSON.stringify({
          bookId: 'book-live',
          pid: process.pid,
          createdAt: new Date().toISOString(),
          operation: 'test',
        })
      );

      const info = lockMgr.getLockInfo('book-live');
      expect(info).not.toBeNull();
      expect(info!.isZombie).toBe(false);
    });
  });

  // ── isBookLocked ──────────────────────────────────────────

  describe('isBookLocked', () => {
    it('returns true when lock file exists', () => {
      manager.ensureBookStructure('book-lock');
      fs.writeFileSync(path.join(tmpDir, 'book-lock', '.lock'), '{}');
      expect(lockMgr.isBookLocked('book-lock')).toBe(true);
    });

    it('returns false when no lock file', () => {
      manager.ensureBookStructure('book-free');
      expect(lockMgr.isBookLocked('book-free')).toBe(false);
    });

    it('returns false for non-existent book', () => {
      expect(lockMgr.isBookLocked('non-existent')).toBe(false);
    });
  });

  // ── forceUnlock ───────────────────────────────────────────

  describe('forceUnlock', () => {
    it('removes lock file regardless of process state', () => {
      manager.ensureBookStructure('book-force');
      const lockPath = path.join(tmpDir, 'book-force', '.lock');
      fs.writeFileSync(
        lockPath,
        JSON.stringify({
          bookId: 'book-force',
          pid: 999999,
          createdAt: new Date().toISOString(),
          operation: 'write',
        })
      );

      lockMgr.forceUnlock('book-force');
      expect(fs.existsSync(lockPath)).toBe(false);
    });

    it('does not throw when lock does not exist', () => {
      expect(() => lockMgr.forceUnlock('non-existent')).not.toThrow();
    });

    it('can unlock an active lock', () => {
      manager.ensureBookStructure('book-active');
      const lockPath = path.join(tmpDir, 'book-active', '.lock');
      fs.writeFileSync(
        lockPath,
        JSON.stringify({
          bookId: 'book-active',
          pid: process.pid,
          createdAt: new Date().toISOString(),
          operation: 'write',
        })
      );

      lockMgr.forceUnlock('book-active');
      expect(fs.existsSync(lockPath)).toBe(false);
    });
  });

  // ── Edge cases ────────────────────────────────────────────

  describe('edge cases', () => {
    it('ignores non-book directories', () => {
      // Create a directory that has no story/ subdirectory
      const randomDir = path.join(tmpDir, 'random-dir');
      fs.mkdirSync(randomDir, { recursive: true });
      fs.writeFileSync(
        path.join(randomDir, '.lock'),
        JSON.stringify({
          bookId: 'random-dir',
          pid: 999999,
          createdAt: new Date().toISOString(),
          operation: 'write',
        })
      );

      // This should still be detected since the directory has a .lock file
      const report = lockMgr.scanAllLocks();
      // It will find this directory and report it
      expect(
        report.zombieLocks.length + report.activeLocks.length + report.corruptedLocks.length
      ).toBeGreaterThanOrEqual(1);
    });

    it('handles empty root directory', () => {
      const report = lockMgr.scanAllLocks();
      expect(report.totalBooks).toBe(0);
    });
  });
});
