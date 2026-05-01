import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { DefaultChapterComposer } from './chapter-composer';
import { StateManager } from '../../state/manager';
import { RuntimeStateStore } from '../../state/runtime-store';
import { agentRegistry } from '../../agents/registry';
import { ContextCard } from '../../agents/context-card';
import { ChapterExecutor } from '../../agents/executor';
import type { LLMProvider } from '../../llm/provider';
import type { TelemetryLogger } from '../../telemetry/logger';

describe('DefaultChapterComposer', () => {
  let tmpDir: string;
  let stateManager: StateManager;
  let stateStore: RuntimeStateStore;
  let composer: DefaultChapterComposer;

  const mockProvider: LLMProvider = {
    generate: vi.fn().mockResolvedValue({
      text: '生成的章节内容',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    }),
    generateJSON: vi.fn().mockResolvedValue({
      fixes: [],
      revisedContent: '修订后内容',
      summary: '修订总结',
    }),
    generateJSONWithMeta: vi.fn(),
    generateStream: vi.fn(),
    config: { model: 'test', apiKey: 'test' },
  } as unknown as LLMProvider;

  const mockTelemetry: TelemetryLogger = {
    record: vi.fn(),
    read: vi.fn(),
    listBookTelemetry: vi.fn(),
  };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(process.env.TEMP ?? '/tmp', 'composer-test-'));
    stateManager = new StateManager(tmpDir);
    stateStore = new RuntimeStateStore(stateManager);
    composer = new DefaultChapterComposer({
      provider: mockProvider,
      stateManager,
      stateStore,
      telemetryLogger: mockTelemetry,
      maxRevisionRetries: 2,
      fallbackAction: 'accept_with_warnings',
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('书籍不存在返回错误', async () => {
    const result = await composer.compose({
      bookId: 'no-book',
      chapterNumber: 1,
      title: '第一章',
      genre: 'xianxia',
      userIntent: '测试',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('不存在');
  });

  it('compose 生成 rule-stack.yaml', async () => {
    const bookId = 'book-rulestack-test';
    stateManager.ensureBookStructure(bookId);
    stateStore.initializeBookState(bookId);

    // 写入 meta.json
    fs.writeFileSync(
      stateManager.getBookPath(bookId, 'meta.json'),
      JSON.stringify({ genre: 'xianxia', title: '测试书' }),
      'utf-8',
    );

    // 注册 mock agents
    agentRegistry.register('context-card', (p) => new ContextCard(p));
    agentRegistry.register('chapter-executor', (p) => new ChapterExecutor(p));

    await composer.compose({
      bookId,
      chapterNumber: 1,
      title: '第一章',
      genre: 'xianxia',
      userIntent: '测试',
    });

    // 无论 compose 成功或失败，rule-stack.yaml 都应该被生成
    const ruleStackPath = stateManager.getBookPath(bookId, 'story', 'state', 'rule-stack.yaml');
    expect(fs.existsSync(ruleStackPath)).toBe(true);

    const yamlContent = fs.readFileSync(ruleStackPath, 'utf-8');
    expect(yamlContent).toContain('bookId: ' + bookId);
    expect(yamlContent).toContain('rules:');
  });
});
