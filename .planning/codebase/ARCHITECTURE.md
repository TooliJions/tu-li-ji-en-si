# 架构扫描（基于当前代码）

## 一句话理解

这是一个**以 `PipelineRunner` 为核心编排器**的本地 AI 写作系统：`studio` 负责交互和接口，`core` 负责生成、审计、修订、状态持久化与治理。

## 1. 实际分层

### 交互层：`packages/studio`

- React 页面：给作者操作书籍、章节、守护进程、分析、配置
- Hono API：把前端动作转成后端调用
- SSE：把流水线进度和结果实时推给前端
- Core Bridge：把 Web 世界和本地运行时目录、`PipelineRunner`、Provider 连接起来

### 核心引擎层：`packages/core`

主要子系统：

- `agents/`：不同职责的 LLM Agent
- `pipeline/`：主流程编排
- `state/`：状态存储、版本、投影、恢复
- `governance/`：伏笔治理
- `quality/`：质量分析与 AI 痕迹检测
- `scheduler/`：守护进程节奏与配额控制
- `export/`：导出
- `notify/`：通知

### 存储层

- 文件系统：章节、`book.json`、`meta.json`、`story/state/*`
- SQLite：时序记忆及相关状态能力（代码中已有 `MemoryDB` 等接口）
- Markdown 投影：便于人工查看和编辑状态快照

## 2. 当前代码里的主调用链

### 创建/初始化书籍

- Studio 调用书籍相关 API
- Core 通过 `StateManager` / `RuntimeStateStore` 初始化目录和 `manifest`
- 运行时目录通常落在 `packages/studio/.runtime`

### 正式写作主链路

`PipelineRunner.composeChapter()` 是最值得优先理解的方法。

基于当前 `runner.ts`，实际链路大致是：

1. 校验书籍和元数据
2. 获取书籍锁
3. `ContextCard` 组装上下文
4. 若已有章节计划则复用，否则通过 `IntentDirector` 生成本章意图/计划
5. `ChapterExecutor` 生成正文草稿
6. 校验世界规则
7. `ScenePolisher` 润色
8. 质量审计与修订循环
9. 记忆提取，回写事实与伏笔 delta
10. 持久化章节文件
11. 更新 `index.json` 与 `manifest.json`
12. 释放书籍锁

### 草稿模式

- `writeDraft()`：生成并持久化草稿，不走审计修订
- `writeFastDraft()`：快速试写，不持久化
- `upgradeDraft()`：草稿转正，带上下文漂移检测与重新润色

## 3. 为什么说 `PipelineRunner` 是系统中轴

从当前导出面和 API 使用方式看：

- `packages/core/src/index.ts` 明确把 `PipelineRunner` 作为公开能力的一部分
- Studio 的 `routes/pipeline.ts` 基本都围绕它调用
- `composeChapter()` 里已经串起上下文、意图、执行、润色、审计、修订、记忆、持久化

这意味着：

- **改创作链路**：优先看 `pipeline/runner.ts`
- **改单个智能节点**：回到 `agents/` 对应 Agent
- **改状态一致性**：回到 `state/`
- **改 UI 流程**：回到 `studio/src/api/routes/pipeline.ts` 与页面调用处

## 4. 状态架构的真实角色划分

### `StateManager`

负责偏文件系统层面的事情：

- 书籍路径计算
- 目录结构维护
- 章节索引读写
- 锁
- 章节文件定位

### `RuntimeStateStore`

负责偏运行时状态层面的事情：

- 加载/保存 `manifest.json`
- 维护 `versionToken`
- 生成完整状态快照

### `ProjectionRenderer`

负责把 JSON 状态投影为 Markdown 视图，便于人读。

### `applyRuntimeStateDelta()`

在 `runner.ts` 的记忆提取后被调用，用结构化 delta 更新状态。

## 5. Provider 架构的真实特点

`RoutedLLMProvider` 不是简单代理，而是带以下机制：

- 按 agent 路由不同 provider/model
- 请求级参数覆盖（如温度）
- 失败扣分
- 分数低于阈值进入 cooldown
- 自动 fallback 到可用 provider

所以这个项目天然适合：

- 不同 Agent 用不同模型
- 本地/云端混合推理
- 针对质量问题做 provider 级调优

## 6. 守护进程架构

`DaemonScheduler` 负责自动写章循环：

- 周期性调用 `runner.composeChapter()`
- 记录 token 使用
- 连续降级时自动停止
- 配额耗尽时自动停止
- 对外发事件和通知

这说明“批量写作”并不是单独系统，而是**围绕同一条 `PipelineRunner` 主链复用出来的自动调度层**。

## 7. 当前代码与规划文档的关系

仓库里的 `docs/Architecture/architecture.md` 和 `.planning/ROADMAP.md` 很完整，能看出项目有强规划背景。结合实际代码后，可以这样理解：

- 规划文档描述的是**目标与完整设计版图**
- 当前代码已经实现了大部分关键骨架
- 真正做改动时，仍应以 `packages/core/src/*` 和 `packages/studio/src/*` 的实际实现为准

## 8. 最重要的架构结论

- **系统中心是 `PipelineRunner`，不是页面，也不是某个 Agent**
- **Studio 本质是操作台 + API 装配层 + 本地运行时桥接层**
- **状态和一致性是第一优先级，创作只是建立在强状态之上的能力**
- **如果后面要接手功能开发，先建立这条导航顺序：页面 → API 路由 → core-bridge → PipelineRunner → 具体 Agent / state 子模块**
