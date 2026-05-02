# CyberNovelist v7.0 技术架构

> 版本: 2.0 | 日期: 2026-05-02 | 配套 PRD v2.0 | 7 阶段流程瘦身后正式发布

## 1. 总体架构

CyberNovelist 是一个 **本地优先 AI 网络小说创作系统**,采用 TypeScript Monorepo 架构,把整个产品能力固化为 7 阶段同步流程:

```
┌─────────────────────────────────────────────────────────────┐
│                    交互层(Interface)                         │
│  CyberNovelist Studio(React + Hono + SSE)                    │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────┼────────────────────────────────────┐
│                  核心引擎层(Core Engine)                      │
│                                                              │
│  7 阶段工作流(workflow/contracts + services)                │
│  ① 灵感 → ② 规划 → ③ 总纲 → ④ 细纲 → ⑤ 正文 → ⑥ 质量 → ⑦ 导出│
│                                                              │
│  ├── Agent 系统(agents/) — 按阶段分组,继承 BaseAgent         │
│  ├── PipelineRunner(pipeline/) — 章节正文唯一入口             │
│  ├── 5 层伏笔治理(governance/) — 跨 ④⑤⑥                   │
│  ├── 33 维审计 + 9 类 AI 检测(quality/) — 服务于 ⑥           │
│  ├── LLM Provider 抽象(llm/) — 多模型路由                    │
│  ├── 状态管理(state/) — 三层架构 + 原子事务                   │
│  └── 导出器(export/) — EPUB / TXT / Markdown / 平台适配       │
│                                                              │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────┼────────────────────────────────────┐
│                  存储层(Storage)                              │
│  workflow-store(JSON)+ books/(章节文件)+ memory.db(SQLite) │
└─────────────────────────────────────────────────────────────┘
```

### 1.1 7 阶段总览

每个阶段都有独立的契约 schema、服务层、API 路由与前端页面。

| 阶段 | 契约 | 服务 | 路由前缀 | 主体 Agent |
|---|---|---|---|---|
| ① 灵感输入 | `inspiration.ts` | `InspirationService` | `/api/books/:bookId/inspiration` | — |
| ② 规划 | `planning.ts` | `PlanningService` | `/api/books/:bookId/planning-brief` | — |
| ③ 总纲规划 | `outline.ts`(三层) | `OutlineService` + 5 条规则校验 | `/api/books/:bookId/story-outline` | `OutlineGenerator` |
| ④ 细纲规划 | `detailed-outline.ts` | `DetailedOutlineService` + 7 条规则校验 | `/api/books/:bookId/detailed-outline` | `DetailedOutlineGenerator` |
| ⑤ 章节正文 | `writing.ts` + Markdown | — | `/api/books/:bookId/chapters/*` | `PipelineRunner` 编排多 Agent |
| ⑥ 质量检查 | `quality.ts` | `QualityService` | `/api/books/:bookId/quality` `/analytics` | 33 维审计 + 9 类 AI 检测 |
| ⑦ 导出 | `export.ts` | `ExportService` | `/api/books/:bookId/export` | EPUB / TXT / Markdown / 平台适配 |

阶段之间 **禁止跨阶段直接调用**,只能通过工作流文档(`{stage}.json`)读写共享数据。

---

## 2. Monorepo 结构

```
cybernovelist/
├── packages/
│   ├── core/                   # @cybernovelist/core(纯业务逻辑)
│   │   ├── src/
│   │   │   ├── workflow/
│   │   │   │   ├── contracts/      # 7 阶段契约(Zod schema)
│   │   │   │   │   ├── inspiration.ts
│   │   │   │   │   ├── planning.ts
│   │   │   │   │   ├── outline.ts          # 三层 StoryBlueprint
│   │   │   │   │   ├── detailed-outline.ts # 细纲 + contextForWriter
│   │   │   │   │   ├── writing.ts
│   │   │   │   │   ├── quality.ts
│   │   │   │   │   ├── export.ts
│   │   │   │   │   └── types/              # 子 schema(architecture / type-specific / ...)
│   │   │   │   └── services/
│   │   │   │       ├── inspiration-service.ts
│   │   │   │       ├── planning-service.ts
│   │   │   │       ├── outline-service.ts          # 含 generateBlueprint + 5 条规则校验
│   │   │   │       ├── detailed-outline-service.ts
│   │   │   │       ├── writing-service.ts
│   │   │   │       ├── quality-service.ts
│   │   │   │       └── export-service.ts
│   │   │   ├── agents/
│   │   │   │   ├── base.ts                  # BaseAgent 抽象基类
│   │   │   │   ├── registry.ts              # agentRegistry
│   │   │   │   ├── auto-register.ts         # Agent 自注册引导
│   │   │   │   ├── genre-guidance.ts        # GENRE_TO_ARCHITECTURE 映射
│   │   │   │   ├── outline-generator.ts     # ③ 单 Agent 总纲生成
│   │   │   │   ├── detailed-outline-generator.ts  # ④ 细纲 + contextForWriter
│   │   │   │   ├── intent-director.ts       # ⑤ 章节意图导演
│   │   │   │   ├── chapter-planner.ts       # ⑤ 单章计划补全器
│   │   │   │   ├── context-card.ts          # ⑤ 上下文卡片
│   │   │   │   ├── executor.ts              # ⑤ 章节执行
│   │   │   │   ├── scene-polisher.ts        # ⑤ 场景润色
│   │   │   │   ├── style-refiner.ts         # ⑤ 风格精修
│   │   │   │   ├── style-fingerprint.ts     # ⑤ 风格指纹
│   │   │   │   ├── market-injector.ts       # ⑤ 市场化爽点
│   │   │   │   ├── memory-extractor.ts      # ⑤→⑥ 章节记忆抽取
│   │   │   │   ├── chapter-summarizer.ts    # 章节摘要
│   │   │   │   ├── summary-compressor.ts    # 长摘要压缩
│   │   │   │   ├── entity-registry.ts       # 实体登记
│   │   │   │   ├── character.ts             # 角色档案
│   │   │   │   ├── quality-reviewer.ts      # ⑥ 综合质量
│   │   │   │   ├── style-auditor.ts         # ⑥ 风格一致性
│   │   │   │   ├── dialogue-checker.ts      # ⑥ 对白冲突力
│   │   │   │   ├── fact-checker.ts          # ⑥ 事实/设定冲突
│   │   │   │   ├── fatigue-analyzer.ts      # ⑥ 重复/疲劳
│   │   │   │   ├── hook-auditor.ts          # ⑥ 伏笔遗忘/逾期
│   │   │   │   ├── title-voice-auditor.ts   # ⑥ 标题/声调
│   │   │   │   ├── compliance-reviewer.ts   # ⑥ 合规审查
│   │   │   │   ├── entity-auditor.ts        # ⑥ 实体登记审计
│   │   │   │   ├── audit-tier-classifier.ts # ⑥ issue 三级分类
│   │   │   │   └── surgical-rewriter.ts     # ⑥ 精修重写
│   │   │   ├── pipeline/
│   │   │   │   ├── runner.ts                # PipelineRunner 主入口
│   │   │   │   ├── orchestrators/           # 章节正文编排器
│   │   │   │   ├── chapter-context.ts       # 章节上下文装配
│   │   │   │   ├── prompt-builders.ts       # 提示词构造
│   │   │   │   ├── chapter-io.ts            # 章节 IO
│   │   │   │   ├── persistence.ts           # 流水线持久化
│   │   │   │   ├── atomic-ops.ts            # 原子操作
│   │   │   │   ├── telemetry.ts             # 遥测
│   │   │   │   ├── memory-extractor.ts      # 章节记忆抽取
│   │   │   │   ├── detection-runner.ts      # 检测 runner
│   │   │   │   ├── review-cycle.ts          # 审稿循环
│   │   │   │   ├── revision-loop.ts         # 修订循环
│   │   │   │   ├── restructurer.ts          # 章节重组
│   │   │   │   └── truth-validation.ts      # 真相校验
│   │   │   ├── governance/                  # 5 层伏笔治理
│   │   │   │   ├── hook-policy.ts
│   │   │   │   ├── hook-agenda.ts
│   │   │   │   ├── hook-governance.ts
│   │   │   │   ├── hook-arbiter.ts
│   │   │   │   ├── hook-lifecycle.ts
│   │   │   │   ├── hook-admission.ts
│   │   │   │   ├── intent-declaration.ts
│   │   │   │   ├── context-governor.ts
│   │   │   │   ├── rule-stack-compiler.ts
│   │   │   │   └── safe-condition-eval.ts
│   │   │   ├── quality/                     # 33 维审计 + 9 类 AI 检测
│   │   │   │   ├── ai-detector.ts
│   │   │   │   ├── audit-dimensions.ts
│   │   │   │   ├── audit-post-processor.ts
│   │   │   │   ├── baseline.ts
│   │   │   │   ├── cadence.ts
│   │   │   │   ├── coverage-checker.ts
│   │   │   │   ├── cross-chapter-repetition.ts
│   │   │   │   ├── emotional-arc-tracker.ts
│   │   │   │   ├── length-normalizer.ts
│   │   │   │   ├── post-write-validator.ts
│   │   │   │   ├── pov-filter.ts
│   │   │   │   ├── repair-strategy.ts
│   │   │   │   ├── analytics-aggregator.ts
│   │   │   │   └── validator-checkers/
│   │   │   ├── state/                       # 状态层(基础设施)
│   │   │   │   ├── manager.ts
│   │   │   │   ├── runtime-store.ts
│   │   │   │   ├── reducer.ts
│   │   │   │   ├── snapshot.ts
│   │   │   │   ├── recovery.ts
│   │   │   │   └── ...
│   │   │   ├── llm/                         # LLM Provider(基础设施)
│   │   │   │   ├── provider.ts
│   │   │   │   ├── routed-provider.ts
│   │   │   │   ├── output-validator.ts      # JSON 输出校验 + LLMOutputRule
│   │   │   │   └── *-provider.ts            # claude/dashscope/gemini/deepseek/ollama
│   │   │   ├── export/                      # 导出器(⑦)
│   │   │   │   ├── epub.ts
│   │   │   │   ├── txt.ts
│   │   │   │   ├── markdown.ts
│   │   │   │   └── platform-adapter.ts
│   │   │   ├── prompts/                     # 提示词模板(版本化 v1/v2/latest)
│   │   │   ├── models/                      # 顶层 Zod schema
│   │   │   ├── errors.ts
│   │   │   ├── utils.ts
│   │   │   └── index.ts                     # barrel
│   │   └── package.json
│   └── studio/                              # @cybernovelist/studio(Web 工作台)
│       ├── src/
│       │   ├── api/
│       │   │   ├── server.ts                # Hono 服务器
│       │   │   ├── routes/                  # 阶段路由
│       │   │   │   ├── inspiration.ts
│       │   │   │   ├── planning-brief.ts
│       │   │   │   ├── story-outline.ts     # ③ POST 含 mode='generate'
│       │   │   │   ├── detailed-outline.ts  # ④
│       │   │   │   ├── chapters/            # ⑤ 章节子路由
│       │   │   │   ├── chapter-plan.ts      # ⑤ 单章计划(降级)
│       │   │   │   ├── writing.ts
│       │   │   │   ├── quality.ts
│       │   │   │   ├── analytics.ts
│       │   │   │   ├── hooks.ts             # 伏笔治理
│       │   │   │   ├── style.ts
│       │   │   │   ├── context.ts
│       │   │   │   ├── export.ts
│       │   │   │   ├── books.ts
│       │   │   │   ├── state.ts
│       │   │   │   ├── system.ts
│       │   │   │   ├── config.ts
│       │   │   │   ├── prompts.ts
│       │   │   │   ├── pipeline.ts
│       │   │   │   ├── genres.ts
│       │   │   │   └── workflow-store.ts    # 工作流文档 IO
│       │   │   └── sse.ts                   # SSE 事件类型
│       │   ├── pages/                       # 前端页面
│       │   │   ├── inspiration-input.tsx
│       │   │   ├── planning-brief.tsx
│       │   │   ├── story-outline.tsx
│       │   │   ├── detailed-outline.tsx
│       │   │   ├── writing.tsx
│       │   │   ├── quality-gate.tsx
│       │   │   ├── analytics.tsx
│       │   │   ├── export-view.tsx
│       │   │   └── ...
│       │   ├── components/
│       │   ├── lib/
│       │   └── runtime/
│       └── package.json
├── docs/                                    # PRD / 架构 / API / UI / 开发任务
├── e2e/                                     # Playwright E2E 测试
└── pnpm-workspace.yaml
```

依赖方向严格单向:`studio → core`,禁止反向依赖。

---

## 3. 7 阶段详细设计

### 3.1 阶段 ① 灵感输入(inspiration)

**契约**:`packages/core/src/workflow/contracts/inspiration.ts`

```ts
InspirationSeedSchema = z.object({
  id, sourceText, genre?, theme?, conflict?, tone?,
  constraints: z.array(z.string()).default([]),
  sourceType: z.enum(['manual', 'shuffle', 'import']),
  createdAt,
});
```

**服务**:`DefaultInspirationService` 仅做 `trim` + 去重 + Zod 校验。不调 LLM。

**入口**:`POST /api/books/:bookId/inspiration`(创建);`PATCH`(更新);`GET`(读取)。

---

### 3.2 阶段 ② 规划(planning)

**契约**:`packages/core/src/workflow/contracts/planning.ts`

```ts
PlanningBriefSchema = z.object({
  id, seedId, audience, genreStrategy, styleTarget, lengthTarget,
  tabooRules: z.array(z.string()).default([]),
  marketGoals: z.array(z.string()).default([]),
  creativeConstraints: z.array(z.string()).default([]),
  status: z.enum(['draft', 'ready', 'approved']).default('draft'),
  createdAt, updatedAt,
});
```

**服务**:`DefaultPlanningService` 同样是纯 schema 校验 + normalize,不调 LLM。

**入口**:`POST /api/books/:bookId/planning-brief`、`PATCH`、`GET`。

---

### 3.3 阶段 ③ 总纲规划(outline)

#### 3.3.1 三层 Schema 设计(参照 `C:\Users\18223\Desktop\AI` Python 项目)

**契约**:`packages/core/src/workflow/contracts/outline.ts`

```ts
StoryBlueprintSchema = z.object({
  id, planningBriefId, createdAt, updatedAt,

  // Layer 1: meta(对应 AI 项目 MetaBlock)
  meta: z.object({
    novelType: NovelTypeSchema,                 // 10 选 1
    novelSubgenre: z.string().optional(),
    typeConfidence: z.number().min(0).max(1).default(0.5),
    typeIsAuto: z.boolean().default(true),
    genderTarget: z.enum(['male', 'female', 'universal']),
    architectureMode: ArchitectureModeSchema,   // 4 选 1,自动从 novelType 推断
    titleSuggestions: z.array(z.string()).min(1),
    estimatedWordCount: z.string(),
    endingType: z.enum(['HE', 'BE', 'open', 'angst_HE']),
    oneLineSynopsis: z.string().max(200),
  }),

  // Layer 2: base(对应 BaseBlock)
  base: z.object({
    sellingPoints: SellingPointsSchema,
    theme: ThemeSchema,
    goldenOpening: GoldenOpeningSchema,         // 黄金三章
    writingStyle: WritingStyleSchema,
    characters: z.array(CharacterSchema).min(1),
    relationships: z.array(RelationshipSchema),
    outlineArchitecture: OutlineArchitectureSchema,
    foreshadowingSeed: ForeshadowingSeedSchema,
    completionDesign: CompletionDesignSchema,
  }),

  // Layer 3: typeSpecific(对应 TypeSpecificBlock,5 选 1)
  typeSpecific: z.discriminatedUnion('kind', [
    FantasyTypeSpecificSchema,
    MysteryTypeSpecificSchema,
    UrbanTypeSpecificSchema,
    RomanceTypeSpecificSchema,
    SciFiTypeSpecificSchema,
  ]),
});
```

#### 3.3.2 Architecture Mode 自动映射

`packages/core/src/agents/genre-guidance.ts`:

```ts
export const GENRE_TO_ARCHITECTURE: Record<NovelType, ArchitectureMode> = {
  xuanhuan: 'lotus_map', xianxia: 'lotus_map', qihuan: 'lotus_map',
  kehuan: 'multiverse',
  youxi: 'map_upgrade', moshi: 'map_upgrade',
  dushi: 'org_ensemble', xuanyi: 'org_ensemble',
  yanqing: 'org_ensemble', lishi: 'org_ensemble',
};
```

4 种架构模式子结构:
- **lotus_map**:`lotusCore { name, secretLayers[], guardianCharacters[], returnTrigger }` + `petals[]`
- **multiverse**:`hubWorld` + `worlds[] { rules, conflict, transferMechanism }` + `progressionLogic`
- **org_ensemble**:`coreOrg` + `factions[] { ideology, leader, stance }` + `powerBalance`
- **map_upgrade**:`startingZone` + `zones[] { levelRange, resources, dangers }` + `upgradeTriggers`

#### 3.3.3 OutlineGenerator Agent

**文件**:`packages/core/src/agents/outline-generator.ts`

继承 `BaseAgent`,接收 `{ seed, brief }` 上下文,**单次 LLM 调用** 产出完整三层 `StoryBlueprint`(meta + base + typeSpecific)。

提示词参考 `C:\Users\18223\Desktop\AI\app\agents\` 下的 intent + theme + world + character + foreshadow 五个 prompt 的合并版本,并用 `output-validator.ts` 的 `LLMOutputRule` 强约束:
- `meta.titleSuggestions` `min_array_length=1`
- `base.characters` `min_array_length=1`
- `base.theme.toneKeywords` `min_array_length=3`
- `typeSpecific.kind` 必须等于 `GENRE_TO_ARCHITECTURE[meta.novelType]` 对应的 kind

#### 3.3.4 5 条一致性校验规则(对应 AI 项目 Agent-07)

`outline-service.ts` 内置规则函数,不再单独建 ConsistencyAgent:

| 规则 | 描述 | 严重性 |
|---|---|---|
| R-01 | `meta.architectureMode == GENRE_TO_ARCHITECTURE[meta.novelType]` | critical |
| R-02 | `typeSpecific.kind` 与 `meta.novelType` 匹配 | critical |
| R-03 | `relationships[].fromId/toId` 必须存在于 `characters[].id` | warning |
| R-04 | 至少有 1 个 `characters[].role='protagonist'` | critical |
| R-05 | `meta.endingType == base.completionDesign.endingType` | warning |

校验失败抛 `OutlineValidationError`,前端按规则编号分组展示供作者修复。

#### 3.3.5 入口

- `POST /api/books/:bookId/story-outline { mode: 'generate' }` — 调 OutlineGenerator 自动生成
- `POST /api/books/:bookId/story-outline { mode: 'manual', ...fields }` — 完全手工提交
- `PATCH` — 局部更新(不重新跑 LLM)
- `GET` — 读取

---

### 3.4 阶段 ④ 细纲规划(detailed-outline)

#### 3.4.1 契约

**文件**:`packages/core/src/workflow/contracts/detailed-outline.ts`

```ts
DetailedOutlineSchema = z.object({
  id, storyBlueprintId, createdAt, updatedAt,
  totalChapters, estimatedTotalWords,
  volumes: z.array(VolumeEntrySchema),
});

ChapterEntrySchema = z.object({
  chapterNumber, title, wordCountTarget,
  sceneSetup, charactersPresent[], coreEvents[],
  emotionArc, chapterEndHook,
  foreshadowingOps[],     // {foreshadowingId, operation: plant|advance|resolve}
  satisfactionType,
  keyDialogueHints[], writingNotes,
  contextForWriter: ContextForWriterSchema,
});

ContextForWriterSchema = z.object({
  storyProgress,                    // 必填(规则 R-08)
  chapterPositionNote,
  characterStates[],                // 角色当时状态
  activeWorldRules[],
  activeForeshadowingStatus[],      // 活跃伏笔状态
  precedingChapterBridge,           // 与上一章衔接
  nextChapterSetup,                 // 为下一章铺垫
});
```

#### 3.4.2 DetailedOutlineGenerator

**文件**:`packages/core/src/agents/detailed-outline-generator.ts`(原 `planner.ts` 改写)

读取 `StoryBlueprint`,两阶段生成:
1. 卷骨架(volume-level summary)
2. 逐卷补 chapters,每章带完整 contextForWriter

Token 控制策略:超过 50 章按卷分批,卷间独立 LLM 请求。

#### 3.4.3 7 条规则校验(对应 AI 项目 xi_gang_check)

| 规则 | 描述 | 严重性 |
|---|---|---|
| R-06 | 每章 `writingNotes` 非空 | warning |
| R-07 | 每章 `keyDialogueHints` 非空 | warning |
| R-08 | 每章 `contextForWriter.storyProgress` 非空 | warning |
| R-09 | `charactersPresent[]` 必须存在于 `StoryBlueprint.base.characters[].id` | warning |
| R-10 | `foreshadowingOps[].foreshadowingId` 必须存在于 `StoryBlueprint.base.foreshadowingSeed.entries[].id` | warning |
| R-11 | 章节号连续从 1 起递增 | warning |
| R-12 | 必须存在 chapterNumber ∈ {1, 2, 3}(黄金三章) | critical |

---

### 3.5 阶段 ⑤ 章节正文(writing)

#### 3.5.1 PipelineRunner — 章节正文唯一外部入口

**文件**:`packages/core/src/pipeline/runner.ts`

提供 4 个公开方法:
- `writeNextChapter()` — 完整链路(意图 → 上下文 → 草稿 → 审计 → 修订 → 持久化)
- `writeFastDraft()` — 快速试写(单次 LLM 调用,<15s,不持久化)
- `writeDraft()` — 草稿模式(跳过审计,标记 draft,<30s)
- `upgradeDraft()` — 草稿转正(含上下文漂移防护检查)

**完整链路 15 步**(`writeNextChapter`):

```
1.  IntentDirector            → 章节叙事目标
2.  ContextCard               → 上下文卡片装配
3.  RuleStackCompiler         → 规则栈聚合
4.  ContextGovernor           → 上下文预算治理
5.  从 DetailedOutline 读取 contextForWriter(优先,命中跳过 6)
6.  ChapterPlanner(降级补全器) → 单章 sceneBreakdown 等(仅当 5 缺失)
7.  Executor                  → 草稿生成
8.  ScenePolisher             → 场景润色
9.  StyleRefiner              → 风格精修
10. AuditTierClassifier       → 审计前分级
11. 33 维审计 + 9 类 AI 检测   → quality/ 引擎
12. RevisionLoop              → 修订循环(maxRetries=2)
13. SurgicalRewriter          → 精修重写(必要时)
14. MemoryExtractor           → 章节记忆抽取
15. AtomicOps.commit          → 章节文件 → index.json → facts/hooks → 快照 → SQLite 提交
```

#### 3.5.2 优先消费细纲

PipelineRunner 在第 5 步从 `DetailedOutline` 读取目标章节的 `contextForWriter`。命中则把它直接喂给 Executor,跳过 ChapterPlanner;未命中则降级走 ChapterPlanner 全量生成。这是细纲层"自给自足上下文"的兑现。

#### 3.5.3 章节执行 Agent 分组

| Agent | 职责 |
|---|---|
| `IntentDirector` | 把用户长期意图 + 当前焦点合成本章叙事目标 |
| `ContextCard` | 装配上下文卡片(角色、世界规则、伏笔状态) |
| `Executor` | 草稿生成主体 |
| `ScenePolisher` | 场景细节润色 |
| `StyleRefiner` | 风格精修 |
| `ChapterPlanner` | 单章 sceneBreakdown / openingHook / closingHook(降级补全器) |
| `MemoryExtractor` | 章节落盘后抽取事实 / 实体 / 伏笔变更 |
| `StyleFingerprint` | 风格指纹提取(仿写) |
| `MarketInjector` | 题材爽点注入 |
| `EntityRegistry` | 实体登记簿 |
| `Character` | 角色档案查询 |
| `ChapterSummarizer` | 章节摘要生成 |
| `SummaryCompressor` | 长摘要压缩 |

---

### 3.6 阶段 ⑥ 质量检查(quality)

#### 3.6.1 33 维审计

`packages/core/src/quality/audit-dimensions.ts` 定义 33 个维度,三级分类:
- **阻断级(critical)** — 12 项:角色矛盾、时间线冲突、伏笔遗忘、世界规则违反、设定崩坏、字数严重不达标、POV 错乱、剧情断层、关键事件缺失、关键对白缺失、关键场景缺失、角色状态矛盾
- **警告级(warning)** — 12 项:角色行为偏离、对话不自然、节奏失衡、感官细节单薄、情感转折突兀、跨章重复、伏笔铺垫不足、世界规则模糊、字数偏离、风格漂移、信息密度异常、配角扁平
- **建议级(suggestion)** — 9 项:修辞重复、语气一致性、描写密度、典型套路、命名一致性、地名细节、装备/物品一致性、读者爽点节拍、市场表现优化

降级路径:单维 LLM 失败自动重试,仍失败则阻断级降级为警告级、非关键维度跳过。

#### 3.6.2 9 类 AI 痕迹检测

`packages/core/src/quality/ai-detector.ts`:

1. 套话检测(高频套语)
2. 句式单调(长度方差过低)
3. 语义重复(语义相似的连续句)
4. 过度连接词(然而/因此/此外滥用)
5. 抽象描述(缺乏具象细节)
6. 排比堆叠(三句以上同结构连用)
7. 格式化结构(明显的列举/对仗)
8. 同质化情感(情感词集中)
9. 缺乏感官细节(视觉/听觉/嗅觉/触觉/味觉缺失)

每类输出 0-100 分,综合给出 AI 痕迹总分。

#### 3.6.3 4 种修复策略

`packages/core/src/quality/repair-strategy.ts`:

| 策略 | 适用场景 | 操作 |
|---|---|---|
| 局部替换 | 套话、单一词汇问题 | LLM 替换 1-3 词 |
| 段落重排 | 节奏失衡、信息密度异常 | LLM 重写 1-2 段 |
| 节拍重写 | 情感转折突兀、对话不自然 | 整段节拍重写 |
| 整章重写 | 阻断级问题或多重警告 | 调 PipelineRunner.writeDraft 重新生成 |

#### 3.6.4 伏笔治理 5 层架构(跨 ④⑤⑥)

`packages/core/src/governance/`:

```
HookPolicy(策略层)
  ↓ 决定一个伏笔何时该被推进/休眠
HookAgenda(议程层)
  ↓ 排班,把所有 open hooks 按章节计划
HookGovernance(治理层)
  ↓ 总控:汇集 policy + agenda + arbiter,输出当前章节 hookPlan
HookArbiter(仲裁层)
  ↓ 检测冲突(时间/角色/主题重叠)、惊群平滑
HookLifecycle(生命周期)
  ↓ open → progressing → deferred → dormant → resolved/abandoned
```

辅助子模块:
- `HookAdmission` — 准入控制,重复伏笔家族拦截
- `IntentDeclaration` — 人工意图声明,标注预期回收窗口
- `ContextGovernor` — 上下文预算治理
- `RuleStackCompiler` — 规则栈编译

#### 3.6.5 状态层(基础设施,服务于⑥)

三层架构 + 原子事务:

```
StateManager(锁/路径/索引)
  ↓
RuntimeStateStore(加载/构建/保存)
  ↓
StateReducer(不可变更新)
```

单章写入为原子事务:章节文件 → index.json → facts/hooks → 快照 → SQLite 提交。崩溃后通过 WAL 自动回滚未提交事务。

7 真相文件:`current_state` / `hooks` / `chapter_summaries` / `subplot_board` / `emotional_arcs` / `character_matrix` / `manifest`。

---

### 3.7 阶段 ⑦ 导出(export)

**文件**:`packages/core/src/export/`

| 导出器 | 文件 | 输出 |
|---|---|---|
| EPUB | `epub.ts` | EPUB 3.0(OPF + NCX + XHTML) |
| TXT | `txt.ts` | 纯文本 |
| Markdown | `markdown.ts` | Markdown 文件 |
| 平台适配 | `platform-adapter.ts` | 起点 / 番茄等平台格式 |

**安全约束**:`ExportService` 校验输出路径必须在项目目录内部,防止路径穿越。

---

## 4. 数据流

### 4.1 7 阶段数据流

```
用户填表(灵感)
  ↓ POST /inspiration
InspirationSeed → workflow-store(inspiration-seed.json)
  ↓
用户填表(规划)
  ↓ POST /planning-brief
PlanningBrief → workflow-store(planning-brief.json)
  ↓
用户点击「AI 自动生成」
  ↓ POST /story-outline { mode: 'generate' }
OutlineGenerator(单 Agent,1 次 LLM)
  ↓ 5 条规则校验
StoryBlueprint(三层) → workflow-store(story-outline.json)
  ↓
用户点击「AI 自动生成」
  ↓ POST /detailed-outline { mode: 'generate' }
DetailedOutlineGenerator(单 Agent,卷分批 LLM)
  ↓ 7 条规则校验
DetailedOutline(含 contextForWriter) → workflow-store(detailed-outline.json)
  ↓
用户点击「写下一章」
  ↓ PipelineRunner.writeNextChapter()
读取 contextForWriter[N] → Executor → 33 维审计 → 修订 → 持久化
  ↓ 章节文件 + 状态原子事务
chapter-{NNNN}.md + index.json + facts.json + snapshot
  ↓
质量门审计
  ↓ POST /quality
QualityReport(8 维度雷达 + 33 维明细)
  ↓
最后导出
  ↓ POST /export
EPUB / TXT / Markdown
```

### 4.2 章节正文流水线数据流

```
DetailedOutline.chapters[N].contextForWriter
  ↓ PipelineRunner 读取
ContextCard 装配 → RuleStackCompiler 编译 → ContextGovernor 治理
  ↓
Executor 草稿生成
  ↓ ScenePolisher → StyleRefiner
草稿文本
  ↓ AuditTierClassifier 分级
33 维审计(并发跑各维度 Agent)
  ↓ AI 检测(9 类)
issues 列表
  ↓ RevisionLoop(maxRetries=2)
通过 → MemoryExtractor 抽取记忆 → AtomicOps.commit
  ↓ 失败超阈值
fallbackAction = accept_with_warnings(污染隔离)
  | pause(暂停等人工介入)
```

### 4.3 状态更新流

任何状态变更都走 `StateManager → RuntimeStateStore → StateReducer` 三层不可变更新链路:

```
请求侧
  ↓ acquireLock(bookId)
StateManager 获取锁
  ↓ load(bookId)
RuntimeStateStore 读取当前状态
  ↓ reduce(state, delta)
StateReducer 计算新状态(纯函数,不可变)
  ↓ save(newState)
RuntimeStateStore 写入磁盘 + SQLite(原子事务)
  ↓ snapshot(if needed)
快照备份
  ↓ releaseLock
StateManager 释放锁
```

---

## 5. 存储设计

### 5.1 文件系统布局

```
books/
  {bookId}/
    story/
      chapters/
        chapter-0001.md
        chapter-0002.md
        ...
      state/
        manifest.json
        current_state.json
        hooks.json
        chapter_summaries.json
        subplot_board.json
        emotional_arcs.json
        character_matrix.json
        index.json
      workflow/                # 7 阶段工作流文档
        inspiration-seed.json
        planning-brief.json
        story-outline.json     # 三层 StoryBlueprint
        detailed-outline.json  # 全书细纲 + contextForWriter
        quality-report.json
        export-artifact.json
      snapshots/
        {chapter}/
          full.json            # 状态全快照
          delta.json           # 增量
      memory.db                # SQLite 时序记忆
      locks/
        write.lock
        reorg.lock
```

### 5.2 SQLite 表结构

`memory.db`(WAL 模式 + busy_timeout):

| 表名 | 用途 |
|---|---|
| `chapters` | 章节元数据(chapterNumber, title, wordCount, status, hash) |
| `facts` | 事实碎片(chapter, content, confidence, polluted) |
| `hooks` | 伏笔状态(id, status, plantedChapter, expectedResolution, priority) |
| `entities` | 实体登记(name, type, firstAppearance, attributes) |
| `character_states` | 角色状态时序(chapter, characterId, powerLevel, emotionalState, ...) |
| `audit_results` | 审计结果(chapter, dimension, severity, message, fixed) |
| `tokens_usage` | Token 用量(chapter, agent, prompt_tokens, completion_tokens) |
| `quality_baselines` | 质量基线快照(metric, value, capturedAtChapter) |

---

## 6. 安全设计

| 维度 | 措施 |
|---|---|
| API 密钥 | `config.local.json`(`.gitignore`),不提交版本控制 |
| 路径穿越 | 所有文件 IO 校验路径必须在项目目录内部 |
| 文件锁 | `acquireLock` / `releaseLock` 防并发写入损坏 |
| 输入验证 | Zod schema 在所有 API 入口校验 |
| XSS | 前端 React 自带转义;Markdown 渲染走白名单 |
| 重组安全 | `reorg.lock` 专用锁 + `.reorg_in_progress` 哨兵 + staging 原子提交 |
| 崩溃恢复 | WAL 日志 + 启动时自动回滚未提交事务 |
| 僵尸锁清理 | DoctorView 一键修复 |

---

## 7. 测试策略

| 层级 | 框架 | 覆盖 |
|---|---|---|
| 单元测试 | Vitest | core + studio,旁侧 `.test.ts`,目标 > 80% |
| 集成测试 | Vitest | PipelineRunner 黄金路径(`runner.golden.test.ts`) |
| E2E 测试 | Playwright | 7 阶段全流程,Chromium 单 worker |

E2E 必须覆盖的关键路径:
1. 创建新书 → 灵感输入 → 规划 → 总纲生成 → 细纲生成 → 写第 1 章 → 质量审计 → 导出 EPUB
2. 总纲规则校验失败的修复流程
3. 细纲漂移检测与修复
4. 章节回滚与快照恢复
5. 污染隔离章节的视觉强化展示

测试运行命令:`pnpm verify`(lint + typecheck + test + build)。
