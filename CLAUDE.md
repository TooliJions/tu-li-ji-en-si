# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概况

CyberNovelist v7.0 是面向长篇网络小说创作的 **本地优先 AI 写作系统**，采用 TypeScript Monorepo 架构。

- `packages/core` — 核心引擎（Agent 系统 + 流水线编排 + 状态管理 + 治理 + 质量），无 UI 依赖
- `packages/studio` — Web 工作台（React + Hono + SSE）

完整需求文档见 `docs/PRDs/CyberNovelist-PRD.md`，技术架构见 `docs/Architecture/architecture.md`，API 文档见 `docs/API/api-reference.md`，开发任务见 `docs/Development/tasks.md`。

## 技术栈

| 领域 | 技术 |
|------|------|
| 语言 | TypeScript |
| 包管理 | pnpm workspace |
| 测试 | Vitest（单元）+ Playwright（E2E） |
| 状态存储 | SQLite（WAL 模式） |
| Web 框架 | React + Hono + SSE |
| 校验 | Zod |
| 代码质量 | ESLint + Prettier + Husky |

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
│       ├── api/routes/      # 14 个 Hono 路由模块
│       ├── pages/           # 前端页面
│       └── components/      # 可复用组件
├── docs/                    # 项目文档（PRD/架构/API/UI/开发计划）
├── pnpm-workspace.yaml
└── tsconfig.json
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

## 开发任务

详细开发计划见 `docs/Development/tasks.md`，共 **124 个原子任务**，11 个阶段，总计约 **525h**。

关键路径：基础设施 → 状态层 → 会话恢复 → 投影校验 → PipelineRunner → Hono API → 核心页面 → 伏笔双轨视图 → 测试

## API 规范

RESTful JSON + SSE 推送，14 个模块 57 个端点。详见 `docs/API/api-reference.md`。

- 基础路径：`http://localhost:3000/api`
- SSE 事件类型：pipeline_progress / memory_extracted / chapter_complete / daemon_event / hook_wake / thundering_herd / quality_drift / context_changed
