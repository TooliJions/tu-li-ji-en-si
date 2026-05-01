import * as fs from 'fs';
import * as path from 'path';
import type { StateManager } from '../state/manager';
import type { RuntimeStateStore } from '../state/runtime-store';
import type { Manifest } from '../models/state';
import type { ChapterIndexEntry } from '../models/chapter';
import { countChineseWords, findChapterEntry, normalizeChapterEntry } from '../utils';
import { ProjectionRenderer } from '../state/projections';

// ── Persistence ─────────────────────────────────────────────────

export function persistChapterAtomic(
  content: string,
  bookId: string,
  chapterNumber: number,
  title: string,
  status: 'draft' | 'final' = 'final',
  metadata:
    | {
        warning?: string;
        warningCode?: 'accept_with_warnings' | 'context_drift';
      }
    | undefined,
  stateManager: StateManager,
): void {
  const targetPath = stateManager.getChapterFilePath(bookId, chapterNumber);
  const tmpPath = targetPath + '.tmp';

  const sanitizedWarning = metadata?.warning?.replace(/\r?\n/g, ' ').trim();
  const warningBlock = [
    metadata?.warningCode ? `warningCode: ${metadata.warningCode}` : null,
    sanitizedWarning ? `warning: ${sanitizedWarning}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join('\n');

  const chapterMeta = `---
title: ${title}
chapter: ${chapterNumber}
status: ${status}
${warningBlock ? `${warningBlock}\n` : ''}createdAt: ${new Date().toISOString()}
---

`;

  try {
    fs.writeFileSync(tmpPath, chapterMeta + content, 'utf-8');
    fs.renameSync(tmpPath, targetPath);
  } catch (error) {
    if (fs.existsSync(tmpPath)) {
      try {
        fs.unlinkSync(tmpPath);
      } catch {
        /* best effort */
      }
    }
    throw error;
  }
}

export function updateStateAfterChapter(
  bookId: string,
  chapterNumber: number,
  title: string | null,
  content: string,
  stateManager: StateManager,
  stateStore: RuntimeStateStore,
  manifestOverride?: Manifest,
): void {
  const index = stateManager.readIndex(bookId);
  const existingChapter = findChapterEntry(index.chapters, chapterNumber);
  if (!existingChapter) {
    const paddedChapterNumber = String(chapterNumber).padStart(4, '0');
    index.chapters.push({
      number: chapterNumber,
      title,
      fileName: `chapter-${paddedChapterNumber}.md`,
      wordCount: countChineseWords(content),
      createdAt: new Date().toISOString(),
    });
  } else {
    const normalized = normalizeChapterEntry(
      existingChapter,
      chapterNumber,
      title,
      countChineseWords(content),
    );
    const idx = index.chapters.findIndex(
      (c) =>
        c.number === chapterNumber ||
        (c as ChapterIndexEntry & { chapterNumber?: number }).chapterNumber === chapterNumber,
    );
    if (idx >= 0) index.chapters[idx] = { ...normalized, wordCount: countChineseWords(content) };
  }
  index.totalChapters = index.chapters.length;
  index.totalWords = index.chapters.reduce(
    (sum, chapter) => sum + (Number.isFinite(chapter.wordCount) ? chapter.wordCount : 0),
    0,
  );
  index.lastUpdated = new Date().toISOString();
  stateManager.writeIndex(bookId, index);

  const manifest = manifestOverride ?? stateStore.loadManifest(bookId);
  const updatedManifest = {
    ...manifest,
    lastChapterWritten:
      chapterNumber > manifest.lastChapterWritten ? chapterNumber : manifest.lastChapterWritten,
  };
  stateStore.saveRuntimeStateSnapshot(bookId, updatedManifest);

  const stateDir = stateManager.getBookPath(bookId, 'story', 'state');
  try {
    const storedHash = loadStoredStateHash(stateDir);
    const currentHash = ProjectionRenderer.computeStateHash(updatedManifest);

    if (storedHash === null || storedHash !== currentHash) {
      const summaries = index.chapters.map((ch) => ({
        chapter: ch.number,
        briefSummary: ch.title ?? '',
        detailedSummary: ch.title ?? '',
        keyEvents: [] as string[],
        stateChanges: null,
        emotionalArc: null,
        cliffhanger: null,
        hookImpact: null,
        consistencyScore: 0,
        created_at: ch.createdAt,
        updated_at: ch.createdAt,
      }));
      ProjectionRenderer.writeProjectionFiles(updatedManifest, stateDir, summaries);
    }
  } catch {
    // 投影刷新失败不影响主流程
  }
}

export function loadStoredStateHash(stateDir: string): string | null {
  try {
    const hashPath = path.join(stateDir, '.state-hash');
    return fs.readFileSync(hashPath, 'utf-8').trim();
  } catch (err) {
    console.warn(
      '[runner-helpers] Failed to load state hash:',
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}
