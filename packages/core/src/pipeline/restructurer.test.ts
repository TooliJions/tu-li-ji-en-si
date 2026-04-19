import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { ChapterRestructurer } from './restructurer';
import { StateManager } from '../state/manager';
import { RuntimeStateStore } from '../state/runtime-store';
import type { LLMProvider } from '../llm/provider';
import type { ChapterIndex } from '../models/state';

// ── Helpers ────────────────────────────────────────────────────────

function makeTempDir(): string {
  return path.join(
    process.cwd(),
    'tmp-test-restructurer-' + Math.random().toString(36).slice(2, 8)
  );
}

function setupBook(
  rootDir: string,
  bookId: string,
  chapterContents: string[]
): { stateManager: StateManager; stateStore: RuntimeStateStore } {
  const sm = new StateManager(rootDir);
  const ss = new RuntimeStateStore(sm);

  sm.ensureBookStructure(bookId);
  ss.initializeBookState(bookId);

  // Create meta.json (book metadata)
  const metaPath = sm.getBookPath(bookId, 'meta.json');
  fs.writeFileSync(
    metaPath,
    JSON.stringify({ title: 'Test Book', genre: 'fantasy' }, null, 2),
    'utf-8'
  );

  // Write chapters
  chapterContents.forEach((content, i) => {
    const chNum = i + 1;
    const filePath = sm.getChapterFilePath(bookId, chNum);
    fs.writeFileSync(
      filePath,
      `---\ntitle: Chapter ${chNum}\nchapter: ${chNum}\nstatus: final\ncreatedAt: ${new Date().toISOString()}\n---\n\n${content}`,
      'utf-8'
    );
  });

  // Write index
  const index: ChapterIndex = {
    bookId,
    chapters: chapterContents.map((c, i) => ({
      number: i + 1,
      title: `Chapter ${i + 1}`,
      fileName: `chapter-${String(i + 1).padStart(4, '0')}.md`,
      wordCount: c.length,
      createdAt: new Date().toISOString(),
    })),
    totalChapters: chapterContents.length,
    totalWords: chapterContents.reduce((sum, c) => sum + c.length, 0),
    lastUpdated: new Date().toISOString(),
  };
  sm.writeIndex(bookId, index);

  // Update manifest with facts and hooks
  const manifest = ss.loadManifest(bookId);
  manifest.facts = chapterContents.map((_, i) => ({
    id: `fact-${i + 1}`,
    content: `Fact from chapter ${i + 1}`,
    chapterNumber: i + 1,
    confidence: 'high' as const,
    category: 'plot' as const,
    createdAt: new Date().toISOString(),
  }));
  manifest.hooks = chapterContents.map((_, i) => ({
    id: `hook-${i + 1}`,
    description: `Hook from chapter ${i + 1}`,
    type: 'plot',
    status: 'open' as const,
    priority: 'major' as const,
    plantedChapter: i + 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));
  manifest.lastChapterWritten = chapterContents.length;
  ss.saveRuntimeStateSnapshot(bookId, manifest);

  return { stateManager: sm, stateStore: ss };
}

function readChapterContent(rootDir: string, bookId: string, chapterNumber: number): string {
  const sm = new StateManager(rootDir);
  const filePath = sm.getChapterFilePath(bookId, chapterNumber);
  const raw = fs.readFileSync(filePath, 'utf-8');
  // Strip frontmatter
  const parts = raw.split('---\n');
  return parts.length > 2 ? parts.slice(2).join('---\n').trim() : raw.trim();
}

function cleanup(dir: string) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ── Tests ──────────────────────────────────────────────────────────

describe('ChapterRestructurer', () => {
  let rootDir: string;
  let restructurer: ChapterRestructurer;
  let mockProvider: LLMProvider;

  beforeEach(() => {
    rootDir = makeTempDir();
    mockProvider = {
      generate: vi.fn(),
      generateJSON: vi.fn(),
    } as unknown as LLMProvider;

    restructurer = new ChapterRestructurer({ rootDir, provider: mockProvider });
  });

  afterEach(() => {
    cleanup(rootDir);
  });

  // ── mergeChapters ─────────────────────────────────────────────

  describe('mergeChapters', () => {
    it('merges two consecutive chapters into one', async () => {
      setupBook(rootDir, 'book1', ['Content of chapter 1', 'Content of chapter 2']);

      const result = await restructurer.mergeChapters({
        bookId: 'book1',
        fromChapter: 1,
        toChapter: 2,
      });

      expect(result.success).toBe(true);

      // Chapter 1 should contain merged content
      const merged = readChapterContent(rootDir, 'book1', 1);
      expect(merged).toContain('Content of chapter 1');
      expect(merged).toContain('Content of chapter 2');

      // Chapter 2 file should be removed
      const sm = new StateManager(rootDir);
      const ch2Path = sm.getChapterFilePath('book1', 2);
      expect(fs.existsSync(ch2Path)).toBe(false);
    });

    it('updates index.json correctly after merge', async () => {
      setupBook(rootDir, 'book1', ['Ch1', 'Ch2', 'Ch3']);

      await restructurer.mergeChapters({
        bookId: 'book1',
        fromChapter: 1,
        toChapter: 2,
      });

      const sm = new StateManager(rootDir);
      const index = sm.readIndex('book1');

      // After merging 1+2: chapters become [merged-1, renumbered-2(was-3)]
      expect(index.totalChapters).toBe(2);
      expect(index.chapters.length).toBe(2);
      expect(index.chapters[0].number).toBe(1);
      expect(index.chapters[1].number).toBe(2); // old Ch3 renumbered to 2
    });

    it('aggregates facts from both chapters and renumbers', async () => {
      setupBook(rootDir, 'book1', ['Ch1 text', 'Ch2 text']);

      await restructurer.mergeChapters({
        bookId: 'book1',
        fromChapter: 1,
        toChapter: 2,
      });

      const ss = new RuntimeStateStore(new StateManager(rootDir));
      const manifest = ss.loadManifest('book1');

      // Facts from both chapters should exist, renumbered to chapter 1
      expect(manifest.facts.length).toBe(2);
      expect(manifest.facts.every((f) => f.chapterNumber === 1)).toBe(true);
    });

    it('re-anchors hooks from merged chapters', async () => {
      setupBook(rootDir, 'book1', ['Ch1 text', 'Ch2 text', 'Ch3 text']);

      await restructurer.mergeChapters({
        bookId: 'book1',
        fromChapter: 2,
        toChapter: 3,
      });

      const ss = new RuntimeStateStore(new StateManager(rootDir));
      const manifest = ss.loadManifest('book1');

      // Hooks from chapters 2 and 3 should both be anchored to chapter 2
      const mergedHooks = manifest.hooks.filter((h) => h.plantedChapter === 2);
      expect(mergedHooks.length).toBe(2);
    });

    it('throws if fromChapter is not consecutive with toChapter', async () => {
      setupBook(rootDir, 'book1', ['Ch1', 'Ch2', 'Ch3', 'Ch4']);

      await expect(
        restructurer.mergeChapters({
          bookId: 'book1',
          fromChapter: 1,
          toChapter: 3, // non-consecutive
        })
      ).rejects.toThrow();
    });

    it('throws if either chapter does not exist', async () => {
      setupBook(rootDir, 'book1', ['Ch1', 'Ch2']);

      await expect(
        restructurer.mergeChapters({
          bookId: 'book1',
          fromChapter: 1,
          toChapter: 5,
        })
      ).rejects.toThrow();
    });

    it('throws if book does not exist', async () => {
      await expect(
        restructurer.mergeChapters({
          bookId: 'nonexistent',
          fromChapter: 1,
          toChapter: 2,
        })
      ).rejects.toThrow();
    });

    it('acquires and releases reorg.lock', async () => {
      setupBook(rootDir, 'book1', ['Ch1', 'Ch2']);

      const result = await restructurer.mergeChapters({
        bookId: 'book1',
        fromChapter: 1,
        toChapter: 2,
      });

      expect(result.success).toBe(true);

      // Lock should be released
      const lockPath = path.join(rootDir, 'book1', '.lock');
      expect(fs.existsSync(lockPath)).toBe(false);
    });

    it('writes and removes .reorg_in_progress sentinel', async () => {
      setupBook(rootDir, 'book1', ['Ch1', 'Ch2']);

      const sentinelPath = path.join(rootDir, 'book1', 'story', 'state', '.reorg_in_progress');

      await restructurer.mergeChapters({
        bookId: 'book1',
        fromChapter: 1,
        toChapter: 2,
      });

      // Sentinel should be cleaned up
      expect(fs.existsSync(sentinelPath)).toBe(false);
    });

    it('updates manifest lastChapterWritten after merge', async () => {
      setupBook(rootDir, 'book1', ['Ch1', 'Ch2', 'Ch3']);

      await restructurer.mergeChapters({
        bookId: 'book1',
        fromChapter: 2,
        toChapter: 3,
      });

      const ss = new RuntimeStateStore(new StateManager(rootDir));
      const manifest = ss.loadManifest('book1');

      // lastChapterWritten should be 2 after merging 2+3
      expect(manifest.lastChapterWritten).toBe(2);
    });

    it('preserves hooks count (no orphaned hooks)', async () => {
      setupBook(rootDir, 'book1', ['Ch1', 'Ch2']);

      const ssBefore = new RuntimeStateStore(new StateManager(rootDir));
      const hooksBefore = ssBefore.loadManifest('book1').hooks.length;

      await restructurer.mergeChapters({
        bookId: 'book1',
        fromChapter: 1,
        toChapter: 2,
      });

      const ssAfter = new RuntimeStateStore(new StateManager(rootDir));
      const hooksAfter = ssAfter.loadManifest('book1').hooks.length;

      expect(hooksAfter).toBe(hooksBefore);
    });

    it('staging directory is cleaned up after success', async () => {
      setupBook(rootDir, 'book1', ['Ch1', 'Ch2']);

      const stagingDir = path.join(rootDir, 'book1', 'story', 'staging');

      await restructurer.mergeChapters({
        bookId: 'book1',
        fromChapter: 1,
        toChapter: 2,
      });

      expect(fs.existsSync(stagingDir)).toBe(false);
    });
  });

  // ── splitChapter ──────────────────────────────────────────────

  describe('splitChapter', () => {
    it('splits a chapter into two at the given position', async () => {
      setupBook(rootDir, 'book1', [
        'Paragraph 1 of chapter 1\n\nParagraph 2 of chapter 1\n\nParagraph 3 of chapter 1\n\nParagraph 4 of chapter 1',
      ]);

      const result = await restructurer.splitChapter({
        bookId: 'book1',
        chapter: 1,
        splitAtParagraph: 2, // split after 2nd paragraph
      });

      expect(result.success).toBe(true);

      // Chapter 1 should have part A (paras 1-2)
      const ch1 = readChapterContent(rootDir, 'book1', 1);
      expect(ch1).toContain('Paragraph 1');
      expect(ch1).toContain('Paragraph 2');

      // Chapter 2 should have part B (paras 3-4)
      const ch2 = readChapterContent(rootDir, 'book1', 2);
      expect(ch2).toContain('Paragraph 3');
      expect(ch2).toContain('Paragraph 4');
    });

    it('updates index.json correctly after split', async () => {
      setupBook(rootDir, 'book1', ['Part A\n\n---SPLIT---\n\nPart B', 'Ch2', 'Ch3']);

      await restructurer.splitChapter({
        bookId: 'book1',
        chapter: 1,
        splitAtParagraph: 2,
      });

      const sm = new StateManager(rootDir);
      const index = sm.readIndex('book1');

      // Should have 4 chapters now (1 split into 1+2, plus existing 2,3 → renumbered)
      expect(index.totalChapters).toBe(4);
    });

    it('distributes facts to the correct new chapters', async () => {
      // Need at least 2 facts for chapter 1 to test distribution
      const { stateStore } = setupBook(rootDir, 'book1', [
        'Paragraph 1\n\nParagraph 2\n\nParagraph 3\n\nParagraph 4',
      ]);

      // Add an extra fact for chapter 1
      const manifest = stateStore.loadManifest('book1');
      manifest.facts.push({
        id: 'fact-extra',
        content: 'Extra fact for chapter 1',
        chapterNumber: 1,
        confidence: 'high' as const,
        category: 'plot' as const,
        createdAt: new Date().toISOString(),
      });
      stateStore.saveRuntimeStateSnapshot('book1', manifest);

      await restructurer.splitChapter({
        bookId: 'book1',
        chapter: 1,
        splitAtParagraph: 2,
      });

      const ss = new RuntimeStateStore(new StateManager(rootDir));
      const updatedManifest = ss.loadManifest('book1');

      const factsCh1 = updatedManifest.facts.filter((f) => f.chapterNumber === 1);
      const factsCh2 = updatedManifest.facts.filter((f) => f.chapterNumber === 2);

      // Total facts should remain the same, distributed across chapters 1 and 2
      expect(factsCh1.length + factsCh2.length).toBe(updatedManifest.facts.length);
      expect(factsCh1.length).toBeGreaterThan(0);
      expect(factsCh2.length).toBeGreaterThan(0);
    });

    it('re-anchors hooks for split chapters', async () => {
      const { stateStore } = setupBook(rootDir, 'book1', [
        'Hook1 paragraph content here\n\nHook2 paragraph content here\n\nHook3 paragraph content\n\nHook4 paragraph content',
      ]);

      // Add an extra hook for chapter 1
      const manifest = stateStore.loadManifest('book1');
      manifest.hooks.push({
        id: 'hook-extra',
        description: 'Extra hook for chapter 1',
        type: 'plot',
        status: 'open' as const,
        priority: 'major' as const,
        plantedChapter: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      stateStore.saveRuntimeStateSnapshot('book1', manifest);

      await restructurer.splitChapter({
        bookId: 'book1',
        chapter: 1,
        splitAtParagraph: 2,
      });

      const ss = new RuntimeStateStore(new StateManager(rootDir));
      const updatedManifest = ss.loadManifest('book1');

      // Some hooks should now be on chapter 2
      const hooksCh2 = updatedManifest.hooks.filter((h) => h.plantedChapter === 2);
      expect(hooksCh2.length).toBeGreaterThanOrEqual(1);
    });

    it('throws if chapter does not exist', async () => {
      setupBook(rootDir, 'book1', ['Ch1']);

      await expect(
        restructurer.splitChapter({
          bookId: 'book1',
          chapter: 5,
          splitAtParagraph: 1,
        })
      ).rejects.toThrow();
    });

    it('throws if book does not exist', async () => {
      await expect(
        restructurer.splitChapter({
          bookId: 'nonexistent',
          chapter: 1,
          splitAtParagraph: 1,
        })
      ).rejects.toThrow();
    });

    it('acquires and releases reorg.lock', async () => {
      setupBook(rootDir, 'book1', [
        'Part A content here\n\nPart B content here\n\nPart C content here\n\nPart D content here',
      ]);

      await restructurer.splitChapter({
        bookId: 'book1',
        chapter: 1,
        splitAtParagraph: 2,
      });

      const lockPath = path.join(rootDir, 'book1', '.lock');
      expect(fs.existsSync(lockPath)).toBe(false);
    });

    it('writes and removes .reorg_in_progress sentinel', async () => {
      setupBook(rootDir, 'book1', [
        'Part A content here\n\nPart B content here\n\nPart C content here\n\nPart D content here',
      ]);

      const sentinelPath = path.join(rootDir, 'book1', 'story', 'state', '.reorg_in_progress');

      await restructurer.splitChapter({
        bookId: 'book1',
        chapter: 1,
        splitAtParagraph: 2,
      });

      expect(fs.existsSync(sentinelPath)).toBe(false);
    });

    it('staging directory is cleaned up after success', async () => {
      setupBook(rootDir, 'book1', [
        'Part A content here\n\nPart B content here\n\nPart C content here\n\nPart D content here',
      ]);

      const stagingDir = path.join(rootDir, 'book1', 'story', 'staging');

      await restructurer.splitChapter({
        bookId: 'book1',
        chapter: 1,
        splitAtParagraph: 2,
      });

      expect(fs.existsSync(stagingDir)).toBe(false);
    });

    it('preserves hooks count after split', async () => {
      setupBook(rootDir, 'book1', [
        'Hook1 content here\n\nHook2 content here\n\nHook3 content here\n\nHook4 content here',
      ]);

      const ssBefore = new RuntimeStateStore(new StateManager(rootDir));
      const hooksBefore = ssBefore.loadManifest('book1').hooks.length;

      await restructurer.splitChapter({
        bookId: 'book1',
        chapter: 1,
        splitAtParagraph: 2,
      });

      const ssAfter = new RuntimeStateStore(new StateManager(rootDir));
      const hooksAfter = ssAfter.loadManifest('book1').hooks.length;

      expect(hooksAfter).toBe(hooksBefore);
    });

    it('renumber subsequent chapters after split', async () => {
      setupBook(rootDir, 'book1', [
        'SplitMe A para 1\n\nSplitMe A para 2\n\nSplitMe B para 1\n\nSplitMe B para 2',
        'Original Ch2',
        'Original Ch3',
      ]);

      await restructurer.splitChapter({
        bookId: 'book1',
        chapter: 1,
        splitAtParagraph: 2,
      });

      const sm = new StateManager(rootDir);
      const index = sm.readIndex('book1');

      // Should have 4 chapters: split(1,2) + renumbered(3,4)
      expect(index.totalChapters).toBe(4);
      // Original Ch2 (was 2) should now be chapter 3
      expect(index.chapters.some((c) => c.number === 3)).toBe(true);
      // Original Ch3 (was 3) should now be chapter 4
      expect(index.chapters.some((c) => c.number === 4)).toBe(true);
    });
  });

  // ── Error handling ────────────────────────────────────────────

  describe('concurrency protection', () => {
    it('rejects merge when reorg.lock is held', async () => {
      setupBook(rootDir, 'book1', ['Ch1', 'Ch2']);

      const sm = new StateManager(rootDir);
      sm.acquireBookLock('book1', 'reorg');

      await expect(
        restructurer.mergeChapters({
          bookId: 'book1',
          fromChapter: 1,
          toChapter: 2,
        })
      ).rejects.toThrow(/already locked|重组进行中/);

      sm.releaseBookLock('book1');
    });

    it('rejects split when reorg.lock is held', async () => {
      setupBook(rootDir, 'book1', ['Ch1']);

      const sm = new StateManager(rootDir);
      sm.acquireBookLock('book1', 'reorg');

      await expect(
        restructurer.splitChapter({
          bookId: 'book1',
          chapter: 1,
          splitAtParagraph: 1,
        })
      ).rejects.toThrow(/already locked|重组进行中/);

      sm.releaseBookLock('book1');
    });
  });
});
