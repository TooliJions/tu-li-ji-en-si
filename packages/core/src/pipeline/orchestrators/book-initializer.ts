import * as fs from 'fs';
import type { StateManager } from '../../state/manager';
import type { RuntimeStateStore } from '../../state/runtime-store';
import { ProjectionRenderer } from '../../state/projections';
import { isValidBookId } from '../../utils';
import type { InitBookInput, InitBookResult } from '../types';

// ─── Interfaces ──────────────────────────────────────────────────

export interface BookInitializer {
  initBook(input: InitBookInput): Promise<InitBookResult>;
}

export interface BookInitializerDeps {
  stateManager: StateManager;
  stateStore: RuntimeStateStore;
}

// ─── DefaultBookInitializer ──────────────────────────────────────

export class DefaultBookInitializer implements BookInitializer {
  constructor(private deps: BookInitializerDeps) {}

  async initBook(input: InitBookInput): Promise<InitBookResult> {
    const { stateManager, stateStore } = this.deps;

    // 输入校验
    if (!input.bookId || input.bookId.trim().length === 0) {
      return { success: false, bookId: '', error: 'bookId 不能为空' };
    }
    if (!isValidBookId(input.bookId)) {
      return {
        success: false,
        bookId: input.bookId,
        error: 'bookId 格式无效：仅允许字母、数字、下划线和连字符',
      };
    }
    if (!input.title || input.title.trim().length === 0) {
      return { success: false, bookId: input.bookId, error: '书名不能为空' };
    }
    if (!input.genre || input.genre.trim().length === 0) {
      return { success: false, bookId: input.bookId, error: '题材不能为空' };
    }
    if (!input.synopsis || input.synopsis.trim().length === 0) {
      return { success: false, bookId: input.bookId, error: '简介不能为空' };
    }

    // 检查是否已存在
    const bookPath = stateManager.getBookPath(input.bookId);
    if (fs.existsSync(bookPath)) {
      return { success: false, bookId: input.bookId, error: `书籍「${input.bookId}」已存在` };
    }

    // 创建目录结构
    stateManager.ensureBookStructure(input.bookId);

    // 初始化状态
    stateStore.initializeBookState(input.bookId);

    // 保存元数据（meta.json — API 兼容层）
    const metaPath = stateManager.getBookPath(input.bookId, 'meta.json');
    const metadata = {
      title: input.title,
      genre: input.genre,
      synopsis: input.synopsis,
      tone: input.tone ?? '',
      targetAudience: input.targetAudience ?? '',
      platform: input.platform ?? '',
      createdAt: new Date().toISOString(),
    };
    fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2), 'utf-8');

    // 同时写入 book.json（与 StateBootstrap 保持一致）
    const bookDataPath = stateManager.getBookPath(input.bookId, 'book.json');
    const bookData = {
      id: input.bookId,
      title: input.title,
      genre: input.genre,
      brief: input.synopsis,
      targetWords: 0,
      targetWordsPerChapter: 3000,
      currentWords: 0,
      chapterCount: 0,
      status: 'active',
      language: 'zh-CN',
      promptVersion: 'v2',
      fanficMode: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(bookDataPath, JSON.stringify(bookData, null, 2), 'utf-8');

    // 创建章节索引
    stateManager.writeIndex(input.bookId, {
      bookId: input.bookId,
      chapters: [],
      totalChapters: 0,
      totalWords: 0,
      lastUpdated: new Date().toISOString(),
    });

    // 写入初始投影文件
    const manifest = stateStore.loadManifest(input.bookId);
    const stateDir = stateManager.getBookPath(input.bookId, 'story', 'state');
    ProjectionRenderer.writeProjectionFiles(manifest, stateDir, []);

    return { success: true, bookId: input.bookId, bookDir: bookPath };
  }
}
