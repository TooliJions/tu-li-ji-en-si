# Phase 6: 质量层 - Context

**Gathered:** 2026-04-21
**Status:** Implementation complete — verified

<domain>
## Phase Boundary

33 维审计、AI 痕迹检测、4 种修复策略、质量评估。覆盖 AIGCDetector、RepairStrategy、SurgicalRewriter、PostWriteValidator、POVFilter、CadenceAnalyzer、LengthNormalizer、CrossChapterRepetition、RevisionLoop、QualityBaseline。10 个源文件 + 10 个测试文件，6927 行代码，测试全部通过。

</domain>

<decisions>
## Implementation Decisions

### AI Detection
- **D-01:** AIGCDetector（`ai-detector.ts`）检测 9 类 AI 生成特征：套话、句式单调、语义重复、过度使用连接词、空洞形容词、陈词滥调、语体不一致、冗余描述、逻辑断裂
- **D-02:** 每类检测返回评分（0-100）和具体位置，支持逐段分析

### Repair Strategy
- **D-03:** RepairStrategy（`repair-strategy.ts`）根据审计结果选择 4 种修复策略：局部替换（local_replace）、段落重排（paragraph_reorder）、节拍重写（beat_rewrite）、整章重写（full_rewrite）
- **D-04:** 策略选择基于问题严重程度和数量：少量小问题 → 局部替换，结构问题 → 段落重排，质量低 → 节拍重写，全面失败 → 整章重写

### Surgical Rewriter
- **D-05:** SurgicalRewriter（`surgical-rewriter.ts`）执行局部重写和段落重排，可仅修改指定部分而不影响其他内容
- **D-06:** 位于 `agents/` 目录（Phase 3 任务），但属于 Phase 6 修复策略的一部分

### Post-Write Validation
- **D-07:** PostWriteValidator（`post-write-validator.ts`）写后验证角色位置/资源/关系变更的合法性
- **D-08:** 检测到非法变更时报告错误，阻止不合法状态落盘

### POV Filter
- **D-09:** POVFilter（`pov-filter.ts`）确保叙事视角一致性，检测 POV 跳变
- **D-10:** 支持第一人称/第三人称有限/第三人称全知等视角类型

### Cadence & Length
- **D-11:** CadenceAnalyzer（`cadence.ts`）分析节奏：段落长度变化、句子长度分布，输出节奏评分和建议
- **D-12:** LengthNormalizer（`length-normalizer.ts`）字数归一化 + 安全网：目标/软区间/硬区间，超出时自动压缩

### Cross-Chapter Repetition
- **D-13:** CrossChapterRepetition（`cross-chapter-repetition.ts`）检测跨章重复：中文 6 字 ngram / 英文 3 词短语
- **D-14:** 纯算法实现（非 LLM），基于 ngram 频率统计

### Revision Loop & Quality Baseline
- **D-15:** RevisionLoop（`pipeline/revision-loop.ts`，Phase 4 任务但属 Phase 6 逻辑）实现 maxRevisionRetries + fallbackAction + 污染隔离
- **D-16:** QualityBaseline（`baseline.ts`）第 3 章后自动建基线，滑动窗口漂移检测，连续 3 章恶化超 30% 时告警

### Integration Patterns
- **D-17:** 质量层通过 PipelineRunner 的 #auditAndRevise 内部方法串联调用
- **D-18:** AuditTierClassifier（Phase 3 Agent）将 33 维分为阻断级/警告级/建议级
- **D-19:** 质量数据通过 AnalyticsAggregator 汇总，TelemetryLogger 记录 token 消耗
- **D-20:** 降级路径：maxRevisionRetries(2) → fallbackAction(accept_with_warnings / pause)

</decisions>

<canonical_refs>
## Canonical References

### Code (Phase 6 scope)
- `packages/core/src/quality/ai-detector.ts` — AIGCDetector 9 类 AI 检测
- `packages/core/src/quality/repair-strategy.ts` — RepairStrategy 4 种修复策略
- `packages/core/src/quality/post-write-validator.ts` — PostWriteValidator 写后验证
- `packages/core/src/quality/pov-filter.ts` — POVFilter 叙事视角过滤
- `packages/core/src/quality/cadence.ts` — CadenceAnalyzer 节奏分析
- `packages/core/src/quality/length-normalizer.ts` — LengthNormalizer 字数治理
- `packages/core/src/quality/cross-chapter-repetition.ts` — CrossChapterRepetition 跨章重复检测
- `packages/core/src/quality/baseline.ts` — QualityBaseline 质量基线
- `packages/core/src/quality/analytics-aggregator.ts` — AnalyticsAggregator 数据汇总
- `packages/core/src/quality/emotional-arc-tracker.ts` — EmotionalArcTracker 情感弧线

### Cross-referenced (other directories)
- `packages/core/src/agents/surgical-rewriter.ts` — SurgicalRewriter 局部重写（Phase 3 目录）
- `packages/core/src/agents/audit-tier-classifier.ts` — AuditTierClassifier 33 维分级（Phase 3 目录）
- `packages/core/src/pipeline/revision-loop.ts` — RevisionLoop 修订循环（Phase 4 目录）
- `packages/core/src/pipeline/runner.ts` — PipelineRunner #auditAndRevise（Phase 4 目录）

### Test Files
All 10 quality test files exist and pass:
`ai-detector.test.ts`, `repair-strategy.test.ts`, `post-write-validator.test.ts`, `pov-filter.test.ts`,
`cadence.test.ts`, `length-normalizer.test.ts`, `cross-chapter-repetition.test.ts`,
`baseline.test.ts`, `analytics-aggregator.test.ts`, `emotional-arc-tracker.test.ts`

### Dependencies (from prior phases)
- `packages/core/src/llm/provider.ts` — LLMProvider（Phase 1）
- `packages/core/src/agents/` — QualityReviewer, AuditTierClassifier, SurgicalRewriter 等（Phase 3）
- `packages/core/src/pipeline/runner.ts` — PipelineRunner（Phase 4）
- `packages/core/src/models/schemas.ts` — QualityBaseline schema（Phase 1）

</canonical_refs>

<code_context>
## Existing Code State

### Verified
- `pnpm build` in core package: **zero errors**
- All tests: **1623/1623 passed**
- Quality code: **6,927 lines** (10 source + 10 test files)

### Integration Points
- Phase 7 Studio 通过 Hono API 触发质量检测并展示审计报告
- Phase 9 异常交互展示 accept_with_warnings 章节的视觉强化标识
- Phase 10 测试与优化验证 NFR-01~NFR-03 性能指标

</code_context>

<deferred>
## Deferred / Not Yet Addressed

- 叙事疲劳分析高级功能（ADVQUAL-01）：长跨度写作中的套路化检测
- 对话质量检查高级功能（ADVQUAL-02）：多角色场景至少一轮带阻力的直接交锋 — DialogueChecker 已部分实现
- 审计报告可视化雷达图（ADVQUAL-03）— 属前端 Phase 7+ 范围
- Prompt 版本化完整功能（6.11）：prompts 目录结构已有，latest 软链接机制需验证

</deferred>

---

*Phase: 06-quality-layer*
*Context gathered: 2026-04-21*
*Implementation verified: complete*
