import { StateManager } from './manager';
import { RuntimeStateStore } from './runtime-store';
import { applyRuntimeStateDelta } from './reducer';
import { validateDelta } from './validator';
import { SyncValidator } from './sync-validator';
import { ProjectionRenderer } from './projections';
import type { Manifest } from '../models/state';

// ─── Types ─────────────────────────────────────────────────────

export interface ImportAction {
  type: string;
  payload: Record<string, unknown>;
}

export interface ImportResult {
  success: boolean;
  actions: ImportAction[];
  actionsCount: number;
  summary: string;
  newVersionToken?: number;
  errors?: string[];
}

export type ImportFileTarget = 'current_state.md' | 'hooks.md' | 'chapter_summaries.md';

// ─── StateImporter ─────────────────────────────────────────────
// 负责将手动编辑的 Markdown 导入为 JSON Delta 并应用到状态。
// 流程：解析 Markdown → 生成 Delta → Zod 校验 → 应用 → 重新投影

export class StateImporter {
  private manager: StateManager;
  private store: RuntimeStateStore;

  constructor(manager: StateManager, store: RuntimeStateStore) {
    this.manager = manager;
    this.store = store;
  }

  /**
   * 预览 Markdown 导入会产生什么变更，不实际修改状态。
   */
  previewImport(bookId: string, markdownContent: string, file: ImportFileTarget): ImportResult {
    const delta = SyncValidator.parseMarkdownContent(markdownContent, file);

    if (!delta) {
      return {
        success: false,
        actions: [],
        actionsCount: 0,
        summary: '无法解析 Markdown 文件',
        errors: ['无法解析文件，格式不支持'],
      };
    }

    return {
      success: true,
      actions: delta.actions,
      actionsCount: delta.actions.length,
      summary: this.#buildSummary(delta.actions),
    };
  }

  /**
   * 应用 Markdown 导入。
   * 解析 Delta → Zod 校验 → 应用 → 重新投影。
   */
  applyImport(bookId: string, markdownContent: string, file: ImportFileTarget): ImportResult {
    const preview = this.previewImport(bookId, markdownContent, file);
    if (!preview.success) return preview;
    if (preview.actions.length === 0) {
      return {
        success: true,
        actions: [],
        actionsCount: 0,
        summary: '无有效变更可导入',
      };
    }

    // Validate delta
    const deltaValidation = validateDelta({
      actions: preview.actions,
    });
    if (!deltaValidation.success) {
      return {
        success: false,
        actions: preview.actions,
        actionsCount: preview.actions.length,
        summary: 'Delta 校验失败',
        errors: deltaValidation.errors,
      };
    }

    // Apply delta to manifest
    const manifest = this.store.loadManifest(bookId);
    const updated = applyRuntimeStateDelta(manifest, {
      actions: preview.actions,
      sourceChapter: manifest.lastChapterWritten || undefined,
    });

    // Save updated manifest
    this.store.saveRuntimeStateSnapshot(bookId, updated);

    // Re-project Markdown (reload manifest to match what was actually saved)
    const stateDir = this.manager.getBookPath(bookId, 'story', 'state');
    const savedManifest = this.store.loadManifest(bookId);
    ProjectionRenderer.writeProjectionFiles(savedManifest, stateDir, []);

    return {
      success: true,
      actions: preview.actions,
      actionsCount: preview.actions.length,
      summary: preview.summary,
      newVersionToken: updated.versionToken,
    };
  }

  // ── Helpers ──────────────────────────────────────────────

  #buildSummary(actions: ImportAction[]): string {
    const counts: Record<string, number> = {};
    for (const action of actions) {
      counts[action.type] = (counts[action.type] || 0) + 1;
    }

    const typeLabels: Record<string, string> = {
      set_focus: '焦点',
      add_character: '角色',
      add_world_rule: '设定',
      add_hook: '伏笔',
    };

    const parts = Object.entries(counts).map(([type, count]) => {
      const label = typeLabels[type] ?? type;
      return `${count} 项${label}`;
    });

    if (parts.length === 0) return '无变更';
    return `导入 ${parts.join('、')}`;
  }
}
