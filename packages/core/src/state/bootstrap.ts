import * as fs from 'fs';
import * as path from 'path';
import type { BookCreate } from '../models/book';
import type { Manifest } from '../models/state';
import { ProjectionRenderer } from './projections';

// ─── Types ─────────────────────────────────────────────────────

export type BootstrapOptions = Omit<BookCreate, 'id'> & { bookId: string };

// ─── StateBootstrap ────────────────────────────────────────────
// 负责新书创建时的初始目录结构、JSON 文件和 Markdown 投影。

export class StateBootstrap {
  /**
   * 创建新书的完整初始结构：
   *  - book.json（书籍元数据）
   *  - story/chapters/chapter-0000.md（空章节文件）
   *  - story/state/manifest.json（空运行时状态）
   *  - story/state/index.json（空章节索引）
   *  - story/state/current_state.md, hooks.md, chapter_summaries.md（初始投影）
   *  - story/state/.state-hash（状态哈希基准）
   */
  static bootstrapBook(rootDir: string, options: BootstrapOptions): void {
    const bookDir = path.join(rootDir, options.bookId);

    if (fs.existsSync(bookDir)) {
      throw new Error(`Book "${options.bookId}" already exists at "${bookDir}"`);
    }

    const now = new Date().toISOString();

    // 1. Create directory structure
    const dirs = [
      bookDir,
      path.join(bookDir, 'story'),
      path.join(bookDir, 'story', 'chapters'),
      path.join(bookDir, 'story', 'state'),
    ];
    for (const dir of dirs) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // 2. Write book.json
    const book: Record<string, unknown> = {
      id: options.bookId,
      title: options.title,
      genre: options.genre,
      targetWords: options.targetWords,
      currentWords: 0,
      chapterCount: 0,
      status: 'active',
      language: options.language ?? 'zh-CN',
      promptVersion: 'v2',
      fanficMode: options.fanficMode ?? null,
      createdAt: now,
      updatedAt: now,
    };

    if (options.brief !== undefined) book.brief = options.brief;
    if (options.targetChapterCount !== undefined)
      book.targetChapterCount = options.targetChapterCount;

    fs.writeFileSync(path.join(bookDir, 'book.json'), JSON.stringify(book, null, 2), 'utf-8');

    // 3. Write manifest.json
    const manifest: Manifest = {
      bookId: options.bookId,
      versionToken: 1,
      lastChapterWritten: 0,
      currentFocus: undefined,
      hooks: [],
      facts: [],
      characters: [],
      worldRules: [],
      chapterPlans: {},
      outline: [],
      updatedAt: now,
    };
    fs.writeFileSync(
      path.join(bookDir, 'story', 'state', 'manifest.json'),
      JSON.stringify(manifest, null, 2),
      'utf-8'
    );

    // 4. Write index.json
    const index = {
      bookId: options.bookId,
      chapters: [] as Record<string, unknown>[],
      totalChapters: 0,
    };
    fs.writeFileSync(
      path.join(bookDir, 'story', 'state', 'index.json'),
      JSON.stringify(index, null, 2),
      'utf-8'
    );

    // 5. Create empty chapter-0000.md placeholder
    const chapterPath = path.join(bookDir, 'story', 'chapters', 'chapter-0000.md');
    fs.writeFileSync(chapterPath, '', 'utf-8');

    // 6. Write initial Markdown projections
    const stateDir = path.join(bookDir, 'story', 'state');
    ProjectionRenderer.writeProjectionFiles(manifest, stateDir, []);
  }

  /**
   * 检查书籍是否已存在（book.json 存在即视为已创建）。
   */
  static bookExists(rootDir: string, bookId: string): boolean {
    const bookJsonPath = path.join(rootDir, bookId, 'book.json');
    return fs.existsSync(bookJsonPath);
  }
}
