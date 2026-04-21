# Phase 6 补: 守护进程调度 - Context

**Gathered:** 2026-04-21
**Status:** Implementation complete — verified

<domain>
## Phase Boundary

后台自动批量写章，智能间隔和配额保护。覆盖 Daemon 主入口、SmartInterval、QuotaGuard、RPMMonitor。4 个源文件 + 4 个测试文件，2011 行代码，测试全部通过。

</domain>

<decisions>
## Implementation Decisions

### Daemon Entry Point
- **D-01:** `daemon.ts`（13134 行）是守护进程主入口，提供启动/暂停/恢复/停止功能
- **D-02:** 守护进程后台连续写章，通过 PipelineRunner.writeNextChapter 触发创作链路
- **D-03:** 支持本地模式（interval=0 即时启动）和云端模式（根据 RPM 动态调整间隔）

### SmartInterval
- **D-04:** SmartInterval（`scheduler/smart-interval.ts`）实现智能间隔策略
- **D-05:** 本地模式 interval=0，云端模式根据 RPM 限流自动延长间隔
- **D-06:** RPM 限流检测后 2s 内自动延长间隔

### QuotaGuard
- **D-07:** QuotaGuard（`scheduler/quota-guard.ts`）实现配额保护，监控单日 Token 消耗上限
- **D-08:** 配额耗尽时守护进程自动暂停

### RPMMonitor
- **D-09:** RPMMonitor（`scheduler/rpm-monitor.ts`）监控 API 请求频率（Requests Per Minute）
- **D-10:** 检测到限流后通知 SmartInterval 延长间隔

### Integration Patterns
- **D-11:** 守护进程通过 PipelineRunner API 触发创作，不直接调用 Agent
- **D-12:** 智能间隔策略与 LLM Provider 的 RoutedLLMProvider 故障切换协同工作
- **D-13:** 守护进程事件通过 SSE 推送（daemon_event 类型）到 Studio 工作台

</decisions>

<canonical_refs>
## Canonical References

### Code (Phase 6 补 scope)
- `packages/core/src/daemon.ts` — 守护进程主入口
- `packages/core/src/scheduler/smart-interval.ts` — SmartInterval 智能间隔
- `packages/core/src/scheduler/quota-guard.ts` — QuotaGuard 配额保护
- `packages/core/src/scheduler/rpm-monitor.ts` — RPMMonitor RPM 监控

### Test Files
All 4 scheduler/daemon test files exist and pass:
`daemon.test.ts`, `smart-interval.test.ts`, `quota-guard.test.ts`, `rpm-monitor.test.ts`

### Dependencies (from prior phases)
- `packages/core/src/pipeline/runner.ts` — PipelineRunner（Phase 4）
- `packages/core/src/llm/provider.ts` — LLMProvider（Phase 1）
- `packages/core/src/llm/routed-provider.ts` — RoutedLLMProvider（Phase 1）
- `packages/core/src/telemetry/logger.ts` — TelemetryLogger（Phase 4）

</canonical_refs>

<code_context>
## Existing Code State

### Verified
- `pnpm build` in core package: **zero errors**
- All tests: **1623/1623 passed**
- Daemon + Scheduler code: **2,011 lines** (4 source + 4 test files)

### Integration Points
- Phase 7 Studio 通过 Hono API 控制守护进程启停
- Phase 8 通知推送集成守护进程事件通知
- Phase 10 测试与优化验证 WRITE-10/WRITE-11 性能指标

</code_context>

<deferred>
## Deferred / Not Yet Addressed

- 守护进程事件通知推送（NOTIF-02）：Telegram/飞书/企微/Webhook — notify 模块已有基础
- 每日配额保护 UI 配置（ADVWRITE-01）
- 守护进程持久化恢复（崩溃后自动恢复状态）

</deferred>

---

*Phase: 06-supplement-daemon*
*Context gathered: 2026-04-21*
*Implementation verified: complete*
