import * as fs from 'fs';
import * as path from 'path';
import type {
  ReorgLockInfo,
  ReorgLockReport,
  ReorgLockDiagnostic,
  ReorgLockCleanOptions,
} from './reorg-lock';

// ─── ReorgLockScanner ────────────────────────────────────────────
// 负责扫描所有书籍的重组锁状态并清理僵尸锁。

export class ReorgLockScanner {
  private rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
  }

  /**
   * 扫描所有书籍的重组锁状态。
   */
  scanAllReorgLocks(): ReorgLockReport {
    const report: ReorgLockReport = {
      totalBooks: 0,
      lockedBooks: 0,
      zombieLocks: [],
      activeLocks: [],
    };

    if (!fs.existsSync(this.rootDir)) return report;

    for (const entry of fs.readdirSync(this.rootDir)) {
      const bookDir = path.join(this.rootDir, entry);
      if (!fs.statSync(bookDir).isDirectory()) continue;

      report.totalBooks++;

      const lockPath = this.#getLockPath(entry);
      if (!fs.existsSync(lockPath)) continue;

      const data = this.#readLockFile(lockPath);
      if (!data) continue;

      const isZombie = !this.#isProcessAlive(data.pid);
      const info: ReorgLockInfo = {
        bookId: entry,
        pid: data.pid,
        createdAt: data.createdAt,
        operation: data.operation,
        isZombie,
      };

      report.lockedBooks++;

      if (isZombie) {
        report.zombieLocks.push(info);
      } else {
        report.activeLocks.push(info);
      }
    }

    return report;
  }

  /**
   * 清理僵尸重组锁。
   */
  cleanZombieReorgLocks(options: ReorgLockCleanOptions = {}): ReorgLockDiagnostic {
    const result: ReorgLockDiagnostic = { cleaned: [] };

    if (!fs.existsSync(this.rootDir)) return result;

    for (const entry of fs.readdirSync(this.rootDir)) {
      const bookDir = path.join(this.rootDir, entry);
      if (!fs.statSync(bookDir).isDirectory()) continue;

      const lockPath = this.#getLockPath(entry);
      if (!fs.existsSync(lockPath)) continue;

      const data = this.#readLockFile(lockPath);
      if (!data) continue;

      if (this.#isProcessAlive(data.pid)) continue;

      if (!options.dryRun) {
        fs.unlinkSync(lockPath);
      }

      result.cleaned.push({
        bookId: entry,
        pid: data.pid,
        createdAt: data.createdAt,
        operation: data.operation,
        isZombie: true,
      });
    }

    return result;
  }

  // ── Internal ───────────────────────────────────────────────

  #getLockPath(bookId: string): string {
    return path.join(this.rootDir, bookId, '.reorg_lock');
  }

  #readLockFile(lockPath: string): Omit<ReorgLockInfo, 'isZombie'> | null {
    try {
      const raw = fs.readFileSync(lockPath, 'utf-8');
      return JSON.parse(raw) as Omit<ReorgLockInfo, 'isZombie'>;
    } catch (err) {
      console.warn(
        `[reorg-lock] Corrupted lock file:`,
        err instanceof Error ? err.message : String(err),
      );
      return null;
    }
  }

  #isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch (err) {
      console.warn(
        `[reorg-lock] Failed to check process:`,
        err instanceof Error ? err.message : String(err),
      );
      return false;
    }
  }
}
