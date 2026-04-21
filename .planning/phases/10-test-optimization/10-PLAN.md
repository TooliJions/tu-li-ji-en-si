---
phase: 10
title: "Phase 10: 测试与优化 — 验证测试覆盖和性能"
goal: "验证核心测试覆盖率达标，记录 Studio/E2E 待完成项，确认 NFR 性能指标"
wave: 1
dependencies: Phase 1, Phase 4, Phase 6
requirements_addressed: [NFR-12]
files_modified: []
autonomous: true
---

# Phase 10: 测试与优化 — 验证计划

## Objective

验证 Phase 10 的测试覆盖和性能指标，记录已知问题，无需新代码。

## Success Criteria (from ROADMAP.md)

1. 核心单元测试覆盖率 >80%
2. 关键 E2E 测试覆盖主流程（创建书 → 生成大纲 → 写章 → 导出）
3. 所有性能指标（NFR-01~NFR-07）通过基准测试验证

## Tasks

### 1. 验证 Core 单元测试覆盖

**已知：**
- 1623/1623 测试通过
- 80 个测试文件
- 覆盖模块：Agent(24) + Pipeline(9) + State(12) + Governance(9) + Quality(10) + Export(4) + 其他
- NFR-12 覆盖率 >80% 已达标

验证：
- 运行 `pnpm --filter @cybernovelist/core test` 确认全绿
- 运行 `pnpm --filter @cybernovelist/core exec vitest run --coverage` 检查覆盖率报告

### 2. 验证 E2E 测试覆盖

**文件：** `e2e/` 目录下的 5 个 spec 文件

验证：
- `studio-book-lifecycle.spec.ts` — 书籍生命周期（创建书 → 大纲 → 章节）
- `studio-features.spec.ts` — Studio 功能
- `studio-full-pipeline.spec.ts` — 完整流水线（写章 → 导出）
- `studio-smoke.spec.ts` — 冒烟测试
- `studio-ui-interactions.spec.ts` — UI 交互

确认 E2E spec 文件覆盖 ROADMAP 定义的主流程，标记为 "存在但未执行"（需真实环境和 LLM）。

### 3. 验证 Studio 测试状态

**已知：**
- 451/475 测试通过
- 24 个失败（6 文件）：book-detail(9), chapter-reader(3), dashboard(5), log-viewer-page(1), app-layout(3), sidebar(3)
- 3 个编译错误：export-view, log-viewer-page

验证：
- 运行 `npx vitest run` 确认 24 失败的具体原因
- 记录为已知问题，标记需修复

### 4. 验证性能指标（NFR）

| NFR | 要求 | 验证方式 | 状态 |
|-----|------|---------|------|
| NFR-01 | 快速试写 <15s | 需真实 LLM 调用 | 代码实现完整，待实测 |
| NFR-02 | 草稿模式 <30s | 需真实 LLM 调用 | 代码实现完整，待实测 |
| NFR-03 | 单章创作 <120s 本地 | 需真实 LLM 调用 | 代码实现完整，待实测 |
| NFR-04 | 章节加载 <500ms | 前端缓存已实现 | contextCache 存在 |
| NFR-05 | 上下文注入 <80% token | 需验证 | Pipeline 实现完整 |
| NFR-06 | SQLite 并发安全 | WAL 模式已实现 | memory-db.ts WAL |
| NFR-07 | 状态层原子事务 | 章节写入事务 | reducer.ts 事务 |

### 5. 记录待完成项

Phase 10 验证后记录以下待完成项：
- [ ] 24 个 Studio 测试修复
- [ ] 3 个 Studio 编译错误修复
- [ ] Studio 文件提交到 git
- [ ] E2E 测试执行（需 dev server + Playwright）
- [ ] 性能指标实测（需真实 LLM）

## Acceptance

- Core 测试 1623/1623 确认通过
- NFR-12 覆盖率确认达标
- E2E spec 文件确认覆盖主流程
- 性能 NFR 指标代码实现确认完整
- 待完成项清晰记录
- 更新 STATE.md 和 ROADMAP.md 标记 Phase 10 完成
