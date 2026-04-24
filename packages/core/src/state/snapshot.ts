import * as fs from 'fs';
import * as path from 'path';
import { StateManager } from './manager';
import { RuntimeStateStore } from './runtime-store';
import { MemoryDB } from './memory-db';

// ─── Types ─────────────────────────────────────────────────────

export interface SnapshotMetadata {
  id: string;
  bookId: string;
  chapterNumber: number;
  createdAt: string;
}

// ─── SnapshotManager ───────────────────────────────────────────
// 负责创建、列出、回滚和删除状态快照。
// 快照包含 manifest.json + memory.db 的完整副本。

export class SnapshotManager {
  private manager: StateManager;
  private store: RuntimeStateStore;
  private memDb: MemoryDB;
  private rootDir: string;

  constructor(manager: StateManager, store: RuntimeStateStore, memDb: MemoryDB, rootDir: string) {
    this.manager = manager;
    this.store = store;
    this.memDb = memDb;
    this.rootDir = rootDir;
  }

  // ── Paths ────────────────────────────────────────────────

  private getSnapshotDir(bookId: string, snapshotId: string): string {
    return path.join(this.rootDir, bookId, 'story', 'state', 'snapshots', snapshotId);
  }

  private getSnapshotsRoot(bookId: string): string {
    return path.join(this.rootDir, bookId, 'story', 'state', 'snapshots');
  }

  // ── Create ───────────────────────────────────────────────

  /**
   * 创建当前状态的快照。
   * 复制 manifest.json 和 memory.db 到快照目录。
   * 返回快照 ID。
   */
  createSnapshot(bookId: string, chapterNumber: number): string {
    const id = `snap-${chapterNumber}-${Date.now()}`;
    const snapDir = this.getSnapshotDir(bookId, id);
    fs.mkdirSync(snapDir, { recursive: true });

    // Copy manifest
    const manifestPath = this.manager.getBookPath(bookId, 'story', 'state', 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      fs.copyFileSync(manifestPath, path.join(snapDir, 'manifest.json'));
    }

    // Copy SQLite database
    const dbPath = path.join(this.rootDir, 'memory.db');
    if (fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, path.join(snapDir, 'memory.db'));
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
      'utf-8'
    );

    return id;
  }

  // ── List ─────────────────────────────────────────────────

  /**
   * 列出书籍的所有快照，按章节号排序。
   */
  listSnapshots(bookId: string): SnapshotMetadata[] {
    const root = this.getSnapshotsRoot(bookId);
    if (!fs.existsSync(root)) return [];

    const snapshots: SnapshotMetadata[] = [];
    for (const entry of fs.readdirSync(root)) {
      const metaPath = path.join(root, entry, 'metadata.json');
      if (fs.existsSync(metaPath)) {
        try {
          const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as SnapshotMetadata;
          snapshots.push(meta);
        } catch {
          // Skip malformed metadata
        }
      }
    }

    return snapshots.sort((a, b) => a.chapterNumber - b.chapterNumber);
  }

  // ── Get ──────────────────────────────────────────────────

  /**
   * 获取指定快照的元数据。
   */
  getSnapshot(bookId: string, snapshotId: string): SnapshotMetadata | null {
    const metaPath = path.join(this.getSnapshotDir(bookId, snapshotId), 'metadata.json');
    if (!fs.existsSync(metaPath)) return null;

    try {
      return JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as SnapshotMetadata;
    } catch (err) {
      console.warn(
        `[snapshot] Corrupted metadata for ${bookId}/${snapshotId}:`,
        err instanceof Error ? err.message : String(err)
      );
      return null;
    }
  }

  // ── Rollback ─────────────────────────────────────────────

  /**
   * 回滚到指定快照。
   * 恢复 manifest.json 和 memory.db。
   */
  rollbackToSnapshot(bookId: string, snapshotId: string): void {
    const snapDir = this.getSnapshotDir(bookId, snapshotId);
    if (!fs.existsSync(snapDir)) {
      throw new Error(`Snapshot "${snapshotId}" not found for book "${bookId}"`);
    }

    const snapManifestPath = path.join(snapDir, 'manifest.json');
    if (!fs.existsSync(snapManifestPath)) {
      throw new Error(`Snapshot manifest missing in "${snapshotId}"`);
    }

    // Restore manifest
    const destManifest = this.manager.getBookPath(bookId, 'story', 'state', 'manifest.json');
    fs.mkdirSync(path.dirname(destManifest), { recursive: true });
    fs.copyFileSync(snapManifestPath, destManifest);

    // Restore SQLite database if available
    const snapDbPath = path.join(snapDir, 'memory.db');
    const destDbPath = path.join(this.rootDir, 'memory.db');
    if (fs.existsSync(snapDbPath)) {
      fs.copyFileSync(snapDbPath, destDbPath);
    }
  }

  // ── Delete ───────────────────────────────────────────────

  /**
   * 删除指定快照。快照不存在时静默跳过。
   */
  deleteSnapshot(bookId: string, snapshotId: string): void {
    const snapDir = this.getSnapshotDir(bookId, snapshotId);
    if (fs.existsSync(snapDir)) {
      fs.rmSync(snapDir, { recursive: true, force: true });
    }
  }
}
