import * as fs from 'fs';
import * as path from 'path';
import { StateManager } from './manager';
import { RuntimeStateStore } from './runtime-store';
import { ProjectionRenderer } from './projections';
import type { Manifest } from '../models/state';

// ─── Types ─────────────────────────────────────────────────────

export type SyncIssueType =
  | 'hash_mismatch'
  | 'markdown_newer'
  | 'missing_projection'
  | 'missing_hash';

export type SyncSeverity = 'warning' | 'error' | 'critical';

export interface SyncIssue {
  file: string;
  type: SyncIssueType;
  severity: SyncSeverity;
  description: string;
}

export interface SyncReport {
  bookId: string;
  timestamp: string;
  isInSync: boolean;
  issues: SyncIssue[];
}

export interface DiffFileEntry {
  file: string;
  status: 'modified' | 'missing' | 'extra';
  expectedContent?: string;
  actualContent?: string;
}

export interface DiffReport {
  bookId: string;
  inSync: boolean;
  files: DiffFileEntry[];
}

export interface DeltaAction {
  type: string;
  payload: Record<string, unknown>;
}

export interface MarkdownDelta {
  sourceFile: string;
  actions: DeltaAction[];
}

// ─── Projection file list ───────────────────────────────────

const PROJECTION_FILES = ['current_state.md', 'hooks.md', 'chapter_summaries.md'];

// ─── SyncValidator ─────────────────────────────────────────────

export class SyncValidator {
  private manager: StateManager;
  private store: RuntimeStateStore;

  constructor(manager: StateManager, store: RuntimeStateStore) {
    this.manager = manager;
    this.store = store;
  }

  /**
   * 检查 JSON 与 Markdown 投影的同步状态。
   */
  checkSync(bookId: string): SyncReport {
    const stateDir = this.manager.getBookPath(bookId, 'story', 'state');
    const report: SyncReport = {
      bookId,
      timestamp: new Date().toISOString(),
      isInSync: true,
      issues: [],
    };

    const hashPath = path.join(stateDir, '.state-hash');
    if (!fs.existsSync(hashPath)) {
      report.isInSync = false;
      report.issues.push({
        file: '.state-hash',
        type: 'missing_hash',
        severity: 'error',
        description: '状态哈希文件缺失，无法检测同步状态',
      });
    }

    for (const file of PROJECTION_FILES) {
      const filePath = path.join(stateDir, file);
      if (!fs.existsSync(filePath)) {
        report.isInSync = false;
        report.issues.push({
          file,
          type: 'missing_projection',
          severity: 'error',
          description: `投影文件 ${file} 缺失`,
        });
      }
    }

    const manifest = this.store.loadManifest(bookId);
    const currentHash = ProjectionRenderer.computeStateHash(manifest);

    if (fs.existsSync(hashPath)) {
      const storedHash = fs.readFileSync(hashPath, 'utf-8').trim();
      if (storedHash !== currentHash) {
        report.isInSync = false;
        report.issues.push({
          file: '.state-hash',
          type: 'hash_mismatch',
          severity: 'warning',
          description: 'JSON 状态已变更但未重新投影 Markdown',
        });
        this.#checkMtimeDrift(stateDir, report);
      }
    }

    return report;
  }

  #checkMtimeDrift(stateDir: string, report: SyncReport): void {
    const manifestPath = path.join(stateDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) return;

    const manifestStat = fs.statSync(manifestPath);

    for (const file of PROJECTION_FILES) {
      const filePath = path.join(stateDir, file);
      if (!fs.existsSync(filePath)) continue;

      const mdStat = fs.statSync(filePath);
      const driftMs = mdStat.mtimeMs - manifestStat.mtimeMs;
      if (driftMs > 5000) {
        report.issues.push({
          file,
          type: 'markdown_newer',
          severity: 'warning',
          description: `${file} 比 JSON 状态更新（可能存在手动编辑）`,
        });
      }
    }
  }

  /**
   * 生成 Markdown 与预期投影的差异报告。
   */
  generateDiff(bookId: string): DiffReport {
    const stateDir = this.manager.getBookPath(bookId, 'story', 'state');
    const result: DiffReport = {
      bookId,
      inSync: true,
      files: [],
    };

    const manifest = this.store.loadManifest(bookId);

    for (const file of PROJECTION_FILES) {
      const filePath = path.join(stateDir, file);
      const expected = this.#getExpectedContent(manifest, file);

      if (!fs.existsSync(filePath)) {
        result.inSync = false;
        result.files.push({ file, status: 'missing', expectedContent: expected });
        continue;
      }

      const actual = fs.readFileSync(filePath, 'utf-8');
      if (expected && actual !== expected) {
        result.inSync = false;
        result.files.push({
          file,
          status: 'modified',
          expectedContent: expected,
          actualContent: actual,
        });
      }
    }

    return result;
  }

  #getExpectedContent(manifest: Manifest, file: string): string | undefined {
    switch (file) {
      case 'current_state.md':
        return ProjectionRenderer.renderCurrentState(manifest);
      case 'hooks.md':
        return ProjectionRenderer.renderHooks(manifest);
      case 'chapter_summaries.md':
        return ProjectionRenderer.renderChapterSummaries([]);
      default:
        return undefined;
    }
  }

  /**
   * 从 Markdown 内容字符串中解析变更，生成 JSON Delta（不依赖文件系统）。
   */
  static parseMarkdownContent(content: string, file: string): MarkdownDelta | null {
    switch (file) {
      case 'current_state.md':
        return SyncValidator.#parseCurrentState(content, file);
      case 'hooks.md':
        return SyncValidator.#parseHooks(content, file);
      case 'chapter_summaries.md':
        return SyncValidator.#parseChapterSummaries(content, file);
      default:
        return null;
    }
  }

  /**
   * 从 Markdown 文件中解析变更，生成 JSON Delta。
   */
  parseMarkdownDelta(bookId: string, file: string): MarkdownDelta | null {
    const stateDir = this.manager.getBookPath(bookId, 'story', 'state');
    const filePath = path.join(stateDir, file);
    if (!fs.existsSync(filePath)) return null;

    const content = fs.readFileSync(filePath, 'utf-8');
    return SyncValidator.parseMarkdownContent(content, file);
  }

  static #parseCurrentState(content: string, file: string): MarkdownDelta {
    const actions: DeltaAction[] = [];

    // Parse focus
    const focusMatch = content.match(/## 当前焦点\s*\n\n([\s\S]*?)(?=\n##)/);
    if (focusMatch) {
      const focus = focusMatch[1].trim();
      if (focus) {
        actions.push({ type: 'set_focus', payload: { focus } });
      }
    }

    // Parse characters
    const charRegex = /### (.+?) \[(.+?)\]\s*\n([\s\S]*?)(?=### |## 世界设定|## 记忆事实|$)/g;
    let charMatch: RegExpExecArray | null;
    while ((charMatch = charRegex.exec(content)) !== null) {
      const name = charMatch[1].trim();
      const roleLabel = charMatch[2].trim();
      const details = charMatch[3];

      const roleMap: Record<string, string> = {
        主角: 'protagonist',
        反派: 'antagonist',
        配角: 'supporting',
        路人: 'minor',
      };

      const traits: string[] = [];
      const traitsMatch = details.match(/\*\*特征\*\*:\s*(.+)/);
      if (traitsMatch) {
        traits.push(...traitsMatch[1].split('、').map((t) => t.trim()));
      }

      let arc: string | undefined;
      const arcMatch = details.match(/\*\*角色弧光\*\*:\s*(.+)/);
      if (arcMatch) arc = arcMatch[1].trim();

      actions.push({
        type: 'add_character',
        payload: { name, role: roleMap[roleLabel] ?? roleLabel, traits, arc, relationships: {} },
      });
    }

    // Parse world rules
    const ruleRegex = /- \[(.+?)\] (.+)/g;
    let ruleMatch: RegExpExecArray | null;
    while ((ruleMatch = ruleRegex.exec(content)) !== null) {
      actions.push({
        type: 'add_world_rule',
        payload: { category: ruleMatch[1].trim(), rule: ruleMatch[2].trim(), exceptions: [] },
      });
    }

    return { sourceFile: file, actions };
  }

  static #parseHooks(content: string, file: string): MarkdownDelta {
    const actions: DeltaAction[] = [];

    const hookRegex = /### (.+)/g;
    let hookMatch: RegExpExecArray | null;
    while ((hookMatch = hookRegex.exec(content)) !== null) {
      const description = hookMatch[1].trim();
      if (description === '伏笔追踪') continue;

      const rest = content.substring(hookMatch.index);
      const lines = rest.split('\n').slice(1, 10);
      const priorityMatch = lines.find((l) => l.includes('优先级'));
      const priority = priorityMatch
        ? priorityMatch.includes('critical')
          ? 'critical'
          : priorityMatch.includes('major')
            ? 'major'
            : 'minor'
        : 'minor';

      const chapterMatch = lines.find((l) => l.includes('埋设章节'));
      const plantedCh = chapterMatch
        ? parseInt(chapterMatch.match(/第 (\d+) 章/)?.[1] ?? '1', 10)
        : 1;

      actions.push({
        type: 'add_hook',
        payload: {
          description,
          type: 'narrative',
          status: 'open',
          priority,
          plantedCh,
          relatedCharacters: [],
          relatedChapters: [],
        },
      });
    }

    return { sourceFile: file, actions };
  }

  static #parseChapterSummaries(content: string, file: string): MarkdownDelta {
    // Chapter summaries are read-only from SQLite
    return { sourceFile: file, actions: [] };
  }

  /**
   * 重新投影 Markdown 从 JSON，修复同步状态。
   */
  fixSync(bookId: string): void {
    const stateDir = this.manager.getBookPath(bookId, 'story', 'state');
    const manifest = this.store.loadManifest(bookId);
    ProjectionRenderer.writeProjectionFiles(manifest, stateDir, []);
  }
}
