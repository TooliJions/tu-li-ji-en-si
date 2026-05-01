import * as fs from 'fs';
import * as path from 'path';
import type { StateManager } from './manager';
import type { MemoryDB } from './memory-db';
import type { ChapterIndex } from '../models/chapter';
import type { Manifest } from '../models/state';
import type { RecoveryReport } from './recovery';

// ─── RecoveryCheckers ────────────────────────────────────────────
// 负责各类一致性检查逻辑，由 SessionRecovery 调用。

export class RecoveryCheckers {
  constructor(
    private manager: StateManager,
    private memDb: MemoryDB,
  ) {}

  // ── Lock Check ─────────────────────────────────────────────

  checkBookLock(bookId: string, report: RecoveryReport, fixLocks: boolean): void {
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
      report.issues.push({
        type: 'active_lock',
        severity: 'critical',
        description: `书籍被进程 ${pid} 锁定（${lockData.operation as string}），正在运行中`,
        resolved: false,
      });
    } else {
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

  // ── WAL Check ──────────────────────────────────────────────

  checkWal(bookId: string): RecoveryReport['walStatus'] {
    const dbPath = path.join(this.manager.getBookPath(bookId, 'story', 'state'), 'memory.db');
    const walPath = dbPath + '-wal';

    if (!fs.existsSync(walPath)) return 'no_wal_file';
    return 'clean';
  }

  // ── Chapter Consistency ────────────────────────────────────

  checkChapterConsistency(bookId: string, report: RecoveryReport, autoRepair: boolean): void {
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

    // Check for orphan chapters
    const chapterDir = this.manager.getBookPath(bookId, 'story', 'chapters');
    if (fs.existsSync(chapterDir)) {
      for (const file of fs.readdirSync(chapterDir)) {
        if (!file.startsWith('chapter-') || !file.endsWith('.md')) continue;

        const chapterNum = parseInt(file.replace('chapter-', '').replace('.md', ''), 10);
        if (isNaN(chapterNum)) continue;

        const filePath = path.join(chapterDir, file);
        const stat = fs.statSync(filePath);
        if (stat.size === 0) continue;

        const jsonSummary = this.manager.getChapterSummaryRecord(bookId, chapterNum);
        const sqliteSummary = this.memDb.getChapterSummary(chapterNum);

        if (!jsonSummary && !sqliteSummary) {
          if (autoRepair) {
            fs.unlinkSync(filePath);
            const idx = index.chapters.findIndex((c) => c.number === chapterNum);
            if (idx >= 0) {
              index.chapters.splice(idx, 1);
            }
            report.issues.push({
              type: 'orphan_chapter',
              severity: 'error',
              description: `第 ${chapterNum} 章是崩溃残留（无摘要记录），已清理`,
              resolved: true,
            });
          } else {
            report.issues.push({
              type: 'orphan_chapter',
              severity: 'error',
              description: `第 ${chapterNum} 章是崩溃残留（无摘要记录），建议自动修复`,
              resolved: false,
            });
          }
        }
      }
    }

    if (index.totalChapters !== index.chapters.length) {
      index.totalChapters = index.chapters.length;
      index.lastUpdated = new Date().toISOString();
      this.manager.writeIndex(bookId, index);
    }
  }

  // ── Summary Consistency ────────────────────────────────────

  checkSummaryConsistency(bookId: string, report: RecoveryReport, _autoRepair: boolean): void {
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

    const indexChapterNumbers = new Set(index.chapters.map((c) => c.number));

    const sqliteSummaryChapters = this.memDb.listChapterSummaryChapters();
    for (const chapterNum of sqliteSummaryChapters) {
      if (!indexChapterNumbers.has(chapterNum)) {
        report.issues.push({
          type: 'orphan_summary',
          severity: 'warning',
          description: `SQLite 中存在第 ${chapterNum} 章摘要，但 index.json 无对应条目`,
          resolved: false,
        });
      }
    }

    try {
      const archive = this.manager.readChapterSummaries(bookId);
      for (const summary of archive.summaries) {
        if (!indexChapterNumbers.has(summary.chapter)) {
          report.issues.push({
            type: 'orphan_summary',
            severity: 'warning',
            description: `summaries.json 中存在第 ${summary.chapter} 章摘要，但 index.json 无对应条目`,
            resolved: false,
          });
        }
      }
    } catch {
      // summaries.json may not exist yet
    }
  }

  // ── Hook Consistency ───────────────────────────────────────

  checkHookConsistency(bookId: string, report: RecoveryReport): void {
    const manifestPath = this.manager.getBookPath(bookId, 'story', 'state', 'manifest.json');
    if (!fs.existsSync(manifestPath)) return;

    let manifest: Manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as Manifest;
    } catch (err) {
      report.issues.push({
        type: 'hook_mismatch',
        severity: 'error',
        description: `manifest.json 损坏无法解析: ${err instanceof Error ? err.message : String(err)}`,
        resolved: false,
      });
      return;
    }

    const sqliteHooks = this.memDb.queryActiveHooks();

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
