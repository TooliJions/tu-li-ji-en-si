# CLAUDE.md

> 本文档是 Claude Code 在本仓库中的行为准则。包含项目定位、7 阶段流程、技术栈、代码风格、开发工作流、架构原则与 AI 行为约束。完整需求见 `docs/PRDs/CyberNovelist-PRD.md`,架构见 `docs/Architecture/architecture.md`,API 见 `docs/API/api-reference.md`,任务见 `docs/Development/tasks.md`。

## 项目定位

CyberNovelist v7.0 是一个 **本地优先的 AI 网络小说创作系统**,采用 TypeScript Monorepo 架构。所有产品能力固化为 **7 阶段同步流程**:

```
① 灵感输入  → ② 规划  → ③ 总纲规划  → ④ 细纲规划  → ⑤ 章节正文  → ⑥ 质量检查  → ⑦ 导出
inspiration   planning    outline       detailed       writing        quality       export
```

每个阶段都有独立的契约 schema、服务层、API 路由与前端页面,作者按顺序推进,前一阶段产出是后一阶段输入。

## 7 阶段流程一览

| 阶段 | 主体契约 | 关键 Agent / 服务 | 入口路由 | 前端页面 |
|---|---|---|---|---|
| ① 灵感输入 | `InspirationSeed` | `DefaultInspirationService` | `/api/books/:bookId/inspiration` | `inspiration-input.tsx` |
| ② 规划 | `PlanningBrief` | `DefaultPlanningService` | `/api/books/:bookId/planning-brief` | `planning-brief.tsx` |
| ③ 总纲规划 | `StoryBlueprint`(meta+base+typeSpecific 三层) | `OutlineGenerator` 单 Agent | `/api/books/:bookId/story-outline` | `story-outline.tsx` |
| ④ 细纲规划 | `DetailedOutline`(volumes+chapters+contextForWriter) | `DetailedOutlineGenerator` | `/api/books/:bookId/detailed-outline` | `detailed-outline.tsx` |
| ⑤ 章节正文 | Chapter Markdown + 状态 | `PipelineRunner` + 写作类 Agent | `/api/books/:bookId/chapters/*` | `writing.tsx` / `chapter-reader.tsx` |
| ⑥ 质量检查 | `QualityReport` | 33 维审计 Agent + 9 类 AI 检测 | `/api/books/:bookId/quality` `/analytics` | `quality-gate.tsx` `analytics.tsx` |
| ⑦ 导出 | `ExportArtifact` | EPUB / TXT / Markdown / 平台适配 | `/api/books/:bookId/export` | `export-view.tsx` |

每个阶段细节见 `docs/PRDs/CyberNovelist-PRD.md` 与 `docs/Architecture/architecture.md`。

## 技术栈

| 领域 | 技术 | 版本 |
|------|------|------|
| 语言 | TypeScript | 5.7+ |
| 运行时 | Node.js | >= 20.0.0 |
| 包管理 | pnpm workspace | >= 9 |
| 单元测试 | Vitest | 2.1+ |
| E2E 测试 | Playwright | 1.49+ |
| 状态存储 | SQLite(WAL 模式)| better-sqlite3 11.7+ |
| Web 前端 | React | 19.0+ |
| 构建工具 | Vite | 6.0+ |
| 样式 | Tailwind CSS | 4.2+ |
| 路由 | React Router DOM | 7.1+ |
| API 框架 | Hono | 4.6+ |
| 校验 | Zod | 3.24+ |
| 代码质量 | ESLint + Prettier + Husky + lint-staged | - |
| CI/CD | GitHub Actions | - |

## Monorepo 结构

```
cybernovelist/
├── packages/
│   ├── core/src/
│   │   ├── workflow/          # 7 阶段契约与服务(contracts/ + services/)
│   │   ├── agents/            # Agent 实现(按阶段分组)
│   │   ├── pipeline/          # PipelineRunner + 章节正文编排
│   │   ├── state/             # 状态管理(Manager/Store/Reducer/SQLite)
│   │   ├── governance/        # 伏笔治理 5 层(跨 ④⑤⑥)
│   │   ├── quality/           # 质量检测(33 维审计 + 9 类 AI 检测)
│   │   ├── llm/               # LLM Provider 抽象 + 模型路由
│   │   ├── export/            # 导出器(EPUB/TXT/Markdown/平台适配)
│   │   ├── prompts/           # 提示词模板(版本化)
│   │   └── models/            # Zod schemas
│   └── studio/src/
│       ├── api/routes/        # 阶段路由(每阶段独立模块)
│       ├── pages/             # 前端页面(按阶段)
│       ├── components/        # 可复用组件
│       └── lib/               # 共享工具
├── docs/                      # PRD / 架构 / API / UI / 开发任务
├── e2e/                       # Playwright E2E 测试
└── tsconfig.json              # Project references(composite)
```

## 核心架构要点

### Agent 系统

所有 Agent 继承 `BaseAgent`(`packages/core/src/agents/base.ts`),通过 `agentRegistry` 自注册,实现统一的 `execute(ctx: AgentContext)` 接口。Agent 职责单一,通过 `ctx.promptContext` 接收输入,返回 `AgentResult { success, data?, error? }`。

按阶段分组(代表性 Agent):

- **总纲规划 ③**:`OutlineGenerator` — 单 Agent 一次 LLM 调用产出三层 `StoryBlueprint`
- **细纲规划 ④**:`DetailedOutlineGenerator`(原 `OutlinePlanner`)— 卷骨架 + 逐卷章节 beat + 每章 `contextForWriter`
- **章节正文 ⑤**:`ChapterExecutor`、`IntentDirector`、`ContextCard`、`ScenePolisher`、`StyleRefiner`、`ChapterPlanner`(降级为补全器)、`MemoryExtractor`、`StyleFingerprint`、`MarketInjector`
- **质量检查 ⑥**:`QualityReviewer`、`FactChecker`、`EntityAuditor`、`StyleAuditor`、`TitleVoiceAuditor`、`ComplianceReviewer`、`HookAuditor`、`FatigueAnalyzer`、`AuditTierClassifier`、`SurgicalRewriter`

### PipelineRunner — 章节正文唯一外部入口

所有章节正文操作通过 `PipelineRunner`(`packages/core/src/pipeline/runner.ts`)协调:
- `writeNextChapter()` — 完整链路(意图 → 上下文 → 草稿 → 审计 → 修订 → 持久化)
- `writeFastDraft()` — 快速试写(单次 LLM 调用,<15s,不持久化)
- `writeDraft()` — 草稿模式(跳过审计,标记 draft)
- `upgradeDraft()` — 草稿转正(含上下文漂移防护)

### 状态层 — 三层架构 + 原子事务

1. `StateManager`(锁/路径/索引)→ 2. `RuntimeStateStore`(加载/构建/保存)→ 3. `StateReducer`(不可变更新)
- 单章写入为原子事务:章节文件 → index.json → facts/hooks → 快照 → SQLite 提交
- 崩溃后通过 WAL 自动回滚未提交事务

### 总纲规划三层 schema(③)

`StoryBlueprint` 三层结构对应 `C:\Users\18223\Desktop\AI` 项目的设计:
- **meta**:novelType / architectureMode / endingType / titleSuggestions
- **base**:sellingPoints / theme / goldenOpening / writingStyle / characters / relationships / outlineArchitecture / foreshadowingSeed / completionDesign
- **typeSpecific**:按 architectureMode 5 选 1(Fantasy / Mystery / Urban / Romance / SciFi)

`architectureMode` 由 `GENRE_TO_ARCHITECTURE` 映射表(`agents/genre-guidance.ts`)从 novelType 自动推断:
- 玄幻/仙侠/奇幻 → `lotus_map`
- 科幻 → `multiverse`
- 都市/悬疑/言情/历史 → `org_ensemble`
- 游戏/末世 → `map_upgrade`

### 细纲规划自给自足上下文(④)

`DetailedOutline.volumes[].chapters[].contextForWriter` 为每章预生成完整写作上下文(角色状态、世界规则、活跃伏笔、前后衔接),章节正文阶段直接消费,避免重复调 LLM 重建上下文。

### 伏笔治理 — 5 层架构(跨 ④⑤⑥)

`HookPolicy → HookAgenda → HookGovernance → HookArbiter → HookLifecycle`
- 生命周期:open → progressing → deferred → dormant → resolved/abandoned
- 支持人工意图声明(预期回收窗口)和惊群平滑

### 质量检查 — 33 维审计 + 9 类 AI 检测(⑥)

- 三级分类:阻断级 12 项 / 警告级 12 项 / 建议级 9 项
- 修复策略:局部替换 / 段落重排 / 节拍重写 / 整章重写
- 降级路径:`maxRevisionRetries`(默认 2)→ `fallbackAction`(`accept_with_warnings` / `pause`)

## 代码风格

### 命名约定

| 元素 | 规则 | 示例 |
|------|------|------|
| 文件名 | kebab-case | `outline-generator.ts`、`runtime-store.ts` |
| 类/接口/类型 | PascalCase | `OutlineGenerator`、`StoryBlueprint` |
| 函数/变量 | camelCase | `writeNextChapter`、`chapterCount` |
| 常量 | SCREAMING_SNAKE_CASE | `GENRE_TO_ARCHITECTURE`、`MAX_RETRY_COUNT` |
| 测试文件 | 同名 + `.test.ts`,旁侧放置 | `outline-generator.ts` → `outline-generator.test.ts` |

### 注释规范

- **所有代码注释使用简体中文**
- **仅在 WHY 非显而易见时写注释**:隐藏约束、特定 bug 的变通方案、复杂业务逻辑
- **禁止**:描述代码做什么(不要重复代码本身的语义)、多段落 JSDoc、引用任务编号或提交上下文

### 文件组织

- 每个文件职责单一,行数不超过 300 行
- 导出顺序:类型定义 → 常量 → 公开函数/类 → 私有辅助函数
- 禁止循环依赖,使用 project references 管理包边界
- 新模块按阶段归位,放在 `packages/core/src/{workflow,agents,quality,...}/` 对应子目录

### 格式化规则

- 缩进:2 空格
- 行宽:100 字符
- 字符串:优先单引号,模板字符串除外
- 尾随逗号:全部保留
- 分号:语句末尾必须保留

## 开发工作流

### 编码流程

1. **理解需求** — 确认需求归属哪个阶段(7 阶段之一),不明确时先询问
2. **查找现有模式** — 先搜索代码库是否有类似实现
3. **编写代码** — 按代码风格规范实现,强类型优先,禁止不必要的 `any`
4. **编写测试** — 每个新功能至少有一个对应测试用例
5. **运行验证** — 执行 `pnpm verify`(lint + typecheck + test + build)
6. **提交代码** — 遵循 Conventional Commits,使用中文描述

### 提交规范

- 格式:`<type>(<scope>): <中文描述>`
- type:`feat` / `fix` / `refactor` / `docs` / `test` / `chore` / `style`
- scope(阶段优先):`inspiration` / `planning` / `outline` / `detailed-outline` / `writing` / `quality` / `export`,跨阶段使用 `core` / `studio` / `state` / `governance`
- 示例:`feat(outline): 添加 OutlineGenerator 单 Agent 三层 schema`
- 提交消息正文描述 **为什么** 而非 **做了什么**
- 禁止跳过 pre-commit hooks

### 分支策略

- `main` 为主分支,所有开发在特性分支上进行
- 特性分支命名:`feature/<简短描述>` 或 `fix/<简短描述>`
- 合并方式:优先 merge commit,保留完整历史
- 禁止直接推送到 `main`

### 测试要求

- 单元测试:核心逻辑必须有对应的 `.test.ts`
- 边界值测试:所有公开函数的异常分支必须覆盖
- 禁止 mock 数据库(集成测试使用真实 SQLite 实例)
- E2E 测试:7 阶段流程必须有 Playwright 用例覆盖

## 架构原则

### Monorepo 架构

- `packages/core` — 纯业务逻辑,无任何 UI 依赖,可独立测试
- `packages/studio` — Web 界面层,依赖 core 包
- 依赖方向:`studio → core`,禁止反向依赖
- 新增共享工具放在对应包的 `lib/` 或 `utils/` 目录

### 阶段独立原则

- 每个阶段的契约在 `packages/core/src/workflow/contracts/{stage}.ts`
- 每个阶段的服务在 `packages/core/src/workflow/services/{stage}-service.ts`
- 每个阶段的 API 在 `packages/studio/src/api/routes/{stage}.ts`
- 每个阶段的页面在 `packages/studio/src/pages/{stage}.tsx`
- **禁止跨阶段直接调用**,只能通过工作流文档(`{stage}.json`)读写共享数据

### Agent 系统

- 所有 Agent 继承 `BaseAgent`,通过 `agentRegistry.register('name', factory)` 注册
- Agent 职责单一,一个 Agent 只做一件事
- Agent 之间通过 `AgentContext` 传递数据,禁止共享可变状态
- 新 Agent 放在 `packages/core/src/agents/` 并按阶段命名

### 状态管理

- 三层架构:`StateManager → RuntimeStateStore → StateReducer`
- 状态更新 **不可变** — 始终返回新对象,禁止原地修改
- 单章写入为原子事务:章节文件 → index.json → facts/hooks → 快照 → SQLite 提交
- 新增状态字段需在 `models/` 中的 Zod schema 中同步定义

### 错误处理

- **完整错误处理**:所有可能失败的操作必须有 try-catch
- 使用自定义错误类型(`ChapterError`、`StateError`、`OutlineValidationError` 等)区分错误来源
- 错误信息包含上下文(章节 ID、操作步骤),便于诊断
- 降级策略:重试失败后根据配置决定 `accept_with_warnings` 或 `pause`

## AI 行为约束

### 必须遵守

- **先读后写** — 修改任何文件前必须先阅读其内容,确保不覆盖已有逻辑
- **最小改动** — 只修改完成需求所必需的代码,不做额外重构
- **验证再报告** — 报告任务完成前必须实际运行测试验证
- **回滚意识** — 每次提交应是可以独立工作的完整单元
- **安全优先** — 禁止引入 SQL 注入、XSS、路径穿越等 OWASP Top 10 漏洞

### 严格禁止

- **禁止猜测不确定的路径** — 不确定时先用 Grep / Glob 搜索确认
- **禁止删除用户代码** — 即使认为代码无用,也应先询问
- **禁止跳过测试** — 任何功能变更必须保证现有测试不失败
- **禁止硬编码** — 配置项提取到常量或配置文件
- **禁止静默失败** — 错误必须抛出或记录日志,不能吞掉异常
- **禁止引入外部依赖** — 新增 npm 包前必须询问

### 沟通规范

- 始终使用简体中文与用户交流
- 涉及代码时标注文件路径和行号(如 `agents/outline-generator.ts:42`)
- 简洁回复,避免冗余描述
- 遇到不确定的问题时明确告知"我不确定",而非给出可能错误的建议

## 工具配置

### ESLint 规则

- `@typescript-eslint/no-unused-vars`: warn(忽略 `_` 前缀参数)
- `@typescript-eslint/no-explicit-any`: warn
- `@typescript-eslint/explicit-function-return-type`: off
- `no-console`: warn(仅允许 `console.warn` / `console.error`)
- `no-implicit-coercion`: warn

### 常用命令

| 操作 | 命令 |
|------|------|
| 安装依赖 | `pnpm install` |
| 开发模式 | `pnpm dev`(http://localhost:3000) |
| 构建 | `pnpm build` |
| 类型检查 | `pnpm typecheck` |
| 单元测试 | `pnpm test` |
| E2E 测试 | `pnpm test:e2e` |
| 完整验证 | `pnpm verify`(lint + typecheck + test + build) |
| 单包操作 | `cd packages/core && pnpm test` |

### 项目关键路径

开发时必须关注的关键链路:
1. 工作流契约(`workflow/contracts/`)→ 7 阶段数据形态
2. 状态层(`state/`)→ 所有创作操作的基础
3. PipelineRunner(`pipeline/runner.ts`)→ 章节正文唯一入口
4. Agent 系统(`agents/`)→ 按阶段协作
5. Hono API(`studio/src/api/routes/`)→ 前端与后端的桥梁

## 测试

| 类型 | 框架 | 命令 | 说明 |
|------|------|------|------|
| 单元测试 | Vitest | `pnpm test` | 覆盖 core + studio,旁侧 `.test.ts` |
| E2E 测试 | Playwright | `pnpm test:e2e` | `e2e/*.spec.ts`,Chromium 单 worker |
| 覆盖率 | vitest coverage-v8 | `cd packages/core && pnpm test -- --coverage` | core 包已配置 |

- Playwright 配置:`playwright.config.ts`
  - baseURL: `http://127.0.0.1:5173`
  - webServer: `pnpm --filter @cybernovelist/studio dev:e2e`
  - workers: 1(串行执行避免状态冲突)

## 构建与运行

```bash
# 安装依赖
pnpm install

# 启动开发服务器(http://localhost:3000)
pnpm dev

# 构建
pnpm build

# 类型检查
pnpm typecheck

# 运行测试
pnpm test
pnpm test:e2e

# 完整验证
pnpm verify

# 单包操作
cd packages/core && pnpm test
cd packages/studio && pnpm dev
```

### Studio 开发模式细节

- `pnpm dev` = `pnpm build:api && pnpm dev:api & vite`
- `build:api` 先构建 core 包,再编译 API 的 `tsconfig.api.json`
- API 开发:`pnpm dev:api` → `tsx watch src/api/index.ts`
- 前端开发:Vite 默认端口(通常 5173)

## Git 工作流

- **分支**:`main`(主分支)
- **提交风格**:Conventional Commits,使用中文描述
- **Pre-commit**:Husky + lint-staged 自动运行 Prettier 格式化和 ESLint fix
- **CI**:GitHub Actions `verify.yml`,在 push 到 main 或 PR 时运行 `pnpm verify`
- **并发控制**:CI 使用 `cancel-in-progress: true` 避免重复运行

## API 规范

RESTful JSON + SSE 推送。详见 `docs/API/api-reference.md`。

- 基础路径:`http://localhost:3000/api`
- SSE 端点:`/api/books/:bookId/sse`
- SSE 事件类型:`pipeline_progress` / `memory_extracted` / `chapter_complete` / `hook_wake` / `thundering_herd` / `quality_drift` / `context_changed`

## 常见任务速查

| 我想做... | 操作位置 |
|-----------|----------|
| 添加一个 Agent | `packages/core/src/agents/`,继承 `BaseAgent` 并 `agentRegistry.register` |
| 添加 API 端点 | `packages/studio/src/api/routes/{stage}.ts`,在 `server.ts` 注册 |
| 添加前端页面 | `packages/studio/src/pages/{stage}.tsx` + `App.tsx` 路由配置 |
| 修改阶段契约 | `packages/core/src/workflow/contracts/{stage}.ts`(Zod schema) |
| 修改阶段服务 | `packages/core/src/workflow/services/{stage}-service.ts` |
| 添加提示词模板 | `packages/core/src/prompts/v1/` 或 `v2/`,更新 registry |
| 修改状态逻辑 | `packages/core/src/state/`(Manager → Store → Reducer) |
| 添加单元测试 | 在源文件旁创建同名 `.test.ts` |
| 添加 E2E 测试 | `e2e/*.spec.ts` |
| 修改构建配置 | `packages/*/vite.config.ts` 或 `tsconfig*.json` |

## 开发任务

详细开发计划见 `docs/Development/tasks.md`,按 7 阶段切分原子任务。
