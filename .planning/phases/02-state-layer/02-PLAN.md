---
phase: 2
title: "Phase 2: 状态层 — 验证现有实现"
goal: "验证 Phase 2 所有 12 个任务的实现满足成功标准"
wave: 1
---

# Phase 2: 状态层 — 验证计划

## Objective

Phase 2 已在历史开发中实现。本计划验证现有代码满足 ROADMAP.md 定义的成功标准，不写新代码。

## Success Criteria (from ROADMAP.md)

1. 可创建新书并获取排他锁，路径计算正确
2. 可加载 `story/state/*.json` 构建运行时状态，快照写入正确
3. SQLite 可查询某角色在指定章节的知识状态
4. 崩溃后未提交事务自动回滚，WAL 模式无并发冲突
5. 明显矛盾状态被检测并阻断落盘

## Tasks

### 1. 验证 StateManager（5min）

**文件:** `packages/core/src/state/manager.ts`, `manager.test.ts`

验证：
- `acquireBookLock()` 使用 "wx" 排他锁
- `getBookPath()` 路径计算正确
- `readIndex()` / `writeIndex()` 可读写 `index.json`
- 测试覆盖 manager.test.ts 全部通过

### 2. 验证 RuntimeStateStore（5min）

**文件:** `packages/core/src/state/runtime-store.ts`, `runtime-store.test.ts`

验证：
- 从 `story/state/*.json` 加载状态文件
- `buildRuntimeState()` 构建正确运行时状态
- `saveRuntimeStateSnapshot()` 快照写入正确

### 3. 验证 SQLite MemoryDB（5min）

**文件:** `packages/core/src/state/memory-db.ts`, `memory-db.test.ts`

验证：
- sql.js WASM 模式，WAL 模式启用
- 4 张表：facts、chapter_summaries、hooks、memory_snapshots
- 可查询某角色在指定章节的知识状态（按章节/实体查询）

### 4. 验证 SnapshotManager + SessionRecovery（5min）

**文件:** `packages/core/src/state/snapshot.ts`, `recovery.ts`

验证：
- SnapshotManager: create/list/get/rollback/delete 操作
- SessionRecovery: reorg sentinel check、zombie lock 检测、WAL 检查
- 崩溃后自动回滚未提交事务

### 5. 验证 StateReducer（5min）

**文件:** `packages/core/src/state/reducer.ts`, `reducer.test.ts`

验证：
- 不可变 Delta 更新
- 矛盾状态检测并阻断落盘
- 单章原子事务写入（章节文件 → index.json → facts/hooks → 快照 → SQLite）

### 6. 验证辅助组件（5min）

**文件:** lock-manager.ts, sync-validator.ts, state-importer.ts, bootstrap.ts, projections.ts

验证：
- LockManager 独立锁管理
- SyncValidator Markdown 投影与 JSON 双向校验
- StateImporter 从 Markdown 导入状态
- Bootstrap 状态层初始化引导
- Projections 状态投影

### 7. 运行测试确认（5min）

运行 `pnpm --filter @cybernovelist/core test`，确认所有 state 模块测试通过。

## Acceptance

- 全部 7 个验证项通过
- 所有 state 相关测试通过（~12 个测试文件）
- ROADMAP.md 5 个成功标准全部满足
- 更新 STATE.md 和 ROADMAP.md 标记 Phase 2 完成
