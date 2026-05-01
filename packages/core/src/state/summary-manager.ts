import * as fs from 'fs';
import type { ChapterSummaryRecord, ChapterSummaryArchive } from '../models/state';
import { safeWriteFile } from '../utils/safe-write-file';
import type { StateManager } from './manager';

// ─── SummaryManager ──────────────────────────────────────────────
// 负责章节摘要存档的读写管理。

export class SummaryManager {
  private manager: StateManager;

  constructor(manager: StateManager) {
    this.manager = manager;
  }

  private getSummariesPath(bookId: string): string {
    return this.manager.getBookPath(bookId, 'story', 'state', 'summaries.json');
  }

  /**
   * 读取书籍的章节摘要存档。
   * 文件不存在时返回空存档。
   */
  readChapterSummaries(bookId: string): ChapterSummaryArchive {
    const path = this.getSummariesPath(bookId);
    if (!fs.existsSync(path)) {
      return {
        bookId,
        summaries: [],
        arcSummaries: {},
        lastUpdated: new Date().toISOString(),
      };
    }
    try {
      const raw = fs.readFileSync(path, 'utf-8');
      return JSON.parse(raw) as ChapterSummaryArchive;
    } catch {
      return {
        bookId,
        summaries: [],
        arcSummaries: {},
        lastUpdated: new Date().toISOString(),
      };
    }
  }

  /**
   * 写入书籍的章节摘要存档。
   */
  writeChapterSummaries(bookId: string, archive: ChapterSummaryArchive): void {
    const stateDir = this.manager.getBookPath(bookId, 'story', 'state');
    fs.mkdirSync(stateDir, { recursive: true });
    const summariesPath = this.getSummariesPath(bookId);
    safeWriteFile(summariesPath, JSON.stringify(archive, null, 2));
  }

  /**
   * 获取单章摘要记录。
   */
  getChapterSummaryRecord(bookId: string, chapterNumber: number): ChapterSummaryRecord | null {
    const archive = this.readChapterSummaries(bookId);
    return archive.summaries.find((s) => s.chapter === chapterNumber) ?? null;
  }

  /**
   * 设置单章摘要记录（upsert）。
   */
  setChapterSummaryRecord(bookId: string, record: ChapterSummaryRecord): void {
    const archive = this.readChapterSummaries(bookId);
    const idx = archive.summaries.findIndex((s) => s.chapter === record.chapter);
    if (idx >= 0) {
      archive.summaries[idx] = record;
    } else {
      archive.summaries.push(record);
      // 保持按章节号排序
      archive.summaries.sort((a, b) => a.chapter - b.chapter);
    }
    archive.lastUpdated = new Date().toISOString();
    this.writeChapterSummaries(bookId, archive);
  }

  /**
   * 删除单章摘要记录。
   */
  deleteChapterSummaryRecord(bookId: string, chapterNumber: number): void {
    const archive = this.readChapterSummaries(bookId);
    const before = archive.summaries.length;
    archive.summaries = archive.summaries.filter((s) => s.chapter !== chapterNumber);
    if (archive.summaries.length !== before) {
      archive.lastUpdated = new Date().toISOString();
      this.writeChapterSummaries(bookId, archive);
    }
  }

  /**
   * 获取块级压缩概要（arc summary）。
   */
  getArcSummary(bookId: string, blockKey: string): string | null {
    const archive = this.readChapterSummaries(bookId);
    return archive.arcSummaries[blockKey] ?? null;
  }

  /**
   * 设置块级压缩概要。
   */
  setArcSummary(bookId: string, blockKey: string, arcSummary: string): void {
    const archive = this.readChapterSummaries(bookId);
    archive.arcSummaries[blockKey] = arcSummary;
    archive.lastUpdated = new Date().toISOString();
    this.writeChapterSummaries(bookId, archive);
  }
}
