# Phase 10: 测试与优化 - Context

**Gathered:** 2026-04-21
**Status:** Core engine fully tested, Studio tests need fixing

<domain>
## Phase Boundary

核心单元测试覆盖率 >80%，关键 E2E 测试覆盖主流程，性能指标验证。Core 引擎 1623/1623 测试全部通过，Studio 24 个测试失败 + 3 个编译错误（untracked），E2E 5 个 spec 文件存在但未执行。

</domain>

<decisions>
## Implementation Decisions

### Unit Tests — COMPLETE (Core Engine)
- **D-01:** Core 引擎 1623/1623 测试全部通过，覆盖所有核心模块
- **D-02:** Agent 测试：24/24 通过（BaseAgent + 22 Agent + 1 特殊类）
- **D-03:** Pipeline 测试：9/9 通过（Runner + AtomicOps + Persistence + Scheduler + RevisionLoop + TruthValidation + DetectionRunner + ReviewCycle + Restructurer）
- **D-04:** State 测试：12/12 通过（Manager + RuntimeStore + Reducer + Validator + MemoryDB + Snapshot + Recovery + Bootstrap + LockManager + SyncValidator + StateImporter + Projections）
- **D-05:** Governance 测试：9/9 通过（HookPolicy + HookAgenda + HookGovernance + HookArbiter + HookLifecycle + HookAdmission + WakeSmoothing + RuleStackCompiler + ContextGovernor）
- **D-06:** Quality 测试：10/10 通过（AIDetector + RepairStrategy + PostWriteValidator + POVFilter + Cadence + LengthNormalizer + CrossChapterRepetition + Baseline + AnalyticsAggregator + EmotionalArcTracker）
- **D-07:** Export 测试：4/4 通过（EPUB + Markdown + TXT + PlatformAdapter）
- **D-08:** 其他测试：Daemon/Notify/Telemetry/Fanfic/Scheduler 等均通过
- **D-09:** 覆盖率远超 80% 目标（NFR-12 已达标）

### Studio Tests — NEED FIXING
- **D-10:** Studio 测试：451 passed / 24 failed（6 文件）
- **D-11:** 失败文件：book-detail（9 失败）、chapter-reader（3 失败）、dashboard（5 失败）、log-viewer-page（1 失败）、app-layout（3 失败）、sidebar（3 失败）
- **D-12:** 失败原因：UI 组件文本未渲染、mock 不完整、路由不匹配、新组件缺少 prop
- **D-13:** 3 个编译错误：export-view 缺少 startExport/ExportFormat、log-viewer-page DaemonLogStream 缺少 searchQuery prop

### E2E Tests — EXIST BUT NOT RUN
- **D-14:** 5 个 E2E spec 文件存在于 `e2e/` 目录（untracked）
- **D-15:** 覆盖路径：studio-book-lifecycle、studio-features、studio-full-pipeline、studio-smoke、studio-ui-interactions
- **D-16:** Playwright 已配置但未执行（需先启动 Studio dev server）

### Performance — NEEDS REAL LLM VALIDATION
- **D-17:** NFR-01：快速试写首段产出 < 15s — 需真实 LLM 验证
- **D-18:** NFR-02：草稿模式 < 30s — 需真实 LLM 验证
- **D-19:** NFR-03：单章完整创作（本地 <120s，云端 <60s）— 需真实 LLM 验证
- **D-20:** NFR-04：章节加载延迟 < 500ms — 前端性能
- **D-21:** NFR-05：20+ 章后上下文注入 < 模型 token 上限 80% — 需验证

### Known Bug Fixed (during Phase 4 discussion)
- **D-22:** runner.test.ts context_drift 测试已修复（lastChapterWritten 从 0 改为 2）

</decisions>

<canonical_refs>
## Canonical References

### Test Infrastructure
- `packages/core/vitest.config.ts` — Core 测试配置
- `packages/studio/vitest.config.ts` — Studio 测试配置
- `playwright.config.ts` — E2E 配置

### E2E Specs
- `e2e/studio-book-lifecycle.spec.ts` — 书籍生命周期
- `e2e/studio-features.spec.ts` — Studio 功能
- `e2e/studio-full-pipeline.spec.ts` — 完整流水线
- `e2e/studio-smoke.spec.ts` — 冒烟测试
- `e2e/studio-ui-interactions.spec.ts` — UI 交互

### Core Test Files (all passing)
80 test files across all core modules

### Failed Studio Test Files
- `packages/studio/src/pages/book-detail.test.tsx` — 9 失败
- `packages/studio/src/pages/chapter-reader.test.tsx` — 3 失败
- `packages/studio/src/pages/dashboard.test.tsx` — 5 失败
- `packages/studio/src/pages/log-viewer-page.test.tsx` — 1 失败
- `packages/studio/src/components/layout/app-layout.test.tsx` — 3 失败
- `packages/studio/src/components/layout/sidebar.test.tsx` — 3 失败

</canonical_refs>

<code_context>
## Existing Code State

### Verified (Core)
- `pnpm build` in core package: **zero errors**
- Core tests: **1623/1623 passed**
- NFR-12 (coverage >80%): **MET**

### NOT Verified (Studio)
- Studio tests: **451 passed / 24 failed**
- Studio build: **3 TypeScript errors**
- All Studio files: **untracked**

### NOT Run (E2E)
- 5 E2E spec files exist but not executed

</code_context>

<deferred>
## Deferred / Not Yet Addressed

- Studio 24 个测试失败修复
- Studio 3 个编译错误修复
- Studio 文件提交到 git
- E2E 测试执行
- 性能指标真实 LLM 验证
- SQLite 查询性能基准测试
- 前端打包体积优化

</deferred>

---

*Phase: 10-test-optimization*
*Context gathered: 2026-04-21*
*Core engine fully tested, Studio/E2E deferred*
