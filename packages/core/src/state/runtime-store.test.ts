import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RuntimeStateStore } from './runtime-store';
import { StateManager } from './manager';
import type { Manifest } from '../models/state';
import * as fs from 'fs';
import * as path from 'path';

describe('RuntimeStateStore', () => {
  let tmpDir: string;
  let manager: StateManager;
  let store: RuntimeStateStore;
  const bookId = 'test-book-001';

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(process.cwd(), 'test-runtime-'));
    manager = new StateManager(tmpDir);
    store = new RuntimeStateStore(manager);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── 初始化状态 ────────────────────────────────────────────

  describe('initializeBookState', () => {
    it('creates initial manifest with empty collections', () => {
      manager.ensureBookStructure(bookId);
      store.initializeBookState(bookId);

      const manifest = store.loadManifest(bookId);
      expect(manifest.bookId).toBe(bookId);
      expect(manifest.hooks).toHaveLength(0);
      expect(manifest.facts).toHaveLength(0);
      expect(manifest.characters).toHaveLength(0);
      expect(manifest.worldRules).toHaveLength(0);
      expect(manifest.versionToken).toBe(1);
    });

    it('creates manifest.json file on disk', () => {
      manager.ensureBookStructure(bookId);
      store.initializeBookState(bookId);

      const manifestPath = manager.getBookPath(bookId, 'story', 'state', 'manifest.json');
      expect(fs.existsSync(manifestPath)).toBe(true);
    });
  });

  // ── 加载状态 ──────────────────────────────────────────────

  describe('loadManifest', () => {
    it('loads existing manifest from disk', () => {
      manager.ensureBookStructure(bookId);
      store.initializeBookState(bookId);

      const manifest = store.loadManifest(bookId);
      expect(manifest.bookId).toBe(bookId);
    });

    it('throws when manifest does not exist', () => {
      manager.ensureBookStructure('no-manifest-book');
      expect(() => store.loadManifest('no-manifest-book')).toThrow();
    });
  });

  // ── 保存状态快照 ─────────────────────────────────────────

  describe('saveRuntimeStateSnapshot', () => {
    it('writes manifest to disk', () => {
      manager.ensureBookStructure(bookId);
      const manifest = createStoreManifest(bookId);

      store.saveRuntimeStateSnapshot(bookId, manifest);

      const saved = store.loadManifest(bookId);
      expect(saved.bookId).toBe(bookId);
      expect(saved.hooks).toHaveLength(1);
      expect(saved.facts).toHaveLength(2);
      expect(saved.characters).toHaveLength(1);
    });

    it('increments versionToken on save', () => {
      manager.ensureBookStructure(bookId);
      store.initializeBookState(bookId);

      const manifest = store.loadManifest(bookId);
      manifest.versionToken = 1;
      store.saveRuntimeStateSnapshot(bookId, manifest);

      const saved = store.loadManifest(bookId);
      expect(saved.versionToken).toBe(2);
    });

    it('overwrites previous manifest', () => {
      manager.ensureBookStructure(bookId);
      store.initializeBookState(bookId);

      // First save with empty state
      const manifest = store.loadManifest(bookId);
      store.saveRuntimeStateSnapshot(bookId, manifest);
      expect(store.loadManifest(bookId).facts).toHaveLength(0);

      // Second save with added fact
      manifest.facts.push({
        id: 'fact-001',
        content: '主角有一把祖传的剑',
        chapterNumber: 1,
        confidence: 'high',
        category: 'character',
        createdAt: new Date().toISOString(),
      });
      store.saveRuntimeStateSnapshot(bookId, manifest);

      expect(store.loadManifest(bookId).facts).toHaveLength(1);
    });

    it('creates state from scratch when no existing manifest', () => {
      manager.ensureBookStructure('fresh-book');

      const now = new Date().toISOString();
      store.saveRuntimeStateSnapshot('fresh-book', {
        bookId: 'fresh-book',
        hooks: [],
        facts: [
          {
            id: 'fact-001',
            content: '初始事实',
            chapterNumber: 1,
            confidence: 'high',
            category: 'world',
            createdAt: now,
          },
        ],
        characters: [],
        worldRules: [],
      });

      const saved = store.loadManifest('fresh-book');
      expect(saved.versionToken).toBe(1);
      expect(saved.facts).toHaveLength(1);
    });
  });

  // ── 加载完整状态对象 ─────────────────────────────────────

  describe('loadFullState', () => {
    it('returns combined state object', () => {
      manager.ensureBookStructure(bookId);
      store.initializeBookState(bookId);

      const fullState = store.loadFullState(bookId);
      expect(fullState.bookId).toBe(bookId);
      expect(fullState.hooks).toBeDefined();
      expect(fullState.facts).toBeDefined();
      expect(fullState.characters).toBeDefined();
      expect(fullState.worldRules).toBeDefined();
    });
  });

  // ── 状态存在性检查 ──────────────────────────────────────

  describe('hasState', () => {
    it('returns true when manifest exists', () => {
      manager.ensureBookStructure(bookId);
      store.initializeBookState(bookId);
      expect(store.hasState(bookId)).toBe(true);
    });

    it('returns false when no manifest exists', () => {
      manager.ensureBookStructure('empty-book');
      expect(store.hasState('empty-book')).toBe(false);
    });
  });

  // ── 辅助测试：完整工作流 ──────────────────────────────────

  describe('end-to-end workflow', () => {
    it('initialize → add hook → save → reload → verify', () => {
      manager.ensureBookStructure(bookId);
      store.initializeBookState(bookId);

      // Load current state
      const manifest = store.loadManifest(bookId);

      // Add a hook
      manifest.hooks.push({
        id: 'hook-001',
        description: '神秘老人的真实身份',
        type: 'character',
        status: 'open',
        priority: 'major',
        plantedChapter: 1,
        expectedResolutionMin: 5,
        expectedResolutionMax: 10,
        relatedCharacters: ['神秘老人'],
        relatedChapters: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Add a fact
      manifest.facts.push({
        id: 'fact-001',
        content: '故事发生在青云城',
        chapterNumber: 1,
        confidence: 'high',
        category: 'world',
        createdAt: new Date().toISOString(),
      });

      // Save
      store.saveRuntimeStateSnapshot(bookId, manifest);

      // Reload and verify
      const reloaded = store.loadManifest(bookId);
      expect(reloaded.hooks).toHaveLength(1);
      expect(reloaded.hooks[0].id).toBe('hook-001');
      expect(reloaded.hooks[0].status).toBe('open');
      expect(reloaded.facts).toHaveLength(1);
      expect(reloaded.facts[0].category).toBe('world');
      expect(reloaded.versionToken).toBe(2);
    });

    it('initialize → add character → save → update character → save again', () => {
      manager.ensureBookStructure(bookId);
      store.initializeBookState(bookId);

      const manifest = store.loadManifest(bookId);

      // Add character
      manifest.characters.push({
        id: 'char-001',
        name: '林风',
        role: 'protagonist',
        traits: ['勇敢', '聪明'],
        relationships: {},
        arc: '成长',
        firstAppearance: 1,
      });
      store.saveRuntimeStateSnapshot(bookId, manifest);

      // Update character
      const updated = store.loadManifest(bookId);
      updated.characters[0].traits.push('坚韧');
      updated.characters[0].lastAppearance = 3;
      store.saveRuntimeStateSnapshot(bookId, updated);

      const final = store.loadManifest(bookId);
      expect(final.characters[0].traits).toContain('坚韧');
      expect(final.characters[0].lastAppearance).toBe(3);
      expect(final.versionToken).toBe(3);
    });
  });
});

// ── Test Helper ─────────────────────────────────────────────

function createStoreManifest(bookId: string): Manifest {
  const now = new Date().toISOString();
  return {
    bookId,
    versionToken: 1,
    lastChapterWritten: 0,
    currentFocus: '开篇',
    hooks: [
      {
        id: 'hook-001',
        description: '伏笔示例',
        type: 'plot',
        status: 'open',
        priority: 'major',
        plantedChapter: 1,
        relatedCharacters: [],
        relatedChapters: [],
        createdAt: now,
        updatedAt: now,
      },
    ],
    facts: [
      {
        id: 'fact-001',
        content: '事实 1',
        chapterNumber: 1,
        confidence: 'high',
        category: 'world',
        createdAt: now,
      },
      {
        id: 'fact-002',
        content: '事实 2',
        chapterNumber: 1,
        confidence: 'medium',
        category: 'character',
        createdAt: now,
      },
    ],
    characters: [
      {
        id: 'char-001',
        name: '主角',
        role: 'protagonist',
        traits: ['勇敢'],
        relationships: {},
      },
    ],
    worldRules: [
      {
        id: 'rule-001',
        category: 'magic-system',
        rule: '灵力等级分为九级',
        exceptions: [],
      },
    ],
    updatedAt: now,
  };
}
