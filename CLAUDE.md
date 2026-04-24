# CLAUDE.md

> 更新说明：本文档是 Claude Code 的自动加载规则文件，定义 AI 编码助手在本项目中的行为准则。包含项目概览、代码风格、开发工作流、架构原则、AI 行为约束和工具配置。

## 项目定位

CyberNovelist v7.0 是一个 **本地优先的 AI 网络小说创作系统**，采用 TypeScript Monorepo 架构。
所有创作操作通过 `PipelineRunner` 编排，22 个 Agent 模块各司其职，状态层保证数据一致性。

完整需求文档见 `docs/PRDs/CyberNovelist-PRD.md`，技术架构见 `docs/Architecture/architecture.md`，API 文档见 `docs/API/api-reference.md`，开发任务见 `docs/Development/tasks.md`。

## 技术栈

| 领域 | 技术 | 版本 |
|------|------|------|
| 语言 | TypeScript | 5.7+ |
| 运行时 | Node.js | >= 20.0.0 |
| 包管理 | pnpm workspace | >= 9 |
| 单元测试 | Vitest | 2.1+ |
| E2E 测试 | Playwright | 1.49+ |
| 状态存储 | SQLite（WAL 模式）| better-sqlite3 11.7+ |
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
│   │   ├── agents/          # 22 个模块化 Agent（继承 BaseAgent）
│   │   ├── pipeline/        # PipelineRunner + 原子操作 + 修订循环
│   │   ├── state/           # 状态管理（Manager/Store/Reducer/SQLite/快照/恢复）
│   │   ├── governance/      # 伏笔治理（Policy/Agenda/Governance/Arbiter/Lifecycle）
│   │   ├── quality/         # 质量检测（AI 检测/修复策略/基线/审计分类）
│   │   ├── llm/             # Provider 抽象 + 模型路由
│   │   ├── scheduler/       # 守护进程调度（SmartInterval + QuotaGuard）
│   │   ├── daemon.ts        # 守护进程主入口
│   │   ├── export/          # 导出器（EPUB/TXT/Markdown/平台适配）
│   │   ├── notify/          # 通知推送（Telegram/飞书/企微/Webhook）
│   │   ├── prompts/         # 提示词模板（版本化 v1/v2/latest）
│   │   ├── fanfic.ts        # 同人创作模式
│   │   └── models/          # Zod schemas
│   └── studio/src/
│       ├── api/routes/      # 14 个 Hono 路由模块 + SSE
│       ├── pages/           # 前端页面（React Router）
│       ├── components/      # 可复用组件
│       └── lib/             # 共享工具
├── docs/                    # 项目文档（PRD/架构/API/UI/开发计划）
├── e2e/                     # Playwright E2E 测试
├── pnpm-workspace.yaml
└── tsconfig.json            # Project references（composite）
```

## 核心架构要点

### PipelineRunner — 唯一外部入口

所有创作操作通过 `PipelineRunner` 协调：
- `writeNextChapter()` — 完整链路（15 步：意图→上下文→记忆→草稿→审计→修订→持久化）
- `writeFastDraft()` — 快速试写（单次 LLM 调用，<15s，不持久化）
- `writeDraft()` — 草稿模式（跳过审计，标记 draft，<30s）
- `upgradeDraft()` — 草稿转正（含上下文漂移防护检查）

### 状态层 — 三层架构 + 原子事务

1. StateManager（锁/路径/索引）→ 2. RuntimeStateStore（加载/构建/保存）→ 3. StateReducer（不可变更新）
- 单章写入为原子事务：章节文件 → index.json → facts/hooks → 快照 → SQLite 提交
- 崩溃后通过 WAL 自动回滚未提交事务

### Agent 系统 — 22 个模块

- 规划类：OutlinePlanner, CharacterDesigner, ChapterPlanner
- 执行类：ChapterExecutor, ContextCard, ScenePolisher, StyleRefiner, IntentDirector, MemoryExtractor
- 审计类：QualityReviewer, FactChecker, EntityAuditor, StyleAuditor, TitleVoiceAuditor, ComplianceReviewer, HookAuditor, FatigueAnalyzer
- 特殊类：AuditTierClassifier, MarketInjector, StyleFingerprint, EntityRegistry, SurgicalRewriter

### 伏笔治理 — 5 层架构

HookPolicy → HookAgenda → HookGovernance → HookArbiter → HookLifecycle
- 生命周期：open → progressing → deferred → dormant → resolved/abandoned
- 支持人工意图声明（预期回收窗口）和惊群平滑

### 质量层 — 33 维审计 + 9 类 AI 检测

- 三级分类：阻断级 12 项 / 警告级 12 项 / 建议级 9 项
- 修复策略：局部替换 / 段落重排 / 节拍重写 / 整章重写
- 降级路径：maxRevisionRetries(2) → fallbackAction(accept_with_warnings / pause)

## 代码风格

### 命名约定

| 元素 | 规则 | 示例 |
|------|------|------|
| 文件名 | kebab-case | `chapter-planner.ts`、`runtime-store.ts` |
| 类/接口/类型 | PascalCase | `PipelineRunner`、`ChapterState` |
| 函数/变量 | camelCase | `writeNextChapter`、`chapterCount` |
| 常量 | SCREAMING_SNAKE_CASE | `MAX_RETRY_COUNT`、`GENRE_WRITER_STYLE_MAP` |
| 测试文件 | 同名 + `.test.ts`，旁侧放置 | `chapter-planner.ts` → `chapter-planner.test.ts` |

### 注释规范

- **所有代码注释使用简体中文**（与项目全局语言规则一致）
- **仅在 WHY 非显而易见时写注释**：隐藏约束、特定 bug 的变通方案、复杂业务逻辑
- **禁止**：描述代码做什么（注释不应重复代码能表达的信息）、多段落 JSDoc、引用任务编号或提交上下文
- **必要注释模板**：
  ```typescript
  // 不可变更新：返回新状态对象，禁止修改原状态
  function applyDelta(state: RuntimeState, delta: StateDelta): RuntimeState { ... }
  ```

### 文件组织

- 每个文件职责单一，行数不超过 300 行
- 导出顺序：类型定义 → 常量 → 公开函数/类 → 私有辅助函数
- 禁止循环依赖，使用 project references 管理包边界
- 新模块放在 `packages/core/src/` 对应子目录下

### 格式化规则

- 缩进：2 空格
- 行宽：100 字符
- 字符串：优先单引号，模板字符串除外
- 尾随逗号：全部保留
- 分号：语句末尾必须保留

## 开发工作流

### 编码流程

1. **理解需求** — 确认需求在现有架构中的位置，不明确时先询问用户
2. **查找现有模式** — 先搜索代码库中是否有类似实现，遵循已有模式
3. **编写代码** — 按代码风格规范实现，强类型优先，禁止不必要的 `any`
4. **编写测试** — 每个新功能至少有一个对应的测试用例
5. **运行验证** — 执行 `pnpm verify`（lint + typecheck + test + build）
6. **提交代码** — 遵循 Conventional Commits，使用中文描述

### 提交规范

- 格式：`<type>(<scope>): <中文描述>`
- type 范围：`feat` / `fix` / `refactor` / `docs` / `test` / `chore` / `style`
- scope 范围：`core` / `studio` / `api` / `state` / `agents` / `pipeline` / `governance` / `quality`
- 示例：`feat(agents): 添加章节总结代理`
- 提交消息正文描述 **为什么** 而非 **做了什么**
- 禁止跳过 pre-commit hooks

### 分支策略

- `main` 为主分支，所有开发在特性分支上进行
- 特性分支命名：`feature/<简短描述>` 或 `fix/<简短描述>`
- 合并方式：优先 merge commit，保留完整历史
- 禁止直接推送到 `main`

### 测试要求

- 单元测试：核心逻辑必须有对应的 `.test.ts` 文件
- 边界值测试：所有公开函数的异常分支必须覆盖
- 禁止 mock 数据库（集成测试使用真实 SQLite 实例）
- E2E 测试：用户可见流程必须有 Playwright 用例

## 架构原则

### Monorepo 架构

- `packages/core` — 纯业务逻辑，无任何 UI 依赖，可独立测试
- `packages/studio` — Web 界面层，依赖 core 包
- 依赖方向：studio → core，禁止反向依赖
- 新增共享工具放在对应包的 `lib/` 目录下

### PipelineRunner 模式

- **PipelineRunner 是唯一外部入口** — 所有创作操作必须通过它协调
- 禁止绕过 PipelineRunner 直接调用 Agent
- 新增流水线步骤通过插入原子操作实现，不修改核心链路

### Agent 系统

- 所有 Agent 继承 `BaseAgent`，实现统一的 `execute()` 接口
- Agent 职责单一，一个 Agent 只做一件事
- Agent 之间通过上下文对象传递数据，禁止共享状态
- 新 Agent 放在 `packages/core/src/agents/` 目录下

### 状态管理

- 三层架构：StateManager → RuntimeStateStore → StateReducer
- 状态更新**不可变** — 始终返回新对象，禁止原地修改
- 单章写入为原子事务：章节文件 → index.json → facts/hooks → 快照 → SQLite 提交
- 新增状态字段需在 `models/` 中的 Zod schema 中同步定义

### 错误处理

- **完整错误处理**：所有可能失败的操作必须有 try-catch
- 使用自定义错误类型（`ChapterError`、`StateError` 等）区分错误来源
- 错误信息包含上下文（章节 ID、操作步骤），便于诊断
- 降级策略：重试失败后根据配置决定 accept_with_warnings 或 pause

## AI 行为约束

### 必须遵守

- **先读后写** — 修改任何文件前必须先阅读其内容，确保不覆盖已有逻辑
- **最小改动** — 只修改完成需求所必需的代码，不做额外重构
- **验证再报告** — 报告任务完成前必须实际运行测试验证，不做假设
- **回滚意识** — 每次提交应是可以独立工作的完整单元，避免半成品提交
- **安全优先** — 禁止引入 SQL 注入、XSS、路径穿越等 OWASP Top 10 漏洞

### 严格禁止

- **禁止猜测不确定的路径** — 不确定时先搜索确认（Grep / Glob）
- **禁止删除用户代码** — 即使认为代码无用，也应先询问用户
- **禁止跳过测试** — 任何功能变更必须保证现有测试不失败
- **禁止硬编码** — 配置项提取到常量或配置文件，不直接写死
- **禁止静默失败** — 错误必须抛出或记录日志，不能吞掉异常
- **禁止引入外部依赖** — 新增 npm 包前必须询问用户

### 沟通规范

- 始终使用简体中文与用户交流
- 涉及代码时标注文件路径和行号（如 `agents/index.ts:42`）
- 简洁回复，避免冗余描述
- 遇到不确定的问题时明确告知"我不确定"，而非给出可能错误的建议

## 工具配置

### ESLint 规则

- `@typescript-eslint/no-unused-vars`: warn（忽略 `_` 前缀参数）
- `@typescript-eslint/no-explicit-any`: warn（禁止不必要的 any 使用）
- `@typescript-eslint/explicit-function-return-type`: off
- `no-console`: warn（仅允许 console.warn / console.error）
- `no-implicit-coercion`: warn（禁止隐式类型转换）

### 常用命令

| 操作 | 命令 |
|------|------|
| 安装依赖 | `pnpm install` |
| 开发模式 | `pnpm dev`（http://localhost:3000） |
| 构建 | `pnpm build` |
| 类型检查 | `pnpm typecheck` |
| 单元测试 | `pnpm test` |
| E2E 测试 | `pnpm test:e2e` |
| 完整验证 | `pnpm verify`（lint + typecheck + test + build） |
| 单包操作 | `cd packages/core && pnpm test` |

### 项目关键路径

开发时必须关注的关键链路：
1. 状态层（state/）→ 所有创作操作的基础
2. PipelineRunner（pipeline/）→ 唯一外部入口
3. Agent 系统（agents/）→ 22 个模块协同工作
4. Hono API（studio/src/api/routes/）→ 前端与后端的桥梁

## 测试

| 类型 | 框架 | 命令 | 说明 |
|------|------|------|------|
| 单元测试 | Vitest | `pnpm test` | 约 448+ 用例，覆盖 core + studio |
| E2E 测试 | Playwright | `pnpm test:e2e` | `e2e/*.spec.ts`，Chromium 单 worker |
| 覆盖率 | vitest coverage-v8 | `cd packages/core && pnpm test -- --coverage` | core 包已配置 |

- Playwright 配置：`playwright.config.ts`
  - baseURL: `http://127.0.0.1:5173`
  - webServer: `pnpm --filter @cybernovelist/studio dev:e2e`
  - workers: 1（串行执行避免状态冲突）

## 构建与运行

```bash
# 安装依赖
pnpm install

# 启动开发服务器（http://localhost:3000）
pnpm dev          # studio 包：同时启动 Vite 前端 + Hono API

# 构建
pnpm build        # 递归构建所有包

# 类型检查
pnpm typecheck

# 运行测试
pnpm test
pnpm test:e2e

# 完整验证（lint + typecheck + test + build）
pnpm verify

# 单包操作
cd packages/core && pnpm test
cd packages/studio && pnpm dev
```

### Studio 开发模式细节
- `pnpm dev` = `pnpm build:api && pnpm dev:api & vite`
- `build:api` 先构建 core 包，再编译 API 的 tsconfig.api.json
- API 开发：`pnpm dev:api` → `tsx watch src/api/index.ts`
- 前端开发：Vite 默认端口（通常 5173）

## Git 工作流

- **分支**：`main`（主分支），`master`（遗留）
- **提交风格**：Conventional Commits（`feat:`, `fix:`, `docs:`, `chore:`, `test:`），使用中文描述
- **Pre-commit**：Husky + lint-staged 自动运行 Prettier 格式化和 ESLint fix
- **CI**：GitHub Actions `verify.yml`，在 `push` 到 main/master 或 PR 时运行 `pnpm verify`
- **并发控制**：CI 使用 `cancel-in-progress: true` 避免重复运行

## API 规范

RESTful JSON + SSE 推送，14 个模块 57 个端点。详见 `docs/API/api-reference.md`。

- 基础路径：`http://localhost:3000/api`
- SSE 端点：`/api/books/:bookId/sse`
- SSE 事件类型：`pipeline_progress` / `memory_extracted` / `chapter_complete` / `daemon_event` / `hook_wake` / `thundering_herd` / `quality_drift` / `context_changed`

## 常见任务速查

| 我想做... | 操作位置 |
|-----------|----------|
| 添加一个 Agent | `packages/core/src/agents/` 继承 `BaseAgent` |
| 添加 API 端点 | `packages/studio/src/api/routes/*.ts` 然后在 `server.ts` 注册 |
| 添加前端页面 | `packages/studio/src/pages/` + React Router 路由配置 |
| 修改数据模型 | `packages/core/src/models/`（Zod schema） |
| 添加提示词模板 | `packages/core/src/prompts/v1/` 或 `v2/`，更新 registry |
| 修改状态逻辑 | `packages/core/src/state/`（Manager → Store → Reducer） |
| 添加单元测试 | 在源文件旁创建同名 `.test.ts` |
| 添加 E2E 测试 | `e2e/*.spec.ts` |
| 修改构建配置 | `packages/*/vite.config.ts` 或 `tsconfig*.json` |

## 开发任务

详细开发计划见 `docs/Development/tasks.md`，共 **124 个原子任务**，11 个阶段，总计约 **525h**。

关键路径：基础设施 → 状态层 → 会话恢复 → 投影校验 → PipelineRunner → Hono API → 核心页面 → 伏笔双轨视图 → 测试
