import * as fs from 'fs';
import * as path from 'path';
import type { BookLock, ChapterIndex } from '../models/state';
import { countChineseWords } from '../utils';

// ─── StateManager ─────────────────────────────────────────────────
// 负责书籍锁、路径计算、章节索引的读写。
// 锁使用 open("wx") 实现排他创建，保证同一时刻仅一个进程可操作。

export class StateManager {
  private _rootDir: string;

  constructor(rootDir: string) {
    this._rootDir = rootDir;
  }

  /** 获取 StateManager 的根目录路径 */
  get rootDir(): string {
    return this._rootDir;
  }

  // ── Path Computation ──────────────────────────────────────────

  /**
   * 计算书籍相关路径。
   * 不传 subPath 时返回目录，传了则拼接。
   */
  getBookPath(bookId: string, ...subPath: string[]): string {
    // 防止路径穿越：拒绝包含目录分隔符或父目录引用的 bookId
    if (
      /[\\/]/.test(bookId) ||
      bookId === '..' ||
      bookId.startsWith('..\\') ||
      bookId.startsWith('../')
    ) {
      throw new Error(`非法的 bookId: ${bookId}`);
    }
    const base = path.join(this.rootDir, bookId);
    if (subPath.length === 0) return base;
    return path.join(base, ...subPath);
  }

  /**
   * 确保书籍目录结构存在：
   *   {root}/{bookId}/
   *   {root}/{bookId}/story/
   *   {root}/{bookId}/story/chapters/
   *   {root}/{bookId}/story/state/
   */
  ensureBookStructure(bookId: string): void {
    const dirs = [
      this.getBookPath(bookId),
      this.getBookPath(bookId, 'story'),
      this.getBookPath(bookId, 'story', 'chapters'),
      this.getBookPath(bookId, 'story', 'state'),
    ];
    for (const dir of dirs) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * 获取章节文件的完整路径。
   * 章节号自动补零为 4 位：chapter-0001.md
   */
  getChapterFilePath(bookId: string, chapterNumber: number): string {
    const padded = String(chapterNumber).padStart(4, '0');
    return this.getBookPath(bookId, 'story', 'chapters', `chapter-${padded}.md`);
  }

  // ── Book Lock ─────────────────────────────────────────────────

  /**
   * 检查进程是否仍在运行。
   */
  private isProcessRunning(pid: number): boolean {
    try {
      // 信号 0 不会杀死进程，但可以用来检测进程是否存在
      process.kill(pid, 0);
      return true;
    } catch (e) {
      console.warn(
        '[state-manager] Failed to check process:',
        e instanceof Error ? e.message : String(e)
      );
      return false;
    }
  }

  /**
   * 获取书籍排他锁。
   * 使用 fs.openSync("wx") 原子创建 .lock 文件。
   * 仅在 EEXIST 时检查陈旧锁并清理，然后重试。
   */
  acquireBookLock(bookId: string, operation: string): BookLock | null {
    const lockPath = this.getBookPath(bookId, '.lock');

    const lockInfo: BookLock = {
      bookId,
      pid: process.pid,
      createdAt: new Date().toISOString(),
      operation,
    };

    const tryAcquire = (): BookLock => {
      const fd = fs.openSync(lockPath, 'wx');
      fs.writeFileSync(fd, JSON.stringify(lockInfo, null, 2));
      fs.closeSync(fd);
      return lockInfo;
    };

    try {
      return tryAcquire();
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw err;
      }

      // 锁已存在，检查是否为陈旧锁
      try {
        const content = fs.readFileSync(lockPath, 'utf-8');
        const existingLock = JSON.parse(content) as BookLock;
        if (existingLock.pid && !this.isProcessRunning(existingLock.pid)) {
          // 进程已不存在，清理陈旧锁并重试
          fs.unlinkSync(lockPath);
          return tryAcquire();
        }
      } catch {
        // 锁文件损坏，清理并重试
        try {
          fs.unlinkSync(lockPath);
          return tryAcquire();
        } catch {
          // 清理失败，说明有活跃锁
        }
      }

      throw new Error(`Book "${bookId}" is already locked by another process`);
    }
  }

  /**
   * 释放书籍锁，删除 .lock 文件。
   */
  releaseBookLock(bookId: string): void {
    const lockPath = this.getBookPath(bookId, '.lock');
    if (fs.existsSync(lockPath)) {
      fs.unlinkSync(lockPath);
    }
  }

  // ── Chapter Index ─────────────────────────────────────────────

  /**
   * 读取 index.json 并返回解析后的对象。
   * 文件不存在时抛出。
   */
  readIndex(bookId: string): ChapterIndex {
    const indexPath = this.getBookPath(bookId, 'story', 'state', 'index.json');
    const raw = fs.readFileSync(indexPath, 'utf-8');
    return JSON.parse(raw) as ChapterIndex;
  }

  /**
   * 写入 index.json。
   */
  writeIndex(bookId: string, index: ChapterIndex): void {
    const stateDir = this.getBookPath(bookId, 'story', 'state');
    fs.mkdirSync(stateDir, { recursive: true });

    const indexPath = path.join(stateDir, 'index.json');
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');
  }

  // ── Index Helpers（集中化，消除 runner/atomic-ops/persistence 中的重复逻辑）──

  /**
   * 在章节索引中查找指定章节号的条目。
   * 兼容旧格式（chapterNumber 字段）和新格式（number 字段）。
   */
  findChapterEntry(
    chapters: ChapterIndex['chapters'],
    chapterNumber: number
  ): ChapterIndex['chapters'][number] | undefined {
    return chapters.find((chapter) => {
      const legacyChapter = chapter as ChapterIndex['chapters'][number] & {
        chapterNumber?: number;
      };
      return chapter.number === chapterNumber || legacyChapter.chapterNumber === chapterNumber;
    });
  }

  /**
   * 归一化章节索引条目字段（清理旧版遗留字段）。
   */
  normalizeChapterEntry(
    entry: ChapterIndex['chapters'][number],
    chapterNumber: number,
    title: string | null,
    wordCount: number
  ): void {
    entry.number = chapterNumber;
    entry.title = title;
    // fileName 保持不变（已存在则保留）
    if (!entry.fileName) {
      const padded = String(chapterNumber).padStart(4, '0');
      entry.fileName = `chapter-${padded}.md`;
    }
    entry.wordCount = Number.isFinite(wordCount) ? wordCount : 0;
    entry.createdAt = entry.createdAt || new Date().toISOString();
    // 清理旧版遗留字段
    const legacyEntry = entry as Record<string, unknown>;
    delete legacyEntry.chapterNumber;
    delete legacyEntry.status;
    delete legacyEntry.writtenAt;
    delete legacyEntry.plannedAt;
  }

  /**
   * 原子化的 upsert 操作：读取 → 查找/创建/更新 → 写入。
   */
  upsertChapterIndex(
    bookId: string,
    chapterNumber: number,
    title: string,
    content: string,
    status: 'draft' | 'final'
  ): void {
    const index = this.readIndex(bookId);
    const existingEntry = this.findChapterEntry(index.chapters, chapterNumber);

    if (!existingEntry) {
      const padded = String(chapterNumber).padStart(4, '0');
      index.chapters.push({
        number: chapterNumber,
        title,
        fileName: `chapter-${padded}.md`,
        wordCount: countChineseWords(content),
        createdAt: new Date().toISOString(),
      });
    } else {
      this.normalizeChapterEntry(
        existingEntry,
        chapterNumber,
        title,
        content.length > 0 ? countChineseWords(content) : existingEntry.wordCount
      );
    }

    index.totalChapters = index.chapters.length;
    index.totalWords = index.chapters.reduce(
      (sum, ch) => sum + (Number.isFinite(ch.wordCount) ? ch.wordCount : 0),
      0
    );
    index.lastUpdated = new Date().toISOString();

    this.writeIndex(bookId, index);
  }
}
