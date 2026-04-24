import * as fs from 'fs';
import * as path from 'path';

// ─── Types ─────────────────────────────────────────────────────

export type ReorgOperation = 'merge' | 'split';

export interface ReorgLockInfo {
  bookId: string;
  pid: number;
  createdAt: string;
  operation: ReorgOperation;
  isZombie: boolean;
}

export interface ReorgLockAcquireResult {
  acquired: boolean;
  info?: ReorgLockInfo;
  reason?: string;
}

export interface ReorgLockReport {
  totalBooks: number;
  lockedBooks: number;
  zombieLocks: ReorgLockInfo[];
  activeLocks: ReorgLockInfo[];
}

export interface ReorgLockDiagnostic {
  cleaned: ReorgLockInfo[];
  skipped?: ReorgLockInfo[];
}

export interface ReorgLockCleanOptions {
  dryRun?: boolean;
}

export interface ReorgSentinelData {
  bookId: string;
  operation: ReorgOperation;
  startedAt: string;
  pid: number;
  [key: string]: unknown;
}

export interface ReorgStatus {
  bookId: string;
  isLocked: boolean;
  hasSentinel: boolean;
  operation?: ReorgOperation;
  needsRecovery: boolean;
  recoveryAction?: 'manual_intervention' | 'rollback' | 'continue';
  status: 'idle' | 'in_progress' | 'interrupted' | 'recovery_needed';
  lockInfo?: ReorgLockInfo;
  sentinelData?: ReorgSentinelData;
}

// ─── ReorgLock ─────────────────────────────────────────────────
/**
 * 重组专用锁管理器。
 * 独立于 StateManager 的 book.lock，用于阻止守护进程和恢复程序在重组期间介入。
 * 锁文件路径: {rootDir}/{bookId}/.reorg_lock
 * 哨兵文件路径: {rootDir}/{bookId}/story/state/.reorg_in_progress
 */
export class ReorgLock {
  private rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
  }

  // ── Acquire / Release ──────────────────────────────────────

  /**
   * 获取重组锁。若已锁定则拒绝。
   * 传入 zombiePid 用于测试僵尸锁场景。
   */
  acquire(bookId: string, operation: ReorgOperation, zombiePid?: number): ReorgLockAcquireResult {
    const lockPath = this.#getLockPath(bookId);

    if (fs.existsSync(lockPath)) {
      const existing = this.#readLockFile(lockPath);
      if (existing) {
        const isZombie = !this.#isProcessAlive(existing.pid);
        if (!isZombie) {
          return {
            acquired: false,
            reason: `重组进行中 (${existing.operation})，请勿重复操作`,
          };
        }
        return {
          acquired: false,
          reason: `检测到僵尸锁 (PID ${existing.pid})，请使用 forceUnlock 清理`,
        };
      }
    }

    const lockInfo: ReorgLockInfo = {
      bookId,
      pid: zombiePid ?? process.pid,
      createdAt: new Date().toISOString(),
      operation,
      isZombie: zombiePid !== undefined,
    };

    fs.writeFileSync(lockPath, JSON.stringify(lockInfo, null, 2), 'utf-8');

    return { acquired: true, info: lockInfo };
  }

  /**
   * 释放重组锁。
   */
  release(bookId: string): void {
    const lockPath = this.#getLockPath(bookId);
    if (fs.existsSync(lockPath)) {
      fs.unlinkSync(lockPath);
    }
  }

  /**
   * 检查书籍是否持有重组锁。
   */
  isLocked(bookId: string): boolean {
    return fs.existsSync(this.#getLockPath(bookId));
  }

  /**
   * 获取锁详情。
   */
  getLockInfo(bookId: string): ReorgLockInfo | null {
    const lockPath = this.#getLockPath(bookId);
    if (!fs.existsSync(lockPath)) return null;

    const data = this.#readLockFile(lockPath);
    if (!data) return null;

    return {
      ...data,
      isZombie: !this.#isProcessAlive(data.pid),
    };
  }

  // ── Sentinel ───────────────────────────────────────────────

  /**
   * 写入 .reorg_in_progress 哨兵文件。
   */
  writeSentinel(bookId: string, operation: ReorgOperation, extra?: Record<string, unknown>): void {
    const sentinelPath = this.#getSentinelPath(bookId);
    const stateDir = path.dirname(sentinelPath);
    fs.mkdirSync(stateDir, { recursive: true });

    const data: ReorgSentinelData = {
      bookId,
      operation,
      startedAt: new Date().toISOString(),
      pid: process.pid,
      ...extra,
    };

    fs.writeFileSync(sentinelPath, JSON.stringify(data, null, 2), 'utf-8');
  }

  /**
   * 移除哨兵文件。
   */
  removeSentinel(bookId: string): void {
    const sentinelPath = this.#getSentinelPath(bookId);
    if (fs.existsSync(sentinelPath)) {
      fs.unlinkSync(sentinelPath);
    }
  }

  /**
   * 检查哨兵文件是否存在。
   */
  hasSentinel(bookId: string): boolean {
    return fs.existsSync(this.#getSentinelPath(bookId));
  }

  /**
   * 读取哨兵数据。
   */
  readSentinel(bookId: string): ReorgSentinelData | null {
    const sentinelPath = this.#getSentinelPath(bookId);
    if (!fs.existsSync(sentinelPath)) return null;

    try {
      const raw = fs.readFileSync(sentinelPath, 'utf-8');
      return JSON.parse(raw) as ReorgSentinelData;
    } catch (err) {
      console.warn(
        `[reorg-lock] Failed to read sentinel for ${bookId}:`,
        err instanceof Error ? err.message : String(err)
      );
      return null;
    }
  }

  // ── Scan / Clean ───────────────────────────────────────────

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

  // ── Force Unlock ───────────────────────────────────────────

  /**
   * 强制移除重组锁（无论进程是否存活）。
   */
  forceUnlock(bookId: string): void {
    const lockPath = this.#getLockPath(bookId);
    if (fs.existsSync(lockPath)) {
      fs.unlinkSync(lockPath);
    }
  }

  // ── Status ─────────────────────────────────────────────────

  /**
   * 获取书籍重组状态，包含哨兵和锁的综合信息。
   * 用于 DoctorView 展示重组中断后的恢复指导。
   */
  getReorgStatus(bookId: string): ReorgStatus {
    const lockInfo = this.getLockInfo(bookId);
    const sentinelData = this.readSentinel(bookId);

    const isLocked = lockInfo !== null;
    const hasSentinel = sentinelData !== null;

    let status: ReorgStatus['status'];
    let needsRecovery = false;
    let recoveryAction: ReorgStatus['recoveryAction'];

    if (hasSentinel && !isLocked) {
      // Sentinel exists but no lock → interrupted reorg
      status = 'interrupted';
      needsRecovery = true;
      recoveryAction = 'manual_intervention';
    } else if (isLocked && hasSentinel) {
      status = 'in_progress';
    } else if (isLocked) {
      status = 'in_progress';
    } else {
      status = 'idle';
    }

    return {
      bookId,
      isLocked,
      hasSentinel,
      operation: lockInfo?.operation ?? sentinelData?.operation,
      needsRecovery,
      recoveryAction,
      status,
      lockInfo: lockInfo ?? undefined,
      sentinelData: sentinelData ?? undefined,
    };
  }

  // ── Internal ───────────────────────────────────────────────

  #getLockPath(bookId: string): string {
    return path.join(this.rootDir, bookId, '.reorg_lock');
  }

  #getSentinelPath(bookId: string): string {
    return path.join(this.rootDir, bookId, 'story', 'state', '.reorg_in_progress');
  }

  #readLockFile(lockPath: string): Omit<ReorgLockInfo, 'isZombie'> | null {
    try {
      const raw = fs.readFileSync(lockPath, 'utf-8');
      return JSON.parse(raw) as Omit<ReorgLockInfo, 'isZombie'>;
    } catch (err) {
      console.warn(
        `[reorg-lock] Corrupted lock file:`,
        err instanceof Error ? err.message : String(err)
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
        err instanceof Error ? err.message : String(err)
      );
      return false;
    }
  }
}
