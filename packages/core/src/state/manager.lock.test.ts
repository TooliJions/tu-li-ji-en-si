import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { StateManager } from './manager';

describe('StateManager Lock Cleanup', () => {
  let tempDir: string;
  let stateManager: StateManager;
  const bookId = 'test-book-lock';

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-test-'));
    stateManager = new StateManager(tempDir);
    stateManager.ensureBookStructure(bookId);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should clean up stale lock from non-existent process', () => {
    const lockPath = stateManager.getBookPath(bookId, '.lock');
    const staleLockInfo = {
      bookId,
      pid: 999999, // Non-existent PID
      createdAt: new Date().toISOString(),
      operation: 'stale-op',
    };
    fs.writeFileSync(lockPath, JSON.stringify(staleLockInfo, null, 2));

    expect(fs.existsSync(lockPath)).toBe(true);

    const lock = stateManager.acquireBookLock(bookId, 'new-op');
    expect(lock).not.toBeNull();
    expect(lock?.pid).toBe(process.pid);
    expect(lock?.operation).toBe('new-op');

    // Ensure the file is updated
    const content = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
    expect(content.pid).toBe(process.pid);
  });

  it('should force acquire expired lock even if process is running', () => {
    const lockPath = stateManager.getBookPath(bookId, '.lock');
    const expiredLockInfo = {
      bookId,
      pid: process.pid,
      createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      expiresAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      operation: 'expired-op',
    };
    fs.writeFileSync(lockPath, JSON.stringify(expiredLockInfo, null, 2));

    expect(fs.existsSync(lockPath)).toBe(true);

    const lock = stateManager.acquireBookLock(bookId, 'new-op');
    expect(lock).not.toBeNull();
    expect(lock?.pid).toBe(process.pid);
    expect(lock?.operation).toBe('new-op');
    expect(lock?.expiresAt).toBeDefined();

    const content = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
    expect(content.pid).toBe(process.pid);
  });

  it('should fail if lock is held by a running process', () => {
    const lock = stateManager.acquireBookLock(bookId, 'original-op');
    expect(lock).not.toBeNull();

    expect(() => {
      stateManager.acquireBookLock(bookId, 'conflicting-op');
    }).toThrow(/already locked/);
  });

  it('should clean up corrupted lock file', () => {
    const lockPath = stateManager.getBookPath(bookId, '.lock');
    fs.writeFileSync(lockPath, 'invalid json content');

    const lock = stateManager.acquireBookLock(bookId, 'recovery-op');
    expect(lock).not.toBeNull();
    expect(lock?.operation).toBe('recovery-op');
  });
});
