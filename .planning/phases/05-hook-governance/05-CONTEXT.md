# Phase 5: 伏笔治理 - Context

**Gathered:** 2026-04-21
**Status:** Implementation complete — verified

<domain>
## Phase Boundary

伏笔可自动注册、排班、生命周期管理、人工意图声明。覆盖 HookPolicy、HookAgenda、HookGovernance、HookArbiter、HookLifecycle、HookAdmission、WakeSmoothing、RuleStackCompiler、ContextGovernor。10 个源文件 + 9 个测试文件，6405 行代码，测试全部通过。

</domain>

<decisions>
## Implementation Decisions

### 5-Layer Governance Architecture
- **D-01:** 5 层架构：HookPolicy（策略配置）→ HookAgenda（排班调度）→ HookGovernance（治理决策）→ HookArbiter（冲突仲裁）→ HookLifecycle（生命周期）
- **D-02:** HookPolicy（`hook-policy.ts`）管理最大活跃数、逾期阈值、预期回收窗口、唤醒策略，支持文件持久化（save/load）
- **D-03:** 默认策略：maxActiveHooks=10, overdueThreshold=5, resolutionWindow=[3,15], maxWakePerChapter=3

### HookAgenda (Scheduling)
- **D-04:** HookAgenda（`hook-agenda.ts`）负责伏笔排班、逾期检查（跳过 dormant）、窗口期校验
- **D-05:** 逾期检测逻辑：`chaptersSincePlanted > overdueThreshold` 时标记逾期，窗口期内不报

### HookGovernance (Admission + Validation)
- **D-06:** HookGovernance（`hook-governance.ts`）提供准入控制、回收验证、健康度检查、休眠标记
- **D-07:** HookAdmission（`hook-admission.ts`）基于时间/角色/主题相似度评估新伏笔是否与现有伏笔家族冲突

### HookArbiter (Conflict Resolution)
- **D-08:** HookArbiter（`hook-arbiter.ts`）检测伏笔冲突（时间/角色/主题重叠），按优先级解决冲突

### HookLifecycle (State Machine)
- **D-09:** HookLifecycle（`hook-lifecycle.ts`）实现状态机：open → progressing → deferred → dormant → resolved/abandoned
- **D-10:** 终态（resolved/abandoned）不可逆转，其他状态可双向转换
- **D-11:** 事件回调：onPlanted / onAdvanced / onDeferred / onDormant / onWake / onResolved / onAbandoned

### Wake Smoothing & Auto-Awake
- **D-12:** WakeSmoothing（`wake-smoothing.ts`）实现自动唤醒：章节到达 minChapter 时 dormant → open
- **D-13:** 惊群平滑：超 maxWakePerChapter 时剩余伏笔 deferred，防止同时唤醒过多伏笔

### Rule Stack & Context Governance
- **D-14:** RuleStackCompiler（`rule-stack-compiler.ts`）编译世界规则、角色契约、题材约束为规则栈
- **D-15:** ContextGovernor（`context-governor.ts`）管理上下文治理与规则栈应用

### Integration Patterns
- **D-16:** 5 层架构通过 PipelineRunner 的 composeChapter 链路触发（HookAuditor → HookAgenda → HookLifecycle）
- **D-17:** 伏笔数据模型使用 `Manifest.hooks` 数组，每个 Hook 含 id/description/type/status/priority/plantedChapter/expectedResolutionMin/Max 等字段
- **D-18:** HookPolicy 配置独立持久化为 JSON 文件，通过 save/load 读写

</decisions>

<canonical_refs>
## Canonical References

### Code (Phase 5 scope)
- `packages/core/src/governance/hook-policy.ts` — HookPolicy 策略配置
- `packages/core/src/governance/hook-agenda.ts` — HookAgenda 排班调度
- `packages/core/src/governance/hook-governance.ts` — HookGovernance 治理决策
- `packages/core/src/governance/hook-arbiter.ts` — HookArbiter 冲突仲裁
- `packages/core/src/governance/hook-lifecycle.ts` — HookLifecycle 状态机
- `packages/core/src/governance/hook-admission.ts` — HookAdmission 准入控制
- `packages/core/src/governance/wake-smoothing.ts` — WakeSmoothing 唤醒平滑
- `packages/core/src/governance/rule-stack-compiler.ts` — RuleStackCompiler 规则栈编译
- `packages/core/src/governance/context-governor.ts` — ContextGovernor 上下文治理

### Test Files
All 9 governance test files exist and pass:
`hook-policy.test.ts`, `hook-agenda.test.ts`, `hook-governance.test.ts`, `hook-arbiter.test.ts`,
`hook-lifecycle.test.ts`, `hook-admission.test.ts`, `wake-smoothing.test.ts`,
`rule-stack-compiler.test.ts`, `context-governor.test.ts`

### Dependencies (from prior phases)
- `packages/core/src/models/state.ts` — Hook Zod schema（Phase 1）
- `packages/core/src/state/memory-db.ts` — SQLite MemoryDB（Phase 2）
- `packages/core/src/agents/hook-auditor.ts` — HookAuditor Agent（Phase 3）
- `packages/core/src/pipeline/runner.ts` — PipelineRunner（Phase 4）

</canonical_refs>

<code_context>
## Existing Code State

### Verified
- `pnpm build` in core package: **zero errors**
- All tests: **1623/1623 passed**
- Governance code: **6,405 lines** (10 source + 9 test files)

### Integration Points
- Phase 6 质量层通过 HookGovernance 检查伏笔健康度
- Phase 7 Studio 通过 Hono API 提供伏笔面板 UI
- Phase 10 测试与优化需覆盖治理层端到端流程

</code_context>

<deferred>
## Deferred / Not Yet Addressed

- 伏笔仲裁高级功能（ADVHOOK-01~ADVHOOK-06）：伏笔冲突检测可视化、健康度仪表盘、调度时间轴等
- 伏笔治理的 UI 可视化（双轨视图、惊群平移动画化）— 属 v2 范围
- 伏笔准入控制的 LLM 相似度评估 — 当前基于规则匹配

</deferred>

---

*Phase: 05-hook-governance*
*Context gathered: 2026-04-21*
*Implementation verified: complete*
