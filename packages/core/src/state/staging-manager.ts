import * as fs from 'fs';
import * as path from 'path';

// ─── Types ─────────────────────────────────────────────────────

export interface StagingFile {
  name: string;
  stagingPath: string;
  size: number;
  createdAt: string;
}

export interface StagingActionResult {
  success: boolean;
  stagingDir?: string;
  error?: string;
}

export interface CommitAction {
  stagingFile: string;
  targetPath: string;
  action: 'create' | 'delete' | 'replace';
}

export interface CommitResult {
  success: boolean;
  applied: string[];
  error?: string;
}

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

// ─── StagingManager ─────────────────────────────────────────────────
/**
 * Staging 目录管理器。
 * 负责重组操作的临时文件准备和原子提交。
 * 目录结构: {rootDir}/{bookId}/story/staging/
 */
export class StagingManager {
  private rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
  }

  // ── Staging Area Lifecycle ────────────────────────────────

  /**
   * 创建 staging 临时目录。
   */
  createStagingArea(bookId: string): StagingActionResult {
    const bookDir = this.#getBookDir(bookId);
    if (!fs.existsSync(bookDir)) {
      return { success: false, error: `书籍「${bookId}」目录不存在` };
    }

    const stagingDir = this.#getStagingDir(bookId);
    fs.mkdirSync(stagingDir, { recursive: true });

    return { success: true, stagingDir };
  }

  /**
   * 获取 staging 目录路径，未创建时返回 undefined。
   */
  getStagingDir(bookId: string): string | undefined {
    const stagingDir = this.#getStagingDir(bookId);
    if (fs.existsSync(stagingDir)) return stagingDir;
    return undefined;
  }

  /**
   * 检查书籍是否有 staging 目录。
   */
  hasStagingArea(bookId: string): boolean {
    return fs.existsSync(this.#getStagingDir(bookId));
  }

  /**
   * 清理 staging 目录。
   */
  cleanup(bookId: string): StagingActionResult {
    const stagingDir = this.#getStagingDir(bookId);
    if (fs.existsSync(stagingDir)) {
      fs.rmSync(stagingDir, { recursive: true, force: true });
    }
    return { success: true };
  }

  // ── File Operations ───────────────────────────────────────

  /**
   * 添加文件到 staging 目录。
   */
  addFile(bookId: string, fileName: string, content: string): StagingActionResult {
    const stagingDir = this.#getStagingDir(bookId);
    if (!fs.existsSync(stagingDir)) {
      return {
        success: false,
        error: `书籍「${bookId}」的 staging 目录不存在，请先调用 createStagingArea`,
      };
    }

    const filePath = path.join(stagingDir, fileName);
    fs.writeFileSync(filePath, content, 'utf-8');

    return { success: true, stagingDir };
  }

  /**
   * 获取 staging 目录中的所有文件。
   */
  getStagedFiles(bookId: string): StagingFile[] {
    const stagingDir = this.#getStagingDir(bookId);
    if (!stagingDir || !fs.existsSync(stagingDir)) return [];

    const files: StagingFile[] = [];
    for (const entry of fs.readdirSync(stagingDir)) {
      const filePath = path.join(stagingDir, entry);
      const stat = fs.statSync(filePath);
      if (stat.isFile()) {
        files.push({
          name: entry,
          stagingPath: filePath,
          size: stat.size,
          createdAt: stat.birthtime.toISOString(),
        });
      }
    }
    return files;
  }

  // ── Commit ────────────────────────────────────────────────

  /**
   * 将 staging 文件原子提交到目标位置。
   * create/replace: 将 staging 文件移动到目标路径
   * delete: 删除目标文件
   */
  commit(bookId: string, actions: CommitAction[]): CommitResult {
    const stagingDir = this.#getStagingDir(bookId);
    if (!fs.existsSync(stagingDir)) {
      return { success: false, applied: [], error: `书籍「${bookId}」的 staging 目录不存在` };
    }

    const applied: string[] = [];

    try {
      for (const action of actions) {
        const stagingPath = path.join(stagingDir, action.stagingFile);

        switch (action.action) {
          case 'create':
          case 'replace': {
            // Ensure target directory exists
            const targetDir = path.dirname(action.targetPath);
            fs.mkdirSync(targetDir, { recursive: true });
            // Atomic rename
            fs.renameSync(stagingPath, action.targetPath);
            applied.push(`${action.action}: ${action.stagingFile} → ${action.targetPath}`);
            break;
          }

          case 'delete':
            if (fs.existsSync(action.targetPath)) {
              fs.unlinkSync(action.targetPath);
            }
            // Also remove from staging if present
            if (fs.existsSync(stagingPath)) {
              fs.unlinkSync(stagingPath);
            }
            applied.push(`delete: ${action.targetPath}`);
            break;
        }
      }

      return { success: true, applied };
    } catch (error) {
      return {
        success: false,
        applied,
        error: `提交失败 (已应用 ${applied.length}/${actions.length}): ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  // ── Plan Generation ───────────────────────────────────────

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

  #getStagingDir(bookId: string): string {
    return path.join(this.rootDir, bookId, 'story', 'staging');
  }

  #chapterFileName(chapterNumber: number): string {
    const padded = String(chapterNumber).padStart(4, '0');
    return `chapter-${padded}.md`;
  }
}
