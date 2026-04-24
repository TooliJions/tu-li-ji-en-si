# CLAUDE.md

> 更新说明：本次通过 codebase-onboarding 流程增强了代码风格、CI/CD、Git 工作流和命名约定等侦察细节。原有架构说明全部保留。

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概况

CyberNovelist v7.0 是面向长篇网络小说创作的 **本地优先 AI 写作系统**，采用 TypeScript Monorepo 架构。

- `packages/core` — 核心引擎（Agent 系统 + 流水线编排 + 状态管理 + 治理 + 质量），无 UI 依赖
- `packages/studio` — Web 工作台（React + Hono + SSE）

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

## 代码风格与规范

### ESLint 配置（`eslint.config.mjs`）
- Flat config 格式，TypeScript ESLint 推荐规则集
- `@typescript-eslint/no-unused-vars`: warn（忽略 `_` 前缀参数）
- `@typescript-eslint/explicit-function-return-type`: off
- `@typescript-eslint/no-explicit-any`: warn
- `no-console`: warn（仅允许 `console.warn` / `console.error`）

### 命名约定
- **文件**：kebab-case（`chapter-planner.ts`, `runtime-store.ts`）
- **类/接口**：PascalCase（`PipelineRunner`, `StateManager`）
- **测试文件**：与源文件同名 + `.test.ts`，旁侧放置
- **常量**：SCREAMING_SNAKE_CASE（如 `GENRE_WRITER_STYLE_MAP`）

### TypeScript
- 启用 `composite: true`（Project References）
- 允许隐式函数返回类型
- `any` 类型触发警告而非错误
- ESM 模块（`"type": "module"`）

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
