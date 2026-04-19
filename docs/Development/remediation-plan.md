# CyberNovelist 文档对齐修复计划

> 日期：2026-04-19
> 目标：把当前“部分真实接线 + 多处占位/简化实现”的状态，推进到“核心能力与 UI 基本对齐 PRD/Architecture/UI 文档，可进入验收”的状态。

## 1. 修复目标

本计划聚焦以下差距：

1. Studio 仍存在占位路由、静态分析数据、内存态伏笔数据、伪诊断/伪恢复结果。
2. 多个 P0/P1 交互组件虽然已存在，但未真正接入用户路径。
3. 页面导航与文档定义的工作台范围不一致，导致“文档宣称可用，但用户无法进入”。
4. 真相文件体系未达到 PRD 要求的 7 文件完整集，状态导入/差异比对也未形成闭环。

## 2. 优先级排序修复清单

### P0.1 真相文件体系补齐并闭环

- 范围：`packages/studio/src/api/routes/state.ts`、`packages/studio/src/pages/truth-files.tsx`、core state/projection 相关能力
- 当前问题：只暴露 4 个真相文件；Markdown 导入只写文件，不做 AI 解析回填和结构化 diff；projection-status 仍是简化版。
- 修复目标：对齐 `current_state/hooks/chapter_summaries/subplot_board/emotional_arcs/character_matrix/manifest` 7 文件，并形成“读取 → 编辑 → 导入 → 校验 → diff”闭环。
- 验收标准：
  - TruthFiles 列表能显示 7 个文件。
  - 导入 Markdown 后能返回结构化 diff，而不是空数组。
  - JSON/Markdown 不一致时 Doctor 和 TruthFiles 都能看到差异。

### P0.2 Doctor 与恢复链路真实化

- 范围：`packages/studio/src/api/routes/system.ts`、`packages/studio/src/pages/doctor-view.tsx`、core recovery/lock/reorg 相关能力
- 当前问题：doctor 结果默认健康；fix-locks 固定返回 0；reorg recovery 直接返回成功；state diff 永远 0 项。
- 修复目标：接入 core 的锁管理、恢复、重组哨兵、投影 diff 能力，输出真实诊断结果。
- 验收标准：
  - 能检测残留锁、reorg 哨兵、projection 脱节。
  - 修复按钮调用真实修复逻辑并刷新状态。
  - diff 输出自然语言摘要与分类项，而不是固定文案。

### P0.3 伏笔治理从内存态切到真实状态层

- 范围：`packages/studio/src/api/routes/hooks.ts`、`packages/studio/src/pages/hook-panel.tsx`、core governance/state
- 当前问题：hooks 路由仍是内存 Map；timeline/health/wake-schedule 多处空数组或伪数据。
- 修复目标：Studio hooks 全部读取 manifest/hooks 与 governance 产物，支持真实生命周期、健康度、排班和唤醒。
- 验收标准：
  - 重启后伏笔状态不丢失。
  - health/timeline/wake-schedule 来源于真实状态。
  - dormant/open/progressing 等状态变更能影响后续调度展示。

### P0.4 污染隔离与回滚交互达标

- 范围：`packages/studio/src/pages/book-detail.tsx`、`packages/studio/src/pages/chapter-reader.tsx`、`packages/studio/src/components/time-dial.tsx`
- 当前问题：污染状态按 `qualityScore < 50` 简化推断；视觉样式未达到 PRD；回滚没有时间回溯拨盘确认。
- 修复目标：以 `accept_with_warnings`/污染隔离语义为准显示状态，并接入 `TimeDial` 进行不可逆操作确认。
- 验收标准：
  - 章节列表和阅读页对污染章节显示橙色边框、斜纹底纹、污染隔离标签/横幅。
  - 回滚前必须经过拨盘交互确认。
  - 回滚目标使用真实 snapshot 列表，不再伪造 snapshotId。

### P0.5 心流模式实体感知接入

- 范围：`packages/studio/src/pages/chapter-reader.tsx`、`packages/studio/src/components/entity-highlight.tsx`、`packages/studio/src/components/context-popup.tsx`、`packages/studio/src/api/routes/context.ts`
- 当前问题：心流模式只是隐藏周边 UI，没有实体识别、虚线底纹、悬停卡片。
- 修复目标：把实体识别与悬停上下文卡片接入阅读/写作心流视图。
- 验收标准：
  - 可见正文中的实体被高亮为弱虚线底纹。
  - 悬停实体可打开 context popup。
  - 无需手动选中文本。

### P1.1 分析面板真实化 ✅

- 范围：`packages/studio/src/api/routes/analytics.ts`、`packages/studio/src/pages/analytics.tsx`、core quality/baseline/scheduler/state
- 当前问题：字数、审计通过率、Token 用量、AI 痕迹、情感弧线仍是零值或静态样本。
- 修复目标：把 analytics 全部改为从真实章节、审计结果、质量基线、守护进程统计中聚合。
- 验收标准：
  - `word-count`、`audit-rate`、`token-usage` 返回真实数据。✅
  - `quality-baseline` 与 `baseline-alert` 反映真实趋势。✅
  - `emotional-arcs` 从真实角色/章节数据生成，而不是固定林晨/苏小雨。✅
  - `inspiration-shuffle` 通过 LLMProvider 并发生成 3 个风格改写。✅
  - 核心流水线按 writer/composer/auditor/reviser/planner 五通道落盘 telemetry。✅

### P1.2 伏笔双轨时间轴 UI 接入

- 范围：新增/接入 `hook-timeline`、`hook-minimap`、`hook-magnifier`、`thunder-anim`
- 当前问题：架构文档列出相关页面/组件，但用户路径中未接入。
- 修复目标：在 HookPanel 或独立页面提供全局热力小地图 + 局部放大镜 + 惊群动画。
- 验收标准：
  - 用户可从导航进入时间轴视图。
  - timeline 数据与真实 hooks schedule 一致。
  - 惊群分流有可视化表现。

### P1.3 页面导航与入口补齐

- 范围：`packages/studio/src/App.tsx`、`packages/studio/src/components/layout/sidebar.tsx`
- 当前问题：`/chapters` 仍是 placeholder；导出、题材管理等文档入口缺失；若干文档页面未开放路由。
- 修复目标：导航与路由至少对齐当前已实现页面，并明确文档未落地页的阶段性策略。
- 验收标准：
  - 不再存在面向用户的 placeholder 页面。
  - 侧栏入口与可访问路由一致。
  - 未落地页要么实现，要么从文档/导航里显式降级说明。

### P1.4 BookCreate 对齐文档字段

- 范围：`packages/studio/src/pages/book-create.tsx`、`packages/studio/src/api/routes/books.ts`
- 当前问题：缺少语言、平台、模型配置、创作简报上传等字段。
- 修复目标：补齐创建新书核心参数，保证初始化后 runtime 元数据完整。
- 验收标准：
  - 创建流程至少覆盖语言、平台、prompt/version 或模型配置、brief/import。
  - 创建结果落盘到真实 runtime 元数据。

### P1.5 记忆透视 UI 接入

- 范围：`packages/studio/src/pages/writing.tsx`、`packages/studio/src/components/memory-wordcloud.tsx`
- 当前问题：写作页记忆区仍是手写关键词，不是真实抽取结果。
- 修复目标：写作前或写作中展示真实记忆抽取词云/事实透视。
- 验收标准：
  - 内容来源于真实 manifest/facts/hooks。
  - 不再硬编码固定人物关键词。

## 3. 可执行修复计划

### 阶段 A：先把“假实现”清空

目标：去掉最影响验收的伪实现，建立真实数据面。

1. 完成 state 路由 7 真相文件补齐。
2. 完成 system 路由真实 doctor/diff/recovery 接线。
3. 完成 hooks 路由真实化，移除内存 store。
4. 为以上三块补 API 路由测试与关键 E2E。

建议顺序：`state -> system -> hooks`

原因：
- system 的 diff/doctor 依赖 state 真相文件完整性。
- hooks 真实化需要 state/manifest 为真相源。

### 阶段 B：补 P0 交互验收面

目标：让用户路径与 PRD 的核心体验一致。

1. 在书籍详情/章节阅读接入真实污染隔离样式。
2. 在回滚路径接入 `TimeDial` 及真实 snapshot 列表。
3. 在 ChapterReader 心流模式接入实体识别与悬停上下文卡片。
4. 为以上交互补页面测试。

建议顺序：`rollback -> pollution -> flow-mode`

原因：
- rollback 是破坏性操作，优先修正风险最高。
- pollution 和心流是体验层，可在真实状态能力就绪后接入。

### 阶段 C：补 P1 业务展示面

目标：把“看起来有页面但内容是假的”部分改成真实聚合。

1. analytics 路由真实化。
2. 写作页记忆透视接入真实数据。
3. 伏笔双轨时间轴接入页面与导航。
4. 补齐 BookCreate 字段与创建落盘。

建议顺序：`analytics -> writing memory -> hook timeline -> book create`

### 阶段 D：补导航与验收收口

目标：消除用户可见缺口，建立文档对齐证明。

1. 去掉 `/chapters` placeholder。
2. 统一 Sidebar、App 路由与实际页面能力。
3. 对未实现但仍在文档中的页面进行处理：
   - 要么实现
   - 要么从文档中降级并注明阶段性范围
4. 运行整体验证并输出对齐报告。

## 4. 每个工作包的执行模板

每个工作包都按以下顺序推进：

1. 先确认真相源
   - 这个能力的数据以哪个 core 文件/状态为准。
2. 再补 API 契约
   - 路由输入/输出与错误码先稳定。
3. 再接 UI
   - 页面层只消费真实 API，不直接伪造状态。
4. 最后补验证
   - route test
   - page/component test
   - 至少 1 条 E2E 主路径

## 5. 建议任务拆分

### 第一周可交付

- `state.ts` 真相文件补齐
- `system.ts` doctor/diff/recovery 真实化
- `hooks.ts` 去内存化

### 第二周可交付

- 污染隔离视觉达标
- `TimeDial` 接入回滚
- 心流模式实体感知接入

### 第三周可交付

- `analytics.ts` 真实化
- 记忆透视接入写作页
- hook timeline 页面/导航接入

### 第四周可交付

- BookCreate 扩展字段
- `/chapters` 页面落地
- 收口验证与文档对齐复审

## 6. 验证门禁

每完成一个阶段，至少执行：

1. `pnpm --filter @cybernovelist/studio test`
2. `pnpm --filter @cybernovelist/studio typecheck`
3. 受影响模块的定向 E2E
4. 文档对照回归：PRD 对应条目逐条打勾

## 7. 风险与依赖

### 关键依赖

- Studio 多数修复依赖 core 已有能力是否足够稳定暴露。
- 如果 core 缺少某些聚合接口，需要先补 core facade，再接 Studio。

### 主要风险

- 一边补 UI，一边继续保留伪 API，会导致“页面更像完成，但真相仍是假”。
- 同时改 state/system/hooks 容易引入路径与快照一致性回归，需要先补测试再扩展页面。

## 8. 完成定义

满足以下条件，才能说“基本对齐文档”：

1. P0 项全部落地，不再有伪恢复、伪 diff、伪 hooks、伪污染状态。
2. 分析面板、真相文件、伏笔面板均以真实 runtime 为数据源。
3. 用户导航中不存在 placeholder 页面。
4. 文档列出的关键页面与交互，在产品中可进入、可操作、可验证。
5. 路由测试、页面测试、E2E 能覆盖主链路。
