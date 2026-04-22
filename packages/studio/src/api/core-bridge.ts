/// <reference types="node" />

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  LLMProvider,
  PipelineRunner,
  StateManager,
  RuntimeStateStore,
  ProjectionRenderer,
  RoutedLLMProvider,
  type LLMRequest,
  type LLMResponse,
  type LLMResponseWithJSON,
  type LLMStreamChunk,
  type Manifest,
  type DaemonScheduler,
} from '@cybernovelist/core';

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

const TEMP_RUNTIME_PREFIX = 'cybernovelist-studio-';

type RuntimeDirectoryEntry = {
  name: string;
  isDirectory(): boolean;
};

function resolveDefaultRuntimeRoot(): string {
  const cwd = process.cwd();
  let dir = cwd;
  const fsRoot = path.parse(dir).root;
  while (dir !== fsRoot) {
    const pkgPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { name?: string };
        if (pkg.name === '@cybernovelist/studio') {
          return path.join(dir, '.runtime');
        }
      } catch {
        // ignore malformed package.json and keep walking up
      }
    }
    dir = path.dirname(dir);
  }
  return path.join(cwd, 'packages', 'studio', '.runtime');
}

const DEFAULT_RUNTIME_ROOT =
  process.env.CYBERNOVELIST_STUDIO_RUNTIME_DIR ?? resolveDefaultRuntimeRoot();

let runtimeRootDir = DEFAULT_RUNTIME_ROOT;
let pipelineRunner: PipelineRunner | null = null;
let llmProvider: LLMProvider | null = null;

const daemonRegistry = new Map<string, DaemonScheduler>();

class DeterministicProvider extends LLMProvider {
  constructor() {
    super({
      apiKey: 'deterministic',
      baseURL: 'http://localhost/deterministic',
      model: 'deterministic-provider',
    });
  }

  async generate(request: LLMRequest): Promise<LLMResponse> {
    const text = this.#buildTextResponse(request.prompt);
    return {
      text,
      usage: estimateUsage(request.prompt, text),
      model: this.config.model,
    };
  }

  async generateJSON<T>(request: LLMRequest): Promise<T> {
    return this.#buildJsonResponse(request.prompt) as T;
  }

  async generateJSONWithMeta<T>(request: LLMRequest): Promise<LLMResponseWithJSON<T>> {
    const data = this.#buildJsonResponse(request.prompt) as T;
    const text = JSON.stringify(data);
    return {
      data,
      usage: estimateUsage(request.prompt, text),
      model: this.config.model,
    };
  }

  async *generateStream(request: LLMRequest): AsyncIterable<LLMStreamChunk> {
    const text = this.#buildTextResponse(request.prompt);
    const words = text.split(' ');
    for (const word of words) {
      yield { text: word + ' ', done: false };
    }
    yield { text: '', done: true };
  }

  #buildTextResponse(prompt: string): string {
    if (prompt.includes('请根据以下审计问题修订章节内容')) {
      const currentContent = extractSection(prompt, '## 当前内容');
      return `${currentContent}\n\n【修订完成】逻辑已校正，表达已收束。`.trim();
    }

    if (prompt.includes('文字润色师')) {
      const draft = extractSection(prompt, '## 初稿内容');
      return `${draft}\n\n【润色补强】场景层次更清晰，情绪递进更稳定。`.trim();
    }

    const chapterNumber = extractChapterNumber(prompt);
    const title = extractLineValue(prompt, '- **章节**:') ?? `第 ${chapterNumber} 章`;
    const sceneDescription =
      extractLineValue(prompt, '- **场景描述**:') ??
      extractSection(prompt, '## 用户意图') ??
      '主角继续推进主线';

    return [
      `${title}`,
      '',
      `夜色压低了城南长街的回声，${sceneDescription}。`,
      '主角先压住情绪，再顺着线索做出更稳妥的判断，让冲突不是突然爆发，而是层层逼近。',
      '对话尽量短促，信息逐步揭示，留出一个能推动下一章的尾钩。',
    ].join('\n');
  }

  #buildJsonResponse(prompt: string): unknown {
    const chapterNumber = extractChapterNumber(prompt);

    if (prompt.includes('世界观构建师')) {
      return {
        currentFocus: '核心矛盾：竞赛推荐名额只有一个；成长主线：主角从自我怀疑走向主动承担。',
        centralConflict: '竞赛推荐名额只有一个，主角必须在家庭压力和校园竞争中争出资格。',
        growthArc: '主角从自我怀疑走向主动承担，学会把天赋转化为责任。',
        worldRules: ['校园竞赛采用淘汰制，校内仅 1 个推荐名额。', '现实向校园环境，无超自然设定。'],
        hooks: ['全国竞赛推荐名单即将公布', '家庭对主角参赛并不支持'],
      };
    }

    if (prompt.includes('大纲策划师')) {
      return {
        acts: [
          {
            actNumber: 1,
            title: '重新入局',
            summary: '主角重返竞赛体系，被迫重新证明自己。',
            chapters: [
              {
                chapterNumber: 1,
                title: '重返考场',
                summary: '主角在首次测验中崭露头角，重新被老师注意。',
              },
              {
                chapterNumber: 2,
                title: '名额之争',
                summary: '校内竞赛名额争夺正式启动。',
              },
            ],
          },
          {
            actNumber: 2,
            title: '压力升级',
            summary: '家庭与校园双重压力挤压主角成长空间。',
            chapters: [
              {
                chapterNumber: 3,
                title: '资格赛前夜',
                summary: '主角在崩溃边缘选择继续挑战。',
              },
            ],
          },
          {
            actNumber: 3,
            title: '逆袭兑现',
            summary: '主角完成成长并在更大舞台兑现自己。',
            chapters: [
              {
                chapterNumber: 4,
                title: '全国赛开场',
                summary: '主角正式进入更大的竞技舞台。',
              },
            ],
          },
        ],
      };
    }

    if (prompt.includes('角色设计师')) {
      return {
        characters: [
          {
            name: '林晨',
            role: 'protagonist',
            traits: ['克制', '好胜', '敏锐'],
            background: '一次失利让他跌入低谷，但也逼着他重新进入竞赛体系。',
            abilities: ['竞赛解题', '高压专注'],
            relationships: {
              王老师: '赏识他的伯乐',
              苏小雨: '理解他处境的同桌盟友',
            },
            arc: '从自我怀疑到主动承担，学会把天赋转化为责任。',
          },
          {
            name: '王老师',
            role: 'supporting',
            traits: ['严格', '克制', '果断'],
            background: '竞赛组老师，在主角身上看到了重新下注的可能。',
            abilities: ['识别潜力', '资源调度'],
            relationships: {
              林晨: '重点观察与培养对象',
            },
            arc: '从谨慎观望到公开押注主角。',
          },
          {
            name: '苏小雨',
            role: 'supporting',
            traits: ['冷静', '细腻', '坚定'],
            background: '主角的同桌，最早看见他脆弱与锋芒并存的一面。',
            abilities: ['信息整合', '情绪支持'],
            relationships: {
              林晨: '并肩成长的同桌盟友',
            },
            arc: '从旁观者变成主角的重要支持者。',
          },
        ],
      };
    }

    if (prompt.includes('章节策划师')) {
      return {
        plan: {
          chapterNumber,
          title: '竞赛邀约',
          intention: '主角在首次测验后被竞赛老师单独约谈，正式进入名额竞争。',
          wordCountTarget: 3000,
          characters: ['林晨', '王老师'],
          keyEvents: ['测验结果公布', '老师单独约谈'],
          hooks: [
            {
              description: '全国竞赛推荐名单即将公布',
              type: 'plot',
              priority: 'major',
            },
          ],
          worldRules: ['校园竞赛采用淘汰制，校内仅 1 个推荐名额。'],
          emotionalBeat: '压抑→绷紧→燃起斗志',
          sceneTransition: '从校园日常切入正式竞争线，并给下一章留下名单悬念。',
        },
      };
    }

    if (prompt.includes('大纲规划师')) {
      return {
        chapterNumber,
        title: `第 ${chapterNumber} 章 转折出现`,
        summary: `第 ${chapterNumber} 章围绕主线冲突推进，并埋入新的疑点。`,
        keyEvents: ['发现新线索', '与对手正面碰撞'],
        targetWordCount: 3000,
        hooks: [],
      };
    }

    if (prompt.includes('场景规划师')) {
      return {
        scenes: [
          { description: '主角梳理线索并进入关键场景', targetWords: 1200, mood: '压迫' },
          { description: '与阻碍者交锋，推进主线', targetWords: 1800, mood: '紧张' },
        ],
        characters: ['主角', '关键对手'],
        hooks: [],
      };
    }

    if (prompt.includes('上下文整理师')) {
      return {
        summary: `已完成至第 ${Math.max(chapterNumber - 1, 0)} 章，当前主线正在收束旧问题并引出新矛盾。`,
        activeHooks: [],
        characterStates: ['主角保持警惕并主动调查'],
        locationContext: '核心冲突现场',
      };
    }

    if (prompt.includes('意图导演')) {
      const userIntent = extractSection(prompt, '## 用户意图') || `推进第 ${chapterNumber} 章主线`;
      return {
        chapterGoal: userIntent,
        keyScenes: ['线索确认', '短兵相接'],
        emotionalArc: '由克制转为决断',
        hookProgression: [],
      };
    }

    if (prompt.includes('质量审计师')) {
      return {
        issues: [],
        overallScore: 92,
        status: 'pass',
        summary: '结构完整，角色与情节一致。',
      };
    }

    if (prompt.includes('记忆提取师')) {
      return {
        facts: [
          {
            content: `第 ${chapterNumber} 章推进了核心剧情并确认新的线索。`,
            category: 'plot',
            confidence: 'high',
          },
        ],
        newHooks: [],
        updatedHooks: [],
      };
    }

    return {};
  }
}

function estimateUsage(prompt: string, text: string) {
  const promptTokens = Math.max(24, Math.ceil(prompt.length / 4));
  const completionTokens = Math.max(32, Math.ceil(text.length / 4));
  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
  };
}

function extractChapterNumber(prompt: string): number {
  const match = /第\s*(\d+)\s*章/.exec(prompt);
  return match ? Number.parseInt(match[1], 10) : 1;
}

function extractLineValue(prompt: string, label: string): string | undefined {
  const line = prompt.split('\n').find((entry) => entry.trimStart().startsWith(label));
  if (!line) {
    return undefined;
  }
  return line.slice(line.indexOf(label) + label.length).trim();
}

function extractSection(prompt: string, heading: string): string {
  const start = prompt.indexOf(heading);
  if (start === -1) {
    return '';
  }

  const body = prompt.slice(start + heading.length).trimStart();
  const nextHeadingIndex = body.indexOf('\n## ');
  return (nextHeadingIndex === -1 ? body : body.slice(0, nextHeadingIndex)).trim();
}

function isManagedTempDir(dirPath: string): boolean {
  return path.basename(dirPath).startsWith(TEMP_RUNTIME_PREFIX);
}

function ensureRuntimeRoot(): void {
  fs.mkdirSync(runtimeRootDir, { recursive: true });
}

function buildInitialManifest(bookId: string): Manifest {
  const manager = new StateManager(runtimeRootDir);
  const stateStore = new RuntimeStateStore(manager);
  return stateStore.loadManifest(bookId);
}

export function getStudioRuntimeRootDir(): string {
  ensureRuntimeRoot();
  return runtimeRootDir;
}

export function getStudioPipelineRunner(): PipelineRunner {
  ensureRuntimeRoot();
  if (!pipelineRunner) {
    const provider = buildLLMProvider();
    pipelineRunner = new PipelineRunner({
      rootDir: runtimeRootDir,
      provider,
    });
  }
  return pipelineRunner;
}

function buildLLMProvider(): LLMProvider {
  // Try loading config from disk (same path as config router uses)
  const cfgPath = process.env.CONFIG_PATH
    ? path.resolve(process.env.CONFIG_PATH)
    : path.join(process.cwd(), '.cybernovelist-config.json');

  try {
    if (fs.existsSync(cfgPath)) {
      const raw = fs.readFileSync(cfgPath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed.providers && parsed.providers.length > 0) {
        // Filter providers that have apiKey configured
        const configuredProviders = parsed.providers.filter(
          (p: { apiKey: string; baseUrl: string; name: string }) => p.apiKey && p.baseUrl
        );

        if (configuredProviders.length > 0) {
          const routingConfig = {
            defaultProvider: parsed.defaultProvider || configuredProviders[0].name,
            defaultModel: parsed.defaultModel || configuredProviders[0].name,
            agentRouting: parsed.agentRouting || [],
            providers: configuredProviders.map(
              (p: { name: string; apiKey: string; baseUrl: string }) => ({
                name: p.name,
                config: {
                  apiKey: p.apiKey,
                  baseURL: p.baseUrl,
                  model: p.name,
                },
                status: 'connected' as const,
              })
            ),
          };
          return new RoutedLLMProvider(routingConfig);
        }
      }
    }
  } catch {
    // fall through to deterministic provider
  }

  // Fallback: no API keys configured, use deterministic mock
  return new DeterministicProvider();
}

export function getStudioLLMProvider(): LLMProvider {
  if (!llmProvider) {
    llmProvider = buildLLMProvider();
  }
  return llmProvider;
}

export function setStudioLLMProviderForTests(provider: LLMProvider | null): void {
  llmProvider = provider;
}

export function hasStudioBookRuntime(bookId: string): boolean {
  return fs.existsSync(path.join(getStudioRuntimeRootDir(), bookId, 'book.json'));
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
  } catch {
    return book;
  }
}

export function initializeStudioBookRuntime(book: StudioRuntimeBookRecord): void {
  ensureRuntimeRoot();
  const manager = new StateManager(runtimeRootDir);
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
  const daemon = daemonRegistry.get(bookId);
  daemon?.stop();
  daemonRegistry.delete(bookId);
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

export function setStudioDaemon(bookId: string, daemon: DaemonScheduler): void {
  daemonRegistry.get(bookId)?.stop();
  daemonRegistry.set(bookId, daemon);
}

export function getStudioDaemon(bookId: string): DaemonScheduler | undefined {
  return daemonRegistry.get(bookId);
}

export function clearStudioDaemon(bookId: string): void {
  daemonRegistry.delete(bookId);
}

export function resetStudioCoreBridgeForTests(rootDir?: string): void {
  for (const daemon of daemonRegistry.values()) {
    daemon.stop();
  }
  daemonRegistry.clear();
  pipelineRunner = null;
  llmProvider = null;

  if (isManagedTempDir(runtimeRootDir) && fs.existsSync(runtimeRootDir)) {
    fs.rmSync(runtimeRootDir, { recursive: true, force: true });
  }

  runtimeRootDir = rootDir ?? fs.mkdtempSync(path.join(os.tmpdir(), TEMP_RUNTIME_PREFIX));
  ensureRuntimeRoot();
}
