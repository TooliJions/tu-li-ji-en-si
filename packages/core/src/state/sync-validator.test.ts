import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  SyncValidator,
  type SyncReport,
  type SyncIssue,
  type MarkdownDelta,
} from './sync-validator';
import { StateManager } from './manager';
import { RuntimeStateStore } from './runtime-store';
import { StateBootstrap, type BootstrapOptions } from './bootstrap';
import { ProjectionRenderer } from './projections';
import * as fs from 'fs';
import * as path from 'path';

describe('SyncValidator', () => {
  let tmpDir: string;
  let bookId: string;
  let manager: StateManager;
  let store: RuntimeStateStore;
  let stateDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(process.cwd(), 'test-sync-'));
    bookId = 'sync-book-001';

    const options: BootstrapOptions = {
      bookId,
      title: '测试小说',
      genre: 'xianxia',
      targetWords: 1000000,
    };
    StateBootstrap.bootstrapBook(tmpDir, options);

    manager = new StateManager(tmpDir);
    store = new RuntimeStateStore(manager);
    stateDir = path.join(tmpDir, bookId, 'story', 'state');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── checkSync ──────────────────────────────────────────────

  describe('checkSync', () => {
    it('returns clean report when Markdown matches JSON', () => {
      const validator = new SyncValidator(manager, store);
      const report = validator.checkSync(bookId);

      expect(report.bookId).toBe(bookId);
      expect(report.isInSync).toBe(true);
      expect(report.issues).toHaveLength(0);
    });

    it('detects hash mismatch when JSON changed but hash not updated', () => {
      // Bootstrap writes hash. Then change manifest without re-projection.
      const manifestPath = path.join(stateDir, 'manifest.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      manifest.currentFocus = 'new focus';
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

      const validator = new SyncValidator(manager, store);
      const report = validator.checkSync(bookId);

      expect(report.isInSync).toBe(false);
      expect(report.issues.some((i) => i.type === 'hash_mismatch')).toBe(true);
    });

    it('detects Markdown newer than JSON', () => {
      // Touch the Markdown file to make it newer than manifest.json
      const mdPath = path.join(stateDir, 'current_state.md');

      // First, modify manifest to create hash mismatch
      const manifestPath = path.join(stateDir, 'manifest.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      manifest.currentFocus = '焦点A';
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

      // Now make manifest older, markdown newer
      const past = new Date('2026-01-01T00:00:00Z');
      const now = new Date();
      fs.utimesSync(manifestPath, past, past);
      fs.utimesSync(mdPath, now, now);

      const validator = new SyncValidator(manager, store);
      const report = validator.checkSync(bookId);

      expect(report.isInSync).toBe(false);
      expect(report.issues.some((i) => i.type === 'markdown_newer')).toBe(true);
    });

    it('detects missing projection files', () => {
      fs.unlinkSync(path.join(stateDir, 'current_state.md'));

      const validator = new SyncValidator(manager, store);
      const report = validator.checkSync(bookId);

      expect(report.isInSync).toBe(false);
      expect(report.issues.some((i) => i.type === 'missing_projection')).toBe(true);
    });

    it('detects missing state hash file', () => {
      fs.unlinkSync(path.join(stateDir, '.state-hash'));

      const validator = new SyncValidator(manager, store);
      const report = validator.checkSync(bookId);

      expect(report.isInSync).toBe(false);
      expect(report.issues.some((i) => i.type === 'missing_hash')).toBe(true);
    });

    it('multiple issues can be detected simultaneously', () => {
      // Delete projection file
      fs.unlinkSync(path.join(stateDir, 'hooks.md'));

      // Change manifest
      const manifestPath = path.join(stateDir, 'manifest.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      manifest.currentFocus = 'changed';
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

      const validator = new SyncValidator(manager, store);
      const report = validator.checkSync(bookId);

      expect(report.issues.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ── generateDiff ───────────────────────────────────────────

  describe('generateDiff', () => {
    it('returns empty diff when in sync', () => {
      const validator = new SyncValidator(manager, store);
      const diff = validator.generateDiff(bookId);

      expect(diff.inSync).toBe(true);
      expect(diff.files).toHaveLength(0);
    });

    it('returns diff entries when Markdown differs from expected projection', () => {
      // Write a modified Markdown file
      const mdPath = path.join(stateDir, 'current_state.md');
      fs.writeFileSync(mdPath, '# 手动修改的状态\n\n这里有人工添加的内容');

      const validator = new SyncValidator(manager, store);
      const diff = validator.generateDiff(bookId);

      expect(diff.inSync).toBe(false);
      // Find the current_state.md entry
      const csEntry = diff.files.find((f) => f.file === 'current_state.md');
      expect(csEntry).toBeDefined();
      expect(csEntry!.status).toBe('modified');
    });
  });

  // ── parseMarkdownDelta ─────────────────────────────────────

  describe('parseMarkdownDelta', () => {
    it('parses focus changes from current_state.md', () => {
      const mdPath = path.join(stateDir, 'current_state.md');
      fs.writeFileSync(
        mdPath,
        `# 当前状态

- **书籍ID**: ${bookId}
- **最后完成章节**: 第 0 章
- **状态版本**: v1
- **更新时间**: 2026-04-18T10:00:00Z

## 当前焦点

新的手动焦点内容

## 角色

暂无角色信息

## 世界设定

暂无世界设定

## 记忆事实

暂无记忆事实
`
      );

      const validator = new SyncValidator(manager, store);
      const delta = validator.parseMarkdownDelta(bookId, 'current_state.md');

      expect(delta).not.toBeNull();
      expect(delta!.actions.length).toBeGreaterThan(0);
      const focusAction = delta!.actions.find((a) => a.type === 'set_focus');
      expect(focusAction).toBeDefined();
    });

    it('parses hook additions from hooks.md', () => {
      const hooksMd = path.join(stateDir, 'hooks.md');
      fs.writeFileSync(
        hooksMd,
        `# 伏笔追踪

## 进行中 (open)

### 神秘玉佩的来历

- **优先级**: critical
- **埋设章节**: 第 1 章
`
      );

      const validator = new SyncValidator(manager, store);
      const delta = validator.parseMarkdownDelta(bookId, 'hooks.md');

      expect(delta).not.toBeNull();
      const hookAction = delta!.actions.find((a) => a.type === 'add_hook');
      expect(hookAction).toBeDefined();
    });

    it('returns null for empty or trivial changes', () => {
      const validator = new SyncValidator(manager, store);
      const delta = validator.parseMarkdownDelta(bookId, 'chapter_summaries.md');

      // With empty chapter_summaries, no actions expected
      if (delta) {
        expect(delta.actions).toHaveLength(0);
      }
    });

    it('returns null for non-existent file', () => {
      const validator = new SyncValidator(manager, store);
      const delta = validator.parseMarkdownDelta(bookId, 'non-existent.md');
      expect(delta).toBeNull();
    });

    it('parses character additions from current_state.md', () => {
      const mdPath = path.join(stateDir, 'current_state.md');
      fs.writeFileSync(
        mdPath,
        `# 当前状态

- **书籍ID**: ${bookId}
- **最后完成章节**: 第 0 章
- **状态版本**: v1
- **更新时间**: 2026-04-18T10:00:00Z

## 角色

### 林风 [主角]

- **特征**: 冷静、坚韧
- **角色弧光**: 从弟子到宗师

## 世界设定

暂无世界设定

## 记忆事实

暂无记忆事实
`
      );

      const validator = new SyncValidator(manager, store);
      const delta = validator.parseMarkdownDelta(bookId, 'current_state.md');

      expect(delta).not.toBeNull();
      const charAction = delta!.actions.find((a) => a.type === 'add_character');
      expect(charAction).toBeDefined();
    });
  });

  // ── fixSync (re-projection) ───────────────────────────────

  describe('fixSync', () => {
    it('re-projects Markdown from JSON to restore sync', () => {
      // Make them out of sync
      const manifestPath = path.join(stateDir, 'manifest.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      manifest.currentFocus = '测试焦点';
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

      // Verify out of sync
      const validator1 = new SyncValidator(manager, store);
      expect(validator1.checkSync(bookId).isInSync).toBe(false);

      // Fix
      const validator2 = new SyncValidator(manager, store);
      validator2.fixSync(bookId);

      // Verify back in sync
      const validator3 = new SyncValidator(manager, store);
      const report = validator3.checkSync(bookId);
      expect(report.isInSync).toBe(true);
    });

    it('updates .state-hash after fix', () => {
      const validator = new SyncValidator(manager, store);
      validator.fixSync(bookId);

      const hashPath = path.join(stateDir, '.state-hash');
      expect(fs.existsSync(hashPath)).toBe(true);

      const storedHash = fs.readFileSync(hashPath, 'utf-8').trim();
      const manifest = store.loadManifest(bookId);
      const expectedHash = ProjectionRenderer.computeStateHash(manifest);
      expect(storedHash).toBe(expectedHash);
    });
  });

  // ── report format ─────────────────────────────────────────

  describe('report format', () => {
    it('issue contains file, type, severity, and description', () => {
      fs.unlinkSync(path.join(stateDir, 'current_state.md'));

      const validator = new SyncValidator(manager, store);
      const report = validator.checkSync(bookId);

      const issue = report.issues.find((i) => i.type === 'missing_projection');
      expect(issue).toBeDefined();
      expect(issue!.file).toBe('current_state.md');
      expect(issue!.severity).toBeDefined();
      expect(issue!.description).toBeDefined();
    });

    it('report includes timestamp', () => {
      const validator = new SyncValidator(manager, store);
      const report = validator.checkSync(bookId);

      expect(report.timestamp).toBeDefined();
    });
  });
});
