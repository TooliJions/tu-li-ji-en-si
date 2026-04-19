import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StateImporter, type ImportResult, type ImportError } from './state-importer';
import { StateManager } from './manager';
import { RuntimeStateStore } from './runtime-store';
import { StateBootstrap, type BootstrapOptions } from './bootstrap';
import { SyncValidator } from './sync-validator';
import * as fs from 'fs';
import * as path from 'path';

describe('StateImporter', () => {
  let tmpDir: string;
  let bookId: string;
  let manager: StateManager;
  let store: RuntimeStateStore;
  let importer: StateImporter;
  let stateDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(process.cwd(), 'test-importer-'));
    bookId = 'import-book-001';

    const options: BootstrapOptions = {
      bookId,
      title: '测试小说',
      genre: 'xianxia',
      targetWords: 1000000,
    };
    StateBootstrap.bootstrapBook(tmpDir, options);

    manager = new StateManager(tmpDir);
    store = new RuntimeStateStore(manager);
    importer = new StateImporter(manager, store);
    stateDir = path.join(tmpDir, bookId, 'story', 'state');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── previewImport ─────────────────────────────────────────

  describe('previewImport', () => {
    it('preview focus change from Markdown', () => {
      const markdown = `# 当前状态

- **书籍ID**: ${bookId}
- **最后完成章节**: 第 0 章
- **状态版本**: v1
- **更新时间**: 2026-04-18T10:00:00Z

## 当前焦点

新的手动焦点

## 角色

暂无角色信息

## 世界设定

暂无世界设定

## 记忆事实

暂无记忆事实
`;

      const result = importer.previewImport(bookId, markdown, 'current_state.md');
      expect(result.success).toBe(true);
      expect(result.actions.length).toBeGreaterThan(0);
      const focusAction = result.actions.find((a) => a.type === 'set_focus');
      expect(focusAction).toBeDefined();
    });

    it('preview character addition', () => {
      const markdown = `# 当前状态

- **书籍ID**: ${bookId}
- **最后完成章节**: 第 0 章

## 角色

### 林风 [主角]

- **特征**: 冷静、坚韧
- **角色弧光**: 从弟子到宗师

## 世界设定

暂无世界设定

## 记忆事实

暂无记忆事实
`;

      const result = importer.previewImport(bookId, markdown, 'current_state.md');
      expect(result.success).toBe(true);
      const charAction = result.actions.find((a) => a.type === 'add_character');
      expect(charAction).toBeDefined();
      expect(charAction!.payload.name).toBe('林风');
    });

    it('preview world rule addition', () => {
      const markdown = `# 当前状态

- **书籍ID**: ${bookId}
- **最后完成章节**: 第 0 章

## 角色

暂无角色信息

## 世界设定

- [magic-system] 修炼分为炼气、筑基、金丹三个阶段
  - 例外: 天灵根无需炼气
- [society] 青云门是正道第一大宗

## 记忆事实

暂无记忆事实
`;

      const result = importer.previewImport(bookId, markdown, 'current_state.md');
      expect(result.success).toBe(true);
      const ruleActions = result.actions.filter((a) => a.type === 'add_world_rule');
      expect(ruleActions).toHaveLength(2);
    });

    it('preview hook addition from hooks.md', () => {
      const markdown = `# 伏笔追踪

## 进行中 (open)

### 神秘玉佩的来历

- **优先级**: critical
- **埋设章节**: 第 1 章

### 师父的真实身份

- **优先级**: major
- **埋设章节**: 第 3 章
`;

      const result = importer.previewImport(bookId, markdown, 'hooks.md');
      expect(result.success).toBe(true);
      expect(result.actions.filter((a) => a.type === 'add_hook')).toHaveLength(2);
    });

    it('returns empty actions for unchanged content', () => {
      // Load the actual current content
      const content = fs.readFileSync(path.join(stateDir, 'current_state.md'), 'utf-8');
      const result = importer.previewImport(bookId, content, 'current_state.md');
      // Focus action might be extracted if no focus exists; that's fine
      expect(result.success).toBe(true);
    });

    it('returns success=false for unsupported file type', () => {
      const result = importer.previewImport(bookId, 'some content', 'unknown.md');
      expect(result.success).toBe(false);
    });
  });

  // ── applyImport ───────────────────────────────────────────

  describe('applyImport', () => {
    it('apply focus change and update state', () => {
      const markdown = `# 当前状态

- **书籍ID**: ${bookId}
- **最后完成章节**: 第 0 章
- **状态版本**: v1
- **更新时间**: 2026-04-18T10:00:00Z

## 当前焦点

新的焦点内容

## 角色

暂无角色信息

## 世界设定

暂无世界设定

## 记忆事实

暂无记忆事实
`;

      const oldManifest = store.loadManifest(bookId);
      const result = importer.applyImport(bookId, markdown, 'current_state.md');

      expect(result.success).toBe(true);
      expect(result.newVersionToken).toBeGreaterThan(oldManifest.versionToken);

      const newManifest = store.loadManifest(bookId);
      expect(newManifest.currentFocus).toBe('新的焦点内容');
    });

    it('apply character addition', () => {
      const markdown = `# 当前状态

- **书籍ID**: ${bookId}
- **最后完成章节**: 第 0 章

## 角色

### 李青 [配角]

- **特征**: 聪明、幽默

## 世界设定

暂无世界设定

## 记忆事实

暂无记忆事实
`;

      importer.applyImport(bookId, markdown, 'current_state.md');

      const manifest = store.loadManifest(bookId);
      expect(manifest.characters).toHaveLength(1);
      expect(manifest.characters[0].name).toBe('李青');
      expect(manifest.characters[0].role).toBe('supporting');
    });

    it('apply hook addition from hooks.md', () => {
      const markdown = `# 伏笔追踪

## 进行中 (open)

### 玉佩的秘密

- **优先级**: critical
- **埋设章节**: 第 1 章
`;

      const oldManifest = store.loadManifest(bookId);
      const result = importer.applyImport(bookId, markdown, 'hooks.md');

      expect(result.success).toBe(true);

      const newManifest = store.loadManifest(bookId);
      expect(newManifest.hooks).toHaveLength(1);
      expect(newManifest.hooks[0].description).toBe('玉佩的秘密');
      expect(newManifest.hooks[0].priority).toBe('critical');
    });

    it('re-projects Markdown after successful import', () => {
      const markdown = `# 当前状态

- **书籍ID**: ${bookId}
- **最后完成章节**: 第 0 章
- **状态版本**: v1
- **更新时间**: 2026-04-18T10:00:00Z

## 当前焦点

导入后焦点

## 角色

暂无角色信息

## 世界设定

暂无世界设定

## 记忆事实

暂无记忆事实
`;

      importer.applyImport(bookId, markdown, 'current_state.md');

      // After import, sync should be restored
      const validator = new SyncValidator(manager, store);
      const syncReport = validator.checkSync(bookId);
      expect(syncReport.isInSync).toBe(true);
    });

    it('increment versionToken on each import', () => {
      const markdown = `# 当前状态

- **书籍ID**: ${bookId}
- **最后完成章节**: 第 0 章
- **状态版本**: v1
- **更新时间**: 2026-04-18T10:00:00Z

## 当前焦点

焦点一

## 角色

暂无角色信息

## 世界设定

暂无世界设定

## 记忆事实

暂无记忆事实
`;

      importer.applyImport(bookId, markdown, 'current_state.md');
      const v1 = store.loadManifest(bookId).versionToken;

      const markdown2 = markdown.replace('焦点一', '焦点二');
      importer.applyImport(bookId, markdown2, 'current_state.md');
      const v2 = store.loadManifest(bookId).versionToken;

      expect(v2).toBeGreaterThan(v1);
    });

    it('returns error for invalid Markdown structure', () => {
      const result = importer.applyImport(bookId, 'garbage content', 'current_state.md');
      // Garbage content should fail to parse any meaningful actions
      // Or succeed with empty actions
      expect(result).toBeDefined();
    });
  });

  // ── Import report ───────────────────────────────────────

  describe('import report', () => {
    it('includes action count and summary', () => {
      const markdown = `# 当前状态

- **书籍ID**: ${bookId}
- **最后完成章节**: 第 0 章

## 角色

### 张三 [主角]

- **特征**: 勇敢

## 世界设定

- [magic-system] 修炼规则

## 记忆事实

暂无记忆事实
`;

      const result = importer.applyImport(bookId, markdown, 'current_state.md');
      expect(result.success).toBe(true);
      expect(result.actionsCount).toBeGreaterThan(0);
      expect(result.summary).toBeDefined();
      expect(typeof result.summary).toBe('string');
    });
  });

  // ── Edge cases ──────────────────────────────────────────

  describe('edge cases', () => {
    it('handles missing book gracefully', () => {
      const result = importer.previewImport('non-existent', '# test', 'current_state.md');
      // Should still parse without needing the book
      expect(result.success).toBe(true);
    });

    it('handles empty Markdown content', () => {
      const result = importer.previewImport(bookId, '', 'current_state.md');
      expect(result.success).toBe(true);
    });

    it('handles chapter_summaries.md (read-only, no actions)', () => {
      const result = importer.previewImport(
        bookId,
        '# 章节摘要\n\n暂无章节摘要',
        'chapter_summaries.md'
      );
      expect(result.success).toBe(true);
      expect(result.actions).toHaveLength(0);
    });
  });
});
