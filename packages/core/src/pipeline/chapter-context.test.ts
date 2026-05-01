import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { buildOutlineContext } from './chapter-context';
import { StateManager } from '../state/manager';

describe('chapter-context', () => {
  let tmpDir: string;
  let stateManager: StateManager;
  const bookId = 'book-test-001';

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(process.env.TEMP ?? '/tmp', 'ctx-test-'));
    stateManager = new StateManager(tmpDir);
    stateManager.ensureBookStructure(bookId);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const outline = [
    {
      actNumber: 1,
      title: '第一幕',
      summary: '主角登场，世界设定展开',
      chapters: [
        { chapterNumber: 1, title: '觉醒', summary: '主角获得金手指' },
        { chapterNumber: 5, title: '冲突', summary: '首次对抗反派' },
      ],
    },
    {
      actNumber: 2,
      title: '第二幕',
      summary: '主角成长，力量提升',
      chapters: [{ chapterNumber: 10, title: '突破', summary: '主角突破境界' }],
    },
  ];

  // ── buildOutlineContext ───────────────────────────────────────

  describe('buildOutlineContext', () => {
    it('returns fallback when outline is empty', () => {
      const result = buildOutlineContext([], 1, 'fallback', bookId, stateManager);
      expect(result).toBe('fallback');
    });

    it('identifies current act with marker', () => {
      const result = buildOutlineContext(outline, 1, '', bookId, stateManager);
      expect(result).toContain('← 当前');
      expect(result).toContain('第一幕');
    });

    it('shows current act details', () => {
      const result = buildOutlineContext(outline, 1, '', bookId, stateManager);
      expect(result).toContain('主角登场，世界设定展开');
    });

    it('shows key chapters in current act', () => {
      const result = buildOutlineContext(outline, 1, '', bookId, stateManager);
      expect(result).toContain('觉醒');
      expect(result).toContain('冲突');
    });

    it('marks current chapter', () => {
      const result = buildOutlineContext(outline, 1, '', bookId, stateManager);
      expect(result).toContain('← 本章');
    });

    it('shows navigation context for chapters between beats', () => {
      const result = buildOutlineContext(outline, 3, '', bookId, stateManager);
      expect(result).toContain('本章叙事定位');
      expect(result).toContain('前一个关键节点');
    });

    it('shows prev/next act summaries when available', () => {
      const result = buildOutlineContext(outline, 10, '', bookId, stateManager);
      expect(result).toContain('上一幕');
      expect(result).toContain('第一幕');
    });

    it('returns fallback when outline is null', () => {
      const result = buildOutlineContext(
        null as unknown as typeof outline,
        1,
        'fallback',
        bookId,
        stateManager,
      );
      expect(result).toBe('fallback');
    });

    it('uses 卷 label for long-form outlines', () => {
      const longOutline = [
        { actNumber: 1, title: '卷一', summary: 'summary', chapters: [] },
        { actNumber: 2, title: '卷二', summary: 'summary', chapters: [] },
        { actNumber: 3, title: '卷三', summary: 'summary', chapters: [] },
        { actNumber: 4, title: '卷四', summary: 'summary', chapters: [] },
      ];
      const result = buildOutlineContext(longOutline, 1, '', bookId, stateManager);
      expect(result).toContain('多卷');
    });

    it('uses 幕 label for short outlines', () => {
      const result = buildOutlineContext(outline, 1, '', bookId, stateManager);
      expect(result).toContain('三幕');
    });
  });
});
