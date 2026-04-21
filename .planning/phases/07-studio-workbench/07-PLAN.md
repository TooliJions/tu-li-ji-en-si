---
phase: 7
title: "Phase 7: Studio 工作台 — 验证现有实现"
goal: "验证 Phase 7 所有已实现的 Studio 文件和 API 路由满足 ROADMAP.md 定义的成功标准"
wave: 1
dependencies: Phase 4 (流水线编排)
requirements_addressed: [INIT-03, PLAN-05, WRITE-05, NFR-04]
files_modified: []
autonomous: true
---

# Phase 7: Studio 工作台 — 验证计划

## Objective

Phase 7 已在历史开发中实现。本计划验证现有代码满足 ROADMAP.md 定义的成功标准，不写新代码。

## Success Criteria (from ROADMAP.md)

1. 可上传创作简报（Markdown 文件）
2. 可通过世界规则编辑器设定硬性约束
3. 快速试写按钮可在 UI 上一键生成，首段产出 <15s
4. 章节加载延迟 <500ms

## Tasks

### 1. 验证 Hono API Server（入口 + SSE）

**文件:** `packages/studio/src/api/server.ts`, `api/index.ts`, `api/sse.ts`

验证：
- `server.ts` 正确注册所有 14 个路由模块
- `sse.ts` 推送事件类型：pipeline_progress / memory_extracted / chapter_complete / daemon_event / hook_wake
- API 入口 `/api` 路径正确
- server 可启动并监听端口

### 2. 验证 API 路由模块（14 个）

**目录:** `packages/studio/src/api/routes/`

验证所有路由文件存在且可导入：
- `analytics.ts` — 数据分析
- `books.ts` — 书籍管理
- `chapters.ts` — 章节管理
- `config.ts` — 配置
- `context.ts` — 上下文
- `daemon.ts` — 守护进程
- `export.ts` — 导出
- `fanfic.ts` — 同人创作
- `hooks.ts` — 伏笔
- `natural-agent.ts` — 自然语言 Agent
- `pipeline.ts` — 流水线
- `prompts.ts` — 提示词版本
- `state.ts` — 状态
- `style.ts` — 风格管理

验证：
- 每个路由通过 `@cybernovelist/core` 调用 core 引擎
- 路由模块有对应的 `.test.ts` 文件

### 3. 验证前端页面（18 个）

**目录:** `packages/studio/src/pages/`

验证页面文件存在：
- `dashboard.tsx` — 仪表盘
- `book-create.tsx` — 创建书
- `book-detail.tsx` — 书籍详情
- `writing.tsx` — 写作工作台
- `chapters.tsx` — 章节管理
- `chapter-reader.tsx` — 章节阅读器
- `config-view.tsx` — 配置
- `writing-plan.tsx` — 写作计划
- `truth-files.tsx` — 真相文件
- `hook-panel.tsx` — 伏笔面板
- `hook-timeline.tsx` — 伏笔时间轴
- `analytics.tsx` — 数据分析
- `emotional-arcs.tsx` — 情感弧线
- `style-manager.tsx` — 风格管理
- `doctor-view.tsx` — 系统诊断
- `daemon-control.tsx` — 守护进程控制
- `export-view.tsx` — 导出
- `fanfic-init.tsx` — 同人创作

### 4. 验证核心成功标准

#### 4.1 创作简报上传（INIT-03）

**检查点：** `book-create.tsx` 或 `dashboard.tsx` 中是否有 Markdown 文件上传功能
- 验证 `FileReader` 或 `input type="file"` 处理 `.md` 文件
- 验证上传后解析为文本并传递给 API

#### 4.2 世界规则编辑器（PLAN-05）

**检查点：** 是否存在世界规则编辑功能
- 验证 `WorldRulesEditor` 组件存在
- 验证规则可保存到 `config` 或 `state`

#### 4.3 快速试写按钮（WRITE-05）

**检查点：** UI 上是否有快速试写入口
- 验证 `writing.tsx` 或相关页面有 `writeFastDraft` 调用
- 验证 SSE 或 API 调用链正确

#### 4.4 章节加载延迟（NFR-04）

**检查点：** 章节加载是否有性能优化
- 验证 `chapter-reader.tsx` 使用缓存或预加载
- 验证 `lib/api.ts` 有合理的请求配置

### 5. 验证前端组件（22 个）

**目录:** `packages/studio/src/components/`

验证组件文件存在：
- 布局组件：`layout/app-layout.tsx`, `layout/header.tsx`, `layout/sidebar.tsx`
- 业务组件：`audit-report.tsx`, `baseline-chart.tsx`, `context-popup.tsx`, `daemon-log-stream.tsx`, `entity-highlight.tsx`, `hook-magnifier.tsx`, `hook-minimap.tsx`, `hook-timeline-workspace.tsx`, `inspiration-shuffle.tsx`, `memory-wordcloud.tsx`, `radar-chart.tsx`, `trend-detail-chart.tsx`, `world-rules-editor.tsx`
- Phase 9 组件（已验证）：`pollution-badge.tsx`, `state-diff-view.tsx`, `time-dial.tsx`
- 其他：`log-panel.tsx`, `log-viewer.tsx`, `daemon-panel.tsx`

### 6. 验证 API 客户端 + 库文件

**文件:** `packages/studio/src/lib/api.ts`, `lib/utils.ts`

验证：
- `api.ts` 封装所有 HTTP 调用（books/chapters/pipeline/daemon/hooks/export 等）
- SSE 客户端订阅逻辑
- 错误处理 + 重试

### 7. 运行 Studio 测试

运行 `npx vitest run` 在 `packages/studio` 目录：
- 确认 451 个通过的测试仍然通过
- 记录 24 个失败的测试（已知问题，留到 Phase 10）
- 记录 3 个编译错误（已知问题，留到 Phase 10）

### 8. 确认已知问题

记录以下已知问题到 VERIFICATION.md（不修复）：
- 24 个测试失败（6 个文件）：book-detail（9）、chapter-reader（3）、dashboard（5）、log-viewer-page（1）、app-layout（3）、sidebar（3）
- 3 个编译错误：export-view.tsx 缺少导出，log-viewer-page.tsx 缺少 prop
- 所有 Studio 文件为 untracked 状态

## Acceptance

- 全部 8 个验证项完成
- 4 个 ROADMAP.md 成功标准满足
- 451 个 Studio 测试通过（24 个已知失败不阻断）
- Hono API 14 个路由模块完整
- 18 个前端页面完整
- 22 个前端组件完整
- 更新 STATE.md 和 ROADMAP.md 标记 Phase 7 完成
