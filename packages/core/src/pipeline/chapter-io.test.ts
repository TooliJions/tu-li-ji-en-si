import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { readChapterSummary, readChapterContent } from './chapter-io';
import { StateManager } from '../state/manager';

describe('chapter-io', () => {
  let tmpDir: string;
  let stateManager: StateManager;
  const bookId = 'book-test-001';

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(process.env.TEMP ?? '/tmp', 'chapter-io-test-'));
    stateManager = new StateManager(tmpDir);
    stateManager.ensureBookStructure(bookId);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── readChapterContent ────────────────────────────────────────

  describe('readChapterContent', () => {
    it('reads chapter content without frontmatter', () => {
      const chapterPath = stateManager.getChapterFilePath(bookId, 1);
      const content = '这是第一章的正文内容。';
      fs.writeFileSync(chapterPath, `---\ntitle: 第一章\nchapter: 1\n---\n\n${content}`, 'utf-8');

      const result = readChapterContent(bookId, 1, stateManager);

      expect(result).toBe(content);
    });

    it('returns empty string when chapter does not exist', () => {
      const result = readChapterContent(bookId, 999, stateManager);
      expect(result).toBe('');
    });

    it('reads plain content without frontmatter', () => {
      const chapterPath = stateManager.getChapterFilePath(bookId, 2);
      fs.writeFileSync(chapterPath, '纯文本内容', 'utf-8');

      const result = readChapterContent(bookId, 2, stateManager);

      expect(result).toBe('纯文本内容');
    });
  });

  // ── readChapterSummary ────────────────────────────────────────

  describe('readChapterSummary', () => {
    it('returns truncated summary for long content', () => {
      const chapterPath = stateManager.getChapterFilePath(bookId, 1);
      const longContent = 'a'.repeat(500);
      fs.writeFileSync(chapterPath, longContent, 'utf-8');

      const result = readChapterSummary(bookId, 1, stateManager);

      expect(result.length).toBe(301); // 300 chars + '…'
      expect(result.endsWith('…')).toBe(true);
    });

    it('returns full content for short text', () => {
      const chapterPath = stateManager.getChapterFilePath(bookId, 1);
      const shortContent = '短内容';
      fs.writeFileSync(chapterPath, shortContent, 'utf-8');

      const result = readChapterSummary(bookId, 1, stateManager);

      expect(result).toBe(shortContent);
    });

    it('returns empty string when chapter does not exist', () => {
      const result = readChapterSummary(bookId, 999, stateManager);
      expect(result).toBe('');
    });
  });
});
