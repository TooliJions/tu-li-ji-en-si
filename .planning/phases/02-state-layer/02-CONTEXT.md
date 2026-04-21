# Phase 2: 状态层 - Context

**Gathered:** 2026-04-21
**Status:** Implementation complete — verified

<domain>
## Phase Boundary

书籍状态可读写、快照回滚、并发安全。覆盖 StateManager、RuntimeStateStore、StateReducer、SQLite 时序库、SnapshotManager、会话恢复、锁管理、状态导入。所有 12 个任务已实现并通过测试。

</domain>

<decisions>
## Implementation Decisions

### State Layer Architecture
- **D-01:** 三层架构已就位：StateManager（锁/路径/索引）→ RuntimeStateStore（加载/构建/保存）→ StateReducer（不可变更新）
- **D-02:** 锁机制使用 "wx" 排他锁，通过 book lock 文件实现并发保护
- **D-03:** 状态文件体系：7 真相文件（current_state/hooks/chapter_summaries/subplot_board/emotional_arcs/character_matrix/manifest）

### SQLite Memory DB
- **D-04:** 使用 sql.js（WASM 模式）作为 SQLite 引擎，启用 WAL 模式
- **D-05:** 表结构：facts、chapter_summaries、hooks、memory_snapshots
- **D-06:** 支持按章节查询"某角色此时知道什么"的知识状态

### Snapshot & Recovery
- **D-07:** SnapshotManager 支持 create/list/get/rollback/delete 操作
- **D-08:** SessionRecovery 支持 reorg sentinel check、zombie lock 检测、WAL 检查
- **D-09:** 崩溃后自动回滚未提交事务，通过 WAL 模式保证

### Additional Components
- **D-10:** LockManager 提供独立的锁管理机制
- **D-11:** SyncValidator 实现 Markdown 投影与 JSON 状态的双向校验
- **D-12:** StateImporter 支持从 Markdown 导入状态
- **D-13:** Bootstrap 提供状态层初始化引导流程

### Deferred Decisions (Phase 4 scope, pre-implemented)
- **D-14:** ReorgLock 和 StagingManager 已提前实现，但属于 Phase 4 流水线编排范围
- **D-15:** 单章原子事务写入流程已在 StateReducer 中实现

</decisions>

<canonical_refs>
## Canonical References

### Code (Phase 2 scope)
- `packages/core/src/state/manager.ts` — StateManager 主类（锁/路径/索引）
- `packages/core/src/state/runtime-store.ts` — RuntimeStateStore（manifest 加载/保存）
- `packages/core/src/state/reducer.ts` — StateReducer（不可变 Delta 更新）
- `packages/core/src/state/memory-db.ts` — SQLite MemoryDB（WAL 模式 + 4 表）
- `packages/core/src/state/snapshot.ts` — SnapshotManager（快照 CRUD）
- `packages/core/src/state/recovery.ts` — SessionRecovery（崩溃恢复）
- `packages/core/src/state/validator.ts` — Validator（状态校验）
- `packages/core/src/state/bootstrap.ts` — 状态层初始化引导
- `packages/core/src/state/lock-manager.ts` — 锁管理器
- `packages/core/src/state/sync-validator.ts` — Markdown 同步校验
- `packages/core/src/state/state-importer.ts` — 状态导入器
- `packages/core/src/state/projections.ts` — 状态投影

### Pre-implemented (Phase 4 scope)
- `packages/core/src/state/reorg-lock.ts` — 重组安全锁
- `packages/core/src/state/staging-manager.ts` — 暂存管理器

### Schemas
- `packages/core/src/models/state.ts` — Manifest, Hook, Fact, Snapshot, Delta 等 Zod schemas
- `packages/core/src/models/chapter.ts` — Chapter 相关 schemas

</canonical_refs>

<code_context>
## Existing Code State

### Verified
- `pnpm build` in core package: **zero errors**
- Core tests: **1622 passed / 1 failed**
- The 1 failure is in `runner.test.ts:1328` (Phase 4 pipeline, not Phase 2)

### Test Files
- `packages/core/src/state/manager.test.ts`
- `packages/core/src/state/runtime-store.test.ts`
- `packages/core/src/state/reducer.test.ts`
- `packages/core/src/state/memory-db.test.ts`
- `packages/core/src/state/snapshot.test.ts`
- `packages/core/src/state/recovery.test.ts`
- `packages/core/src/state/validator.test.ts`
- `packages/core/src/state/bootstrap.test.ts`
- `packages/core/src/state/lock-manager.test.ts`
- `packages/core/src/state/sync-validator.test.ts`
- `packages/core/src/state/state-importer.test.ts`
- `packages/core/src/state/projections.test.ts`
- Plus additional test files for reorg-lock and staging

### Integration Points
- Phase 3 Agents 通过 StateManager 读写状态
- Phase 4 PipelineRunner 调用 RuntimeStateStore 和 StateReducer
- Phase 7 Studio 通过 Hono API 间接访问状态层

</code_context>

<deferred>
## Deferred / Not Yet Addressed

- 状态层 UI 可视化编辑器（v2 ADVSTATE-01）
- 状态投影双向校验的 UI 警告弹窗（v2 ADVSTATE-02）
- TruthFiles 编辑器导入 Markdown 按钮（v2 ADVSTATE-03）

</deferred>

---

*Phase: 02-state-layer*
*Context gathered: 2026-04-21*
*Implementation verified: complete*
