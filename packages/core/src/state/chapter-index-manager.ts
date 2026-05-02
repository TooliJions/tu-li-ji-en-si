import * as fs from 'fs';
import * as path from 'path';
import type { ChapterIndex } from '../models/state';
import { countChineseWords } from '../utils/text';
import { safeWriteFile } from '../utils/safe-write-file';
import type { StateManager } from './manager';

// ─── ChapterIndexManager ─────────────────────────────────────────
// 负责章节索引的读写、查找、归一化和原子化 upsert。

export class ChapterIndexManager {
  private manager: StateManager;

  constructor(manager: StateManager) {
    this.manager = manager;
  }

  /**
   * 读取 index.json 并返回解析后的对象。
   * 文件不存在时抛出。
   */
  readIndex(bookId: string): ChapterIndex {
    const indexPath = this.manager.getBookPath(bookId, 'story', 'state', 'index.json');
    const raw = fs.readFileSync(indexPath, 'utf-8');
    return JSON.parse(raw) as ChapterIndex;
  }

  /**
   * 写入 index.json。
   */
  writeIndex(bookId: string, index: ChapterIndex): void {
    const stateDir = this.manager.getBookPath(bookId, 'story', 'state');
    fs.mkdirSync(stateDir, { recursive: true });

    const indexPath = path.join(stateDir, 'index.json');
    safeWriteFile(indexPath, JSON.stringify(index, null, 2));
  }

  /**
   * 在章节索引中查找指定章节号的条目。
   * 兼容旧格式（chapterNumber 字段）和新格式（number 字段）。
   */
  findChapterEntry(
    chapters: ChapterIndex['chapters'],
    chapterNumber: number,
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
    wordCount: number,
  ): ChapterIndex['chapters'][number] {
    const legacyEntry = entry as Record<string, unknown>;
    const rest = {
      ...(legacyEntry as ChapterIndex['chapters'][number] & {
        chapterNumber?: unknown;
        status?: unknown;
        writtenAt?: unknown;
        plannedAt?: unknown;
      }),
    };
    delete rest.chapterNumber;
    delete rest.status;
    delete rest.writtenAt;
    delete rest.plannedAt;
    return {
      ...rest,
      number: chapterNumber,
      title: title ?? entry.title,
      fileName: entry.fileName || `chapter-${String(chapterNumber).padStart(4, '0')}.md`,
      wordCount: Number.isFinite(wordCount) ? wordCount : 0,
      createdAt: entry.createdAt || new Date().toISOString(),
    };
  }

  /**
   * 原子化的 upsert 操作：读取 → 查找/创建/更新 → 写入。
   */
  upsertChapterIndex(
    bookId: string,
    chapterNumber: number,
    title: string,
    content: string,
    _status: 'draft' | 'final',
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
      const normalized = this.normalizeChapterEntry(
        existingEntry,
        chapterNumber,
        title,
        content.length > 0 ? countChineseWords(content) : existingEntry.wordCount,
      );
      const idx = index.chapters.findIndex((c) => c.number === chapterNumber);
      if (idx >= 0) index.chapters[idx] = normalized;
    }

    index.totalChapters = index.chapters.length;
    index.totalWords = index.chapters.reduce(
      (sum, ch) => sum + (Number.isFinite(ch.wordCount) ? ch.wordCount : 0),
      0,
    );
    index.lastUpdated = new Date().toISOString();

    this.writeIndex(bookId, index);
  }
}
