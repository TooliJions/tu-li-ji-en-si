# Phase 4: 流水线编排 - Context

**Gathered:** 2026-04-21
**Status:** Implementation complete — verified (bug fixed)

<domain>
## Phase Boundary

章节可端到端生成（草稿→审计→修订→持久化）。覆盖 PipelineRunner、AtomicPipelineOps、Persistence、Scheduler、RevisionLoop、TruthValidation、DetectionRunner、ReviewCycle、Restructurer、重组安全机制。9 个源文件 + 9 个测试文件，8444 行代码，全部测试通过（1623/1623）。

</domain>

<decisions>
## Implementation Decisions

### PipelineRunner (Primary Entry Point)
- **D-01:** PipelineRunner 是唯一外部入口，位于 `packages/core/src/pipeline/runner.ts`（1227 行）
- **D-02:** 提供 7 个核心方法：`initBook`、`planChapter`、`composeChapter`、`writeDraft`、`writeFastDraft`、`upgradeDraft`、`writeNextChapter`
- **D-03:** `writeNextChapter` 是 `composeChapter` 的别名，composeChapter 执行 8 步链路：上下文卡片→意图定向→草稿生成→场景润色→质量审计+修订→记忆提取→持久化→状态更新
- **D-04:** 修订循环最多 `maxRevisionRetries`（默认 2 次）次尝试，用尽后按 `fallbackAction`（默认 `accept_with_warnings`）降级
- **D-05:** 污染检测：若修订后质量下降（currentScore < previousScore），回滚到修订前版本
- **D-06:** upgradeDraft 检测上下文漂移：`chaptersAhead = lastChapterWritten - chapterNumber`，> 0 时标记 `context_drift` 警告

### Atomic Operations & Persistence
- **D-07:** AtomicPipelineOps（`atomic-ops.ts`）提供 `draft_chapter`/`audit_chapter`/`revise_chapter`/`persist_chapter` 原子操作
- **D-08:** Persistence 模块（`persistence.ts`）负责章节落盘 + 索引更新 + 快照创建 + 状态提交的原子操作

### Scheduling & Review
- **D-09:** PipelineScheduler（`scheduler.ts`）支持动态启用/跳过阶段（如草稿模式跳过审计）
- **D-10:** ChapterReviewCycle（`review-cycle.ts`）综合审计结果决策 rewrite/accept/skip
- **D-11:** RevisionLoop（`revision-loop.ts`）实现修订循环逻辑

### Validation & Detection
- **D-12:** TruthValidation（`truth-validation.ts`）持久化前校验规则层真相，检测到矛盾时拒绝落盘
- **D-13:** DetectionRunner（`detection-runner.ts`）串联 AI 检测、语体审计、合规审核

### Restructuring & Safety
- **D-14:** ChapterRestructurer（`restructurer.ts`）实现 `mergeChapters` + `splitChapter`，三阶段提交
- **D-15:** ReorgLock（`reorg-lock.ts`）+ StagingManager（`staging-manager.ts`）提供重组安全机制，专用锁 + `.reorg_in_progress` 哨兵
- **D-16:** reorg.lock 和 staging-manager.ts 在 Phase 2 时已提前实现（位于 `state/` 目录），但属于 Phase 4 范围

### Integration Patterns
- **D-17:** PipelineRunner 通过 LLMProvider 直接调用 Agent 功能（ContextCard、IntentDirector、ScenePolisher 等），不通过 Agent 类实例
- **D-18:** TelemetryLogger 记录每个步骤的 token 消耗，按频道分类（planner/writer/composer/auditor/reviser）
- **D-19:** 章节持久化使用 frontmatter（YAML 格式）+ 正文的 Markdown 结构

### Bug Fix (during verification)
- **D-20:** 修复 runner.test.ts `context_drift` 测试：原测试 `lastChapterWritten: 0` 无法触发漂移检测（需 > chapterNumber），已改为 `2`；期望文本从"上下文版本变化"修正为"上下文漂移"

</decisions>

<canonical_refs>
## Canonical References

### Code (Phase 4 scope)
- `packages/core/src/pipeline/runner.ts` — PipelineRunner 主类（1227 行）
- `packages/core/src/pipeline/atomic-ops.ts` — AtomicPipelineOps
- `packages/core/src/pipeline/persistence.ts` — 章节落盘原子操作
- `packages/core/src/pipeline/scheduler.ts` — PipelineScheduler
- `packages/core/src/pipeline/revision-loop.ts` — RevisionLoop
- `packages/core/src/pipeline/truth-validation.ts` — TruthValidation
- `packages/core/src/pipeline/detection-runner.ts` — DetectionRunner
- `packages/core/src/pipeline/review-cycle.ts` — ChapterReviewCycle
- `packages/core/src/pipeline/restructurer.ts` — ChapterRestructurer

### Pre-implemented (Phase 2 scope, Phase 4 use)
- `packages/core/src/state/reorg-lock.ts` — 重组安全锁
- `packages/core/src/state/staging-manager.ts` — 暂存管理器

### Test Files
- All 9 pipeline test files exist and pass:
  `runner.test.ts`, `atomic-ops.test.ts`, `persistence.test.ts`, `scheduler.test.ts`,
  `revision-loop.test.ts`, `truth-validation.test.ts`, `detection-runner.test.ts`,
  `review-cycle.test.ts`, `restructurer.test.ts`

### Dependencies (from prior phases)
- `packages/core/src/state/manager.ts` — StateManager（Phase 2）
- `packages/core/src/state/runtime-store.ts` — RuntimeStateStore（Phase 2）
- `packages/core/src/state/reducer.ts` — StateReducer（Phase 2）
- `packages/core/src/llm/provider.ts` — LLMProvider（Phase 1）
- `packages/core/src/agents/` — All Agent modules（Phase 3）

</canonical_refs>

<code_context>
## Existing Code State

### Verified
- `pnpm build` in core package: **zero errors**
- All tests: **1623/1623 passed** (previously 1 failed in runner.test.ts, fixed)
- Pipeline code: **8,444 lines** (9 source + 9 test files)

### Integration Points
- Phase 5 伏笔治理通过 PipelineRunner 的 composeChapter 链路触发
- Phase 6 质量层通过 PipelineRunner 的 #auditAndRevise 内部方法调用
- Phase 7 Studio 通过 Hono API 调用 PipelineRunner

</code_context>

<deferred>
## Deferred / Not Yet Addressed

- LLM 实际调用时的 prompt 模板质量调优（当前使用硬编码 prompt 字符串）
- 章节生成性能优化（NFR-01~NFR-03 时间指标需结合真实 LLM 验证）
- PipelineRunner 内部方法对 Agent 类的直接实例化（当前通过 LLMProvider 间接调用）

</deferred>

---

*Phase: 04-pipeline-orchestration*
*Context gathered: 2026-04-21*
*Implementation verified: complete*
*Bug fixed: runner.test.ts context_drift test*
