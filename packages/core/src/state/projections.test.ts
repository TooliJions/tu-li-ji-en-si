import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProjectionRenderer, type ProjectionFile } from './projections';
import { StateManager } from './manager';
import * as fs from 'fs';
import * as path from 'path';

describe('ProjectionRenderer', () => {
  let tmpDir: string;
  let stateDir: string;
  let manager: StateManager;
  const bookId = 'proj-book-001';

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(process.cwd(), 'test-projection-'));
    stateDir = path.join(tmpDir, bookId, 'story', 'state');
    fs.mkdirSync(stateDir, { recursive: true });
    manager = new StateManager(tmpDir);
    manager.ensureBookStructure(bookId);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── renderCurrentState ──────────────────────────────────────

  describe('renderCurrentState', () => {
    it('renders a basic header with bookId and last chapter', () => {
      const manifest = createMinimalManifest(bookId);
      const md = ProjectionRenderer.renderCurrentState(manifest);

      expect(md).toContain('# 当前状态');
      expect(md).toContain(`**书籍ID**: ${bookId}`);
      expect(md).toContain('**最后完成章节**: 第 0 章');
    });

    it('renders currentFocus when present', () => {
      const manifest = createMinimalManifest(bookId);
      manifest.currentFocus = '主角正在探索地下迷宫';
      const md = ProjectionRenderer.renderCurrentState(manifest);

      expect(md).toContain('## 当前焦点');
      expect(md).toContain('主角正在探索地下迷宫');
    });

    it('renders characters section', () => {
      const manifest = createMinimalManifest(bookId);
      manifest.characters = [
        {
          id: 'char-001',
          name: '林风',
          role: 'protagonist',
          traits: ['冷静', '坚韧'],
          relationships: { 'char-002': '师徒关系' },
          arc: '从弟子到宗师的成长',
          firstAppearance: 1,
          lastAppearance: 5,
        },
      ];
      const md = ProjectionRenderer.renderCurrentState(manifest);

      expect(md).toContain('## 角色');
      expect(md).toContain('林风');
      expect(md).toContain('主角');
      expect(md).toContain('冷静');
      expect(md).toContain('从弟子到宗师的成长');
    });

    it('renders world rules section', () => {
      const manifest = createMinimalManifest(bookId);
      manifest.worldRules = [
        {
          id: 'rule-001',
          category: 'magic-system',
          rule: '灵气修炼需要吸收天地精华',
          exceptions: ['天灵根除外'],
          sourceChapter: 1,
        },
      ];
      const md = ProjectionRenderer.renderCurrentState(manifest);

      expect(md).toContain('## 世界设定');
      expect(md).toContain('灵气修炼需要吸收天地精华');
      expect(md).toContain('天灵根除外');
    });

    it('renders facts section grouped by category', () => {
      const manifest = createMinimalManifest(bookId);
      manifest.facts = [
        {
          id: 'fact-001',
          content: '林风是青云门弟子',
          chapterNumber: 1,
          confidence: 'high',
          category: 'character',
          createdAt: '2026-04-18T10:00:00Z',
        },
        {
          id: 'fact-002',
          content: '青云门位于昆仑山',
          chapterNumber: 1,
          confidence: 'high',
          category: 'world',
          createdAt: '2026-04-18T10:00:00Z',
        },
      ];
      const md = ProjectionRenderer.renderCurrentState(manifest);

      expect(md).toContain('## 记忆事实');
      expect(md).toContain('林风是青云门弟子');
      expect(md).toContain('青云门位于昆仑山');
    });

    it('shows empty state message when no data', () => {
      const manifest = createMinimalManifest(bookId);
      const md = ProjectionRenderer.renderCurrentState(manifest);

      expect(md).toContain('暂无角色信息');
      expect(md).toContain('暂无世界设定');
      expect(md).toContain('暂无记忆事实');
    });
  });

  // ── renderHooks ─────────────────────────────────────────────

  describe('renderHooks', () => {
    it('renders hooks grouped by status', () => {
      const manifest = createMinimalManifest(bookId);
      manifest.hooks = [
        createHook('h-001', '神秘玉佩的来历', 'open', 'critical', 1),
        createHook('h-002', '师父的真实身份', 'progressing', 'major', 2),
        createHook('h-003', '旧敌复仇', 'resolved', 'minor', 1),
      ];
      const md = ProjectionRenderer.renderHooks(manifest);

      expect(md).toContain('# 伏笔追踪');
      expect(md).toContain('## 进行中 (open)');
      expect(md).toContain('## 推进中 (progressing)');
      expect(md).toContain('## 已回收 (resolved)');
      expect(md).toContain('神秘玉佩的来历');
      expect(md).toContain('师父的真实身份');
      expect(md).toContain('旧敌复仇');
    });

    it('renders hook details with priority and chapters', () => {
      const manifest = createMinimalManifest(bookId);
      manifest.hooks = [
        createHook('h-001', '神秘玉佩', 'open', 'critical', 1, {
          expectedResolutionMin: 10,
          expectedResolutionMax: 15,
          relatedCharacters: ['林风'],
        }),
      ];
      const md = ProjectionRenderer.renderHooks(manifest);

      expect(md).toContain('critical');
      expect(md).toContain('埋设章节');
      expect(md).toContain('**预期回收**: 第 10-15 章');
      expect(md).toContain('**相关角色**: 林风');
    });

    it('shows empty message when no hooks', () => {
      const manifest = createMinimalManifest(bookId);
      const md = ProjectionRenderer.renderHooks(manifest);

      expect(md).toContain('暂无伏笔');
    });

    it('skips empty status groups', () => {
      const manifest = createMinimalManifest(bookId);
      manifest.hooks = [createHook('h-001', '唯一伏笔', 'open', 'major', 1)];
      const md = ProjectionRenderer.renderHooks(manifest);

      expect(md).toContain('唯一伏笔');
      expect(md).not.toContain('progressing');
      expect(md).not.toContain('resolved');
    });
  });

  // ── renderChapterSummaries ──────────────────────────────────

  describe('renderChapterSummaries', () => {
    it('renders summaries in chapter order', () => {
      const manifest = createMinimalManifest(bookId);
      // Chapter summaries come from SQLite, we pass them as array
      const summaries = [
        {
          chapter: 1,
          summary: '林风拜入青云门，开始修炼。',
          keyEvents: ['拜师仪式', '初次修炼'],
          stateChanges: null,
          created_at: '2026-04-18T10:00:00Z',
        },
        {
          chapter: 2,
          summary: '林风在后山发现神秘玉佩。',
          keyEvents: ['发现玉佩'],
          stateChanges: null,
          created_at: '2026-04-18T11:00:00Z',
        },
      ];
      const md = ProjectionRenderer.renderChapterSummaries(summaries);

      expect(md).toContain('# 章节摘要');
      expect(md).toContain('## 第 1 章');
      expect(md).toContain('## 第 2 章');
      expect(md).toContain('林风拜入青云门');
      expect(md).toContain('林风在后山发现神秘玉佩');
      expect(md).toContain('拜师仪式');
    });

    it('shows empty message when no summaries', () => {
      const md = ProjectionRenderer.renderChapterSummaries([]);
      expect(md).toContain('暂无章节摘要');
    });
  });

  // ── computeStateHash ────────────────────────────────────────

  describe('computeStateHash', () => {
    it('produces a consistent SHA-256 hash', () => {
      const manifest = createMinimalManifest(bookId);
      const hash1 = ProjectionRenderer.computeStateHash(manifest);
      const hash2 = ProjectionRenderer.computeStateHash(manifest);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 hex length
    });

    it('produces different hashes for different state', () => {
      const manifest1 = createMinimalManifest(bookId);
      const manifest2 = createMinimalManifest(bookId);
      manifest2.currentFocus = 'different focus';

      const hash1 = ProjectionRenderer.computeStateHash(manifest1);
      const hash2 = ProjectionRenderer.computeStateHash(manifest2);

      expect(hash1).not.toBe(hash2);
    });
  });

  // ── writeProjectionFiles ────────────────────────────────────

  describe('writeProjectionFiles', () => {
    it('writes all projection files to state directory', () => {
      const manifest = createMinimalManifest(bookId);
      manifest.hooks = [createHook('h-001', '测试伏笔', 'open', 'major', 1)];
      const summaries = [
        {
          chapter: 1,
          summary: '第一章摘要',
          keyEvents: ['事件一'],
          stateChanges: null,
          created_at: '2026-04-18T10:00:00Z',
        },
      ];

      const files = ProjectionRenderer.writeProjectionFiles(manifest, stateDir, summaries);

      expect(files).toHaveLength(4); // current_state.md, hooks.md, chapter_summaries.md, .state-hash

      const fileNames = files.map((f) => f.name);
      expect(fileNames).toContain('current_state.md');
      expect(fileNames).toContain('hooks.md');
      expect(fileNames).toContain('chapter_summaries.md');
      expect(fileNames).toContain('.state-hash');

      // Verify files exist on disk
      expect(fs.existsSync(path.join(stateDir, 'current_state.md'))).toBe(true);
      expect(fs.existsSync(path.join(stateDir, 'hooks.md'))).toBe(true);
      expect(fs.existsSync(path.join(stateDir, 'chapter_summaries.md'))).toBe(true);
      expect(fs.existsSync(path.join(stateDir, '.state-hash'))).toBe(true);
    });

    it('.state-hash file contains the SHA-256 hash', () => {
      const manifest = createMinimalManifest(bookId);
      ProjectionRenderer.writeProjectionFiles(manifest, stateDir, []);

      const hashContent = fs.readFileSync(path.join(stateDir, '.state-hash'), 'utf-8').trim();
      const expectedHash = ProjectionRenderer.computeStateHash(manifest);

      expect(hashContent).toBe(expectedHash);
    });

    it('overwrites existing files on re-projection', () => {
      const manifest1 = createMinimalManifest(bookId);
      ProjectionRenderer.writeProjectionFiles(manifest1, stateDir, []);

      const content1 = fs.readFileSync(path.join(stateDir, 'current_state.md'), 'utf-8');

      // Change state and re-project
      const manifest2 = createMinimalManifest(bookId);
      manifest2.currentFocus = '新的焦点';
      ProjectionRenderer.writeProjectionFiles(manifest2, stateDir, []);

      const content2 = fs.readFileSync(path.join(stateDir, 'current_state.md'), 'utf-8');

      expect(content1).not.toBe(content2);
      expect(content2).toContain('新的焦点');
    });
  });

  // ── detectManualEdit ────────────────────────────────────────

  describe('detectManualEdit', () => {
    it('returns false when hash matches (no manual edit)', () => {
      const manifest = createMinimalManifest(bookId);
      ProjectionRenderer.writeProjectionFiles(manifest, stateDir, []);

      const edited = ProjectionRenderer.detectManualEdit(manifest, stateDir);
      expect(edited).toBe(false);
    });

    it('returns true when .state-hash content changed', () => {
      const manifest = createMinimalManifest(bookId);
      ProjectionRenderer.writeProjectionFiles(manifest, stateDir, []);

      // Simulate manual edit by changing the hash file
      fs.writeFileSync(path.join(stateDir, '.state-hash'), 'fake-hash-123');

      const edited = ProjectionRenderer.detectManualEdit(manifest, stateDir);
      expect(edited).toBe(true);
    });

    it('returns false when .state-hash file missing (no baseline)', () => {
      const manifest = createMinimalManifest(bookId);
      // Don't write projection files, so no hash file exists
      const edited = ProjectionRenderer.detectManualEdit(manifest, stateDir);
      expect(edited).toBe(false);
    });
  });
});

// ── Helpers ───────────────────────────────────────────────────────

function createMinimalManifest(bookId: string) {
  return {
    bookId,
    versionToken: 1,
    lastChapterWritten: 0,
    currentFocus: undefined as string | undefined,
    hooks: [] as any[],
    facts: [] as any[],
    characters: [] as any[],
    worldRules: [] as any[],
    updatedAt: '2026-04-18T10:00:00Z',
  };
}

function createHook(
  id: string,
  description: string,
  status: string,
  priority: string,
  plantedChapter: number,
  extra: Record<string, unknown> = {}
) {
  return {
    id,
    description,
    type: 'narrative',
    status,
    priority,
    plantedChapter,
    wakeAtChapter: undefined as number | undefined,
    relatedCharacters: [] as string[],
    relatedChapters: [] as number[],
    createdAt: '2026-04-18T10:00:00Z',
    updatedAt: '2026-04-18T10:00:00Z',
    ...extra,
  };
}
