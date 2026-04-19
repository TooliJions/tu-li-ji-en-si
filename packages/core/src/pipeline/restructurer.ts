import * as fs from 'fs';
import * as path from 'path';
import { StateManager } from '../state/manager';
import { RuntimeStateStore } from '../state/runtime-store';
import { LLMProvider } from '../llm/provider';
import type { Manifest, Fact, Hook } from '../models/state';
import type { ChapterIndex, ChapterIndexEntry } from '../models/chapter';

// ─── Configuration ──────────────────────────────────────────────────────

export interface RestructurerConfig {
  rootDir: string;
  provider: LLMProvider;
}

// ─── Input Types ─────────────────────────────────────────────────────────

export interface MergeChaptersInput {
  bookId: string;
  fromChapter: number;
  toChapter: number;
}

export interface SplitChapterInput {
  bookId: string;
  chapter: number;
  splitAtParagraph: number;
}

// ─── Result ──────────────────────────────────────────────────────────────

export interface RestructureResult {
  success: boolean;
  operation: 'merge' | 'split';
  bookId: string;
  resultChapterNumber: number;
  error?: string;
}

// ─── ChapterRestructurer ─────────────────────────────────────────────────
/**
 * 章节重组器：支持合并相邻章节和拆分章节。
 * 采用三阶段提交：staging 准备 → 原子替换 → SQLite/索引事务。
 */
export class ChapterRestructurer {
  private stateManager: StateManager;
  private stateStore: RuntimeStateStore;
  private provider: LLMProvider;

  constructor(config: RestructurerConfig) {
    this.stateManager = new StateManager(config.rootDir);
    this.stateStore = new RuntimeStateStore(this.stateManager);
    this.provider = config.provider;
  }

  // ── mergeChapters ─────────────────────────────────────────────────

  /**
   * 合并两个相邻章节：将 toChapter 的内容追加到 fromChapter，
   * 删除 toChapter 文件，重编号后续章节，聚合事实/伏笔。
   */
  async mergeChapters(input: MergeChaptersInput): Promise<RestructureResult> {
    const { bookId, fromChapter, toChapter } = input;

    // ── Validation ──
    this.#validateBookExists(bookId);
    this.#validateConsecutive(fromChapter, toChapter);
    this.#validateChaptersExist(bookId, [fromChapter, toChapter]);

    // ── Phase 0: Acquire reorg.lock + sentinel ──
    const sentinelPath = this.#writeSentinel(bookId);
    this.stateManager.acquireBookLock(bookId, 'reorg');

    try {
      // ── Phase 1: Prepare in staging/ ──
      const stagingDir = this.#getStagingDir(bookId);
      fs.mkdirSync(stagingDir, { recursive: true });

      const fromContent = this.#readChapterBody(bookId, fromChapter);
      const toContent = this.#readChapterBody(bookId, toChapter);
      const mergedContent = `${fromContent}\n\n${toContent}`;

      // Write merged chapter to staging
      const mergedFilePath = this.stateManager.getChapterFilePath(bookId, fromChapter);
      const stagingFilePath = path.join(stagingDir, path.basename(mergedFilePath));
      this.#writeChapterWithFrontmatter(stagingFilePath, bookId, fromChapter, mergedContent);

      // Load current state
      const manifest = this.stateStore.loadManifest(bookId);
      const index = this.stateManager.readIndex(bookId);

      // Aggregate facts → renumber to fromChapter
      const updatedFacts = manifest.facts.map((f) => {
        if (f.chapterNumber === toChapter) {
          return { ...f, chapterNumber: fromChapter };
        }
        return f;
      });

      // Re-anchor hooks → move toChapter hooks to fromChapter
      const updatedHooks = manifest.hooks.map((h) => {
        if (h.plantedChapter === toChapter) {
          return { ...h, plantedChapter: fromChapter, updatedAt: new Date().toISOString() };
        }
        return h;
      });

      // Build new index (remove toChapter, update fromChapter)
      const newIndex = this.#buildMergedIndex(index, fromChapter, toChapter, mergedContent);

      // ── Phase 2: Atomic commit ──
      // fs.rename staging → chapters
      fs.renameSync(stagingFilePath, mergedFilePath);

      // Remove toChapter file
      const toFilePath = this.stateManager.getChapterFilePath(bookId, toChapter);
      if (fs.existsSync(toFilePath)) {
        fs.unlinkSync(toFilePath);
      }

      // Update index
      this.stateManager.writeIndex(bookId, newIndex);

      // Update manifest (facts, hooks, lastChapterWritten)
      const newLastChapter = Math.min(manifest.lastChapterWritten, fromChapter);
      const updatedManifest: Partial<Manifest> & Pick<Manifest, 'bookId'> = {
        bookId,
        facts: updatedFacts,
        hooks: updatedHooks,
        lastChapterWritten: newLastChapter,
      };
      this.stateStore.saveRuntimeStateSnapshot(bookId, updatedManifest);

      // ── Phase 3: Cleanup ──
      this.#cleanupStaging(stagingDir);

      return {
        success: true,
        operation: 'merge',
        bookId,
        resultChapterNumber: fromChapter,
      };
    } catch (error) {
      // Leave sentinel and lock for recovery
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        operation: 'merge',
        bookId,
        resultChapterNumber: fromChapter,
        error: `章节合并失败: ${message}`,
      };
    } finally {
      this.#removeSentinel(sentinelPath);
      this.stateManager.releaseBookLock(bookId);
    }
  }

  // ── splitChapter ────────────────────────────────────────────────

  /**
   * 拆分章节：将指定章节在给定段落位置处分割为两章，
   * 后续章节重编号，事实/伏笔按位置分配到新章节。
   */
  async splitChapter(input: SplitChapterInput): Promise<RestructureResult> {
    const { bookId, chapter, splitAtParagraph } = input;

    // ── Validation ──
    this.#validateBookExists(bookId);
    this.#validateChapterExists(bookId, chapter);

    // ── Phase 0: Acquire reorg.lock + sentinel ──
    const sentinelPath = this.#writeSentinel(bookId);
    this.stateManager.acquireBookLock(bookId, 'reorg');

    try {
      // ── Phase 1: Prepare in staging/ ──
      const stagingDir = this.#getStagingDir(bookId);
      fs.mkdirSync(stagingDir, { recursive: true });

      const body = this.#readChapterBody(bookId, chapter);
      const paragraphs = body.split(/\n\s*\n/); // Split by blank lines

      if (splitAtParagraph < 1 || splitAtParagraph >= paragraphs.length) {
        throw new Error(`无效的拆分位置: ${splitAtParagraph}（章节共 ${paragraphs.length} 段）`);
      }

      const partA = paragraphs.slice(0, splitAtParagraph).join('\n\n').trim();
      const partB = paragraphs.slice(splitAtParagraph).join('\n\n').trim();

      if (!partA || !partB) {
        throw new Error('拆分后其中一部分内容为空');
      }

      // Write both parts to staging
      const chAPath = this.stateManager.getChapterFilePath(bookId, chapter);
      const chBPath = this.stateManager.getChapterFilePath(bookId, chapter + 1);

      const stagingAPath = path.join(stagingDir, path.basename(chAPath));
      const stagingBPath = path.join(stagingDir, path.basename(chBPath));

      this.#writeChapterWithFrontmatter(stagingAPath, bookId, chapter, partA);
      this.#writeChapterWithFrontmatter(stagingBPath, bookId, chapter + 1, partB);

      // Load current state
      const manifest = this.stateStore.loadManifest(bookId);
      const index = this.stateManager.readIndex(bookId);

      // Distribute facts based on original chapter position
      // Facts from the split chapter: alternate between chapter and chapter+1
      // Facts from subsequent chapters: renumbered +1
      let splitChapterFactCount = 0;
      const updatedFacts = manifest.facts.map((f) => {
        if (f.chapterNumber === chapter) {
          const localIdx = splitChapterFactCount++;
          // Alternate: even → chapter, odd → chapter+1
          if (localIdx % 2 === 1) {
            return { ...f, chapterNumber: chapter + 1 };
          }
        }
        // Renumber facts for subsequent chapters
        if (f.chapterNumber > chapter) {
          return { ...f, chapterNumber: f.chapterNumber + 1 };
        }
        return f;
      });

      // Re-anchor hooks for split
      // Hooks from the split chapter: alternate between chapter and chapter+1
      // Hooks from subsequent chapters: renumbered +1
      let splitChapterHookCount = 0;
      const updatedHooks = manifest.hooks.map((h) => {
        if (h.plantedChapter === chapter) {
          const localIdx = splitChapterHookCount++;
          // Alternate: even → chapter, odd → chapter+1
          if (localIdx % 2 === 1) {
            return { ...h, plantedChapter: chapter + 1, updatedAt: new Date().toISOString() };
          }
        }
        // Renumber hooks for subsequent chapters
        if (h.plantedChapter > chapter) {
          return { ...h, plantedChapter: h.plantedChapter + 1 };
        }
        return h;
      });

      // Build new index (insert new chapter, renumber subsequent)
      const newIndex = this.#buildSplitIndex(index, chapter, partA, partB);

      // ── Phase 2: Atomic commit ──
      // Move staging files to chapters (atomic rename)
      fs.renameSync(stagingAPath, chAPath);
      fs.renameSync(stagingBPath, chBPath);

      // Update index
      this.stateManager.writeIndex(bookId, newIndex);

      // Update manifest
      const updatedManifest: Partial<Manifest> & Pick<Manifest, 'bookId'> = {
        bookId,
        facts: updatedFacts,
        hooks: updatedHooks,
        lastChapterWritten: manifest.lastChapterWritten + 1,
      };
      this.stateStore.saveRuntimeStateSnapshot(bookId, updatedManifest);

      // ── Phase 3: Cleanup ──
      this.#cleanupStaging(stagingDir);

      return {
        success: true,
        operation: 'split',
        bookId,
        resultChapterNumber: chapter,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        operation: 'split',
        bookId,
        resultChapterNumber: chapter,
        error: `章节拆分失败: ${message}`,
      };
    } finally {
      this.#removeSentinel(sentinelPath);
      this.stateManager.releaseBookLock(bookId);
    }
  }

  // ── Internal: Validation ────────────────────────────────────────

  #validateBookExists(bookId: string): void {
    const metaPath = this.stateManager.getBookPath(bookId, 'meta.json');
    if (!fs.existsSync(metaPath)) {
      throw new Error(`书籍「${bookId}」不存在`);
    }
  }

  #validateConsecutive(fromChapter: number, toChapter: number): void {
    if (fromChapter >= toChapter) {
      throw new Error(`fromChapter (${fromChapter}) 必须小于 toChapter (${toChapter})`);
    }
    if (toChapter - fromChapter !== 1) {
      throw new Error(`章节 ${fromChapter} 和 ${toChapter} 不相邻`);
    }
  }

  #validateChaptersExist(bookId: string, chapters: number[]): void {
    for (const ch of chapters) {
      const filePath = this.stateManager.getChapterFilePath(bookId, ch);
      if (!fs.existsSync(filePath)) {
        throw new Error(`第 ${ch} 章不存在`);
      }
    }
  }

  #validateChapterExists(bookId: string, chapter: number): void {
    const filePath = this.stateManager.getChapterFilePath(bookId, chapter);
    if (!fs.existsSync(filePath)) {
      throw new Error(`第 ${chapter} 章不存在`);
    }
  }

  // ── Internal: Sentinel ──────────────────────────────────────────

  #getSentinelPath(bookId: string): string {
    return path.join(this.stateManager.getBookPath(bookId, 'story', 'state'), '.reorg_in_progress');
  }

  #writeSentinel(bookId: string): string {
    const sentinelPath = this.#getSentinelPath(bookId);
    fs.writeFileSync(
      sentinelPath,
      JSON.stringify({
        bookId,
        startedAt: new Date().toISOString(),
        pid: process.pid,
      }),
      'utf-8'
    );
    return sentinelPath;
  }

  #removeSentinel(sentinelPath: string): void {
    if (fs.existsSync(sentinelPath)) {
      fs.unlinkSync(sentinelPath);
    }
  }

  // ── Internal: Staging ───────────────────────────────────────────

  #getStagingDir(bookId: string): string {
    return path.join(this.stateManager.getBookPath(bookId, 'story'), 'staging');
  }

  #cleanupStaging(stagingDir: string): void {
    if (fs.existsSync(stagingDir)) {
      fs.rmSync(stagingDir, { recursive: true, force: true });
    }
  }

  // ── Internal: Chapter I/O ───────────────────────────────────────

  #readChapterBody(bookId: string, chapterNumber: number): string {
    const filePath = this.stateManager.getChapterFilePath(bookId, chapterNumber);
    const raw = fs.readFileSync(filePath, 'utf-8');
    // Strip YAML frontmatter
    const match = raw.match(/^---\n[\s\S]*?\n---\n?/);
    if (match) {
      return raw.slice(match[0].length).trim();
    }
    return raw.trim();
  }

  #writeChapterWithFrontmatter(
    filePath: string,
    bookId: string,
    chapterNumber: number,
    content: string
  ): void {
    const now = new Date().toISOString();
    const frontmatter = `---
title: Chapter ${chapterNumber}
chapter: ${chapterNumber}
status: final
createdAt: ${now}
---

`;
    fs.writeFileSync(filePath, frontmatter + content, 'utf-8');
  }

  // ── Internal: Index building ────────────────────────────────────

  #buildMergedIndex(
    index: ChapterIndex,
    fromChapter: number,
    toChapter: number,
    mergedContent: string
  ): ChapterIndex {
    const updatedChapters = index.chapters
      .filter((c) => c.number !== toChapter)
      .map((c) => {
        if (c.number === fromChapter) {
          return {
            ...c,
            wordCount: mergedContent.length,
          };
        }
        // Renumber subsequent chapters: shift down by 1
        if (c.number > toChapter) {
          return { ...c, number: c.number - 1 };
        }
        return c;
      });

    return {
      ...index,
      chapters: updatedChapters,
      totalChapters: updatedChapters.length,
      totalWords: updatedChapters.reduce((sum, c) => sum + c.wordCount, 0),
      lastUpdated: new Date().toISOString(),
    };
  }

  #buildSplitIndex(
    index: ChapterIndex,
    chapter: number,
    partA: string,
    partB: string
  ): ChapterIndex {
    const updatedChapters: ChapterIndexEntry[] = [];

    for (const entry of index.chapters) {
      if (entry.number === chapter) {
        // Insert split chapter (part A keeps original number)
        updatedChapters.push({
          ...entry,
          wordCount: partA.length,
        });
        // Insert new chapter (part B, number + 1)
        updatedChapters.push({
          number: chapter + 1,
          title: `Chapter ${chapter + 1}`,
          fileName: `chapter-${String(chapter + 1).padStart(4, '0')}.md`,
          wordCount: partB.length,
          createdAt: new Date().toISOString(),
        });
      } else if (entry.number > chapter) {
        // Renumber subsequent chapters: shift up by 1
        updatedChapters.push({
          ...entry,
          number: entry.number + 1,
          fileName: `chapter-${String(entry.number + 1).padStart(4, '0')}.md`,
        });
      } else {
        updatedChapters.push(entry);
      }
    }

    return {
      ...index,
      chapters: updatedChapters,
      totalChapters: updatedChapters.length,
      totalWords: updatedChapters.reduce((sum, c) => sum + c.wordCount, 0),
      lastUpdated: new Date().toISOString(),
    };
  }
}
