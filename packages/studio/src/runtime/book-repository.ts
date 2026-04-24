import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  StateManager,
  RuntimeStateStore,
  ProjectionRenderer,
  type Manifest,
} from '@cybernovelist/core';
import { getStudioRuntimeRootDir } from './runtime-config';
import { getStudioDaemon, clearStudioDaemon } from '../daemon/daemon-registry';

export interface StudioRuntimeBookRecord {
  id: string;
  title: string;
  genre: string;
  targetWords: number;
  targetChapterCount: number;
  targetWordsPerChapter: number;
  currentWords: number;
  chapterCount: number;
  status: 'active' | 'archived';
  language: string;
  platform: string;
  brief?: string;
  expandedBrief?: string;
  planningBrief?: string;
  createdAt: string;
  updatedAt: string;
  fanficMode: string | null;
  promptVersion: string;
  modelConfig: {
    useGlobalDefaults: boolean;
    writer: string;
    auditor: string;
    planner: string;
  };
}

type RuntimeDirectoryEntry = {
  name: string;
  isDirectory(): boolean;
};

function buildInitialManifest(bookId: string): Manifest {
  const rootDir = getStudioRuntimeRootDir();
  const manager = new StateManager(rootDir);
  const stateStore = new RuntimeStateStore(manager);
  return stateStore.loadManifest(bookId);
}

export function loadBookManifest(bookId: string): Manifest {
  return buildInitialManifest(bookId);
}

export function saveBookManifest(bookId: string, manifest: Manifest): void {
  const manager = new StateManager(getStudioRuntimeRootDir());
  const store = new RuntimeStateStore(manager);
  store.saveRuntimeStateSnapshot(bookId, manifest);
}

function syncBookRuntimeWithIndex(book: StudioRuntimeBookRecord): StudioRuntimeBookRecord {
  const indexPath = path.join(getStudioRuntimeRootDir(), book.id, 'story', 'state', 'index.json');
  if (!fs.existsSync(indexPath)) {
    return book;
  }

  try {
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8')) as {
      totalWords?: number;
      totalChapters?: number;
    };
    return {
      ...book,
      currentWords: typeof index.totalWords === 'number' ? index.totalWords : book.currentWords,
      chapterCount:
        typeof index.totalChapters === 'number' ? index.totalChapters : book.chapterCount,
    };
  } catch (err) {
    console.warn('[book-repository] Failed to sync book runtime with index:', book.id, err);
    return book;
  }
}

export function hasStudioBookRuntime(bookId: string): boolean {
  return fs.existsSync(path.join(getStudioRuntimeRootDir(), bookId, 'book.json'));
}

export function initializeStudioBookRuntime(book: StudioRuntimeBookRecord): void {
  const rootDir = getStudioRuntimeRootDir();
  const manager = new StateManager(rootDir);
  const stateStore = new RuntimeStateStore(manager);

  if (hasStudioBookRuntime(book.id)) {
    throw new Error(`书籍「${book.id}」已存在`);
  }

  manager.ensureBookStructure(book.id);
  stateStore.initializeBookState(book.id);

  const bookDir = manager.getBookPath(book.id);
  const now = book.updatedAt;
  fs.writeFileSync(path.join(bookDir, 'book.json'), JSON.stringify(book, null, 2), 'utf-8');
  fs.writeFileSync(
    path.join(bookDir, 'meta.json'),
    JSON.stringify(
      {
        title: book.title,
        genre: book.genre,
        synopsis: book.brief ?? `${book.title} 的创作概要`,
        tone: '',
        targetAudience: '',
        platform: book.platform,
        language: book.language,
        promptVersion: book.promptVersion,
        modelConfig: book.modelConfig,
        targetChapterCount: book.targetChapterCount,
        targetWords: book.targetWords,
        targetWordsPerChapter: book.targetWordsPerChapter,
        createdAt: book.createdAt,
      },
      null,
      2
    ),
    'utf-8'
  );

  manager.writeIndex(book.id, {
    bookId: book.id,
    chapters: [],
    totalChapters: 0,
    totalWords: 0,
    lastUpdated: now,
  });

  const placeholderChapter = manager.getBookPath(book.id, 'story', 'chapters', 'chapter-0000.md');
  fs.writeFileSync(placeholderChapter, '', 'utf-8');

  const manifest = buildInitialManifest(book.id);
  ProjectionRenderer.writeProjectionFiles(
    manifest,
    manager.getBookPath(book.id, 'story', 'state'),
    []
  );
}

export function updateStudioBookRuntime(book: StudioRuntimeBookRecord): void {
  if (!hasStudioBookRuntime(book.id)) {
    return;
  }

  const bookDir = path.join(getStudioRuntimeRootDir(), book.id);
  fs.writeFileSync(path.join(bookDir, 'book.json'), JSON.stringify(book, null, 2), 'utf-8');

  const metaPath = path.join(bookDir, 'meta.json');
  const currentMeta = fs.existsSync(metaPath)
    ? (JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as Record<string, unknown>)
    : {};

  fs.writeFileSync(
    metaPath,
    JSON.stringify(
      {
        ...currentMeta,
        title: book.title,
        genre: book.genre,
        language: book.language,
        platform: book.platform,
        promptVersion: book.promptVersion,
        modelConfig: book.modelConfig,
        targetChapterCount: book.targetChapterCount,
        targetWords: book.targetWords,
        targetWordsPerChapter: book.targetWordsPerChapter,
        synopsis:
          typeof currentMeta.synopsis === 'string' ? currentMeta.synopsis : (book.brief ?? ''),
      },
      null,
      2
    ),
    'utf-8'
  );
}

export function deleteStudioBookRuntime(bookId: string): void {
  const daemon = getStudioDaemon(bookId);
  daemon?.stop();
  clearStudioDaemon(bookId);
  fs.rmSync(path.join(getStudioRuntimeRootDir(), bookId), { recursive: true, force: true });
}

export function readStudioBookRuntime(bookId: string): StudioRuntimeBookRecord | null {
  const bookPath = path.join(getStudioRuntimeRootDir(), bookId, 'book.json');
  if (!fs.existsSync(bookPath)) {
    return null;
  }
  const book = JSON.parse(fs.readFileSync(bookPath, 'utf-8')) as StudioRuntimeBookRecord;
  return syncBookRuntimeWithIndex(book);
}

export function listStudioBookRuntimes(): StudioRuntimeBookRecord[] {
  return fs
    .readdirSync(getStudioRuntimeRootDir(), { withFileTypes: true })
    .filter((entry: RuntimeDirectoryEntry) => entry.isDirectory())
    .map((entry: RuntimeDirectoryEntry) => readStudioBookRuntime(entry.name))
    .filter(
      (book: StudioRuntimeBookRecord | null): book is StudioRuntimeBookRecord => book !== null
    )
    .sort((left: StudioRuntimeBookRecord, right: StudioRuntimeBookRecord) =>
      right.updatedAt.localeCompare(left.updatedAt)
    );
}
