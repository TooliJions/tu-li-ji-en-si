import * as fs from 'fs';
import type { StateManager } from '../state/manager';
import { stripFrontmatter } from '../utils';

// ── Chapter I/O ─────────────────────────────────────────────────

export function readChapterSummary(
  bookId: string,
  chapterNumber: number,
  stateManager: StateManager,
): string {
  const content = readChapterContent(bookId, chapterNumber, stateManager);
  if (!content) return '';
  return content.substring(0, 300) + (content.length > 300 ? '…' : '');
}

export function readChapterContent(
  bookId: string,
  chapterNumber: number,
  stateManager: StateManager,
): string {
  const filePath = stateManager.getChapterFilePath(bookId, chapterNumber);
  if (!fs.existsSync(filePath)) return '';
  const raw = fs.readFileSync(filePath, 'utf-8');
  return stripFrontmatter(raw);
}
