# Phase 7: Studio 工作台 - Context

**Gathered:** 2026-04-21
**Status:** Implementation exists — not yet committed to git, 24 test failures

<domain>
## Phase Boundary

Web UI 可访问，核心页面可操作，API 完整覆盖。覆盖 Hono API（14 个路由模块）、前端页面（18 个）、组件（22 个）、SSE 推送、API 客户端。73 个源文件 + 56 个测试文件，27724 行代码。

**注意：** Studio 全部文件均未提交到 git（untracked 状态），24 个测试失败（6 个文件）。测试修复留到 Phase 10。

</domain>

<decisions>
## Implementation Decisions

### Hono API Server
- **D-01:** Hono API 位于 `packages/studio/src/api/`，入口 `server.ts`，SSE 位于 `sse.ts`
- **D-02:** 14 个路由模块：analytics、books、chapters、config、context、daemon、export、fanfic、hooks、natural-agent、pipeline、prompts、state、style、system
- **D-03:** API 路由通过 `@cybernovelist/core` 调用 core 引擎功能

### Frontend Pages (18)
- **D-04:** 核心页面：Dashboard（仪表盘）、BookCreate（创建书）、BookDetail（书籍详情）、Writing（写作工作台）、Chapters（章节管理）、ChapterReader（章节阅读）
- **D-05:** 配置页面：ConfigView（配置）、WritingPlan（写作计划）、TruthFiles（真相文件）、HookPanel（伏笔面板）、HookTimeline（伏笔时间轴）
- **D-06:** 高级页面：Analytics（数据分析）、EmotionalArcs（情感弧线）、StyleManager（风格管理）、DoctorView（系统诊断）、DaemonControl（守护进程控制）、ExportView（导出）、FanficInit（同人创作）、PromptVersion（提示词版本）、NaturalAgent（自然语言 Agent）、LogViewerPage（日志查看）、ImportManager（导入管理）

### Frontend Components (22)
- **D-07:** 布局组件：AppLayout、Header、Sidebar
- **D-08:** 业务组件：AuditReport（审计报告）、BaselineChart（基线图表）、ContextPopup（上下文弹窗）、DaemonLogStream（守护进程日志）、EntityHighlight（实体高亮）、HookMagnifier（伏笔放大镜）、HookMinimap（伏笔小地图）、HookTimelineWorkspace（伏笔时间轴工作区）、InspirationShuffle（灵感洗牌）、MemoryWordCloud（记忆词云）、PollutionBadge（污染标识）、RadarChart（雷达图）、StateDiffView（状态差异视图）、SuggestionBubble（建议气泡）、ThunderAnim（惊群动画）、TimeDial（时间拨盘）、TrendDetailChart（趋势明细图表）、WorldRulesEditor（世界规则编辑器）、LogPanel、LogViewer、DaemonPanel
- **D-09:** 库文件：api.ts（API 客户端）、utils.ts（工具函数）、entity-context.ts（实体上下文）、genre-catalog.ts（题材目录）

### SSE Push
- **D-10:** SSE 位于 `api/sse.ts`，推送 pipeline_progress / memory_extracted / chapter_complete / daemon_event / hook_wake 等事件
- **D-11:** API 客户端（`lib/api.ts`）封装所有 HTTP 调用

### Integration Patterns
- **D-12:** Studio 通过导入 `@cybernovelist/core` 调用核心引擎
- **D-13:** API 路由是 Hono HTTP handlers，不是直接调用 core 函数
- **D-14:** React 组件使用 jsdom 测试环境，Testing Library 进行测试

### Known Issues (deferred to Phase 10)
- **D-15:** 24 个测试失败（6 文件）：book-detail（9 失败）、chapter-reader（3 失败）、dashboard（5 失败）、log-viewer-page（1 失败）、app-layout（3 失败）、sidebar（3 失败）
- **D-16:** 3 个编译错误：export-view.tsx 缺少 startExport/ExportFormat 导出，log-viewer-page.tsx DaemonLogStream 缺少 searchQuery prop
- **D-17:** 全部 Studio 文件为 untracked 状态，尚未提交到 git

</decisions>

<canonical_refs>
## Canonical References

### API Routes (Hono)
- `packages/studio/src/api/server.ts` — Hono API 入口
- `packages/studio/src/api/sse.ts` — SSE 推送
- `packages/studio/src/api/routes/books.ts` — 书籍管理路由
- `packages/studio/src/api/routes/chapters.ts` — 章节管理路由
- `packages/studio/src/api/routes/pipeline.ts` — Pipeline 路由
- `packages/studio/src/api/routes/daemon.ts` — 守护进程路由
- `packages/studio/src/api/routes/hooks.ts` — 伏笔路由
- `packages/studio/src/api/routes/state.ts` — 状态路由
- `packages/studio/src/api/routes/export.ts` — 导出路由
- `packages/studio/src/api/routes/analytics.ts` — 数据分析路由
- `packages/studio/src/api/routes/config.ts` — 配置路由
- `packages/studio/src/api/routes/context.ts` — 上下文路由
- `packages/studio/src/api/routes/fanfic.ts` — 同人创作路由
- `packages/studio/src/api/routes/natural-agent.ts` — 自然语言 Agent 路由
- `packages/studio/src/api/routes/prompts.ts` — 提示词版本路由
- `packages/studio/src/api/routes/style.ts` — 风格管理路由
- `packages/studio/src/api/routes/system.ts` — 系统路由

### Frontend Pages
- `packages/studio/src/pages/dashboard.tsx` — 仪表盘
- `packages/studio/src/pages/book-create.tsx` — 创建书
- `packages/studio/src/pages/book-detail.tsx` — 书籍详情
- `packages/studio/src/pages/writing.tsx` — 写作工作台
- `packages/studio/src/pages/chapters.tsx` — 章节管理
- `packages/studio/src/pages/chapter-reader.tsx` — 章节阅读器

### Frontend Components
- `packages/studio/src/components/layout/app-layout.tsx` — App 布局
- `packages/studio/src/components/layout/header.tsx` — 头部
- `packages/studio/src/components/layout/sidebar.tsx` — 侧边栏
- `packages/studio/src/lib/api.ts` — API 客户端

### Dependencies (from prior phases)
- `packages/core/src/` — Core engine（Phase 1-6 补）
- `packages/core/dist/` — Core 编译输出

</canonical_refs>

<code_context>
## Existing Code State

### NOT Verified
- Studio 全部文件为 untracked 状态，尚未提交到 git
- Studio 测试：451 passed / 24 failed（6 files）
- Studio 编译：3 TypeScript errors
- Total studio code: **27,724 lines** (73 source + 56 test files)

### Integration Points
- Phase 8 导出与通知集成 ExportView 页面和导出路由
- Phase 9 异常交互涉及 TimeDial、PollutionBadge、StateDiffView 等组件
- Phase 10 测试与优化需修复 24 个失败测试和 3 个编译错误

</code_context>

<deferred>
## Deferred / Not Yet Addressed

- 24 个 Studio 测试失败修复 — Phase 10 范围
- 3 个 Studio 编译错误修复 — Phase 10 范围
- Studio 文件提交到 git — 需在适当时机提交
- 前端 E2E 测试（Playwright）— 已有 e2e 目录但未执行
- UI 可视化高级功能（雷达图、惊群动画、时间拨盘等）— 已实现但测试不完整

</deferred>

---

*Phase: 07-studio-workbench*
*Context gathered: 2026-04-21*
*Implementation noted: exists but untracked, 24 test failures deferred*
