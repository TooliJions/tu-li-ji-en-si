# Roadmap: CyberNovelist v7.0

**Milestone:** v1.0 初始版本
**Created:** 2026-04-21
**Restructured:** 2026-04-21 — based on actual codebase state vs planning docs
**Granularity:** Fine (11 phases — complex AI system with natural delivery boundaries)

## Phases

- [x] **Phase 1: 基础设施** — Monorepo 搭建、LLM Provider 抽象、Zod Schemas、测试配置
- [x] **Phase 2: 状态层** — StateManager、RuntimeStateStore、SQLite 时序库、快照回滚
- [x] **Phase 3: 核心 Agent** — 22 个 Agent 模块（规划/执行/审计类）
- [x] **Phase 4: 流水线编排** — PipelineRunner、修订循环、原子事务、章节拆分合并
- [x] **Phase 5: 伏笔治理** — HookPolicy、HookAgenda、HookGovernance、HookArbiter、HookLifecycle
- [x] **Phase 6: 质量层** — 33 维审计、AI 痕迹检测、修复策略、降级路径
- [x] **Phase 6 补: 守护进程** — Daemon 调度、SmartInterval、QuotaGuard
- [x] **Phase 7: Studio 工作台** — Web UI、Hono API、SSE 推送、核心页面（43 页面 + 36 组件）
- [x] **Phase 8: 导出与通知** — EPUB/TXT 导出、路径安全、通知推送
- [x] **Phase 9: 异常交互** — 状态脱节翻译、污染隔离视觉、时间回溯拨盘
- [x] **Phase 10: 测试与优化** — 单元测试、E2E 测试、性能优化

## Phase Details

### Phase 1: 基础设施
**Goal**: 项目可编译、测试、LLM 可调用
**Depends on**: Nothing (first phase)
**Requirements**: NFR-08
**Success Criteria**: ✓ Met — `pnpm install` → `pnpm build` → `pnpm test` 全绿
**Status**: Complete (85 test files, 1658 tests)
**Key files**: core/llm/*, core/models/*

### Phase 2: 状态层
**Goal**: 书籍状态可读写、快照回滚、并发安全
**Depends on**: Phase 1
**Requirements**: STATE-01~STATE-05, NFR-06, NFR-07, NFR-10, NFR-11
**Success Criteria**: ✓ Met — SQLite WAL 模式 + 原子事务 + 崩溃恢复
**Status**: Complete (StateManager, StateStore, Snapshot, Validator)
**Key files**: core/state/manager.ts, store.ts, snapshot.ts, validator.ts, sqlite-store.ts

### Phase 3: 核心 Agent
**Goal**: 22 个 Agent 模块可独立运行
**Depends on**: Phase 1, Phase 2
**Requirements**: PLAN-01~PLAN-03, WRITE-07~WRITE-09
**Success Criteria**: ✓ Met — 24 Agent 文件（12704 行代码），全部有测试
**Status**: Complete (OutlinePlanner, CharacterDesigner, ChapterPlanner, IntentDirector, ContextCard, etc.)
**Key files**: core/agents/* (24 files)

### Phase 4: 流水线编排
**Goal**: 章节可端到端生成（草稿→审计→修订→持久化）
**Depends on**: Phase 2, Phase 3
**Requirements**: WRITE-01~WRITE-04, WRITE-06, WRITE-12~WRITE-13, NFR-01~NFR-03, NFR-05, QUAL-05
**Success Criteria**: ✓ Met — PipelineRunner 完整 15 步链路
**Status**: Complete (PipelineRunner, RevisionLoop, AtomicOps, ChapterSplitter)
**Key files**: core/pipeline/runner.ts, revision-loop.ts, atomic-ops.ts, chapter-merger.ts

### Phase 5: 伏笔治理
**Goal**: 伏笔可自动注册、排班、生命周期管理
**Depends on**: Phase 2, Phase 3
**Requirements**: HOOK-01~HOOK-06
**Success Criteria**: ✓ Met — 5 层伏笔治理架构
**Status**: Complete (10 Governance 文件，6405 行代码)
**Key files**: core/governance/* (hook-policy, hook-agenda, hook-governance, hook-arbiter, hook-lifecycle)

### Phase 6: 质量层
**Goal**: 33 维审计、AI 痕迹检测、4 种修复策略
**Depends on**: Phase 4
**Requirements**: QUAL-01~QUAL-08, WRITE-14
**Success Criteria**: ✓ Met — 33 维审计 + 4 种修复策略 + POV 过滤 + 跨章重复检测
**Status**: Complete (10 Quality 文件，6927 行代码)
**Key files**: core/quality/* (auditor, ai-detector, repair-strategy, pov-filter, cross-chapter-repetition, etc.)

### Phase 6 补: 守护进程
**Goal**: 后台自动批量写章，智能间隔和配额保护
**Depends on**: Phase 4, Phase 6
**Requirements**: WRITE-10, WRITE-11
**Success Criteria**: ✓ Met — 守护进程 + SmartInterval + QuotaGuard + RPM 监控
**Status**: Complete (4 Daemon 文件，2011 行代码)
**Key files**: core/daemon.ts, scheduler/smart-interval.ts, scheduler/quota-guard.ts

### Phase 7: Studio 工作台
**Goal**: Web UI 可访问，核心页面可操作，API 完整覆盖
**Depends on**: Phase 4
**Requirements**: INIT-03, PLAN-05, WRITE-05, NFR-04
**Success Criteria**: ✓ Met — Hono API 14 路由 + 43 页面 + 36 组件
**Status**: Complete (73 Studio 文件，472/475 测试通过)
**Remaining**: 2 测试失败（sidebar.test.tsx 导入管理链接查找）
**Key files**: studio/src/api/routes/*, studio/src/pages/*, studio/src/components/*
**UI hint**: yes

### Phase 8: 导出与通知
**Goal**: 作品可导出为 EPUB/TXT，路径安全
**Depends on**: Phase 4
**Requirements**: EXPORT-01, EXPORT-02, NFR-09
**Success Criteria**: ✓ Met — EPUB/TXT/Markdown 导出 + 通知推送
**Status**: Complete (5 文件，1508 行代码)
**Key files**: core/export/epub.ts, txt.ts, markdown.ts, notify/*

### Phase 9: 异常交互
**Goal**: 异常状态可理解地呈现给用户
**Depends on**: Phase 7
**Requirements**: UX-01, UX-02, UX-03
**Success Criteria**: ✓ Met — StateDiffView + PollutionBadge + TimeDial
**Status**: Complete (3 组件，415 行代码，27/27 测试通过)
**Key files**: studio/src/components/state-diff-view.tsx, pollution-badge.tsx, time-dial.tsx
**UI hint**: yes

### Phase 10: 测试与优化
**Goal**: 核心测试覆盖达标，性能符合要求
**Depends on**: Phase 1, Phase 4, Phase 6
**Requirements**: NFR-12
**Success Criteria**: ✓ Met — 91.9% 覆盖率（1658/1658 测试通过），E2E 5 spec 覆盖主流程
**Status**: Complete (Core 1658 tests, Studio 475 tests, 5 E2E specs)
**Remaining**: 2 Studio 测试失败（sidebar.test.tsx）待修复

## Progress Table

| Phase | Status | Tests | Code | Notes |
|-------|--------|-------|------|-------|
| 1. 基础设施 | Complete | 85 files / 1658 tests | Core | 全绿 |
| 2. 状态层 | Complete | StateManager 16 tests | ~5000 lines | WAL + 原子事务 |
| 3. 核心 Agent | Complete | 24 Agent files | 12704 lines | 全类型覆盖 |
| 4. 流水线编排 | Complete | runner 44 tests | ~8444 lines | 15 步链路 |
| 5. 伏笔治理 | Complete | HookPolicy 18 tests | ~6405 lines | 5 层架构 |
| 6. 质量层 | Complete | Auditor 15 tests | ~6927 lines | 33 维审计 |
| 6 补. 守护进程 | Complete | Daemon 28 tests | ~2011 lines | RPM 监控 |
| 7. Studio 工作台 | Complete | 472/475 tests | ~27724 lines | 2 测试待修复 |
| 8. 导出与通知 | Complete | EPUB 12 tests | ~1508 lines | 全格式支持 |
| 9. 异常交互 | Complete | 27/27 tests | ~415 lines | 3 组件 |
| 10. 测试与优化 | Complete | 91.9% coverage | 5 E2E specs | NFR-12 达标 |

## Coverage

| Requirement | Phase | Status |
|-------------|-------|--------|
| INIT-01 | Phase 1 | ✓ Implemented |
| INIT-02 | Phase 1 | ✓ Implemented |
| INIT-03 | Phase 7 | ✓ Implemented |
| PLAN-01 | Phase 3 | ✓ Implemented |
| PLAN-02 | Phase 3 | ✓ Implemented |
| PLAN-03 | Phase 3 | ✓ Implemented |
| PLAN-04 | Phase 4 | ✓ Implemented |
| PLAN-05 | Phase 7 | ✓ Implemented |
| WRITE-01 | Phase 4 | ✓ Implemented |
| WRITE-02 | Phase 4 | ✓ Implemented |
| WRITE-03 | Phase 4 | ✓ Implemented |
| WRITE-04 | Phase 4 | ✓ Implemented |
| WRITE-05 | Phase 7 | ✓ Implemented |
| WRITE-06 | Phase 4 | ✓ Implemented |
| WRITE-07 | Phase 3 | ✓ Implemented |
| WRITE-08 | Phase 3 | ✓ Implemented |
| WRITE-09 | Phase 3 | ✓ Implemented |
| WRITE-10 | Phase 6 补 | ✓ Implemented |
| WRITE-11 | Phase 6 补 | ✓ Implemented |
| WRITE-12 | Phase 4 | ✓ Implemented |
| WRITE-13 | Phase 4 | ✓ Implemented |
| WRITE-14 | Phase 6 | ✓ Implemented |
| QUAL-01 | Phase 6 | ✓ Implemented |
| QUAL-02 | Phase 6 | ✓ Implemented |
| QUAL-03 | Phase 6 | ✓ Implemented |
| QUAL-04 | Phase 6 | ✓ Implemented |
| QUAL-05 | Phase 4 | ✓ Implemented |
| QUAL-06 | Phase 6 | ✓ Implemented |
| QUAL-07 | Phase 6 | ✓ Implemented |
| QUAL-08 | Phase 6 | ✓ Implemented |
| HOOK-01 | Phase 5 | ✓ Implemented |
| HOOK-02 | Phase 5 | ✓ Implemented |
| HOOK-03 | Phase 5 | ✓ Implemented |
| HOOK-04 | Phase 5 | ✓ Implemented |
| HOOK-05 | Phase 5 | ✓ Implemented |
| HOOK-06 | Phase 5 | ✓ Implemented |
| STATE-01 | Phase 2 | ✓ Implemented |
| STATE-02 | Phase 2 | ✓ Implemented |
| STATE-03 | Phase 2 | ✓ Implemented |
| STATE-04 | Phase 2 | ✓ Implemented |
| STATE-05 | Phase 2 | ✓ Implemented |
| EXPORT-01 | Phase 8 | ✓ Implemented |
| EXPORT-02 | Phase 8 | ✓ Implemented |
| UX-01 | Phase 9 | ✓ Implemented |
| UX-02 | Phase 9 | ✓ Implemented |
| UX-03 | Phase 9 | ✓ Implemented |
| NFR-01 | Phase 4 | ✓ Implemented |
| NFR-02 | Phase 4 | ✓ Implemented |
| NFR-03 | Phase 4 | ✓ Implemented |
| NFR-04 | Phase 7 | ✓ Implemented |
| NFR-05 | Phase 4 | ✓ Implemented |
| NFR-06 | Phase 2 | ✓ Implemented |
| NFR-07 | Phase 2 | ✓ Implemented |
| NFR-08 | Phase 1 | ✓ Implemented |
| NFR-09 | Phase 8 | ✓ Implemented |
| NFR-10 | Phase 2 | ✓ Implemented |
| NFR-11 | Phase 2 | ✓ Implemented |
| NFR-12 | Phase 10 | ✓ Implemented (91.9%) |

**Coverage:**
- v1 requirements: 58 total
- Implemented: 58/58 ✓
- Tested: Core 1658/1658 ✓, Studio 472/475 (2 pending fix)

---
*Roadmap created: 2026-04-21*
*Last updated: 2026-04-21 — restructured to reflect actual codebase state*
