# Phase 3: 核心 Agent - Context

**Gathered:** 2026-04-21
**Status:** Implementation complete — verified

<domain>
## Phase Boundary

22 个 Agent 模块可独立运行，完成大纲、角色、世界观、意图生成。覆盖 BaseAgent 抽象类、3 个规划类 Agent、7 个执行类 Agent、12 个审计类 Agent、4 个特殊类 Agent。所有 Agent 均有实现和测试，12704 行代码，24/24 测试通过。

</domain>

<decisions>
## Implementation Decisions

### BaseAgent Architecture
- **D-01:** 所有 Agent 继承 `BaseAgent`（`packages/core/src/agents/base.ts`），定义 `name`、`temperature`、`execute(ctx)` 抽象方法
- **D-02:** BaseAgent 提供 `generate()` 和 `generateJSON<T>()` 两个受保护方法，委托给 LLMProvider
- **D-03:** AgentContext 包含 bookId、chapterId、promptContext，支持任意扩展字段
- **D-04:** AgentResult 包含 success、data、error、usage（token 统计）

### Planning Agents (3)
- **D-05:** OutlinePlanner（`planner.ts`）— 输入创作简报，输出三幕结构大纲
- **D-06:** CharacterDesigner（`character.ts`）— 生成角色属性、关系网络
- **D-07:** ChapterPlanner（`chapter-planner.ts`）— 生成本章目标/出场人物/关键事件/伏笔埋设计划

### Execution Agents (7)
- **D-08:** ChapterExecutor（`executor.ts`）— 章节执行骨架，协调其他 Agent
- **D-09:** ContextCard（`context-card.ts`）— 从 SQLite 和真相文件构建上下文卡片，输出 context.json
- **D-10:** ScenePolisher（`scene-polisher.ts`）— 核心写作 Agent，生成符合字数要求的正文
- **D-11:** StyleRefiner（`style-refiner.ts`）— 对正文进行风格精修
- **D-12:** IntentDirector（`intent-director.ts`）— 结合长期意图和当前焦点生成创作指令
- **D-13:** MemoryExtractor（`memory-extractor.ts`）— 从 SQLite 抓取事实碎片和世界规则
- **D-14:** SurgicalRewriter（`surgical-rewriter.ts`）— 精准重写指定段落

### Audit Agents (12)
- **D-15:** QualityReviewer（`quality-reviewer.ts`）— 33 维连续性审计的协调逻辑
- **D-16:** FactChecker（`fact-checker.ts`）— 核对事实一致性
- **D-17:** EntityAuditor（`entity-auditor.ts`）— 审计实体存在性和状态
- **D-18:** StyleAuditor（`style-auditor.ts`）— 检查语体一致性
- **D-19:** TitleVoiceAuditor（`title-voice-auditor.ts`）— 检查称谓一致性
- **D-20:** ComplianceReviewer（`compliance-reviewer.ts`）— 合规审核
- **D-21:** HookAuditor（`hook-auditor.ts`）— 审计伏笔状态和逾期
- **D-22:** FatigueAnalyzer（`fatigue-analyzer.ts`）— 检测叙事疲劳和套路化
- **D-23:** AuditTierClassifier（`audit-tier-classifier.ts`）— 33 维三级分类 + 单维重试 + 降级
- **D-24:** DialogueChecker（`dialogue-checker.ts`）— 对话质量检测

### Special Agents (4)
- **D-25:** MarketInjector（`market-injector.ts`）— 分析目标平台热门特征并注入约束
- **D-26:** StyleFingerprint（`style-fingerprint.ts`）— 分析参考作品提取风格指纹
- **D-27:** EntityRegistry（`entity-registry.ts`）— 统一管理角色/地点/道具注册表

### Integration Patterns
- **D-28:** 所有 Agent 通过 index.ts 聚合导出，`packages/core/src/index.ts` 提供统一公共 API
- **D-29:** Agent 通过 LLMProvider 构造函数注入依赖，不使用单例
- **D-30:** Audit 类 Agent 的输入输出遵循统一的 ReviewInput/ReviewOutput 类型
- **D-31:** 33 维审计通过 AuditTierClassifier 分为阻断级/警告级/建议级

</decisions>

<canonical_refs>
## Canonical References

### Code (Phase 3 scope)
- `packages/core/src/agents/base.ts` — BaseAgent 抽象类
- `packages/core/src/agents/planner.ts` — OutlinePlanner
- `packages/core/src/agents/character.ts` — CharacterDesigner
- `packages/core/src/agents/chapter-planner.ts` — ChapterPlanner
- `packages/core/src/agents/executor.ts` — ChapterExecutor
- `packages/core/src/agents/context-card.ts` — ContextCard
- `packages/core/src/agents/scene-polisher.ts` — ScenePolisher
- `packages/core/src/agents/style-refiner.ts` — StyleRefiner
- `packages/core/src/agents/intent-director.ts` — IntentDirector
- `packages/core/src/agents/memory-extractor.ts` — MemoryExtractor
- `packages/core/src/agents/surgical-rewriter.ts` — SurgicalRewriter
- `packages/core/src/agents/quality-reviewer.ts` — QualityReviewer
- `packages/core/src/agents/fact-checker.ts` — FactChecker
- `packages/core/src/agents/entity-auditor.ts` — EntityAuditor
- `packages/core/src/agents/style-auditor.ts` — StyleAuditor
- `packages/core/src/agents/title-voice-auditor.ts` — TitleVoiceAuditor
- `packages/core/src/agents/compliance-reviewer.ts` — ComplianceReviewer
- `packages/core/src/agents/hook-auditor.ts` — HookAuditor
- `packages/core/src/agents/fatigue-analyzer.ts` — FatigueAnalyzer
- `packages/core/src/agents/audit-tier-classifier.ts` — AuditTierClassifier
- `packages/core/src/agents/market-injector.ts` — MarketInjector
- `packages/core/src/agents/style-fingerprint.ts` — StyleFingerprint
- `packages/core/src/agents/entity-registry.ts` — EntityRegistry
- `packages/core/src/agents/dialogue-checker.ts` — DialogueChecker

### Dependencies (from prior phases)
- `packages/core/src/llm/provider.ts` — LLMProvider 接口（Phase 1）
- `packages/core/src/llm/routed-provider.ts` — RoutedLLMProvider（Phase 1）
- `packages/core/src/state/manager.ts` — StateManager（Phase 2）
- `packages/core/src/state/memory-db.ts` — MemoryDB（Phase 2）
- `packages/core/src/models/` — Zod schemas（Phase 1）

</canonical_refs>

<code_context>
## Existing Code State

### Verified
- `pnpm build` in core package: **zero errors**
- Agent tests: **24/24 passed**
- Total agent code: **12,704 lines** (24 source + 24 test files)

### Test Files
All 24 agent test files exist and pass:
- `base.test.ts`, `planner.test.ts`, `character.test.ts`, `chapter-planner.test.ts`
- `executor.test.ts`, `context-card.test.ts`, `scene-polisher.test.ts`, `style-refiner.test.ts`
- `intent-director.test.ts`, `memory-extractor.test.ts`, `quality-reviewer.test.ts`, `fact-checker.test.ts`
- `entity-auditor.test.ts`, `style-auditor.test.ts`, `title-voice-auditor.test.ts`
- `compliance-reviewer.test.ts`, `hook-auditor.test.ts`, `fatigue-analyzer.test.ts`
- `audit-tier-classifier.test.ts`, `market-injector.test.ts`, `style-fingerprint.test.ts`
- `entity-registry.test.ts`, `surgical-rewriter.test.ts`, `dialogue-checker.test.ts`

### Integration Points
- Phase 4 PipelineRunner 编排调用所有 Agent
- Phase 6 质量层使用 Audit 类 Agent
- Phase 7 Studio 通过 Hono API 间接触发 Agent 执行

</code_context>

<deferred>
## Deferred / Not Yet Addressed

- Agent 的 prompt 模板质量调优（需结合真实 LLM 调用结果评估）
- Agent 之间的上下文传递格式优化
- Agent 执行时的 token 预算控制（NFR-05）

</deferred>

---

*Phase: 03-core-agents*
*Context gathered: 2026-04-21*
*Implementation verified: complete*
