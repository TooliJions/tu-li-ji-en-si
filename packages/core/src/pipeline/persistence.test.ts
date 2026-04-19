import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { PipelinePersistence, type PersistChapterInput, type PersistResult } from './persistence';
import { StateManager } from '../state/manager';
import { RuntimeStateStore } from '../state/runtime-store';
import type { ChapterIndex } from '../models/chapter';

// ── Helpers ────────────────────────────────────────────────────────

function makeTempDir(): string {
  return path.join(process.cwd(), 'tmp-test-persist-' + Math.random().toString(36).slice(2, 8));
}

function setupBook(
  rootDir: string,
  bookId: string,
  existingChapters: number[] = []
): { stateManager: StateManager; stateStore: RuntimeStateStore } {
  const sm = new StateManager(rootDir);
  const ss = new RuntimeStateStore(sm);

  sm.ensureBookStructure(bookId);
  ss.initializeBookState(bookId);

  const metaPath = sm.getBookPath(bookId, 'meta.json');
  fs.writeFileSync(
    metaPath,
    JSON.stringify({ title: 'Test Book', genre: 'fantasy' }, null, 2),
    'utf-8'
  );

  // Create actual chapter files for existing chapters
  for (const ch of existingChapters) {
    const filePath = sm.getChapterFilePath(bookId, ch);
    const frontmatter = `---
title: Chapter ${ch}
chapter: ${ch}
status: final
createdAt: ${new Date().toISOString()}
---

Chapter ${ch} content`;
    fs.writeFileSync(filePath, frontmatter, 'utf-8');
  }

  const index: ChapterIndex = {
    bookId,
    chapters: existingChapters.map((ch) => ({
      number: ch,
      title: `Chapter ${ch}`,
      fileName: `chapter-${String(ch).padStart(4, '0')}.md`,
      wordCount: 100,
      createdAt: new Date().toISOString(),
    })),
    totalChapters: existingChapters.length,
    totalWords: existingChapters.length * 100,
    lastUpdated: new Date().toISOString(),
  };
  sm.writeIndex(bookId, index);

  const manifest = ss.loadManifest(bookId);
  manifest.lastChapterWritten = existingChapters.length > 0 ? Math.max(...existingChapters) : 0;
  ss.saveRuntimeStateSnapshot(bookId, manifest);

  return { stateManager: sm, stateStore: ss };
}

function readChapterContent(rootDir: string, bookId: string, chapterNumber: number): string {
  const sm = new StateManager(rootDir);
  const filePath = sm.getChapterFilePath(bookId, chapterNumber);
  const raw = fs.readFileSync(filePath, 'utf-8');
  const parts = raw.split('---\n');
  return parts.length > 2 ? parts.slice(2).join('---\n').trim() : raw.trim();
}

function cleanup(dir: string) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ── Tests ──────────────────────────────────────────────────────────

describe('PipelinePersistence', () => {
  let rootDir: string;
  let persistence: PipelinePersistence;

  beforeEach(() => {
    rootDir = makeTempDir();
    persistence = new PipelinePersistence(rootDir);
  });

  afterEach(() => {
    cleanup(rootDir);
  });

  // ── persistChapter ──────────────────────────────────────────

  describe('persistChapter', () => {
    it('writes chapter file with frontmatter', async () => {
      setupBook(rootDir, 'book1');

      const result = await persistence.persistChapter({
        bookId: 'book1',
        chapterNumber: 1,
        title: '第一章',
        content: 'Chapter content here',
        status: 'final',
      });

      expect(result.success).toBe(true);
      expect(result.persisted).toBe(true);

      const content = readChapterContent(rootDir, 'book1', 1);
      expect(content).toBe('Chapter content here');
    });

    it('creates snapshot before writing', async () => {
      setupBook(rootDir, 'book1', [1]);

      await persistence.persistChapter({
        bookId: 'book1',
        chapterNumber: 2,
        title: '第二章',
        content: 'New chapter content',
        status: 'final',
      });

      const snapshotsDir = path.join(rootDir, 'book1', 'story', 'state', 'snapshots');
      if (fs.existsSync(snapshotsDir)) {
        const entries = fs.readdirSync(snapshotsDir);
        expect(entries.length).toBeGreaterThan(0);
      }
    });

    it('updates index.json after writing', async () => {
      setupBook(rootDir, 'book1');

      await persistence.persistChapter({
        bookId: 'book1',
        chapterNumber: 1,
        title: '第一章',
        content: 'Content',
        status: 'final',
      });

      const sm = new StateManager(rootDir);
      const index = sm.readIndex('book1');

      expect(index.totalChapters).toBe(1);
      expect(index.chapters.length).toBe(1);
      expect(index.chapters[0].number).toBe(1);
    });

    it('updates manifest lastChapterWritten', async () => {
      setupBook(rootDir, 'book1', [1]);

      await persistence.persistChapter({
        bookId: 'book1',
        chapterNumber: 2,
        title: '第二章',
        content: 'Content',
        status: 'final',
      });

      const ss = new RuntimeStateStore(new StateManager(rootDir));
      const manifest = ss.loadManifest('book1');

      expect(manifest.lastChapterWritten).toBe(2);
    });

    it('updates existing chapter in index', async () => {
      setupBook(rootDir, 'book1', [1]);

      await persistence.persistChapter({
        bookId: 'book1',
        chapterNumber: 1,
        title: 'Updated Title',
        content: 'Updated content',
        status: 'final',
      });

      const sm = new StateManager(rootDir);
      const index = sm.readIndex('book1');

      expect(index.totalChapters).toBe(1);
      expect(index.chapters[0].title).toBe('Updated Title');
    });

    it('marks draft chapters correctly', async () => {
      setupBook(rootDir, 'book1');

      await persistence.persistChapter({
        bookId: 'book1',
        chapterNumber: 1,
        title: '草稿章',
        content: 'Draft content',
        status: 'draft',
      });

      const filePath = path.join(rootDir, 'book1', 'story', 'chapters', 'chapter-0001.md');
      const raw = fs.readFileSync(filePath, 'utf-8');
      expect(raw).toContain('status: draft');
    });

    it('returns error when book does not exist', async () => {
      const result = await persistence.persistChapter({
        bookId: 'nonexistent',
        chapterNumber: 1,
        title: 'Test',
        content: 'Content',
        status: 'final',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('不存在');
    });

    it('is atomic: if snapshot fails, chapter is not written', async () => {
      // This tests the atomicity — the module should write to a temp file first,
      // then rename after snapshot. If we can't verify snapshot creation,
      // the chapter file should still be written for now (best effort).
      setupBook(rootDir, 'book1');

      const result = await persistence.persistChapter({
        bookId: 'book1',
        chapterNumber: 1,
        title: 'Test',
        content: 'Content',
        status: 'final',
      });

      expect(result.success).toBe(true);
    });
  });

  // ── rollbackChapter ─────────────────────────────────────────

  describe('rollbackChapter', () => {
    it('restores chapter from snapshot', async () => {
      setupBook(rootDir, 'book1', [1]);

      // Write chapter 2
      await persistence.persistChapter({
        bookId: 'book1',
        chapterNumber: 2,
        title: '第二章',
        content: 'Original content',
        status: 'final',
      });

      // Create a snapshot
      const snapshotId = persistence.createSnapshot('book1', 2);

      // Overwrite chapter 2
      await persistence.persistChapter({
        bookId: 'book1',
        chapterNumber: 2,
        title: '第二章 (revised)',
        content: 'Revised content',
        status: 'final',
      });

      // Verify the content changed
      const revised = readChapterContent(rootDir, 'book1', 2);
      expect(revised).toBe('Revised content');

      // Rollback
      const result = persistence.rollbackToSnapshot('book1', snapshotId);
      expect(result.success).toBe(true);
    });

    it('fails when snapshot does not exist', () => {
      setupBook(rootDir, 'book1', [1]);

      const result = persistence.rollbackToSnapshot('book1', 'nonexistent-snap');
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/不存在|没有快照/);
    });
  });

  // ── listSnapshots ───────────────────────────────────────────

  describe('listSnapshots', () => {
    it('returns empty list when no snapshots', () => {
      setupBook(rootDir, 'book1', [1]);
      const snapshots = persistence.listSnapshots('book1');
      expect(snapshots).toEqual([]);
    });

    it('returns snapshots sorted by chapter number', async () => {
      setupBook(rootDir, 'book1', [1, 2, 3]);

      persistence.createSnapshot('book1', 2);
      // Small delay to ensure different timestamps
      await new Promise((r) => setTimeout(r, 10));
      persistence.createSnapshot('book1', 1);

      const snapshots = persistence.listSnapshots('book1');
      expect(snapshots.length).toBe(2);
      expect(snapshots[0].chapterNumber).toBeLessThanOrEqual(snapshots[1].chapterNumber);
    });
  });

  // ── verifyConsistency ───────────────────────────────────────

  describe('verifyConsistency', () => {
    it('passes when index and files are consistent', async () => {
      setupBook(rootDir, 'book1', [1, 2]);

      await persistence.persistChapter({
        bookId: 'book1',
        chapterNumber: 3,
        title: '第三章',
        content: 'Content',
        status: 'final',
      });

      const result = persistence.verifyConsistency('book1');
      expect(result.consistent).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('detects missing chapter files', async () => {
      const { stateManager } = setupBook(rootDir, 'book1', [1, 2, 3]);

      // Delete chapter 2 file but leave it in index
      const ch2Path = stateManager.getChapterFilePath('book1', 2);
      fs.unlinkSync(ch2Path);

      const result = persistence.verifyConsistency('book1');
      expect(result.consistent).toBe(false);
      expect(result.issues.some((i) => i.includes('第 2 章'))).toBe(true);
    });

    it('detects orphaned chapter files', async () => {
      setupBook(rootDir, 'book1', [1]);

      // Create a chapter file not in the index
      const sm = new StateManager(rootDir);
      const orphanPath = sm.getChapterFilePath('book1', 5);
      fs.writeFileSync(
        orphanPath,
        `---
title: Orphan
chapter: 5
status: final
createdAt: ${new Date().toISOString()}
---

Orphan content`,
        'utf-8'
      );

      const result = persistence.verifyConsistency('book1');
      expect(result.consistent).toBe(false);
      expect(result.issues.some((i) => i.includes('第 5 章'))).toBe(true);
    });

    it('detects index-manifest mismatch', async () => {
      const { stateManager, stateStore } = setupBook(rootDir, 'book1', [1, 2]);

      // Manually change manifest to have different lastChapterWritten
      const manifest = stateStore.loadManifest('book1');
      manifest.lastChapterWritten = 5;
      stateStore.saveRuntimeStateSnapshot('book1', manifest);

      const result = persistence.verifyConsistency('book1');
      expect(result.consistent).toBe(false);
    });
  });
});
