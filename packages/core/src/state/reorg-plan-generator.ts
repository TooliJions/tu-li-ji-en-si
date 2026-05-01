import * as fs from 'fs';
import * as path from 'path';

// ─── Types ─────────────────────────────────────────────────────

export interface ReorgPlanFile {
  name: string;
  targetPath: string;
  action: 'create' | 'delete' | 'replace';
  content: string;
}

export interface ReorgPlan {
  success: boolean;
  bookId: string;
  operation: 'merge' | 'split';
  files: ReorgPlanFile[];
  reanchorFacts: { fromChapter: number; toChapter: number }[];
  reanchorHooks: { fromChapter: number; toChapter: number }[];
  renumberChapters?: { oldNumber: number; newNumber: number }[];
  error?: string;
}

// ─── ReorgPlanGenerator ──────────────────────────────────────────
// 负责生成合并/拆分操作的重组计划。

export class ReorgPlanGenerator {
  private rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
  }

  /**
   * 生成合并操作的计划。
   */
  prepareMergePlan(bookId: string, fromChapter: number, toChapter: number): ReorgPlan {
    const bookDir = this.#getBookDir(bookId);
    if (!fs.existsSync(bookDir)) {
      return {
        success: false,
        bookId,
        operation: 'merge',
        files: [],
        reanchorFacts: [],
        reanchorHooks: [],
        error: `书籍「${bookId}」不存在`,
      };
    }

    const fromFile = this.#chapterFileName(fromChapter);
    const toFile = this.#chapterFileName(toChapter);

    const files: ReorgPlanFile[] = [
      {
        name: fromFile,
        targetPath: path.join(bookDir, 'story', 'chapters', fromFile),
        action: 'replace',
        content: '',
      },
      {
        name: toFile,
        targetPath: path.join(bookDir, 'story', 'chapters', toFile),
        action: 'delete',
        content: '',
      },
    ];

    // Facts from toChapter → reanchor to fromChapter
    const reanchorFacts = [{ fromChapter: toChapter, toChapter: fromChapter }];
    // Hooks from toChapter → reanchor to fromChapter
    const reanchorHooks = [{ fromChapter: toChapter, toChapter: fromChapter }];

    // Subsequent chapters need renumbering (-1)
    const renumberChapters: { oldNumber: number; newNumber: number }[] = [];
    // Assume we don't know total chapters; caller should determine
    for (let ch = toChapter + 1; ch <= toChapter + 100; ch++) {
      const chFile = this.#chapterFileName(ch);
      const chPath = path.join(bookDir, 'story', 'chapters', chFile);
      if (fs.existsSync(chPath)) {
        renumberChapters.push({ oldNumber: ch, newNumber: ch - 1 });
      } else {
        break;
      }
    }

    return {
      success: true,
      bookId,
      operation: 'merge',
      files,
      reanchorFacts,
      reanchorHooks,
      renumberChapters,
    };
  }

  /**
   * 生成拆分操作的计划。
   */
  prepareSplitPlan(bookId: string, chapter: number, _splitAtParagraph: number): ReorgPlan {
    const bookDir = this.#getBookDir(bookId);
    if (!fs.existsSync(bookDir)) {
      return {
        success: false,
        bookId,
        operation: 'split',
        files: [],
        reanchorFacts: [],
        reanchorHooks: [],
        error: `书籍「${bookId}」不存在`,
      };
    }

    const chFile = this.#chapterFileName(chapter);
    const newChFile = this.#chapterFileName(chapter + 1);

    const files: ReorgPlanFile[] = [
      {
        name: chFile,
        targetPath: path.join(bookDir, 'story', 'chapters', chFile),
        action: 'replace',
        content: '',
      },
      {
        name: newChFile,
        targetPath: path.join(bookDir, 'story', 'chapters', newChFile),
        action: 'create',
        content: '',
      },
    ];

    // Facts and hooks from chapter → split between chapter and chapter+1
    const reanchorFacts = [{ fromChapter: chapter, toChapter: chapter + 1 }];
    const reanchorHooks = [{ fromChapter: chapter, toChapter: chapter + 1 }];

    // Subsequent chapters need renumbering (+1)
    const renumberChapters: { oldNumber: number; newNumber: number }[] = [];
    for (let ch = chapter + 1; ch <= chapter + 100; ch++) {
      const chFile = this.#chapterFileName(ch);
      const chPath = path.join(bookDir, 'story', 'chapters', chFile);
      if (fs.existsSync(chPath)) {
        renumberChapters.push({ oldNumber: ch, newNumber: ch + 1 });
      } else {
        break;
      }
    }

    return {
      success: true,
      bookId,
      operation: 'split',
      files,
      reanchorFacts,
      reanchorHooks,
      renumberChapters,
    };
  }

  // ── Internal ──────────────────────────────────────────────

  #getBookDir(bookId: string): string {
    return path.join(this.rootDir, bookId);
  }

  #chapterFileName(chapterNumber: number): string {
    const padded = String(chapterNumber).padStart(4, '0');
    return `chapter-${padded}.md`;
  }
}
