import * as fs from 'fs';
import * as path from 'path';

// ─── Types ─────────────────────────────────────────────────────

export interface LockInfo {
  bookId: string;
  pid: number;
  createdAt: string;
  operation: string;
  isZombie: boolean;
}

export interface LockReport {
  totalBooks: number;
  lockedBooks: number;
  zombieLocks: LockInfo[];
  activeLocks: LockInfo[];
  corruptedLocks: Array<{ bookId: string }>;
}

export interface LockDiagnosticResult {
  cleaned: LockInfo[];
  skipped?: LockInfo[];
}

export interface CleanOptions {
  dryRun?: boolean;
}

// ─── LockManager ───────────────────────────────────────────────
// 负责扫描、诊断和清理僵尸锁。为 DoctorView 提供数据源。

export class LockManager {
  private rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
  }

  /**
   * 扫描根目录下所有书籍的锁状态，生成诊断报告。
   */
  scanAllLocks(): LockReport {
    const report: LockReport = {
      totalBooks: 0,
      lockedBooks: 0,
      zombieLocks: [],
      activeLocks: [],
      corruptedLocks: [],
    };

    if (!fs.existsSync(this.rootDir)) return report;

    for (const entry of fs.readdirSync(this.rootDir)) {
      const bookDir = path.join(this.rootDir, entry);
      if (!fs.statSync(bookDir).isDirectory()) continue;

      report.totalBooks++;

      const lockPath = path.join(bookDir, '.lock');
      if (!fs.existsSync(lockPath)) continue;

      let lockData: Record<string, unknown>;
      try {
        lockData = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
      } catch {
        report.corruptedLocks.push({ bookId: entry });
        report.lockedBooks++;
        continue;
      }

      const info: LockInfo = {
        bookId: entry,
        pid: lockData.pid as number,
        createdAt: lockData.createdAt as string,
        operation: lockData.operation as string,
        isZombie: !this.#isProcessAlive(lockData.pid as number),
      };

      report.lockedBooks++;

      if (info.isZombie) {
        report.zombieLocks.push(info);
      } else {
        report.activeLocks.push(info);
      }
    }

    return report;
  }

  /**
   * 清理所有僵尸锁。
   * dryRun 模式仅报告不删除。
   */
  cleanZombieLocks(options: CleanOptions = {}): LockDiagnosticResult {
    const result: LockDiagnosticResult = { cleaned: [] };
    if (options.dryRun) result.skipped = [];

    if (!fs.existsSync(this.rootDir)) return result;

    for (const entry of fs.readdirSync(this.rootDir)) {
      const bookDir = path.join(this.rootDir, entry);
      if (!fs.statSync(bookDir).isDirectory()) continue;

      const lockPath = path.join(bookDir, '.lock');
      if (!fs.existsSync(lockPath)) continue;

      let lockData: Record<string, unknown>;
      try {
        lockData = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
      } catch {
        continue; // Skip corrupted locks
      }

      const pid = lockData.pid as number;
      if (this.#isProcessAlive(pid)) {
        // Active lock — skip
        if (options.dryRun && result.skipped) {
          result.skipped.push({
            bookId: entry,
            pid,
            createdAt: lockData.createdAt as string,
            operation: lockData.operation as string,
            isZombie: false,
          });
        }
        continue;
      }

      // Zombie lock — remove
      if (!options.dryRun) {
        fs.unlinkSync(lockPath);
      }
      result.cleaned.push({
        bookId: entry,
        pid,
        createdAt: lockData.createdAt as string,
        operation: lockData.operation as string,
        isZombie: true,
      });
    }

    return result;
  }

  /**
   * 获取指定书籍的锁详情。
   */
  getLockInfo(bookId: string): LockInfo | null {
    const lockPath = path.join(this.rootDir, bookId, '.lock');
    if (!fs.existsSync(lockPath)) return null;

    let lockData: Record<string, unknown>;
    try {
      lockData = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
    } catch (err) {
      console.warn(
        `[lock-manager] Corrupted lock file for ${bookId}:`,
        err instanceof Error ? err.message : String(err)
      );
      return null;
    }

    const pid = lockData.pid as number;
    return {
      bookId,
      pid,
      createdAt: lockData.createdAt as string,
      operation: lockData.operation as string,
      isZombie: !this.#isProcessAlive(pid),
    };
  }

  /**
   * 检查书籍是否被锁定（不考虑锁的类型）。
   */
  isBookLocked(bookId: string): boolean {
    return fs.existsSync(path.join(this.rootDir, bookId, '.lock'));
  }

  /**
   * 强制解锁指定书籍（无论进程是否存活）。
   */
  forceUnlock(bookId: string): void {
    const lockPath = path.join(this.rootDir, bookId, '.lock');
    if (fs.existsSync(lockPath)) {
      fs.unlinkSync(lockPath);
    }
  }

  // ── Private ──────────────────────────────────────────────

  #isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch (err) {
      console.warn(
        `[lock-manager] Failed to check process for lock:`,
        err instanceof Error ? err.message : String(err)
      );
      return false;
    }
  }
}
