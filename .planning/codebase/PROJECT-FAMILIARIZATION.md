# 项目熟悉结果

## 先说结论

这个仓库的核心不是页面，而是 `packages/core` 里的 **`PipelineRunner` + 状态系统 + Agent 体系**。`packages/studio` 只是把这些能力包装成可操作的 Web 工作台与 API。

## 项目本质

`CyberNovelist` 是一个**本地优先的 AI 长篇写作系统**，目标不是生成一段文本，而是围绕“长篇一致性”构建完整创作闭环：

- 初始化作品
- 规划大纲与角色
- 生成章节
- 审计与修订
- 提取事实/伏笔
- 更新状态
- 支持批量自动写章
- 导出作品

## 我已经确认的实际结构

### Monorepo 分层

- `packages/core`：引擎层
- `packages/studio`：工作台层
- `docs` / `.planning`：架构与项目过程文档
- `e2e`：Playwright 端到端验证

### Core 里最关键的模块

- `pipeline/runner.ts`：主编排器
- `agents/`：章节规划、上下文卡片、意图导演、正文执行、润色、审计等节点
- `state/`：`StateManager`、`RuntimeStateStore`、投影与版本管理
- `llm/routed-provider.ts`：多模型路由与 fallback
- `daemon.ts`：后台自动写章

### Studio 里最关键的模块

- `App.tsx`：页面总入口
- `api/server.ts`：Hono 路由装配
- `api/core-bridge.ts`：Studio 和 Core 的桥
- `api/routes/pipeline.ts`：正式创作相关 API 主入口

## 真实运行链路

在当前代码里，正式创作主链路大致是：

1. 前端页面触发接口
2. `studio` 的 Hono 路由接住请求
3. 路由通过 `core-bridge` 获取 `PipelineRunner`
4. `PipelineRunner.composeChapter()` 串起：
   - `ContextCard`
   - `IntentDirector`
   - `ChapterExecutor`
   - `ScenePolisher`
   - 审计/修订
   - 记忆提取
   - 状态更新与持久化

这条链路是后续所有功能改动的主轴。

## 本地运行时与配置

我确认到两个很关键的现实细节：

- Studio 默认把运行时数据放在 `packages/studio/.runtime`
- 模型配置来自 `.cybernovelist-config.json`

同时，若没有可用 API Key，Studio 会退回**确定性 mock provider**，方便本地开发和测试。

## 当前仓库的开发热点

从当前未提交改动看，活跃区域主要在：

- `core` 的多个 Agent
- `pipeline/runner.ts`
- `state/bootstrap.ts`、`projections.ts`、`runtime-store.ts`
- `studio` 的 `analytics.ts`、`pipeline.ts`、`prompts.ts`

所以如果下一步要继续开发，我会优先关注这些区域，并避免覆盖你现有的本地修改。

## 后续协作时我会怎么定位问题

以后你让我改功能，我会默认按下面这条路线找代码：

**页面 / 交互入口 → Hono API 路由 → `core-bridge` → `PipelineRunner` → 对应 Agent / state 模块**

这套地图已经足够让我稳定接手这个项目。

## 本次附带产物

我已经在 `.planning/codebase/` 下补了一组扫描文档：

- `STACK.md`
- `INTEGRATIONS.md`
- `ARCHITECTURE.md`
- `STRUCTURE.md`

后面如果你要我继续深入某个子系统，我可以直接在这套地图基础上往下钻。
