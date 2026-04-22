# 项目结构与上手地图

## 1. 仓库骨架

```text
AI量产/
├─ packages/
│  ├─ core/
│  └─ studio/
├─ docs/
├─ e2e/
├─ .planning/
├─ README.md
├─ package.json
└─ playwright.config.ts
```

## 2. 你后续最常进入的目录

### `packages/core/src`

这是业务主战场。

- `agents/`：Agent 定义，适合改提示词逻辑、结构化输出、单点智能行为
- `pipeline/`：主流程编排，适合改写作步骤、修订循环、落盘顺序
- `state/`：适合改状态结构、版本、投影、恢复、锁
- `llm/`：适合改模型适配和路由
- `governance/`：适合改伏笔排班/生命周期/冲突仲裁
- `quality/`：适合改审计、AI 痕迹检测、指标分析

### `packages/studio/src`

这是操作台与接口层。

- `pages/`：页面入口
- `components/`：复用 UI 组件
- `api/routes/`：Hono 路由分组
- `api/core-bridge.ts`：Studio 与 Core 的桥
- `App.tsx`：前端路由总表
- `main.tsx`：前端挂载入口

## 3. 前端页面总入口

`packages/studio/src/App.tsx` 直接列出了核心页面：

- `/`：仪表盘
- `/book-create`：创建书籍
- `/book/:bookId`：书籍详情
- `/writing`：写作页
- `/analytics`：分析页
- `/truth-files`：真相文件
- `/daemon`：守护进程
- `/config`：配置页
- `/prompts/:bookId`：提示词版本
- 以及 hooks、日志、风格、导出、导入等扩展页面

如果你想找“某个页面功能从哪进入”，先看这里最省时间。

## 4. API 入口与路由地图

### API 启动

- `packages/studio/src/api/index.ts`：启动 `@hono/node-server`
- `packages/studio/src/api/server.ts`：把各路由挂到 `/api/*`

### 高频路由

- `routes/books.ts`：书籍 CRUD / 列表
- `routes/chapters.ts`：章节读写
- `routes/pipeline.ts`：写作流水线主入口
- `routes/state.ts`：状态读写/查看
- `routes/daemon.ts`：守护进程控制
- `routes/analytics.ts`：统计分析
- `routes/config.ts`：模型和通知配置
- `routes/prompts.ts`：提示词版本

## 5. 最关键的单文件导航

如果你时间很少，只读这些文件就能快速接手：

1. `README.md`：项目目标与功能总览
2. `packages/core/src/pipeline/runner.ts`：正式写作主链路
3. `packages/core/src/state/runtime-store.ts`：运行时状态保存方式
4. `packages/studio/src/api/core-bridge.ts`：Studio 如何连接 Core
5. `packages/studio/src/api/routes/pipeline.ts`：UI 如何调用主链路
6. `packages/studio/src/App.tsx`：页面总入口

## 6. 当前仓库的活跃改动区域

根据当前会话开始时的 `git status`，未提交修改集中在：

- `packages/core/src/agents/`
  - `base.ts`
  - `chapter-planner.ts`
  - `character.ts`
  - `context-card.ts`
  - `intent-director.ts`
  - `planner.ts`
  - `scene-polisher.ts`
- `packages/core/src/models/state.ts`
- `packages/core/src/pipeline/runner.ts`
- `packages/core/src/state/`
  - `bootstrap.ts`
  - `projections.ts`
  - `runtime-store.ts`
- `packages/core/src/pipeline/runner.test.ts`
- `packages/studio/src/api/routes/`
  - `analytics.ts`
  - `pipeline.ts`
  - `prompts.ts`

这意味着当前开发重点大概率落在：

- Agent 输出与主流水线衔接
- 状态结构/投影
- Studio API 层对主链路的适配

后面改代码时，优先避开这些文件里的用户现有改动，或先仔细读取再下手。

## 7. 文档资产怎么用

仓库里有两类文档都值得看：

- `docs/`：偏产品/架构说明
- `.planning/`：偏项目过程、阶段、路线图、真实状态复盘

建议读取顺序：

1. `README.md`
2. `.planning/PROJECT.md`
3. `.planning/ROADMAP.md`
4. `docs/Architecture/architecture.md`

## 8. 最实用的上手建议

如果下一步要继续做开发，推荐按这个顺序理解问题：

- **功能入口在哪个页面**
- **页面调用了哪个 API 路由**
- **路由是不是走了 `core-bridge`**
- **最终落到 `PipelineRunner` 的哪个方法**
- **这个方法依赖了哪个 Agent / state / governance 模块**

照这个顺序看，基本不会在仓库里迷路。
