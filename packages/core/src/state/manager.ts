import * as fs from 'fs';
import * as path from 'path';
import type { BookLock, ChapterIndex, ChapterIndexEntry } from '../models/state';

// ─── StateManager ─────────────────────────────────────────────────
// 负责书籍锁、路径计算、章节索引的读写。
// 锁使用 open("wx") 实现排他创建，保证同一时刻仅一个进程可操作。

export class StateManager {
  private rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
  }

  // ── Path Computation ──────────────────────────────────────────

  /**
   * 计算书籍相关路径。
   * 不传 subPath 时返回目录，传了则拼接。
   */
  getBookPath(bookId: string, ...subPath: string[]): string {
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
   * 获取书籍排他锁。
   * 使用 open("wx") 原子创建 .lock 文件，若已存在则抛出。
   */
  acquireBookLock(bookId: string, operation: string): BookLock | null {
    const lockPath = this.getBookPath(bookId, '.lock');
    const lockInfo: BookLock = {
      bookId,
      pid: process.pid,
      createdAt: new Date().toISOString(),
      operation,
    };

    try {
      // "wx" = exclusive create，文件已存在时抛出 EEXIST
      const fd = fs.openSync(lockPath, 'wx');
      fs.writeFileSync(fd, JSON.stringify(lockInfo, null, 2));
      fs.closeSync(fd);
      return lockInfo;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new Error(`Book "${bookId}" is already locked by another process`);
      }
      throw err;
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
}
