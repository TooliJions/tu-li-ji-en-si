import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '../../agents/auto-register';
import * as fs from 'fs';
import * as path from 'path';
import { DefaultPlanOrchestrator } from './plan-orchestrator';
import { StateManager } from '../../state/manager';
import { RuntimeStateStore } from '../../state/runtime-store';
import type { LLMProvider } from '../../llm/provider';

describe('DefaultPlanOrchestrator', () => {
  let tmpDir: string;
  let stateManager: StateManager;
  let stateStore: RuntimeStateStore;
  let orchestrator: DefaultPlanOrchestrator;

  const mockProvider: LLMProvider = {
    generate: vi.fn(),
    generateJSON: vi.fn().mockResolvedValue({
      plan: {
        chapterNumber: 1,
        title: '第一章',
        intention: '开篇',
        wordCountTarget: 3000,
        characters: [],
        keyEvents: [],
        hooks: [],
        worldRules: [],
        emotionalBeat: '平稳',
        sceneTransition: '自然',
        sceneBreakdown: [],
        hookActions: [],
        pacingTag: 'slow_build',
      },
    }),
    generateJSONWithMeta: vi.fn(),
    generateStream: vi.fn(),
    config: { model: 'test', apiKey: 'test' },
  } as unknown as LLMProvider;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(process.env.TEMP ?? '/tmp', 'plan-test-'));
    stateManager = new StateManager(tmpDir);
    stateStore = new RuntimeStateStore(stateManager);
    orchestrator = new DefaultPlanOrchestrator({
      provider: mockProvider,
      stateManager,
      stateStore,
    });

    stateManager.ensureBookStructure('book-1');
    stateStore.initializeBookState('book-1');
    stateManager.writeIndex('book-1', {
      bookId: 'book-1',
      chapters: [],
      totalChapters: 0,
      totalWords: 0,
      lastUpdated: new Date().toISOString(),
    });
    fs.writeFileSync(
      stateManager.getBookPath('book-1', 'meta.json'),
      JSON.stringify({ genre: 'xianxia', title: '测试', synopsis: '简介' }),
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('成功规划单章', async () => {
    const result = await orchestrator.planChapter({
      bookId: 'book-1',
      chapterNumber: 1,
      userIntent: '写第一章',
    });

    expect(result.success).toBe(true);
    expect(result.chapterNumber).toBe(1);
  });

  it('章节号小于 1 返回错误', async () => {
    const result = await orchestrator.planChapter({
      bookId: 'book-1',
      chapterNumber: 0,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('必须从 1 开始');
  });

  it('书籍不存在返回错误', async () => {
    const result = await orchestrator.planChapter({
      bookId: 'no-book',
      chapterNumber: 1,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('不存在');
  });
});
