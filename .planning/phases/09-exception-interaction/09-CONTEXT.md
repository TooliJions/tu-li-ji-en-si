# Phase 9: 异常交互 - Context

**Gathered:** 2026-04-21
**Status:** Implementation exists — untracked (part of Studio package), test failures deferred to Phase 10

<domain>
## Phase Boundary

异常状态可理解地呈现给用户，操作安全确认。覆盖 TimeDial（时间拨盘）、PollutionBadge（污染标识）、StateDiffView（状态差异视图）。3 个组件 + 3 个测试文件，415 行代码。

**注意：** 全部文件为 Studio 包的一部分，未提交到 git。测试情况已在 Phase 7 中记录。

</domain>

<decisions>
## Implementation Decisions

### TimeDial (Time Rewind Dial)
- **D-01:** TimeDial（`time-dial.tsx`）实现回滚操作的时间回溯拨盘交互
- **D-02:** 支持快照选择和回滚确认，强调不可逆性
- **D-03:** 包含碎裂淡出动画效果（UX-03）

### PollutionBadge (Contamination Isolation)
- **D-04:** PollutionBadge（`pollution-badge.tsx`）为 accept_with_warnings 章节提供视觉强化标识
- **D-05:** 橙色边框 + 斜纹背景 + 「污染隔离」标签（UX-02）

### StateDiffView (State Difference)
- **D-06:** StateDiffView（`state-diff-view.tsx`）将状态脱节差异以自然语言呈现
- **D-07:** 不暴露 JSON 路径等技术术语（UX-01）

### Integration Patterns
- **D-08:** 这些组件集成在 Studio 的 BookDetail、ChapterReader 等页面中
- **D-09:** 与 core 引擎的状态层（Phase 2）和流水线（Phase 4）协同工作

</decisions>

<canonical_refs>
## Canonical References

### Code (Phase 9 scope)
- `packages/studio/src/components/time-dial.tsx` — 时间回溯拨盘
- `packages/studio/src/components/pollution-badge.tsx` — 污染隔离标识
- `packages/studio/src/components/state-diff-view.tsx` — 状态差异视图

### Test Files
`time-dial.test.tsx`, `pollution-badge.test.tsx`, `state-diff-view.test.tsx`
（测试情况已在 Phase 7 CONTEXT.md 中记录）

### Dependencies (from prior phases)
- `packages/core/src/state/snapshot.ts` — SnapshotManager（Phase 2）
- `packages/core/src/pipeline/runner.ts` — PipelineRunner（Phase 4）
- `packages/core/src/models/chapter.ts` — Chapter schema（Phase 1）

</canonical_refs>

<code_context>
## Existing Code State

### NOT Verified
- All Phase 9 files are part of the untracked Studio package
- Test results included in Phase 7 analysis (24 failures across 6 files)
- Phase 9 specific components: **415 lines** (3 source + 3 test files)

### Integration Points
- Phase 10 测试与优化需修复 Phase 9 相关测试
- Core engine provides the data (snapshot list, pollution flags, state diffs)

</code_context>

<deferred>
## Deferred / Not Yet Addressed

- Phase 9 组件测试修复 — Phase 10 范围
- Studio 文件提交到 git
- 时间拨盘动画效果优化

</deferred>

---

*Phase: 09-exception-interaction*
*Context gathered: 2026-04-21*
*Implementation noted: exists but untracked, part of Studio package*
