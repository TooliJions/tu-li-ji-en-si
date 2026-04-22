# 技术栈扫描

## 项目定位

`CyberNovelist v7.0` 是一个**本地优先 AI 长篇写作系统**。仓库采用 `pnpm workspace` monorepo，核心分成两个包：

- `packages/core`：纯引擎层，负责 Agent、流水线、状态、治理、质量、导出、守护进程
- `packages/studio`：工作台层，负责 React UI、Hono API、SSE 推送，以及与 `core` 的桥接

## 仓库级技术栈

- **语言**：TypeScript
- **包管理**：`pnpm`
- **Monorepo**：`pnpm-workspace.yaml`
- **Node 要求**：`>=20`
- **格式/质量**：ESLint 9 + Prettier + Husky + lint-staged
- **测试**：Vitest + Playwright

根 `package.json` 里的核心脚本：

- `pnpm build`：递归构建所有包
- `pnpm typecheck`：递归类型检查
- `pnpm test`：递归测试
- `pnpm verify`：`lint + typecheck + test + build`

## `@cybernovelist/core`

### 运行时能力

- **LLM 接入**：`OpenAICompatibleProvider`、`ClaudeProvider`、`OllamaProvider`、`DashScopeProvider`、`GeminiProvider`
- **模型路由**：`RoutedLLMProvider`
- **状态存储**：文件系统 + SQLite（依赖 `better-sqlite3` / `sql.js`）
- **结构校验**：`zod`
- **导出**：EPUB / Markdown / TXT
- **守护进程**：`DaemonScheduler`

### 目录分层

- `agents/`：规划、执行、审计、风格、实体、伏笔相关 Agent
- `pipeline/`：`PipelineRunner`、修订循环、章节重组、真相校验等
- `state/`：状态读写、投影、恢复、锁、导入导出
- `governance/`：伏笔治理体系
- `quality/`：AI 痕迹检测、质量分析、情感弧线等
- `scheduler/`：智能间隔与配额控制
- `notify/`：通知通道
- `export/`：导出器

## `@cybernovelist/studio`

### 前端栈

- **UI**：React 19
- **路由**：`react-router-dom` 7
- **构建/开发**：Vite 6
- **样式**：Tailwind 4 + `clsx` + `class-variance-authority` + `tailwind-merge`
- **表单校验**：`@hookform/resolvers` + `zod`

### 后端/API 栈

- **HTTP 框架**：Hono
- **Node Server**：`@hono/node-server`
- **实时推送**：SSE

### Studio 的实际职责

- 提供书籍、章节、流水线、守护进程、状态、分析、配置、导出、提示词等页面与接口
- 通过 `src/api/core-bridge.ts` 把 Web 层和 `@cybernovelist/core` 的本地运行时连接起来
- 在没有可用 API Key 时，自动退回到**确定性 mock provider**，方便本地开发与测试

## 配置与运行时

### 关键配置文件

- `.cybernovelist-config.json`：模型默认提供商、Agent 路由、通知配置
- `playwright.config.ts`：E2E 配置，默认起 `@cybernovelist/studio` 的 `dev:e2e`

### 当前配置特征

从仓库内现有 `.cybernovelist-config.json` 看：

- 默认 Provider 指向 `DashScope`
- Agent 级别支持 `Writer` / `Auditor` / `Planner` 路由
- 通知项预留了 Telegram 配置

## 测试体系

- **单元/集成**：Vitest，覆盖 `core` 与 `studio`
- **E2E**：Playwright，`e2e/` 下已有多条主流程 spec
- **E2E 入口地址**：`http://127.0.0.1:5173`

## 对后续开发最重要的结论

- 这是一个**核心引擎优先**的仓库：大多数关键业务改动都应先看 `packages/core`
- `studio` 不是简单前端，而是**React 页面 + Hono API + 本地运行时桥接层**的组合
- 模型调用不是写死单 provider，而是**Agent 粒度路由 + fallback**
- 项目对“长篇一致性”非常重视，所以状态、伏笔、质量、恢复机制都很重
