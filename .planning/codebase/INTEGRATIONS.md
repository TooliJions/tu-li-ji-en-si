# 集成与运行时连接扫描

## 1. Studio 如何连接 Core

项目的真正桥接层是 `packages/studio/src/api/core-bridge.ts`。

它负责：

- 确定 Studio 的本地运行目录
- 初始化 `PipelineRunner`
- 加载 LLM Provider 配置
- 管理书籍运行时目录
- 管理守护进程实例注册表

### 运行时目录

默认运行目录不是根目录，而是：

- 优先取环境变量 `CYBERNOVELIST_STUDIO_RUNTIME_DIR`
- 否则落到 `packages/studio/.runtime`

也就是说，Studio 的实际书籍数据和状态默认会写在**工作台自己的本地运行目录**里。

## 2. LLM Provider 集成方式

### 配置来源

Studio 通过 `.cybernovelist-config.json` 读取：

- `defaultProvider`
- `defaultModel`
- `agentRouting`
- `providers`
- `notifications`

### 实际加载逻辑

`core-bridge.ts` 会：

1. 尝试读取配置文件
2. 过滤出带 `apiKey` 和 `baseUrl` 的 provider
3. 如果有可用 provider，则构建 `RoutedLLMProvider`
4. 如果没有，则退回 `DeterministicProvider`

### 当前支持的 Provider 类型

`packages/core/src/llm/routed-provider.ts` 当前支持：

- `openai`
- `claude`
- `ollama`
- `dashscope`
- `gemini`

### 路由特征

- 支持按 `agentName` 选择 provider 和 model
- 支持 `temperature` / `maxTokens` 覆盖
- 带**声誉分系统**：失败扣分，低分进入 cooldown，自动寻找 fallback provider

## 3. API 层集成

### API Server 入口

- `packages/studio/src/api/index.ts`：Node server 启动入口
- `packages/studio/src/api/server.ts`：Hono app 装配入口

### 主要 API 分组

`server.ts` 当前装配的路由分组包括：

- `/api/books`
- `/api/books/:bookId/chapters`
- `/api/books/:bookId/pipeline`
- `/api/books/:bookId/state`
- `/api/books/:bookId/daemon`
- `/api/books/:bookId/hooks`
- `/api/books/:bookId/analytics`
- `/api/books/:bookId/export`
- `/api/books/:bookId/prompts`
- `/api/books/:bookId/context`
- `/api/books/:bookId/natural-agent`
- `/api/books/:bookId/fanfic`
- `/api/books/:bookId/style`
- `/api/config`
- `/api/system`
- `/api/genres`

## 4. SSE 实时推送

Studio 通过 `server.ts` 暴露：

- `/api/books/:bookId/sse`

特征：

- 基于 `ReadableStream`
- 30 秒 ping 保活
- 按 `bookId` 维度维护客户端订阅
- 流水线进度和章节完成事件会通过 `eventHub` 广播

## 5. Pipeline 与 UI 的连接方式

`packages/studio/src/api/routes/pipeline.ts` 是最关键的业务路由之一。

它负责把 UI 的创作操作映射为 `PipelineRunner` 调用：

- `POST /write-next` → `composeChapter()` 或 `writeDraft()`
- `POST /fast-draft` → `writeFastDraft()`
- `POST /upgrade-draft` → `upgradeDraft()`
- `POST /write-draft` → `writeDraft()`
- `POST /plan-chapter` → `planChapter()`
- `POST /bootstrap-story` → 自动大纲/角色/世界观/首章规划

这个路由还有两个很重要的现实特征：

- 会把**书籍上下文**（当前焦点、世界规则、关键角色、进行中伏笔）拼进意图
- 会把流水线状态写进内存 `pipelineStore`，并通过 SSE 推送前端

## 6. 守护进程与通知集成

`packages/core/src/daemon.ts` 体现了后台自动写章的运行机制：

- 通过 `SmartInterval` 控制节奏
- 通过 `QuotaGuard` 控制 token 日限额
- 支持通知事件：启动、停止、章节完成、章节失败、配额耗尽、连续降级

而 `core-bridge.ts` 用一个 `daemonRegistry` 维护每本书对应的守护进程实例。

## 7. 导出与外部输出

仓库当前导出能力位于 `packages/core/src/export/`：

- EPUB
- Markdown
- TXT

Studio 通过 API 路由把这些能力暴露给前端页面。

## 8. 对后续开发最有用的集成结论

- **真正的系统边界不在浏览器，而在 `core-bridge.ts`**
- **所有创作动作的最终落点都是 `PipelineRunner`**
- **配置、Provider、通知、守护进程，都是通过 Studio API 层拼起来的**
- 若你要改“模型切换、运行目录、守护进程、流水线调用方式”，优先看：
  - `core-bridge.ts`
  - `server.ts`
  - `routes/pipeline.ts`
  - `routes/config.ts`
