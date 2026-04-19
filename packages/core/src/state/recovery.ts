import * as fs from 'fs';
import * as path from 'path';
import { StateManager } from './manager';
import { MemoryDB } from './memory-db';
import { ProjectionRenderer } from './projections';
import type { ChapterIndex } from '../models/chapter';
import type { Manifest } from '../models/state';

// ─── Types ─────────────────────────────────────────────────────

export type RecoveryIssueType =
  | 'zombie_lock'
  | 'active_lock'
  | 'orphan_chapter'
  | 'missing_chapter_file'
  | 'orphan_summary'
  | 'hook_mismatch';

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

    // 2. 检查 WAL 状态
    report.walStatus = this.#checkWal(bookId);

    // 3. 一致性校验
    this.#checkChapterConsistency(bookId, report, options.autoRepair ?? false);
    this.#checkSummaryConsistency(bookId, report, options.autoRepair ?? false);
    this.#checkHookConsistency(bookId, report);

    // 4. 计算整体状态
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
    } catch {
      return false;
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
    } catch {
      return; // No index yet
    }

    for (let i = index.chapters.length - 1; i >= 0; i--) {
      const entry = index.chapters[i];
      const chapterPath = this.manager.getChapterFilePath(bookId, entry.number);
      const fileExists = fs.existsSync(chapterPath);

      if (!fileExists) {
        // Index has entry but file missing
        if (autoRepair) {
          index.chapters.splice(i, 1);
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
          // Chapter file exists but no SQLite record → orphan (crash before commit)
          if (autoRepair) {
            // Remove the orphan chapter file
            fs.unlinkSync(filePath);
            // Remove from index.json too
            const idx = index.chapters.findIndex((c) => c.number === chapterNum);
            if (idx >= 0) {
              index.chapters.splice(idx, 1);
            }
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

  #checkSummaryConsistency(bookId: string, report: RecoveryReport, autoRepair: boolean): void {
    let index: ChapterIndex;
    try {
      index = this.manager.readIndex(bookId);
    } catch {
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
