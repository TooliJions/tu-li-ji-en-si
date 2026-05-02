import * as fs from 'fs';
import * as path from 'path';
import { StateManager } from './manager';
import { MemoryDB } from './memory-db';
import type { ChapterIndex } from '../models/chapter';
import type { Manifest } from '../models/state';

// ─── Types ─────────────────────────────────────────────────────

export type RecoveryIssueType =
  | 'zombie_lock'
  | 'active_lock'
  | 'orphan_chapter'
  | 'missing_chapter_file'
  | 'orphan_summary'
  | 'hook_mismatch'
  | 'orphan_tmp_file'
  | 'incomplete_commit';

export type RecoverySeverity = 'warning' | 'error' | 'critical';

export interface RecoveryIssue {
  type: RecoveryIssueType;
  severity: RecoverySeverity;
  description: string;
  resolved: boolean;
}

export interface RecoveryOptions {
  fixLocks?: boolean;
  autoRepair?: boolean;
}

export interface RecoveryReport {
  bookId: string;
  timestamp: string;
  skipped: boolean;
  skipReason?: string;
  isClean: boolean;
  issues: RecoveryIssue[];
  walStatus: 'clean' | 'has_uncommitted' | 'no_wal_file';
}

// ─── SessionRecovery ───────────────────────────────────────────
// 负责启动时检测并修复崩溃后的状态不一致问题。
// 检查顺序：重组哨兵 → 书籍锁 → WAL → 一致性校验 → 自动修复

export class SessionRecovery {
  private manager: StateManager;
  private memDb: MemoryDB;

  constructor(manager: StateManager, memDb: MemoryDB) {
    this.manager = manager;
    this.memDb = memDb;
  }

  /**
   * 执行完整的恢复检查。
   */
  async recover(bookId: string, options: RecoveryOptions = {}): Promise<RecoveryReport> {
    const report: RecoveryReport = {
      bookId,
      timestamp: new Date().toISOString(),
      skipped: false,
      isClean: true,
      issues: [],
      walStatus: 'clean',
    };

    // 0. 检查重组哨兵文件
    const sentinelPath = path.join(this.manager.getBookPath(bookId), '.reorg_in_progress');
    if (fs.existsSync(sentinelPath)) {
      report.skipped = true;
      report.skipReason = '重组操作进行中（.reorg_in_progress 存在），禁止自动修复';
      return report;
    }

    // 1. 检查书籍锁
    this.#checkBookLock(bookId, report, options.fixLocks ?? false);

    const hasActiveLock = report.issues.some((issue) => issue.type === 'active_lock');

    // 2. 检查未完成的 commit marker（rename 阶段崩溃时回滚）
    if (!hasActiveLock) {
      this.#checkCommitMarker(bookId, report, options.autoRepair ?? false);
    }

    // 3. 清理崩溃残留的 .tmp / .pending（仅在无活跃锁时执行）
    if (!hasActiveLock) {
      this.#cleanupOrphanTmpFiles(bookId, report, options.autoRepair ?? false);
    }

    // 4. 检查 WAL 状态
    report.walStatus = this.#checkWal(bookId);

    // 5. 一致性校验
    this.#checkChapterConsistency(bookId, report, options.autoRepair ?? false);
    this.#checkSummaryConsistency(bookId, report, options.autoRepair ?? false);
    this.#checkHookConsistency(bookId, report);

    // 6. 计算整体状态
    report.isClean = report.issues.length === 0;

    return report;
  }

  // ── Lock Check ─────────────────────────────────────────────

  #checkBookLock(bookId: string, report: RecoveryReport, fixLocks: boolean): void {
    const lockPath = path.join(this.manager.getBookPath(bookId), '.lock');
    if (!fs.existsSync(lockPath)) return;

    let lockData: Record<string, unknown>;
    try {
      lockData = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
    } catch {
      // Corrupted lock file — treat as zombie
      if (fixLocks) {
        fs.unlinkSync(lockPath);
        report.issues.push({
          type: 'zombie_lock',
          severity: 'warning',
          description: '已清理损坏的锁文件',
          resolved: true,
        });
      } else {
        report.issues.push({
          type: 'zombie_lock',
          severity: 'warning',
          description: '锁文件损坏，建议使用 --fix-locks 清理',
          resolved: false,
        });
      }
      return;
    }

    const pid = lockData.pid as number;
    const isProcessAlive = this.#isProcessAlive(pid);

    if (isProcessAlive) {
      // Process still running — active lock
      report.issues.push({
        type: 'active_lock',
        severity: 'critical',
        description: `书籍被进程 ${pid} 锁定（${lockData.operation as string}），正在运行中`,
        resolved: false,
      });
    } else {
      // Zombie lock — process is dead
      if (fixLocks) {
        fs.unlinkSync(lockPath);
        report.issues.push({
          type: 'zombie_lock',
          severity: 'warning',
          description: `已清理进程 ${pid} 的僵尸锁`,
          resolved: true,
        });
      } else {
        report.issues.push({
          type: 'zombie_lock',
          severity: 'warning',
          description: `检测到进程 ${pid} 的僵尸锁，使用 --fix-locks 可清理`,
          resolved: false,
        });
      }
    }
  }

  #isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch (err) {
      console.warn(
        '[recovery] Failed to check process alive:',
        err instanceof Error ? err.message : String(err),
      );
      return false;
    }
  }

  // ── Commit Marker Check ────────────────────────────────────

  #checkCommitMarker(bookId: string, report: RecoveryReport, autoRepair: boolean): void {
    const stateDir = this.manager.getBookPath(bookId, 'story', 'state');
    const markerPath = path.join(stateDir, '.commit-in-progress');
    if (!fs.existsSync(markerPath)) return;

    let marker: { snapshotId?: string; chapterNumber?: number };
    try {
      marker = JSON.parse(fs.readFileSync(markerPath, 'utf-8')) as {
        snapshotId?: string;
        chapterNumber?: number;
      };
    } catch (err) {
      console.warn(
        `[recovery] Corrupted commit marker for ${bookId}:`,
        err instanceof Error ? err.message : String(err),
      );
      if (autoRepair) {
        try {
          fs.unlinkSync(markerPath);
        } catch {
          // best effort
        }
      }
      report.issues.push({
        type: 'incomplete_commit',
        severity: 'error',
        description: `commit marker 损坏${autoRepair ? '，已清理' : '，建议自动修复'}`,
        resolved: autoRepair,
      });
      return;
    }

    const snapshotId = marker.snapshotId;
    const chapterDescriptor =
      typeof marker.chapterNumber === 'number' ? `第 ${marker.chapterNumber} 章` : '未知章节';

    if (!snapshotId) {
      if (autoRepair) {
        try {
          fs.unlinkSync(markerPath);
        } catch {
          // best effort
        }
      }
      report.issues.push({
        type: 'incomplete_commit',
        severity: 'error',
        description: `${chapterDescriptor} 的 commit marker 缺少 snapshotId${autoRepair ? '，已清理' : ''}`,
        resolved: autoRepair,
      });
      return;
    }

    const snapDir = path.join(stateDir, 'snapshots', snapshotId);
    const snapManifestPath = path.join(snapDir, 'manifest.json');
    const snapIndexPath = path.join(snapDir, 'index.json');
    const destManifestPath = path.join(stateDir, 'manifest.json');
    const destIndexPath = path.join(stateDir, 'index.json');

    if (!fs.existsSync(snapDir)) {
      report.issues.push({
        type: 'incomplete_commit',
        severity: 'critical',
        description: `${chapterDescriptor} 检测到未完成的 commit，但快照「${snapshotId}」缺失，无法回滚`,
        resolved: false,
      });
      return;
    }

    if (autoRepair) {
      try {
        if (fs.existsSync(snapManifestPath)) {
          fs.copyFileSync(snapManifestPath, destManifestPath);
        }
        if (fs.existsSync(snapIndexPath)) {
          fs.copyFileSync(snapIndexPath, destIndexPath);
        }
        fs.unlinkSync(markerPath);
        report.issues.push({
          type: 'incomplete_commit',
          severity: 'error',
          description: `${chapterDescriptor} 检测到未完成的 commit，已从快照「${snapshotId}」回滚`,
          resolved: true,
        });
      } catch (err) {
        report.issues.push({
          type: 'incomplete_commit',
          severity: 'critical',
          description: `${chapterDescriptor} 回滚失败: ${err instanceof Error ? err.message : String(err)}`,
          resolved: false,
        });
      }
    } else {
      report.issues.push({
        type: 'incomplete_commit',
        severity: 'error',
        description: `${chapterDescriptor} 检测到未完成的 commit（快照「${snapshotId}」），使用 --auto-repair 可回滚`,
        resolved: false,
      });
    }
  }

  // ── Orphan Tmp Cleanup ────────────────────────────────────

  #cleanupOrphanTmpFiles(bookId: string, report: RecoveryReport, autoRepair: boolean): void {
    const bookDir = this.manager.getBookPath(bookId);
    if (!fs.existsSync(bookDir)) return;

    const STALE_THRESHOLD_MS = 60 * 60 * 1000;
    const now = Date.now();
    const candidates: string[] = [];

    const walk = (dir: string): void => {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === 'snapshots') continue;
          walk(full);
        } else if (entry.isFile()) {
          if (!entry.name.endsWith('.tmp') && !entry.name.endsWith('.pending')) continue;
          try {
            const stat = fs.statSync(full);
            if (now - stat.mtimeMs >= STALE_THRESHOLD_MS) {
              candidates.push(full);
            }
          } catch {
            // 无法 stat，跳过
          }
        }
      }
    };

    walk(bookDir);

    for (const file of candidates) {
      const relName = path.relative(bookDir, file);
      if (autoRepair) {
        try {
          fs.unlinkSync(file);
          report.issues.push({
            type: 'orphan_tmp_file',
            severity: 'warning',
            description: `已清理崩溃残留的临时文件: ${relName}`,
            resolved: true,
          });
        } catch (err) {
          console.warn(
            `[recovery] Failed to remove orphan tmp file ${file}:`,
            err instanceof Error ? err.message : String(err),
          );
        }
      } else {
        report.issues.push({
          type: 'orphan_tmp_file',
          severity: 'warning',
          description: `检测到崩溃残留的临时文件: ${relName}（使用 --auto-repair 可清理）`,
          resolved: false,
        });
      }
    }
  }

  // ── WAL Check ──────────────────────────────────────────────

  #checkWal(bookId: string): RecoveryReport['walStatus'] {
    const dbPath = path.join(this.manager.getBookPath(bookId, 'story', 'state'), 'memory.db');
    const walPath = dbPath + '-wal';

    if (!fs.existsSync(walPath)) return 'no_wal_file';

    // WAL file exists — sql.js handles WAL auto-rollback on open
    // We note its presence for diagnostic purposes
    return 'clean';
  }

  // ── Chapter Consistency ────────────────────────────────────

  #checkChapterConsistency(bookId: string, report: RecoveryReport, autoRepair: boolean): void {
    let index: ChapterIndex;
    try {
      index = this.manager.readIndex(bookId);
    } catch (err) {
      console.warn(
        `[recovery] Failed to read index for ${bookId}:`,
        err instanceof Error ? err.message : String(err),
      );
      return;
    }

    for (let i = index.chapters.length - 1; i >= 0; i--) {
      const entry = index.chapters[i];
      const chapterPath = this.manager.getChapterFilePath(bookId, entry.number);
      const fileExists = fs.existsSync(chapterPath);

      if (!fileExists) {
        if (autoRepair) {
          report.issues.push({
            type: 'missing_chapter_file',
            severity: 'error',
            description: `第 ${entry.number} 章在 index.json 中存在但文件缺失，已清理索引条目`,
            resolved: true,
          });
        } else {
          report.issues.push({
            type: 'missing_chapter_file',
            severity: 'error',
            description: `第 ${entry.number} 章在 index.json 中存在但文件缺失`,
            resolved: false,
          });
        }
      }
    }

    if (autoRepair) {
      const validChapterNumbers = new Set(
        index.chapters
          .filter((entry) => fs.existsSync(this.manager.getChapterFilePath(bookId, entry.number)))
          .map((e) => e.number),
      );
      index.chapters = index.chapters.filter((entry) => validChapterNumbers.has(entry.number));
    }

    // Check for chapters that exist in filesystem but not in SQLite
    const chapterDir = this.manager.getBookPath(bookId, 'story', 'chapters');
    if (fs.existsSync(chapterDir)) {
      for (const file of fs.readdirSync(chapterDir)) {
        if (!file.startsWith('chapter-') || !file.endsWith('.md')) continue;

        const chapterNum = parseInt(file.replace('chapter-', '').replace('.md', ''), 10);
        if (isNaN(chapterNum)) continue;

        const filePath = path.join(chapterDir, file);
        const stat = fs.statSync(filePath);
        if (stat.size === 0) continue; // Skip empty placeholder

        // Check if this chapter has a corresponding summary in SQLite
        const summary = this.memDb.getChapterSummary(chapterNum);

        if (!summary) {
          if (autoRepair) {
            fs.unlinkSync(filePath);
            index.chapters = index.chapters.filter((c) => c.number !== chapterNum);
            report.issues.push({
              type: 'orphan_chapter',
              severity: 'error',
              description: `第 ${chapterNum} 章是崩溃残留（无 SQLite 记录），已清理`,
              resolved: true,
            });
          } else {
            report.issues.push({
              type: 'orphan_chapter',
              severity: 'error',
              description: `第 ${chapterNum} 章是崩溃残留（无 SQLite 记录），建议自动修复`,
              resolved: false,
            });
          }
        }
      }
    }

    // Write back updated index if changed
    if (index.totalChapters !== index.chapters.length) {
      index.totalChapters = index.chapters.length;
      index.lastUpdated = new Date().toISOString();
      this.manager.writeIndex(bookId, index);
    }
  }

  // ── Summary Consistency ────────────────────────────────────

  #checkSummaryConsistency(bookId: string, report: RecoveryReport, _autoRepair: boolean): void {
    let index: ChapterIndex;
    try {
      index = this.manager.readIndex(bookId);
    } catch (err) {
      console.warn(
        `[recovery] Failed to read index for ${bookId}:`,
        err instanceof Error ? err.message : String(err),
      );
      return;
    }

    // Get all chapter numbers from index
    const indexChapterNumbers = new Set(index.chapters.map((c) => c.number));

    // Get all chapters from SQLite
    const summaryChapters = this.memDb.listChapterSummaryChapters();
    if (summaryChapters.length === 0) return;

    for (const chapterNum of summaryChapters) {
      if (!indexChapterNumbers.has(chapterNum)) {
        // SQLite has summary but index doesn't have the chapter
        report.issues.push({
          type: 'orphan_summary',
          severity: 'warning',
          description: `SQLite 中存在第 ${chapterNum} 章摘要，但 index.json 无对应条目`,
          resolved: false,
        });
      }
    }
  }

  // ── Hook Consistency ───────────────────────────────────────

  #checkHookConsistency(bookId: string, report: RecoveryReport): void {
    // Load manifest to get hooks from JSON
    const manifestPath = this.manager.getBookPath(bookId, 'story', 'state', 'manifest.json');
    if (!fs.existsSync(manifestPath)) return;

    const manifest: Manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as Manifest;

    const sqliteHooks = this.memDb.queryActiveHooks();

    // Check for hooks in SQLite that aren't in manifest
    if (sqliteHooks.length > 0 && manifest.hooks.length === 0) {
      report.issues.push({
        type: 'hook_mismatch',
        severity: 'warning',
        description: `SQLite 中有 ${sqliteHooks.length} 条活跃伏笔，但 manifest.json 中无伏笔`,
        resolved: false,
      });
    }
  }
}
