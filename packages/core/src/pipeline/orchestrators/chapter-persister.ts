import type { LLMProvider } from '../../llm/provider';
import type { StateManager } from '../../state/manager';
import type { RuntimeStateStore } from '../../state/runtime-store';
import type { Manifest } from '../../models/state';
import { extractMemory, persistChapterAtomic, updateStateAfterChapter } from '../runner-helpers';

// ─── Interfaces ──────────────────────────────────────────────────

export interface ChapterPersister {
  persist(input: PersistInput): Promise<PersistResult>;
}

export interface ChapterPersisterDeps {
  stateManager: StateManager;
  stateStore: RuntimeStateStore;
  provider: LLMProvider;
}

export interface PersistInput {
  bookId: string;
  chapterNumber: number;
  title: string;
  content: string;
  manifest: Manifest;
  warning?: string;
  warningCode?: 'accept_with_warnings' | 'context_drift';
}

export interface PersistResult {
  success: true;
  manifest: Manifest;
}

// ─── DefaultChapterPersister ─────────────────────────────────────

export class DefaultChapterPersister implements ChapterPersister {
  constructor(private deps: ChapterPersisterDeps) {}

  async persist(input: PersistInput): Promise<PersistResult> {
    const { stateManager, stateStore, provider } = this.deps;
    const {
      bookId,
      chapterNumber,
      title,
      content,
      manifest: initialManifest,
      warning,
      warningCode,
    } = input;

    // 1. 记忆提取（使用传入的 manifest）
    const manifestAfterMemory = await extractMemory(
      content,
      bookId,
      chapterNumber,
      provider,
      stateStore,
      initialManifest
    );
    const manifest = manifestAfterMemory ?? initialManifest;

    // 2. 原子持久化
    persistChapterAtomic(
      content,
      bookId,
      chapterNumber,
      title,
      'final',
      {
        warning,
        warningCode,
      },
      stateManager
    );

    // 3. 更新状态
    updateStateAfterChapter(
      bookId,
      chapterNumber,
      title,
      content,
      stateManager,
      stateStore,
      manifest
    );

    return { success: true, manifest };
  }
}
