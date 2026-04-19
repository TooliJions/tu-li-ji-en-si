import * as fs from 'fs';
import * as path from 'path';
import type { Manifest } from '../models/state';
import { StateManager } from './manager';

// ─── RuntimeStateStore ────────────────────────────────────────────
// 负责运行时状态的加载、保存和版本管理。
// 状态存储在 story/state/ 目录下，以 manifest.json 为核心文件。

export interface FullState {
  bookId: string;
  versionToken: number;
  hooks: Manifest['hooks'];
  facts: Manifest['facts'];
  characters: Manifest['characters'];
  worldRules: Manifest['worldRules'];
  lastChapterWritten: number;
  currentFocus?: string;
}

export class RuntimeStateStore {
  private manager: StateManager;

  constructor(manager: StateManager) {
    this.manager = manager;
  }

  // ── State Path ────────────────────────────────────────────

  private getStateDir(bookId: string): string {
    return this.manager.getBookPath(bookId, 'story', 'state');
  }

  private getManifestPath(bookId: string): string {
    return path.join(this.getStateDir(bookId), 'manifest.json');
  }

  // ── Check Existence ──────────────────────────────────────

  /**
   * 检查书籍是否已有运行时状态。
   */
  hasState(bookId: string): boolean {
    return fs.existsSync(this.getManifestPath(bookId));
  }

  // ── Initialize ───────────────────────────────────────────

  /**
   * 初始化一本书的运行时状态（空集合，versionToken = 1）。
   */
  initializeBookState(bookId: string): void {
    const stateDir = this.getStateDir(bookId);
    fs.mkdirSync(stateDir, { recursive: true });

    const manifest: Manifest = {
      bookId,
      versionToken: 1,
      lastChapterWritten: 0,
      hooks: [],
      facts: [],
      characters: [],
      worldRules: [],
      updatedAt: new Date().toISOString(),
    };

    this.writeManifest(bookId, manifest);
  }

  // ── Load ─────────────────────────────────────────────────

  /**
   * 从磁盘加载 manifest.json。
   */
  loadManifest(bookId: string): Manifest {
    const manifestPath = this.getManifestPath(bookId);
    const raw = fs.readFileSync(manifestPath, 'utf-8');
    return JSON.parse(raw) as Manifest;
  }

  /**
   * 加载完整运行时状态（manifest 的便捷访问形式）。
   */
  loadFullState(bookId: string): FullState {
    const manifest = this.loadManifest(bookId);
    return {
      bookId: manifest.bookId,
      versionToken: manifest.versionToken,
      hooks: manifest.hooks,
      facts: manifest.facts,
      characters: manifest.characters,
      worldRules: manifest.worldRules,
      lastChapterWritten: manifest.lastChapterWritten,
      currentFocus: manifest.currentFocus,
    };
  }

  // ── Save ─────────────────────────────────────────────────

  /**
   * 保存运行时状态快照到 story/state/manifest.json。
   * 自动递增 versionToken 并更新 updatedAt。
   */
  saveRuntimeStateSnapshot(
    bookId: string,
    state: Partial<Manifest> & Pick<Manifest, 'bookId'>
  ): void {
    const existing = this.hasState(bookId) ? this.loadManifest(bookId) : null;

    const manifest: Manifest = {
      bookId: state.bookId,
      versionToken: existing ? existing.versionToken + 1 : 1,
      lastChapterWritten: state.lastChapterWritten ?? existing?.lastChapterWritten ?? 0,
      currentFocus: state.currentFocus ?? existing?.currentFocus,
      hooks: state.hooks ?? existing?.hooks ?? [],
      facts: state.facts ?? existing?.facts ?? [],
      characters: state.characters ?? existing?.characters ?? [],
      worldRules: state.worldRules ?? existing?.worldRules ?? [],
      updatedAt: new Date().toISOString(),
    };

    this.writeManifest(bookId, manifest);
  }

  // ── Internal ─────────────────────────────────────────────

  private writeManifest(bookId: string, manifest: Manifest): void {
    const stateDir = this.getStateDir(bookId);
    fs.mkdirSync(stateDir, { recursive: true });

    const manifestPath = this.getManifestPath(bookId);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  }
}
