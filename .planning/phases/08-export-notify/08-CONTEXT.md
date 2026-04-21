# Phase 8: 导出与通知 - Context

**Gathered:** 2026-04-21
**Status:** Implementation complete — verified

<domain>
## Phase Boundary

作品可导出为 EPUB/TXT/Markdown，路径安全；通知推送支持 Telegram/飞书/企微/Webhook。4 个导出文件 + 1 个通知文件，1508 行代码，测试全部通过。

</domain>

<decisions>
## Implementation Decisions

### EPUB Export
- **D-01:** EPUB 导出（`export/epub.ts`）生成完整 OPF + NCX + XHTML 结构
- **D-02:** 支持章节排序、元数据填充、封面生成

### TXT/Markdown Export
- **D-03:** TXT 导出（`export/txt.ts`）纯文本输出
- **D-04:** Markdown 导出（`export/markdown.ts`）带 frontmatter 的 Markdown 格式

### Platform Adapter
- **D-05:** PlatformAdapter（`export/platform-adapter.ts`）适配不同发布平台（起点/番茄等）格式

### Notification
- **D-06:** Notify 模块（`notify/index.ts`）支持 Telegram/飞书/企微/Webhook 通知推送
- **D-07:** 通知事件类型：章节完成、守护进程启停、配额耗尽等

### Path Safety
- **D-08:** 导出路径限制在项目目录内部，防止路径穿越（NFR-09）

### Integration Patterns
- **D-09:** 导出通过 core 包 `index.ts` 导出，Studio ExportView 页面调用
- **D-10:** 通知模块通过 daemon 事件触发，与守护进程协同工作

</decisions>

<canonical_refs>
## Canonical References

### Code (Phase 8 scope)
- `packages/core/src/export/epub.ts` — EPUB 3.0 导出
- `packages/core/src/export/markdown.ts` — Markdown 导出
- `packages/core/src/export/txt.ts` — TXT 导出
- `packages/core/src/export/platform-adapter.ts` — 平台适配导出
- `packages/core/src/notify/index.ts` — 通知推送

### Test Files
All 5 test files exist and pass:
`epub.test.ts`, `markdown.test.ts`, `txt.test.ts`, `platform-adapter.test.ts`, `notify/index.test.ts`

### Dependencies (from prior phases)
- `packages/core/src/state/manager.ts` — StateManager（Phase 2）
- `packages/core/src/models/book.ts` — Book schema（Phase 1）
- `packages/core/src/models/chapter.ts` — Chapter schema（Phase 1）

</canonical_refs>

<code_context>
## Existing Code State

### Verified
- `pnpm build` in core package: **zero errors**
- All tests: **1623/1623 passed**
- Export + Notify code: **1,508 lines** (4 source + 1 source + tests)

### Integration Points
- Phase 7 Studio ExportView 页面调用导出模块
- Phase 9 异常交互不直接影响导出
- Phase 10 测试与优化需验证 EXPORT-01/EXPORT-02 端到端流程

</code_context>

<deferred>
## Deferred / Not Yet Addressed

- 平台适配导出（PUB-01）：起点/番茄等平台格式 — PlatformAdapter 已有基础
- 批量导出（PUB-02）：支持指定章节范围
- 通知推送的具体 Webhook 实现完整性

</deferred>

---

*Phase: 08-export-notify*
*Context gathered: 2026-04-21*
*Implementation verified: complete*
