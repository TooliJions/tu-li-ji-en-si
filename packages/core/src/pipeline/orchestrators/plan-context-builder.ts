import * as fs from 'fs';
import type { StateManager } from '../../state/manager';
import type { Manifest } from '../../models/state';
import type { PlanChapterInput } from '../types';
import { readChapterSummary, buildOutlineContext } from '../runner-helpers';

export interface PlanContext {
  meta: { genre: string; title: string; synopsis: string };
  bookData: Record<string, unknown>;
  wordCountTarget: number;
  centralConflict: string;
  growthArc: string;
  candidateWorldRules: string[];
  openHooks: Array<{
    description: string;
    type: string;
    status: string;
    priority: string;
    plantedChapter: number;
  }>;
  outlineContext: string;
  previousChapterSummary: string;
}

export function buildPlanContext(
  input: PlanChapterInput,
  manifest: Manifest,
  stateManager: StateManager,
): PlanContext {
  const metaPath = stateManager.getBookPath(input.bookId, 'meta.json');
  const meta = fs.existsSync(metaPath)
    ? (JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as {
        genre: string;
        title: string;
        synopsis: string;
      })
    : { genre: 'unknown', title: '', synopsis: '' };

  const previousChapterSummary =
    manifest.lastChapterWritten > 0
      ? readChapterSummary(input.bookId, manifest.lastChapterWritten, stateManager)
      : '第一章，需要建立世界观和角色介绍';

  const outlineContext = buildOutlineContext(
    manifest.outline ?? [],
    input.chapterNumber,
    input.outlineContext || manifest.currentFocus || '',
    input.bookId,
    stateManager,
  );

  const bookDataPath = stateManager.getBookPath(input.bookId, 'book.json');
  let bookData: Record<string, unknown> = {};
  if (fs.existsSync(bookDataPath)) {
    try {
      bookData = JSON.parse(fs.readFileSync(bookDataPath, 'utf-8'));
    } catch {
      /* ignore */
    }
  }
  const wordCountTarget = (bookData.targetWordsPerChapter as number) ?? 3000;

  const expandedBrief = (bookData.expandedBrief as string) ?? '';
  const planningBrief = (bookData.planningBrief as string) ?? '';
  let centralConflict = '';
  let growthArc = '';
  if (expandedBrief) {
    const conflictMatch = expandedBrief.match(/【矛盾主线】([\s\S]*?)(?=\n【|$)/);
    if (conflictMatch) centralConflict = conflictMatch[1].trim();
    const growthMatch = expandedBrief.match(/【主角定位】([\s\S]*?)(?=\n【|$)/);
    if (growthMatch) growthArc = growthMatch[1].trim();
  }
  if (planningBrief) {
    const conflictMatch = planningBrief.match(/核心矛盾[：:]([\s\S]*?)(?=；|$)/);
    if (!centralConflict && conflictMatch) centralConflict = conflictMatch[1].trim();
    const growthMatch = planningBrief.match(/成长主线[：:]([\s\S]*?)(?=；|$)/);
    if (!growthArc && growthMatch) growthArc = growthMatch[1].trim();
  }

  const candidateWorldRules = manifest.worldRules.map((r) => `[${r.category}] ${r.rule}`);

  const openHooksRaw = manifest.hooks.filter(
    (h) => h.status === 'open' || h.status === 'progressing',
  );
  const seenHookDescs = new Set<string>();
  const openHooks = openHooksRaw
    .filter((h) => {
      const key = h.description.trim();
      if (seenHookDescs.has(key)) return false;
      seenHookDescs.add(key);
      return true;
    })
    .map((h) => ({
      description: h.description,
      type: h.type,
      status: h.status,
      priority: h.priority,
      plantedChapter: h.plantedChapter,
    }));

  return {
    meta,
    bookData,
    wordCountTarget,
    centralConflict,
    growthArc,
    candidateWorldRules,
    openHooks,
    outlineContext,
    previousChapterSummary,
  };
}

export function computeBatchRange(
  outline: Array<{
    actNumber: number;
    title: string;
    summary: string;
    chapters: Array<{ chapterNumber: number; title: string; summary: string }>;
  }>,
  chapterNumber: number,
): { startChapter: number; endChapter: number } | null {
  if (!outline || outline.length === 0) return null;

  const allBeatChapters: number[] = [];
  for (const act of outline) {
    for (const ch of act.chapters ?? []) {
      if (ch.chapterNumber > 0) allBeatChapters.push(ch.chapterNumber);
    }
  }
  allBeatChapters.sort((a, b) => a - b);

  if (allBeatChapters.length === 0) return null;

  let nextBeat = allBeatChapters.find((c) => c > chapterNumber);
  if (nextBeat === undefined) {
    nextBeat = chapterNumber + 5;
  }

  const endChapter = Math.min(nextBeat - 1, chapterNumber + 9);
  if (endChapter < chapterNumber) return null;

  return { startChapter: chapterNumber, endChapter };
}
