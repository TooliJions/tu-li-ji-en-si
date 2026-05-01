import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SnapshotManager } from './snapshot';
import { StateManager } from './manager';
import { RuntimeStateStore } from './runtime-store';
import { MemoryDB } from './memory-db';
import * as fs from 'fs';
import * as path from 'path';

describe('SnapshotManager', () => {
  let tmpDir: string;
  let dbPath: string;
  let manager: StateManager;
  let store: RuntimeStateStore;
  let memDb: MemoryDB;
  let snapshotMgr: SnapshotManager;
  const bookId = 'snap-book-001';

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(process.cwd(), 'test-snapshot-'));
    dbPath = path.join(tmpDir, bookId, 'story', 'state', 'memory.db');

    manager = new StateManager(tmpDir);
    manager.ensureBookStructure(bookId);

    store = new RuntimeStateStore(manager);
    store.initializeBookState(bookId);

    memDb = await MemoryDB.create(dbPath);

    snapshotMgr = new SnapshotManager(manager, store, memDb, tmpDir);
  });

  afterEach(() => {
    memDb.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── 创建快照 ──────────────────────────────────────────────

  describe('createSnapshot', () => {
    it('creates a snapshot directory and files', () => {
      const id = snapshotMgr.createSnapshot(bookId, 1);

      expect(id).toBeTruthy();

      const snapDir = path.join(tmpDir, bookId, 'story', 'state', 'snapshots', id);
      expect(fs.existsSync(snapDir)).toBe(true);
      expect(fs.existsSync(path.join(snapDir, 'manifest.json'))).toBe(true);
    });

    it('captures current manifest state', () => {
      // Add some state before snapshot
      const manifest = store.loadManifest(bookId);
      manifest.currentFocus = '快照前状态';
      store.saveRuntimeStateSnapshot(bookId, manifest);

      const id = snapshotMgr.createSnapshot(bookId, 1);
      const snapManifest = JSON.parse(
        fs.readFileSync(
          path.join(tmpDir, bookId, 'story', 'state', 'snapshots', id, 'manifest.json'),
          'utf-8',
        ),
      );

      expect(snapManifest.currentFocus).toBe('快照前状态');
    });

    it('saves metadata.json with snapshot info', () => {
      const id = snapshotMgr.createSnapshot(bookId, 3);

      const meta = JSON.parse(
        fs.readFileSync(
          path.join(tmpDir, bookId, 'story', 'state', 'snapshots', id, 'metadata.json'),
          'utf-8',
        ),
      );

      expect(meta.bookId).toBe(bookId);
      expect(meta.chapterNumber).toBe(3);
      expect(meta.createdAt).toBeDefined();
      expect(meta.id).toBe(id);
    });

    it('saves SQLite data to snapshot', () => {
      memDb.insertFact({
        chapter: 1,
        entity_type: 'character',
        entity_name: '林风',
        fact_text: '青云门弟子',
        confidence: 'high',
      });

      const id = snapshotMgr.createSnapshot(bookId, 1);
      const snapDbPath = path.join(tmpDir, bookId, 'story', 'state', 'snapshots', id, 'memory.db');

      expect(fs.existsSync(snapDbPath)).toBe(true);
    });

    it('increments snapshot counter', () => {
      const id1 = snapshotMgr.createSnapshot(bookId, 1);
      const id2 = snapshotMgr.createSnapshot(bookId, 2);

      expect(id1).not.toBe(id2);
    });
  });

  // ── 列出快照 ──────────────────────────────────────────────

  describe('listSnapshots', () => {
    it('returns empty list when no snapshots', () => {
      const list = snapshotMgr.listSnapshots(bookId);
      expect(list).toHaveLength(0);
    });

    it('returns snapshots in order', () => {
      snapshotMgr.createSnapshot(bookId, 1);
      snapshotMgr.createSnapshot(bookId, 3);
      snapshotMgr.createSnapshot(bookId, 2);

      const list = snapshotMgr.listSnapshots(bookId);
      expect(list).toHaveLength(3);
      expect(list[0].chapterNumber).toBe(1);
      expect(list[1].chapterNumber).toBe(2);
      expect(list[2].chapterNumber).toBe(3);
    });
  });

  // ── 获取快照详情 ────────────────────────────────────────

  describe('getSnapshot', () => {
    it('returns snapshot details', () => {
      const id = snapshotMgr.createSnapshot(bookId, 5);
      const snapshot = snapshotMgr.getSnapshot(bookId, id);

      expect(snapshot).not.toBeNull();
      expect(snapshot!.id).toBe(id);
      expect(snapshot!.chapterNumber).toBe(5);
      expect(snapshot!.bookId).toBe(bookId);
    });

    it('returns null for non-existent snapshot', () => {
      const snapshot = snapshotMgr.getSnapshot(bookId, 'non-existent');
      expect(snapshot).toBeNull();
    });
  });

  // ── 回滚到快照 ──────────────────────────────────────────

  describe('rollbackToSnapshot', () => {
    it('restores manifest from snapshot', () => {
      // Set initial state and snapshot
      const manifest = store.loadManifest(bookId);
      manifest.currentFocus = '回滚前状态';
      manifest.facts.push({
        id: 'fact-001',
        content: '旧事实',
        chapterNumber: 1,
        confidence: 'high',
        category: 'world',
        createdAt: new Date().toISOString(),
      });
      store.saveRuntimeStateSnapshot(bookId, manifest);

      const snapId = snapshotMgr.createSnapshot(bookId, 1);

      // Change state after snapshot
      const changed = store.loadManifest(bookId);
      changed.currentFocus = '修改后状态';
      changed.facts = [];
      store.saveRuntimeStateSnapshot(bookId, changed);

      // Verify change
      expect(store.loadManifest(bookId).currentFocus).toBe('修改后状态');

      // Rollback
      snapshotMgr.rollbackToSnapshot(bookId, snapId);

      const restored = store.loadManifest(bookId);
      expect(restored.currentFocus).toBe('回滚前状态');
      expect(restored.facts).toHaveLength(1);
    });

    it('throws when snapshot does not exist', () => {
      expect(() => {
        snapshotMgr.rollbackToSnapshot(bookId, 'non-existent');
      }).toThrow(/snapshot.*not found/i);
    });

    it('throws when snapshot manifest is missing', () => {
      const id = snapshotMgr.createSnapshot(bookId, 1);
      const snapDir = path.join(tmpDir, bookId, 'story', 'state', 'snapshots', id);
      fs.unlinkSync(path.join(snapDir, 'manifest.json'));

      expect(() => {
        snapshotMgr.rollbackToSnapshot(bookId, id);
      }).toThrow();
    });
  });

  // ── 删除快照 ──────────────────────────────────────────────

  describe('deleteSnapshot', () => {
    it('removes snapshot directory', () => {
      const id = snapshotMgr.createSnapshot(bookId, 1);
      const snapDir = path.join(tmpDir, bookId, 'story', 'state', 'snapshots', id);
      expect(fs.existsSync(snapDir)).toBe(true);

      snapshotMgr.deleteSnapshot(bookId, id);
      expect(fs.existsSync(snapDir)).toBe(false);
    });

    it('does not throw when snapshot does not exist', () => {
      expect(() => {
        snapshotMgr.deleteSnapshot(bookId, 'non-existent');
      }).not.toThrow();
    });
  });

  // ── 端到端工作流 ────────────────────────────────────────

  describe('end-to-end workflow', () => {
    it('create multiple snapshots → list → rollback to specific one', () => {
      // Chapter 1
      const manifest = store.loadManifest(bookId);
      manifest.facts.push({
        id: 'fact-ch1',
        content: '第一章事实',
        chapterNumber: 1,
        confidence: 'high',
        category: 'world',
        createdAt: new Date().toISOString(),
      });
      store.saveRuntimeStateSnapshot(bookId, manifest);
      const snap1 = snapshotMgr.createSnapshot(bookId, 1);

      // Chapter 2
      const manifest2 = store.loadManifest(bookId);
      manifest2.facts.push({
        id: 'fact-ch2',
        content: '第二章事实',
        chapterNumber: 2,
        confidence: 'high',
        category: 'character',
        createdAt: new Date().toISOString(),
      });
      store.saveRuntimeStateSnapshot(bookId, manifest2);
      snapshotMgr.createSnapshot(bookId, 2);

      // Chapter 3
      const manifest3 = store.loadManifest(bookId);
      manifest3.facts.push({
        id: 'fact-ch3',
        content: '第三章事实',
        chapterNumber: 3,
        confidence: 'medium',
        category: 'plot',
        createdAt: new Date().toISOString(),
      });
      store.saveRuntimeStateSnapshot(bookId, manifest3);
      snapshotMgr.createSnapshot(bookId, 3);

      // List
      const list = snapshotMgr.listSnapshots(bookId);
      expect(list).toHaveLength(3);

      // Rollback to chapter 1
      snapshotMgr.rollbackToSnapshot(bookId, snap1);

      const restored = store.loadManifest(bookId);
      expect(restored.facts).toHaveLength(1);
      expect(restored.facts[0].id).toBe('fact-ch1');

      // List should still show 3 snapshots (they are not deleted on rollback)
      expect(snapshotMgr.listSnapshots(bookId)).toHaveLength(3);
    });
  });
});
