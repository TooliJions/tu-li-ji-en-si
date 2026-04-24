# CyberNovelist v7.0 架构重构计划

> 状态: **进行中** | 预估总工期: 5-7 天 | 风险等级: 中
>
> ## 当前进度
>
> | 任务 | 状态 | 备注 |
> |------|------|------|
> | 修复 ESM 构建/测试阻塞（`require('node:fs')`、动态 `require`） | ✅ 完成 | `provider-factory.ts`、`book-repository.ts` |
> | 修复 Studio 单元测试（BookCreate、Chapters PATCH、Daemon、InspirationShuffle） | ✅ 完成 | 核心 1757/1820，工作室 493/497 |
> | 阶段 1.1：分离 `DeterministicProvider` | ✅ 完成 | 已移至 `studio/src/llm/deterministic-provider.ts` |
> | 阶段 1.2：统一 SQLite (`sql.js` → `better-sqlite3`) | ⏭️ 跳过 | 环境 ABI 不匹配，已回滚并移除 `better-sqlite3` 依赖 |
> | 阶段 2.1：拆分 `core-bridge.ts` | ✅ 完成 | 从 974 行 → 85 行，已拆分为 `book-repository`、`provider-factory`、`daemon-registry`、`runtime-config` |
> | 阶段 3.2：提取编排器（Orchestrators） | ✅ 完成 | 提取 6 个 orchestrator + `ChapterRestructurer` |
| 阶段 1.3：提取共享 Utils | ✅ 完成 | 新建 `utils/prompt.ts`（`extractSection`, `extractChapterNumber`），`deterministic-provider.ts` 改为从 core 包导入 |
| 阶段 3.1：黄金路径集成测试 | ✅ 完成 | `runner.golden.test.ts` 锁定 writeNextChapter 输出结构、文件副作用、锁生命周期 |
| 阶段 3.2：提取编排器（Orchestrators） | ✅ 完成 | 提取 6 个 orchestrator + `ChapterRestructurer` |
| 阶段 3.3：Agent 自注册系统 | ✅ 完成 | `agents/registry.ts` + `auto-register.ts`，9 个 Agent 自注册，新增 Agent 无需改 orchestrator |
| 阶段 1.4：修复错误静默 | ✅ 完成 | `UsageTracker.build/merge` 始终返回非 undefined；`runner.ts` success 路径返回 usage；17 处 `catch { return null }` 添加 `console.warn` 日志 |
| 阶段 2.2：请求级上下文 | ✅ 完成 | 移除 `core-bridge.ts` / `provider-factory.ts` 全局缓存；路由统一使用 `c.get('requestContext')`；5 个测试文件注册 middleware |
| 阶段 2.3：路由瘦身 Service 层 | ✅ 完成 | 新建 `services/pipeline.ts`（945 行），提取 17 个 helper + `pipelineStore` + tracking；`pipeline.ts` 1372 行 → 310 行（-77%） |
> | 提取 `DraftManager` | ✅ 完成 | `orchestrators/draft-manager.ts` |
> | 提取 `AuditOrchestrator` | ✅ 完成 | `orchestrators/audit-orchestrator.ts`，内部使用 `RevisionLoop` |
> | 提取 `PlanOrchestrator` | ✅ 完成 | `orchestrators/plan-orchestrator.ts` |
> | 提取 `BookInitializer` | ✅ 完成 | `orchestrators/book-initializer.ts` |
> | 提取 `ChapterComposer` | ✅ 完成 | `orchestrators/chapter-composer.ts` |
> | 提取 `ChapterPersister` | ✅ 完成 | `orchestrators/chapter-persister.ts` |
> | 删除废弃的 `ChapterReviewCycle` | ✅ 完成 | 含测试文件及 `index.ts` 导出 |
> | 清理 `AtomicPipelineOps` 废弃方法 | ✅ 完成 | `#buildAuditPrompt`、`#buildRevisePrompt`、`#buildDraftPrompt` 已清理 |
> | 清理 `runner.ts` 委托私有方法 | ✅ 完成 | `#buildAgentDraftPrompt`、`#readChapterSummary`、`#readChapterContent`、`#checkWorldRules` 已移除 |
> | 清理 `runner.ts` 未使用 normalization helper | ✅ 完成 | 删除 10 个未使用 helper |
> | 提取 `UsageTracker` | ✅ 完成 | `pipeline/telemetry.ts`，runner.ts 370 行 → 305 行 |
> | `PipelineRunner` 行数 | **305 行** | 从 2480 行缩减，目标 < 200 行 |
>
> **下一步**: 推进阶段 4.1（Barrel Export 治理）或阶段 4.2（类型命名统一）。
>
> 待办阶段：4.1、4.2

---

## 1. 重构目标

### 1.1 核心问题

| 问题 | 当前症状 | 目标状态 |
|------|---------|---------|
| God Object | `PipelineRunner` 2,311 行，`core-bridge.ts` 974 行 | 单一职责，每文件 < 250 行 |
| 全局可变状态 | 并发请求共享 `pipelineRunner`/`llmProvider` | 请求级上下文隔离 |
| 测试代码污染 | `DeterministicProvider` 463 行嵌在生产代码 | 测试替身仅在 test 环境加载 |
| Barrel Export | `index.ts` 导出全部 40+ 模块 | 按领域拆分显式导入 |
| 双 SQLite | `sql.js` + `better-sqlite3` 并存 | 统一为 `better-sqlite3` |
| 路由过厚 | `pipeline.ts` 1,408 行含业务逻辑 | 路由 100 行内，委托 Service |
| 错误静默 | `catch { return null }` 吞掉异常 | 分级日志 + 结构化错误 |

### 1.2 成功标准

1. **可测试性**: 所有核心类可通过构造函数注入 Mock，无需 `resetGlobalState()`
2. **并发安全**: 同时处理 2+ 书籍请求不互相污染状态
3. **构建体积**: `studio` 构建产物减少 ≥ 10%（移除 barrel export 的死代码）
4. **代码健康**: ESLint `max-lines` 规则启用 250 行上限，0 个违规
5. **零回归**: 现有 448 单元测试 + 9 E2E 测试全部通过

---

## 2. 风险与约束

### 2.1 禁止做的事

- ❌ **不改动业务逻辑**: Agent 的提示词、审计规则、状态机行为保持不变
- ❌ **不改动数据格式**: `book.json`、`index.json`、SQLite Schema、快照格式不变
- ❌ **不改动 API 契约**: HTTP 端点路径、请求/响应 JSON 结构不变
- ❌ **不引入新依赖**: 除 `better-sqlite3` 替代 `sql.js` 外，不新增 npm 包

### 2.2 高风险区域

| 区域 | 风险 | 缓解措施 |
|------|------|---------|
| `core-bridge.ts` 拆分 | 运行时目录解析逻辑变更导致书籍丢失 | 保留原逻辑 100% 拷贝到新模块，逐行对比单元测试 |
| `PipelineRunner` 拆分 | 编排顺序微调导致流水线行为差异 | 提取前编写「黄金路径」集成测试锁定输出 |
| SQLite 迁移 | `sql.js` → `better-sqlite3` API 差异 | 封装 `DatabaseAdapter` 接口，双实现并行验证 1 轮迭代 |

---

## 3. 阶段规划

### 阶段 1: 基础设施清理（低风险打基础）

**工期**: 1 天 | **前提**: 无 | **阻塞**: 阶段 2、3

#### 1.1 分离 DeterministicProvider

**目标**: 将 463 行测试 Mock 从生产代码路径彻底移除。

**涉及文件**:
```
新增:
  packages/studio/src/llm/deterministic-provider.ts   [移动]
  packages/studio/src/llm/deterministic-provider.test.ts

修改:
  packages/studio/src/api/core-bridge.ts              [删除 463 行]
```

**实现细节**:
```typescript
// core-bridge.ts 生产路径
function buildLLMProvider(): LLMProvider {
  const parsed = loadStudioConfig();
  const configuredProviders = (parsed?.providers ?? [])
    .filter((p) => p.apiKey && p.baseUrl);

  if (configuredProviders.length > 0) {
    return new RoutedLLMProvider(buildRoutingConfig(configuredProviders, parsed));
  }

  // 不再内嵌 DeterministicProvider，显式报错
  throw new ConfigurationError(
    'No LLM provider configured. Please set up API keys in .cybernovelist-config.json'
  );
}

// 测试路径通过注入覆盖
// test-setup.ts
import { DeterministicProvider } from '../llm/deterministic-provider';
setStudioLLMProviderForTests(new DeterministicProvider());
```

**验证**:
- [ ] `pnpm test`（studio 包）通过
- [ ] `pnpm build` 产物中不包含 `deterministic-provider.ts` 的代码（搜索字符串确认）

---

#### 1.2 统一 SQLite 依赖

**目标**: 移除 `sql.js`，全面使用 `better-sqlite3`。

**涉及文件**:
```
修改:
  packages/core/src/state/memory-db.ts
  packages/core/package.json
  packages/core/src/state/memory-db.test.ts

新增:
  packages/core/src/state/db-adapter.ts    [接口抽象层，阶段 1.2 先不抽象，直接替换]
```

**实现细节**:

```typescript
// memory-db.ts 变更
// 删除: import initSqlJs from 'sql.js';
// 新增:
import Database from 'better-sqlite3';

export class MemoryDB {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.initSchema();
  }

  // 所有方法改为同步 API
  insertFact(params: InsertFactParams): number {
    const stmt = this.db.prepare(`
      INSERT INTO facts (chapter, entity_type, entity_name, fact_text, valid_from, valid_until, confidence)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      params.chapter, params.entity_type, params.entity_name,
      params.fact_text, params.valid_from ?? params.chapter,
      params.valid_until ?? null, params.confidence ?? 'high'
    );
    return Number(result.lastInsertRowid);
  }

  // 事务支持
  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }
}
```

**关键兼容点**:

| `sql.js` API | `better-sqlite3` API |
|-------------|---------------------|
| `db.run(sql, params)` | `db.prepare(sql).run(params)` |
| `db.exec(sql)` | `db.exec(sql)` |
| `new SQL.Database()` | `new Database(':memory:')` |
| `db.export()` | 不适用（文件即持久化） |

**验证**:
- [ ] `packages/core/src/state/memory-db.test.ts` 全部通过
- [ ] `packages/core/src/state/manager.test.ts` 通过（依赖 memory-db）
- [ ] `packages/core/src/pipeline/runner.test.ts` 通过（端到端）

---

#### 1.3 提取共享 Utils

**目标**: 消除 `core-bridge.ts` 与 Agent 之间的工具函数重复。

**涉及文件**:
```
新增:
  packages/core/src/utils/prompt.ts       [extractSection, extractChapterNumber]
  packages/core/src/utils/text.ts         [countChineseWords, stripFrontmatter]
  packages/core/src/utils/validation.ts   [isValidBookId, sanitizePath]
  packages/core/src/utils/json.ts         [safeParse, safeStringify]

修改:
  packages/core/src/utils.ts              [标记 @deprecated，转发到新模块]
  packages/studio/src/api/core-bridge.ts  [使用 utils/prompt 替代本地函数]
```

**实现细节**:
```typescript
// utils/prompt.ts
export function extractSection(prompt: string, heading: string): string {
  const start = prompt.indexOf(heading);
  if (start === -1) return '';
  const body = prompt.slice(start + heading.length).trimStart();
  const nextHeadingIndex = body.indexOf('\n## ');
  return (nextHeadingIndex === -1 ? body : body.slice(0, nextHeadingIndex)).trim();
}

export function extractChapterNumber(prompt: string): number {
  const match = /第\s*(\d+)\s*章/.exec(prompt);
  return match ? Number.parseInt(match[1], 10) : 1;
}

// utils/json.ts
export function safeParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}
```

**验证**:
- [ ] 所有引用 `utils.ts` 的测试仍通过
- [ ] `core-bridge.ts` 的 `extractSection` 调用替换后测试通过

---

#### 1.4 修复错误静默

**目标**: 消除 `catch { return null }` 模式，改为分级处理。

**涉及文件**:
```
修改:
  packages/studio/src/api/core-bridge.ts
  packages/core/src/state/memory-db.ts
  packages/core/src/state/recovery.ts
```

**实现细节**:
```typescript
// 错误分级策略
class ConfigurationError extends Error {}
class RuntimeError extends Error {}

// 替换前:
function loadStudioConfig(): StudioConfigState | null {
  try { /* ... */ } catch { return null; }
}

// 替换后:
function loadStudioConfig(): StudioConfigState | null {
  try { /* ... */ }
  catch (err) {
    logger.warn('Failed to load studio config', {
      path: cfgPath,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
```

---

### 阶段 2: API 层重构（core-bridge 拆分 + 请求上下文）

**工期**: 2 天 | **前提**: 阶段 1 完成 | **阻塞**: 阶段 3

#### 2.1 拆分 core-bridge.ts 为 5 个模块

**目标**: 单一职责，消除 974 行 God File。

**新目录结构**:
```
packages/studio/src/
├── runtime/
│   ├── book-repository.ts      # 书籍 CRUD（原 core-bridge 600-945 行）
│   ├── runtime-config.ts       # 目录/环境（原 core-bridge 48-78 行）
│   └── book-repository.test.ts
├── llm/
│   ├── provider-factory.ts     # buildLLMProvider + 配置解析（原 732-780 行）
│   └── provider-factory.test.ts
├── daemon/
│   ├── daemon-registry.ts      # Map 管理 + 生命周期（原 947-958 行）
│   └── daemon-registry.test.ts
└── api/
    └── core-bridge.ts          # 精简门面（< 100 行）
```

**BookRepository 接口**:
```typescript
// runtime/book-repository.ts
export interface BookRepository {
  initialize(book: StudioRuntimeBookRecord): void;
  update(book: StudioRuntimeBookRecord): void;
  delete(bookId: string): void;
  read(bookId: string): StudioRuntimeBookRecord | null;
  list(): StudioRuntimeBookRecord[];
}

export class FsBookRepository implements BookRepository {
  constructor(private rootDir: string) {}
  // 实现...
}
```

**ProviderFactory 接口**:
```typescript
// llm/provider-factory.ts
export interface ProviderFactory {
  create(book?: StudioRuntimeBookRecord): LLMProvider;
}

export class ConfigurableProviderFactory implements ProviderFactory {
  constructor(private configPath: string) {}
  create(book?: StudioRuntimeBookRecord): LLMProvider { /* ... */ }
}
```

**core-bridge.ts 精简后**:
```typescript
// api/core-bridge.ts — 仅保留向后兼容的聚合导出
import { FsBookRepository } from '../runtime/book-repository';
import { ConfigurableProviderFactory } from '../llm/provider-factory';
import { DaemonRegistry } from '../daemon/daemon-registry';

// 懒初始化，由请求上下文管理
let _repository: BookRepository | null = null;
let _providerFactory: ProviderFactory | null = null;
let _daemonRegistry: DaemonRegistry | null = null;

function getRepository(): BookRepository {
  if (!_repository) {
    _repository = new FsBookRepository(getStudioRuntimeRootDir());
  }
  return _repository;
}

// 旧 API 保持兼容
export const readStudioBookRuntime = (bookId: string) =>
  getRepository().read(bookId);

export const listStudioBookRuntimes = () =>
  getRepository().list();
```

**验证**:
- [ ] 所有 `studio` 包测试通过
- [ ] `core-bridge.ts` 行数 < 100
- [ ] 每个新模块有独立测试覆盖

---

#### 2.2 引入请求级上下文（Request Context）

**目标**: 替代全局单例，实现真正的无状态 API 层。

**涉及文件**:
```
新增:
  packages/studio/src/api/context.ts          [Hono Middleware + Context 类型]
  packages/studio/src/api/context.test.ts

修改:
  packages/studio/src/api/server.ts           [注册 Middleware]
  packages/studio/src/api/routes/*.ts         [从全局函数改为 c.get('ctx')]
```

**实现细节**:
```typescript
// api/context.ts
import type { Hono } from 'hono';

export interface RequestContext {
  bookId: string;
  runner: PipelineRunner;
  provider: LLMProvider;
  repository: BookRepository;
}

declare module 'hono' {
  interface ContextVariableMap {
    requestContext: RequestContext;
  }
}

export function registerRequestContext(app: Hono): void {
  app.use('/api/books/:bookId/*', async (c, next) => {
    const bookId = c.req.param('bookId');
    const repository = getRepository();
    const book = repository.read(bookId);

    if (!book) {
      return c.json({ error: `Book ${bookId} not found` }, 404);
    }

    const providerFactory = getProviderFactory();
    const provider = providerFactory.create(book);
    const runner = new PipelineRunner({
      rootDir: getStudioRuntimeRootDir(),
      provider,
    });

    c.set('requestContext', {
      bookId,
      runner,
      provider,
      repository,
    });

    await next();
  });
}
```

**路由使用方式变更**:
```typescript
// pipeline.ts 修改前:
const runner = getStudioPipelineRunner(bookId);

// pipeline.ts 修改后:
const { runner } = c.get('requestContext');
```

**验证**:
- [ ] 同时创建两本书的流水线不互相干扰（并发测试）
- [ ] E2E 测试通过

---

#### 2.3 路由瘦身：提取 Service 层

**目标**: 路由文件只处理 HTTP 协议转换，业务逻辑下沉到 Service。

**涉及文件**:
```
新增:
  packages/studio/src/services/pipeline-service.ts
  packages/studio/src/services/book-service.ts
  packages/studio/src/services/chapter-service.ts

修改:
  packages/studio/src/api/routes/pipeline.ts    [1408 → 100 行]
  packages/studio/src/api/routes/books.ts
  packages/studio/src/api/routes/chapters.ts
```

**PipelineService 接口**:
```typescript
// services/pipeline-service.ts
export interface PipelineService {
  writeNextChapter(
    ctx: RequestContext,
    input: WriteNextChapterInput
  ): Promise<WriteResult>;

  writeFastDraft(
    ctx: RequestContext,
    input: FastDraftInput
  ): Promise<DraftResult>;

  upgradeDraft(
    ctx: RequestContext,
    input: UpgradeDraftInput
  ): Promise<WriteResult>;
}

export class DefaultPipelineService implements PipelineService {
  async writeNextChapter(ctx, input) {
    // 原 pipeline.ts 中 500+ 行的业务逻辑移到这里
  }
}
```

**路由文件目标形态**:
```typescript
// routes/pipeline.ts (~80 行)
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { getPipelineService } from '../../services/pipeline-service';

const app = new Hono();
const service = getPipelineService();

app.post('/chapter', zValidator('json', writeNextSchema), async (c) => {
  const ctx = c.get('requestContext');
  const input = c.req.valid('json');
  const result = await service.writeNextChapter(ctx, input);
  return c.json(result);
});

export default app;
```

**验证**:
- [ ] `pipeline.ts` 行数 < 100
- [ ] PipelineService 单元测试覆盖 ≥ 80%

---

### 阶段 3: 核心引擎重构（PipelineRunner 拆分）

**工期**: 2-3 天 | **前提**: 阶段 2 完成 | **阻塞**: 阶段 4

#### 3.1 锁定「黄金路径」集成测试

**在改动 PipelineRunner 之前，先写一个集成测试锁定当前行为**:

```typescript
// pipeline/runner.golden.test.ts
import { describe, it, expect } from 'vitest';

describe('PipelineRunner golden path', () => {
  it('writeNextChapter 第 1 章完整链路输出结构不变', async () => {
    const runner = createTestRunner();
    const result = await runner.writeNextChapter({
      bookId: 'golden-test-book',
      chapterNumber: 1,
      title: '测试章节',
      genre: 'urban',
      userIntent: '主角初入江湖',
    });

    // 锁定输出结构（不是内容）
    expect(result).toMatchObject({
      success: true,
      chapterNumber: 1,
      persisted: true,
      revisionHistory: expect.any(Array),
    });

    // 锁定状态副作用
    const manifest = runner.stateManager.loadManifest('golden-test-book');
    expect(manifest.chapters).toHaveLength(1);
  });
});
```

**验证**:
- [ ] 新增测试在当前代码上通过
- [ ] 重构后此测试仍通过（零回归红线）

---

#### 3.2 提取编排器（Orchestrators）

**目标**: 将 `PipelineRunner` 拆分为 4 个编排器 + 1 个门面。

**新结构**:
```
packages/core/src/pipeline/
├── runner.ts                 [门面, ~150 行]
├── orchestrators/
│   ├── chapter-composer.ts   [意图→上下文→草稿生成]
│   ├── audit-orchestrator.ts [检测→决策→修订循环]
│   ├── chapter-persister.ts  [验证→持久化→快照]
│   └── draft-manager.ts      [草稿生命周期]
└── types.ts                  [共享类型]
```

**ChapterComposer 设计**:
```typescript
// pipeline/orchestrators/chapter-composer.ts
export interface ChapterComposer {
  compose(input: ComposeInput): Promise<ComposeResult>;
}

export class DefaultChapterComposer implements ChapterComposer {
  constructor(
    private intentDirector: IntentDirector,
    private contextCard: ContextCard,
    private chapterPlanner: ChapterPlanner,
    private scenePolisher: ScenePolisher,
    private memoryExtractor: MemoryExtractor
  ) {}

  async compose(input: ComposeInput): Promise<ComposeResult> {
    // 原 runner.ts 步骤 3-6 的逻辑
    const intent = await this.intentDirector.execute(...);
    const context = await this.contextCard.execute(...);
    const plan = await this.chapterPlanner.execute(...);
    const draft = await this.scenePolisher.execute(...);
    return { intent, context, plan, draft };
  }
}
```

**AuditOrchestrator 设计**:
```typescript
// pipeline/orchestrators/audit-orchestrator.ts
export interface AuditOrchestrator {
  auditAndRevise(
    draft: string,
    context: AuditContext,
    policy: RevisionPolicy
  ): Promise<AuditResult>;
}

export class DefaultAuditOrchestrator implements AuditOrchestrator {
  constructor(
    private qualityReviewer: QualityReviewer,
    private factChecker: FactChecker,
    private aiDetector: AIGCDetector,
    private repairStrategy: RepairStrategy,
    private surgicalRewriter: SurgicalRewriter
  ) {}

  async auditAndRevise(draft, context, policy): Promise<AuditResult> {
    const issues = await this.runAudit(draft, context);
    if (issues.blockers.length === 0) return { passed: true, draft };

    return this.revisionLoop(draft, issues, policy);
  }

  private async revisionLoop(
    draft: string,
    issues: AuditIssues,
    policy: RevisionPolicy
  ): Promise<AuditResult> {
    for (let attempt = 0; attempt < policy.maxRevisionRetries; attempt++) {
      const strategy = this.repairStrategy.decide(issues);
      draft = await this.surgicalRewriter.revise(draft, strategy);
      const reAudit = await this.runAudit(draft, context);
      if (reAudit.blockers.length === 0) return { passed: true, draft, attempt };
      issues = reAudit;
    }
    return { passed: false, draft, fallback: policy.fallbackAction };
  }
}
```

**PipelineRunner 门面**:
```typescript
// pipeline/runner.ts (~150 行)
export class PipelineRunner {
  constructor(private config: PipelineConfig) {
    this.composer = config.composer ?? this.buildDefaultComposer();
    this.auditor = config.auditor ?? this.buildDefaultAuditor();
    this.persister = config.persister ?? this.buildDefaultPersister();
  }

  async writeNextChapter(input: WriteNextChapterInput): Promise<WriteResult> {
    const lock = await this.stateManager.acquireBookLock(input.bookId);
    try {
      const composed = await this.composer.compose({ ...input, bookId: input.bookId });
      const audited = await this.auditor.auditAndRevise(composed.draft, { ... }, this.revisionPolicy);
      return this.persister.persist({ ...input, draft: audited.draft });
    } finally {
      lock.release();
    }
  }
}
```

**验证**:
- [ ] `runner.ts` 行数 < 200
- [ ] 每个编排器独立测试通过
- [ ] 黄金路径集成测试通过

---

#### 3.3 Agent 自注册系统

**目标**: 新增 Agent 不需要修改 `runner.ts` 或 `composer.ts`。

**实现**:
```typescript
// agents/registry.ts
export type AgentFactory = (provider: LLMProvider) => BaseAgent;

class AgentRegistry {
  private factories = new Map<string, AgentFactory>();

  register(name: string, factory: AgentFactory): void {
    this.factories.set(name, factory);
  }

  create(name: string, provider: LLMProvider): BaseAgent {
    const factory = this.factories.get(name);
    if (!factory) throw new Error(`Agent "${name}" not registered`);
    return factory(provider);
  }
}

export const agentRegistry = new AgentRegistry();

// agents/context-card.ts
import { agentRegistry } from './registry';
agentRegistry.register('context-card', (p) => new ContextCard(p));

// agents/chapter-planner.ts
agentRegistry.register('chapter-planner', (p) => new ChapterPlanner(p));
// ... 每个 Agent 文件自注册
```

**编排器使用注册表**:
```typescript
// pipeline/orchestrators/chapter-composer.ts
import { agentRegistry } from '../../agents/registry';

function buildDefaultComposer(provider: LLMProvider): ChapterComposer {
  return new DefaultChapterComposer(
    agentRegistry.create('intent-director', provider),
    agentRegistry.create('context-card', provider),
    agentRegistry.create('chapter-planner', provider),
    agentRegistry.create('scene-polisher', provider),
    agentRegistry.create('memory-extractor', provider)
  );
}
```

**验证**:
- [ ] 新增一个虚拟 Agent 测试，不修改 `runner.ts` 即可生效

---

### 阶段 4: 模块接口治理

**工期**: 1 天 | **前提**: 阶段 3 完成 | **阻塞**: 无

#### 4.1 废弃 Barrel Export

**目标**: 从全局 `index.ts` 导入迁移到领域级导入。

**新目录结构**:
```
packages/core/src/
├── index.ts                    [标记 @deprecated，保留兼容]
├── pipeline/
│   ├── index.ts                [导出 runner + orchestrators + types]
│   └── ...
├── state/
│   ├── index.ts                [导出 manager + store + reducer + validator]
│   └── ...
├── agents/
│   ├── index.ts                [导出 base + registry + 公共类型]
│   └── ...
├── llm/
│   ├── index.ts                [导出 provider + routed-provider + types]
│   └── ...
└── governance/
    ├── index.ts                [导出 hook-policy + agenda + governance + lifecycle + arbiter]
    └── ...
```

**迁移示例**:
```typescript
// 修改前
import { PipelineRunner, StateManager, QualityReviewer } from '@cybernovelist/core';

// 修改后
import { PipelineRunner } from '@cybernovelist/core/pipeline';
import { StateManager } from '@cybernovelist/core/state';
import { QualityReviewer } from '@cybernovelist/core/agents';
```

**package.json exports 配置**:
```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    },
    "./pipeline": {
      "types": "./dist/pipeline/index.d.ts",
      "default": "./dist/pipeline/index.js"
    },
    "./state": {
      "types": "./dist/state/index.d.ts",
      "default": "./dist/state/index.js"
    },
    "./agents": {
      "types": "./dist/agents/index.d.ts",
      "default": "./dist/agents/index.js"
    },
    "./llm": {
      "types": "./dist/llm/index.d.ts",
      "default": "./dist/llm/index.js"
    },
    "./governance": {
      "types": "./dist/governance/index.d.ts",
      "default": "./dist/governance/index.js"
    }
  }
}
```

**验证**:
- [ ] `pnpm build` 成功
- [ ] 新导入路径在 studio 包中可用
- [ ] 旧 `index.ts` 导入仍兼容

---

#### 4.2 统一类型命名

**目标**: 消除 `as XxxYyyZzz` 重命名导出。

**变更清单**:

| 当前命名 | 新命名 |
|---------|--------|
| `ChapterSummaryRecord as MemoryDBChapterSummaryRecord` | `MemoryDbChapterSummary` |
| `ChapterSummaryRecord as ProjectionChapterSummaryRecord` | `ProjectionChapterSummary` |
| `WakeResult as HookAgendaWakeResult` | `HookAgenda.WakeResult` (namespace) |
| `WakeResult as HookGovernanceWakeResult` | `HookGovernance.WakeResult` |
| `IssueLocation as QualityIssueLocation` | `QualityIssue.Location` |
| `IssueLocation as ComplianceIssueLocation` | `ComplianceIssue.Location` |

**验证**:
- [ ] `grep -r "as .*Record\|as .*Result\|as .*Location" packages/core/src/index.ts` 无输出

---

## 4. 验证策略

### 4.1 每阶段验收清单

| 阶段 | 验收标准 |
|------|---------|
| 1.1 | `DeterministicProvider` 不在生产构建产物中；studio 测试全过 |
| 1.2 | `sql.js` 从 `package.json` 移除；所有 state 相关测试全过 |
| 1.3 | `utils/` 目录下各模块独立测试 ≥ 80% 覆盖；原 `utils.ts` 测试仍过 |
| 1.4 | 新增 `ConfigurationError`/`RuntimeError` 有对应单元测试 |
| 2.1 | `core-bridge.ts` < 100 行；新模块各自有测试 |
| 2.2 | 并发测试：同时操作 book-a 和 book-b 不互相污染 |
| 2.3 | `pipeline.ts` < 100 行；`PipelineService` 测试覆盖 ≥ 80% |
| 3.1 | 黄金路径集成测试通过（重构前后对比） |
| 3.2 | `runner.ts` < 200 行；各编排器独立测试全过 |
| 3.3 | 新增虚拟 Agent 不修改 `runner.ts` 即可工作 |
| 4.1 | `pnpm build` 成功；新导入路径可用；旧路径兼容 |
| 4.2 | 无 `as` 重命名导出 |

### 4.2 全量回归测试

每阶段完成后必须执行：
```bash
pnpm verify        # lint + typecheck + test + build
pnpm test:e2e      # Playwright 端到端
```

### 4.3 性能基线

阶段 1.2（SQLite 迁移）完成后对比：
```bash
# 基准测试
hyperfine --warmup 3 'pnpm test -- --run packages/core/src/state/memory-db.test.ts'
# 期望: better-sqlite3 版本不比 sql.js 慢（本地实际应快 3-5 倍）
```

---

## 5. 回滚方案

### 5.1 提交策略

每个子任务独立提交，使用 `git revert` 可单独回滚：

```
feat(refactor): 分离 DeterministicProvider 到测试目录
feat(refactor): 统一 SQLite 为 better-sqlite3
feat(refactor): 提取 utils/prompt 共享模块
feat(refactor): 拆分 core-bridge 为 book-repository + provider-factory
...
```

### 5.2 数据兼容性回滚

阶段 1.2（SQLite 迁移）若发现问题：
1. `git revert` 该提交
2. `memory.db` 文件格式无需回滚（`better-sqlite3` 和 `sql.js` 使用相同 SQLite 文件格式）
3. 仅需恢复代码层面的 API 调用

### 5.3 紧急回滚开关

在 `package.json` 中保留功能开关（仅阶段 1.2 需要）：
```json
{
  "cybernovelist": {
    "useBetterSqlite3": true
  }
}
```

---

## 6. 时间估算

| 阶段 | 子任务 | 乐观 | 标准 | 悲观 |
|------|--------|------|------|------|
| 1.1 | 分离 DeterministicProvider | 2h | 3h | 4h |
| 1.2 | 统一 SQLite | 3h | 4h | 6h |
| 1.3 | 提取 utils | 2h | 3h | 4h |
| 1.4 | 修复错误静默 | 1h | 2h | 3h |
| 2.1 | 拆分 core-bridge | 4h | 6h | 8h |
| 2.2 | 请求上下文 | 3h | 4h | 6h |
| 2.3 | 路由瘦身 | 4h | 6h | 8h |
| 3.1 | 黄金路径测试 | 2h | 2h | 3h |
| 3.2 | PipelineRunner 拆分 | 6h | 10h | 14h |
| 3.3 | Agent 注册表 | 2h | 3h | 4h |
| 4.1 | Barrel Export 治理 | 3h | 4h | 6h |
| 4.2 | 类型命名统一 | 1h | 2h | 3h |
| **总计** | | **33h** | **47h** | **69h** |

按标准估算 **约 6 个工作日**（考虑代码审查和测试调试）。

---

## 7. 人员分工建议

| 人员 | 负责阶段 | 关键技能 |
|------|---------|---------|
| 后端工程师 A | 阶段 1 + 3.2 | Node.js / SQLite / 单元测试 |
| 后端工程师 B | 阶段 2 + 3.1/3.3 | Hono / TypeScript / 并发 |
| 架构师 | 阶段 4 + Code Review | 模块设计 / API 兼容性 |

单人也可按顺序执行，但阶段 2 和阶段 3 内部的任务可以部分并行。
