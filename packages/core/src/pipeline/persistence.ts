import * as fs from 'fs';
import * as path from 'path';
import { StateManager } from '../state/manager';
import { RuntimeStateStore } from '../state/runtime-store';
import type { ChapterIndex, ChapterIndexEntry } from '../models/chapter';
import type { Manifest } from '../models/state';
import type { SnapshotMetadata } from '../state/snapshot';
import { countChineseWords } from '../utils';

// ─── Types ─────────────────────────────────────────────────────────

export interface PersistChapterInput {
  bookId: string;
  chapterNumber: number;
  title: string;
  content: string;
  status: 'draft' | 'final';
  warningCode?: string;
  warning?: string;
}

export interface PersistResult {
  success: boolean;
  persisted: boolean;
  snapshotId?: string;
  error?: string;
}

export interface ConsistencyResult {
  consistent: boolean;
  issues: string[];
}

export interface SnapshotInfo {
  id: string;
  bookId: string;
  chapterNumber: number;
  createdAt: string;
}

export interface RollbackResult {
  success: boolean;
  error?: string;
}

// ─── PipelinePersistence ─────────────────────────────────────────
/**
 * 章节持久化模块：负责将章节落盘为单一原子事务。
 *
 * 事务流程：
 *   1. 写入临时文件 (.tmp)
 *   2. 创建当前状态快照
 *   3. fs.rename 原子替换到目标路径
 *   4. 更新 index.json
 *   5. 更新 manifest（lastChapterWritten）
 *
 * 若中途崩溃：
 *   - 临时文件保留但不影响现有数据
 *   - SQLite 事务未提交 → 自动回滚
 *   - 恢复器通过 verifyConsistency 检测不一致
 */
export class PipelinePersistence {
  private stateManager: StateManager;
  private stateStore: RuntimeStateStore;
  private rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
    this.stateManager = new StateManager(rootDir);
    this.stateStore = new RuntimeStateStore(this.stateManager);
  }

  // ── persistChapter ──────────────────────────────────────────

  /**
   * 将章节原子性地持久化到文件系统。
   * 采用临时文件 + rename 模式保证原子性。
   */
  async persistChapter(input: PersistChapterInput): Promise<PersistResult> {
    if (!this.stateStore.hasState(input.bookId)) {
      return { success: false, persisted: false, error: `书籍「${input.bookId}」不存在` };
    }

    const targetPath = this.stateManager.getChapterFilePath(input.bookId, input.chapterNumber);
    const chapterTmp = targetPath + '.tmp';

    const stateDir = this.stateManager.getBookPath(input.bookId, 'story', 'state');
    const indexPath = path.join(stateDir, 'index.json');
    const manifestPath = path.join(stateDir, 'manifest.json');
    const indexTmp = indexPath + '.tmp';
    const manifestTmp = manifestPath + '.tmp';
    const commitMarkerPath = path.join(stateDir, '.commit-in-progress');

    const tempFiles = [chapterTmp, indexTmp, manifestTmp];

    try {
      const sanitizedWarning = input.warning?.replace(/\r?\n/g, ' ').trim();
      const warningBlock = [
        input.warningCode ? `warningCode: ${input.warningCode}` : null,
        sanitizedWarning ? `warning: ${sanitizedWarning}` : null,
      ]
        .filter((line): line is string => line !== null)
        .join('\n');

      // Step 1: 写入章节临时文件
      const frontmatter = `---
title: ${input.title}
chapter: ${input.chapterNumber}
status: ${input.status}
${warningBlock ? `${warningBlock}\n` : ''}createdAt: ${new Date().toISOString()}
---

`;
      fs.writeFileSync(chapterTmp, frontmatter + input.content, 'utf-8');

      // Step 2: 计算并写入索引临时文件
      const updatedIndex = this.#computeUpdatedIndex(input);
      fs.writeFileSync(indexTmp, JSON.stringify(updatedIndex, null, 2), 'utf-8');

      // Step 3: 计算并写入 manifest 临时文件
      const updatedManifest = this.#computeUpdatedManifest(input);
      fs.writeFileSync(manifestTmp, JSON.stringify(updatedManifest, null, 2), 'utf-8');

      // Step 4: 创建快照（持久化前的状态保存）
      let snapshotId: string | undefined;
      try {
        snapshotId = this.createSnapshot(input.bookId, input.chapterNumber);
      } catch (err) {
        console.warn(
          `[PipelinePersistence] Snapshot creation failed for chapter ${input.chapterNumber}:`,
          err,
        );
      }

      // Step 5: 预提交验证 — 确保所有临时文件已写入
      for (const tmp of tempFiles) {
        if (!fs.existsSync(tmp)) {
          throw new Error(`预提交验证失败: 临时文件不存在 ${path.basename(tmp)}`);
        }
      }

      // Step 6: 写入 commit marker（rename 阶段失败时由 recovery 回滚）
      if (snapshotId) {
        fs.writeFileSync(
          commitMarkerPath,
          JSON.stringify(
            {
              bookId: input.bookId,
              chapterNumber: input.chapterNumber,
              snapshotId,
              timestamp: Date.now(),
            },
            null,
            2,
          ),
          'utf-8',
        );
      }

      // Step 7: 原子替换所有文件
      fs.renameSync(chapterTmp, targetPath);
      fs.renameSync(indexTmp, indexPath);
      fs.renameSync(manifestTmp, manifestPath);

      // Step 8: 删除 commit marker（commit 完成）
      if (fs.existsSync(commitMarkerPath)) {
        try {
          fs.unlinkSync(commitMarkerPath);
        } catch (err) {
          console.warn('[PipelinePersistence] Failed to remove commit marker:', err);
        }
      }

      return {
        success: true,
        persisted: true,
        snapshotId,
      };
    } catch (error) {
      // 任意步骤失败时清理所有临时文件 + commit marker
      for (const tmp of tempFiles) {
        if (fs.existsSync(tmp)) {
          try {
            fs.unlinkSync(tmp);
          } catch {
            // Best effort cleanup
          }
        }
      }
      if (fs.existsSync(commitMarkerPath)) {
        try {
          fs.unlinkSync(commitMarkerPath);
        } catch {
          // Best effort cleanup
        }
      }

      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        persisted: false,
        error: `章节持久化失败: ${message}`,
      };
    }
  }

  // ── Snapshot Operations ─────────────────────────────────────

  /**
   * 创建当前状态快照（文件级副本：manifest + index）。
   */
  createSnapshot(bookId: string, chapterNumber: number): string {
    const id = `snap-${chapterNumber}-${Date.now()}`;
    const snapDir = path.join(this.rootDir, bookId, 'story', 'state', 'snapshots', id);
    fs.mkdirSync(snapDir, { recursive: true });

    // Copy manifest
    const manifestPath = this.stateManager.getBookPath(bookId, 'story', 'state', 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      fs.copyFileSync(manifestPath, path.join(snapDir, 'manifest.json'));
    }

    // Copy index
    const indexPath = this.stateManager.getBookPath(bookId, 'story', 'state', 'index.json');
    if (fs.existsSync(indexPath)) {
      fs.copyFileSync(indexPath, path.join(snapDir, 'index.json'));
    }

    // Write metadata
    const metadata: SnapshotMetadata = {
      id,
      bookId,
      chapterNumber,
      createdAt: new Date().toISOString(),
    };
    fs.writeFileSync(
      path.join(snapDir, 'metadata.json'),
      JSON.stringify(metadata, null, 2),
      'utf-8',
    );

    return id;
  }

  /**
   * 列出所有快照。
   */
  listSnapshots(bookId: string): SnapshotInfo[] {
    const root = path.join(this.rootDir, bookId, 'story', 'state', 'snapshots');
    if (!fs.existsSync(root)) return [];

    const snapshots: SnapshotInfo[] = [];
    for (const entry of fs.readdirSync(root)) {
      const metaPath = path.join(root, entry, 'metadata.json');
      if (fs.existsSync(metaPath)) {
        try {
          const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as SnapshotMetadata;
          snapshots.push({
            id: meta.id,
            bookId: meta.bookId,
            chapterNumber: meta.chapterNumber,
            createdAt: meta.createdAt,
          });
        } catch {
          // Skip malformed
        }
      }
    }

    return snapshots.sort((a, b) => a.chapterNumber - b.chapterNumber);
  }

  /**
   * 回滚到指定快照。
   */
  rollbackToSnapshot(bookId: string, snapshotId: string): RollbackResult {
    const root = path.join(this.rootDir, bookId, 'story', 'state', 'snapshots');
    if (!fs.existsSync(root)) {
      return { success: false, error: `书籍「${bookId}」没有快照` };
    }

    const snapDir = path.join(root, snapshotId);
    if (!fs.existsSync(snapDir)) {
      return { success: false, error: `快照「${snapshotId}」不存在` };
    }

    try {
      // Restore manifest
      const snapManifest = path.join(snapDir, 'manifest.json');
      const destManifest = this.stateManager.getBookPath(bookId, 'story', 'state', 'manifest.json');
      if (fs.existsSync(snapManifest)) {
        fs.mkdirSync(path.dirname(destManifest), { recursive: true });
        fs.copyFileSync(snapManifest, destManifest);
      }

      // Restore index
      const snapIndex = path.join(snapDir, 'index.json');
      const destIndex = this.stateManager.getBookPath(bookId, 'story', 'state', 'index.json');
      if (fs.existsSync(snapIndex)) {
        fs.copyFileSync(snapIndex, destIndex);
      }

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: `回滚失败: ${message}` };
    }
  }

  // ── Consistency Verification ────────────────────────────────

  /**
   * 校验 index.json、章节文件和 manifest 之间的一致性。
   * 用于 SessionRecovery 和 DoctorView 检测数据损坏。
   */
  verifyConsistency(bookId: string): ConsistencyResult {
    const issues: string[] = [];

    // Check book exists
    if (!this.stateStore.hasState(bookId)) {
      return { consistent: false, issues: [`书籍「${bookId}」不存在`] };
    }

    // Load index
    let index: ChapterIndex;
    try {
      index = this.stateManager.readIndex(bookId);
    } catch {
      return { consistent: false, issues: ['index.json 无法读取'] };
    }

    // Load manifest
    const manifest = this.stateStore.loadManifest(bookId);

    // 1. 检查 index 中每个章节的文件是否存在
    const chaptersDir = path.join(this.rootDir, bookId, 'story', 'chapters');
    for (const entry of index.chapters) {
      const filePath = path.join(chaptersDir, entry.fileName);
      if (!fs.existsSync(filePath)) {
        issues.push(`第 ${entry.number} 章文件缺失 (预期: ${entry.fileName})`);
      }
    }

    // 2. 检查章节目录中是否有不在 index 中的文件（孤儿文件）
    if (fs.existsSync(chaptersDir)) {
      for (const file of fs.readdirSync(chaptersDir)) {
        if (!file.endsWith('.md') || file.endsWith('.tmp')) continue;
        const match = file.match(/^chapter-(\d{4})\.md$/);
        if (!match) continue;

        const chNum = parseInt(match[1], 10);
        const inIndex = index.chapters.some((c) => c.number === chNum);
        if (!inIndex) {
          issues.push(`第 ${chNum} 章文件存在但未在索引中 (孤儿文件: ${file})`);
        }
      }
    }

    // 3. 检查 manifest.lastChapterWritten 与 index 是否一致
    const maxChapterInIndex =
      index.chapters.length > 0 ? Math.max(...index.chapters.map((c) => c.number)) : 0;

    if (manifest.lastChapterWritten > maxChapterInIndex && index.chapters.length > 0) {
      issues.push(
        `manifest.lastChapterWritten (${manifest.lastChapterWritten}) 超出索引最大章节号 (${maxChapterInIndex})`,
      );
    }

    // 4. 检查 index.totalChapters 与实际条目数
    if (index.totalChapters !== index.chapters.length) {
      issues.push(
        `index.totalChapters (${index.totalChapters}) 与实际条目数 (${index.chapters.length}) 不一致`,
      );
    }

    return {
      consistent: issues.length === 0,
      issues,
    };
  }

  // ── Internal: Index / Manifest Updates ──────────────────────

  #computeUpdatedIndex(input: PersistChapterInput): ChapterIndex {
    const index = this.stateManager.readIndex(input.bookId);
    const existingIdx = index.chapters.findIndex(
      (c) =>
        c.number === input.chapterNumber ||
        (c as ChapterIndexEntry & { chapterNumber?: number }).chapterNumber === input.chapterNumber,
    );

    let updatedChapters: ChapterIndexEntry[];
    if (existingIdx >= 0) {
      updatedChapters = index.chapters.map((c, i) => {
        if (i !== existingIdx) return c;
        const legacy = c as ChapterIndexEntry & {
          chapterNumber?: number;
          status?: string;
          writtenAt?: string;
          plannedAt?: string;
        };
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { chapterNumber: _cn, status: _s, writtenAt: _w, plannedAt: _p, ...rest } = legacy;
        return {
          ...rest,
          number: rest.number ?? input.chapterNumber,
          title: input.title,
          wordCount: countChineseWords(input.content),
        };
      });
    } else {
      const padded = String(input.chapterNumber).padStart(4, '0');
      updatedChapters = [
        ...index.chapters,
        {
          number: input.chapterNumber,
          title: input.title,
          fileName: `chapter-${padded}.md`,
          wordCount: countChineseWords(input.content),
          createdAt: new Date().toISOString(),
        },
      ];
    }

    return {
      ...index,
      chapters: updatedChapters,
      totalChapters: updatedChapters.length,
      totalWords: updatedChapters.reduce((sum, c) => sum + c.wordCount, 0),
      lastUpdated: new Date().toISOString(),
    };
  }

  #computeUpdatedManifest(input: PersistChapterInput): Manifest {
    const manifest = this.stateStore.loadManifest(input.bookId);
    return {
      ...manifest,
      versionToken: manifest.versionToken + 1,
      lastChapterWritten:
        input.chapterNumber > manifest.lastChapterWritten
          ? input.chapterNumber
          : manifest.lastChapterWritten,
      updatedAt: new Date().toISOString(),
    };
  }
}
