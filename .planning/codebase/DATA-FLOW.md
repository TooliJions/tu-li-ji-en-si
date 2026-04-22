# 完整数据流分析：从创建新书到出版小说

**分析日期：** 2026-04-23

---

## 总览

CyberNovelist 采用 **Agent 编排流水线架构**，数据流经 9 个核心阶段：

```
用户创建 → 初始化Bootstrap → 章节规划 → 上下文构建 → 意图定向 → 正文生成 → 润色 → 审计修订 → 记忆提取 → 持久化 → 导出
```

核心数据载体为 **Manifest**（运行时状态）和 **ChapterPlan**（章节计划），贯穿整条流水线。

---

## 1. Book Creation Flow（书籍创建流程）

### 1.1 UI 入口 → API → Core

**入口文件：** `packages/studio/src/pages/book-create.tsx`

**数据流：**
1. 用户在 BookCreate 页面填写：`title`, `genre`, `brief`（创作灵感）, `language`, `platform`, `targetWordsPerChapter`, `modelConfig`
2. 前端通过 `lib/api.ts` 发送 POST 请求到 `/api/books`
3. API 路由创建 `StudioRuntimeBookRecord` 并存储到 `.runtime/` 目录

**关键接口：**
- **输入：** `BookCreate`（`packages/core/src/models/book.ts`）
  - `title: string`, `genre: BookGenreSchema`, `targetWords: number`, `language?: LanguageSchema`, `brief?: string`, `targetChapterCount?: number`, `fanficMode?: FanficModeSchema`
- **输出：** `Book`（含自动生成的 `id`, `status: 'active'`, `currentWords: 0`, `chapterCount: 0`）

### 1.2 Core 初始化（PipelineRunner.initBook）

**文件：** `packages/core/src/pipeline/runner.ts` → `initBook()`

**流程：**
```
initBook(InitBookInput) → InitBookResult
  1. 验证输入（bookId, title, genre, synopsis 非空）
  2. 检查书籍目录是否已存在
  3. StateManager.ensureBookStructure() — 创建目录结构
  4. RuntimeStateStore.initializeBookState() — 写入空 manifest.json
  5. 写入 meta.json（title, genre, synopsis, tone, targetAudience, platform）
  6. StateManager.writeIndex() — 创建空 index.json
```

**磁盘布局：**
```
{rootDir}/{bookId}/
├── book.json          # 书籍元数据
├── meta.json          # 扩展元数据（synopsis, tone, platform）
├── story/
│   ├── chapters/
│   │   └── chapter-0000.md   # 占位空文件
│   └── state/
│       ├── manifest.json     # 运行时状态（核心）
│       ├── index.json        # 章节索引
│       ├── current_state.md  # Markdown 投影
│       ├── hooks.md          # 伏笔投影
│       ├── chapter_summaries.md
│       ├── subplot_board.md
│       ├── emotional_arcs.md
│       ├── character_matrix.md
│       └── .state-hash       # SHA-256 状态哈希
```

**关键接口：**
- **InitBookInput：** `{ bookId, title, genre, synopsis, tone?, targetAudience?, platform? }`
- **InitBookResult：** `{ success, bookId, error? }`

### 1.3 Bootstrap Story（故事启动——Studio 层扩展）

**文件：** `packages/studio/src/api/routes/pipeline.ts` → `POST /api/books/:bookId/pipeline/bootstrap-story`

这是 Studio 对 `initBook` 的增强版，执行完整的故事初始化：

```
buildStoryBootstrap(bookId, chapterNumber)
  1. expandInspiration() — LLM 扩展用户灵感为结构化简报
     输出：ExpandedInspiration { corePremise, eraContext, centralConflict, protagonistPosition, powerSystem }
  2. OutlinePlanner.execute() — 生成大纲
     输出：OutlineResult { acts: OutlineAct[] }
  3. World Bootstrap — LLM 生成世界观规划
     输出：{ currentFocus, centralConflict, growthArc, worldRules[], hooks[] }
  4. CharacterDesigner.execute() — 角色设计
     输出：CharacterDesignResult { characters: CharacterProfile[] }
  5. ChapterPlanner.execute() — 首章规划
     输出：ChapterPlanResult { plan: ChapterPlan }
  6. 合并所有数据写入 manifest.json
  7. 更新 book.json 的 expandedBrief, planningBrief
```

**数据合并逻辑：**
- 伏笔：`manifest.hooks` + `openHooks`（世界规划生成）+ `planHooks`（章节规划生成）→ 去重 → 重新编号
- 角色：`manifest.characters` + `characterDesign.characters` → 按 name 去重
- 世界规则：`manifest.worldRules` + `worldBootstrap.worldRules` → 按 rule 去重
- 章节计划：写入 `manifest.chapterPlans[String(chapterNumber)]`
- 大纲：写入 `manifest.outline`

---

## 2. Chapter Planning Flow（章节规划流程）

### 2.1 PipelineRunner.planChapter

**文件：** `packages/core/src/pipeline/runner.ts` → `planChapter()`

**流程：**
```
planChapter(PlanChapterInput) → PlanChapterResult
  1. 验证 chapterNumber ≥ 1
  2. 加载 manifest
  3. #computeBatchRange() — 计算批量规划区间（从当前章节到下一个 beat 之前，最多10章）
  4. #buildPlanContext() — 构建规划上下文
     读取：meta.json, book.json（expandedBrief, planningBrief）
     计算：wordCountTarget, centralConflict, growthArc, candidateWorldRules, openHooks, outlineContext, previousChapterSummary
  5. 批量规划：ChapterPlanner.execute({ batchRange })
     或单章规划：ChapterPlanner.execute({ 单章 })
     批量失败时降级到单章
  6. 将所有 plans 保存到 manifest.chapterPlans
  7. 更新 index.json（新章节条目）
```

**关键接口：**
- **PlanChapterInput：** `{ bookId, chapterNumber, outlineContext? }`
- **PlanChapterResult：** `{ success, chapterNumber, title?, summary?, keyEvents?, characters?, hooks?, error? }`

### 2.2 ChapterPlanner Agent

**文件：** `packages/core/src/agents/chapter-planner.ts`

**输入：** `ChapterPlanBrief` + 角色列表 + 大纲 + 开放伏笔 + 世界规则 + 上下文焦点
**输出：** `ChapterPlanResult { plan: ChapterPlan }`

**ChapterPlan 核心结构：**
```typescript
{
  chapterNumber: number;
  title: string;
  intention: string;           // 本章意图
  wordCountTarget: number;     // 目标字数
  characters: string[];        // 出场角色
  keyEvents: string[];         // 关键事件
  hooks: HookPlan[];           // 伏笔计划
  worldRules: string[];        // 世界观设定
  emotionalBeat: string;       // 情感节拍
  sceneTransition: string;     // 场景过渡
  openingHook: string;         // 开篇钩子
  closingHook: string;         // 结尾悬念
  sceneBreakdown: SceneBreakdown[];  // 场景分解（2-4个场景）
  characterGrowthBeat: string; // 角色成长点
  hookActions: HookAction[];   // 伏笔动作（plant/advance/payoff）
  pacingTag: 'slow_build' | 'rising' | 'climax' | 'cooldown' | 'transition';
}
```

### 2.3 相关 Agent

- **IntentDirector**（`packages/core/src/agents/intent-director.ts`）：将用户意图转化为结构化叙事指令
  - 输入：`IntentInput { userIntent, chapterNumber, genre, previousChapterSummary?, outlineContext?, characterProfiles? }`
  - 输出：`IntentOutput { narrativeGoal, emotionalTone, keyBeats[], focusCharacters[], styleNotes }`

- **CharacterDesigner**（`packages/core/src/agents/character.ts`）：角色设计
  - 输入：`CharacterDesignBrief { title, genre, brief, characterCount? }` + outline + eraContext
  - 输出：`CharacterDesignResult { characters: CharacterProfile[] }`
  - CharacterProfile：`{ name, role, traits[], background, abilities[], relationships: Record<string,string>, arc }`

---

## 3. Chapter Writing Flow（章节写作流程）

### 3.1 完整创作链路：composeChapter

**文件：** `packages/core/src/pipeline/runner.ts` → `composeChapter()`

这是最核心的 9 步流程：

```
composeChapter(WriteNextChapterInput) → ChapterResult

步骤1: ContextCard Agent — 构建上下文卡片
  输入：bookId, chapterNumber, title, genre + 数据源（getManifest, getPreviousChapterSummary, getChapterContext）
  输出：ContextCardOutput { characters, hooks, facts, worldRules, currentFocus, previousChapterSummary, chapterContext, formattedText }

步骤2: 获取章节计划
  优先：manifest.chapterPlans[String(chapterNumber)]
  降级：IntentDirector Agent 生成意图 → 构建 ChapterPlan

步骤3: ChapterExecutor Agent — 正文生成
  依赖注入：
    - buildContext: 返回 contextCard.formattedText
    - generateScene: 使用 #buildAgentDraftPrompt() 构建 prompt → provider.generate()
  输出：{ chapterNumber, title, content, wordCount }

步骤4: 世界规则执行检查（#checkWorldRules）

步骤5: ScenePolisher Agent — 场景润色
  输入：draftContent, chapterNumber, title, genre, contextCard
  输出：ScenePolishOutput { polishedContent, wordCount, originalWordCount }

步骤6: #auditAndRevise() — 质量审计 + 修订循环
  内部循环：审计 → 修订 → 污染检测 → 降级处理

步骤7: #extractMemory() — 记忆提取
  LLM 提取新事实和新伏笔 → applyRuntimeStateDelta() → 保存 manifest

步骤8: #persistChapter() — 持久化到文件系统

步骤9: #updateStateAfterChapter() — 更新 index.json + manifest
```

### 3.2 简化模式

- **writeDraft**（草稿模式）：直接 LLM 生成 → 持久化 → 更新状态（跳过审计修订）
- **writeFastDraft**（快速试写）：LLM 生成 → ScenePolisher 润色（不持久化）
- **upgradeDraft**（草稿转正）：读取草稿 → 漂移检测 → ContextCard → IntentDirector → ScenePolisher → 持久化为正式章节

### 3.3 关键 Agent 详解

**ContextCard**（`packages/core/src/agents/context-card.ts`）：
- **职责：** 从 Manifest 中提取当前章节写作所需的所有上下文
- **数据源：** ContextDataSources 接口（getManifest, getPreviousChapterSummary, getChapterContext）
- **输出格式化：** 将 characters, hooks, worldRules, facts, previousChapterSummary 组合为 Markdown 格式的 formattedText
- **温度：** 0.2（低创造性，高准确性）

**ChapterExecutor**（`packages/core/src/agents/executor.ts`）：
- **职责：** 根据章节计划生成正文
- **核心方法：** `execute(ctx)` → 通过 deps.buildContext() 获取上下文 → deps.generateScene() 生成正文
- **降级：** 无 deps 时使用 #generateFallback() 直接调用 LLM
- **温度：** 0.8（高创造性）

**ScenePolisher**（`packages/studio/src/agents/scene-polisher.ts`）：
- **职责：** 对草稿进行文字润色，提升语言质量和阅读体验
- **输入：** `ScenePolishInput { draftContent, chapterNumber, title?, genre, intentGuidance?, contextCard? }`
- **输出：** `ScenePolishOutput { polishedContent, wordCount, originalWordCount }`
- **关键约束：** 润色后字数不得少于初稿的 90%
- **温度：** 0.5

**StyleRefiner**（`packages/core/src/agents/style-refiner.ts`）：
- **职责：** 风格优化和文字精炼
- **输入：** `StyleRefineInput { draftContent, chapterNumber, genre, styleFingerprint?, previousChapterContent? }`
- **输出：** `StyleRefineOutput { refinedContent, styleAnalysis, improvementScore }`
- **温度：** 0.4

---

## 4. Review & Revision Flow（审计与修订流程）

### 4.1 内置审计修订循环（#auditAndRevise）

**文件：** `packages/core/src/pipeline/runner.ts` → `#auditAndRevise()`

**循环逻辑：**
```
for attempt = 0 to maxRevisionRetries:
  1. #auditChapter() — LLM 审计，返回 { status, issues, overallScore }
  2. 污染检测：若修订后分数 < 前一轮，回滚到前一版本
  3. 若 status='pass' 或 issues 为空 → 返回
  4. 若 attempt < maxRevisionRetries → LLM 修订
  5. 用尽次数 → 降级处理：
     - fallbackAction='accept_with_warnings' → 返回当前版本 + 警告
     - fallbackAction='pause' → 抛出错误
```

### 4.2 独立审计方法（auditDraft）

**文件：** `packages/core/src/pipeline/runner.ts` → `auditDraft()`

**流程：**
```
auditDraft(AuditDraftInput) → AuditResult
  1. #runContinuityAudit() — 33维连续性审计（角色、时间线、伏笔、世界规则）
  2. #runAIDetection() — 9类AI检测（套话、句式单调、元叙事、意象重复等）
  3. 合并评分：overallScore = (auditScore + (1-aiTrace)*100) / 2
  4. 判定：≥80 pass, ≥60 warning, <60 fail
```

### 4.3 修订循环（RevisionLoop）

**文件：** `packages/core/src/pipeline/revision-loop.ts`

**核心逻辑：**
```
RevisionLoop.run(RevisionInput) → RevisionResult
  1. 初始审计
  2. 若通过 → accepted
  3. 修订循环（maxRevisionRetries次）：
     a. 修订内容
     b. 审计修订后内容
     c. 污染检测（分数下降 → 回滚 + break）
     d. 若通过 → accepted
  4. 用尽次数 → accepted_with_warnings 或 paused
```

**关键接口：**
- **RevisionResult：** `{ action: 'accepted' | 'accepted_with_warnings' | 'paused', content, originalContent, revisionAttempts, warnings[], isContaminated, finalScore }`

### 4.4 ReviewCycle

**文件：** `packages/core/src/pipeline/review-cycle.ts`

**与 RevisionLoop 的区别：** ReviewCycle 是更通用的审核循环，支持 accept/rewrite/skip 决策，包含验证（空内容/过短内容 → skip）。

### 4.5 审计 Agent 矩阵

| Agent | 文件 | 职责 | 温度 |
|-------|------|------|------|
| QualityReviewer | `agents/quality-reviewer.ts` | 7维度质量审核（一致性、重复性、节奏感、逻辑性、画面感、对话质量、题材适配） | 0.2 |
| ComplianceReviewer | `agents/compliance-reviewer.ts` | 7类别合规审核（暴力、不当内容、政治敏感、版权、敏感话题、歧视、违法） | 0.1 |
| FactChecker | `agents/fact-checker.ts` | 事实核查（世界设定、角色、时间线、伏笔一致性） | 0.1 |
| EntityAuditor | `agents/entity-auditor.ts` | 实体审核（角色/地点/物品/组织的注册状态检测） | 0.1 |
| AuditTierClassifier | `agents/audit-tier-classifier.ts` | 审计分级（blocker/warning/suggestion 分类） | 0.2 |
| SurgicalRewriter | `agents/surgical-rewriter.ts` | 精确重写（4种策略：local-replace, paragraph-reorder, beat-rewrite, chapter-rewrite） | 0.7 |

---

## 5. Governance & Hook System（治理与伏笔系统）

### 5.1 五层架构

```
HookPolicy → HookAgenda → HookGovernance → HookAdmission → HookLifecycle
  策略配置     排班调度      治理控制       准入控制       生命周期
```

### 5.2 HookPolicy（策略配置层）

**文件：** `packages/core/src/governance/hook-policy.ts`

**配置项：**
- `maxActiveHooks: 10` — 最大活跃伏笔数
- `overdueThreshold: 5` — 逾期阈值（章节数）
- `expectedResolutionWindow: { min: 3, max: 15 }` — 预期回收窗口
- `wakePolicy: { maxWakePerChapter: 3, wakeBatchSize: 2, wakeInterval: 1, autoWakeEnabled: true }`

### 5.3 HookAgenda（排班调度层）

**文件：** `packages/core/src/governance/hook-agenda.ts`

**核心方法：**
- `scheduleHook(hook)` — 为伏笔创建排班条目
- `checkOverdue(currentChapter)` — 检查逾期伏笔
- `onChapterReached(currentChapter)` — 章节到达时唤醒休眠伏笔（含惊群平滑 WakeSmoothing）
- `wakeDeferredHook(hookId, currentChapter)` — 唤醒延期伏笔

**伏笔状态参与排班：** `open`, `progressing`, `deferred`（dormant/resolved/abandoned 不参与）

### 5.4 HookGovernance（治理控制层）

**文件：** `packages/core/src/governance/hook-governance.ts`

**核心方法：**
- `evaluateAdmission(newHook, existingHooks)` — 准入控制（活跃数上限 + 重复检测）
- `validatePayoff(hook, chapterContent)` — 回收验证
- `checkHealth(hooks, currentChapter)` — 健康度检查（0-100 分）
- `markDormant(hookId, hooks)` — 人工休眠声明

### 5.5 HookAdmission（准入控制模块）

**文件：** `packages/core/src/governance/hook-admission.ts`

**三重冲突检测：**
1. **时间 proximity** — 埋设章节差距 < `timeProximityThreshold: 5`
2. **角色重叠** — 共享角色比例 > `characterOverlapThreshold: 0.5`
3. **主题相似度** — type + description 相似度 > `themeSimilarityThreshold: 0.6`

### 5.6 HookLifecycle（生命周期状态机）

**文件：** `packages/core/src/governance/hook-lifecycle.ts`

**合法状态转换：**
```
open → progressing → deferred → dormant → resolved/abandoned
open → deferred
open → dormant
progressing → dormant
dormant → open（唤醒）
dormant → deferred
resolved/abandoned — 终态，不可转换
```

**事件通知：** onPlanted, onAdvanced, onDeferred, onDormant, onWake, onResolved, onAbandoned

---

## 6. State Persistence & Versioning（状态持久化与版本管理）

### 6.1 核心状态文件

| 文件 | 位置 | 内容 |
|------|------|------|
| manifest.json | `story/state/` | 运行时状态（Manifest），核心数据载体 |
| index.json | `story/state/` | 章节索引（ChapterIndex） |
| book.json | 书籍根目录 | 书籍元数据（Book） |
| meta.json | 书籍根目录 | 扩展元数据（synopsis, tone, platform） |
| chapter-XXXX.md | `story/chapters/` | 章节内容（YAML frontmatter + 正文） |

### 6.2 Manifest 数据模型

**文件：** `packages/core/src/models/state.ts`

```typescript
Manifest {
  bookId: string;
  versionToken: number;          // 乐观锁版本号，每次更新+1
  lastChapterWritten: number;    // 最后完成章节号
  currentFocus?: string;         // 当前叙事焦点
  hooks: Hook[];                 // 伏笔列表
  facts: Fact[];                 // 记忆事实列表
  characters: Character[];       // 角色列表
  worldRules: WorldRule[];       // 世界规则列表
  chapterPlans: Record<string, ChapterPlanStore>;  // 章节计划（key=章节号字符串）
  outline: OutlineAct[];         // 大纲（分幕/分卷）
  updatedAt: string;
}
```

### 6.3 State Reducer（不可变状态更新）

**文件：** `packages/core/src/state/reducer.ts`

**Delta 操作类型：**
- `add_hook`, `update_hook`, `resolve_hook`
- `add_fact`, `update_fact`
- `add_character`, `update_character`
- `add_world_rule`, `update_world_rule`
- `set_focus`, `advance_chapter`

**更新机制：** `applyRuntimeStateDelta(state, delta)` → 返回新 Manifest（不可变更新 + versionToken 自增）

### 6.4 PipelinePersistence（原子持久化）

**文件：** `packages/core/src/pipeline/persistence.ts`

**事务流程：**
```
1. 写入临时文件 (.tmp)
2. 创建当前状态快照
3. fs.rename 原子替换到目标路径
4. 更新 index.json
5. 更新 manifest（lastChapterWritten）
```

### 6.5 MemoryDB（SQLite 内存数据库）

**文件：** `packages/core/src/state/memory-db.ts`

**表结构：**
- `facts` — 事实记录（chapter, entity_type, entity_name, fact_text, valid_from, valid_until, confidence）
- `chapter_summaries` — 章节摘要（chapter, summary, key_events, state_changes）
- `hooks` — 伏笔记录（planted_ch, description, status, priority, expected_resolution_min/max）
- `memory_snapshots` — 快照（chapter, snapshot JSON）

**事务支持：** `transaction(fn)` — 自动回滚

### 6.6 ProjectionRenderer（Markdown 投影）

**文件：** `packages/core/src/state/projections.ts`

将 Manifest 渲染为 6 个 Markdown 文件：
1. `current_state.md` — 当前状态总览
2. `hooks.md` — 伏笔追踪
3. `chapter_summaries.md` — 章节摘要
4. `subplot_board.md` — 支线看板
5. `emotional_arcs.md` — 情感弧线
6. `character_matrix.md` — 角色矩阵

**手动编辑检测：** `detectManualEdit()` — 比对 `.state-hash` 与当前 Manifest 的 SHA-256

### 6.7 StateManager（路径管理与锁）

**文件：** `packages/core/src/state/manager.ts`

- **锁机制：** `acquireBookLock()` — 使用 `fs.openSync("wx")` 原子创建 `.lock` 文件
- **陈旧锁清理：** 检测 PID 是否存活，不存活则清理
- **路径穿越防护：** bookId 不允许包含 `/`、`\`、`..`

### 6.8 RuntimeStateStore

**文件：** `packages/core/src/state/runtime-store.ts`

- `loadManifest(bookId)` → 从磁盘加载 manifest.json
- `loadFullState(bookId)` → 加载为 FullState 接口
- `saveRuntimeStateSnapshot(bookId, state)` → 合并保存（versionToken 自增）

---

## 7. Export & Publishing（导出与出版）

### 7.1 导出格式

| 格式 | 文件 | 类 | 输入 |
|------|------|-----|------|
| EPUB | `packages/core/src/export/epub.ts` | `EpubExporter` | `EpubInput { title, author, language, chapters[] }` |
| Markdown | `packages/core/src/export/markdown.ts` | `MarkdownExporter` | `MarkdownInput { title, author, language, chapters[] }` |
| TXT | `packages/core/src/export/txt.ts` | `TxtExporter` | `TxtInput { title, author, chapters[] }` |
| 平台适配 | `packages/core/src/export/platform-adapter.ts` | — | `PlatformInput + PlatformConfig` |

### 7.2 平台适配

**文件：** `packages/core/src/export/platform-adapter.ts`

支持 3 种平台格式：
- **qidian（起点中文网）** — 单文件，起点标准格式，VIP 章节标记，字数统计
- **fanqiao（番茄小说）** — 每章独立文件 + metadata.json
- **text** — 纯文本

**接口：** `PlatformOutput { files: PlatformFile[] }` — 可输出多个文件

---

## 8. Pipeline Orchestration（流水线编排）

### 8.1 PipelineRunner（核心编排器）

**文件：** `packages/core/src/pipeline/runner.ts`（2251 行）

**核心方法：**

| 方法 | 用途 | 关键流程 |
|------|------|----------|
| `initBook()` | 初始化新书 | 创建目录 + 空状态 |
| `planChapter()` | 规划章节 | ChapterPlanner Agent（支持批量） |
| `composeChapter()` | 完整创作 | ContextCard → 计划/Intent → Executor → Polisher → Audit → Memory → Persist |
| `writeDraft()` | 草稿模式 | LLM 生成 → 持久化（无审计） |
| `writeFastDraft()` | 快速试写 | LLM 生成 → Polisher（不持久化） |
| `writeNextChapter()` | 写下一章 | composeChapter 别名 |
| `upgradeDraft()` | 草稿转正 | 漂移检测 → ContextCard → Polisher → 持久化 |
| `auditDraft()` | 独立审计 | 33维审计 + 9类AI检测 |
| `reviseDraft()` | 独立修订 | RevisionLoop |
| `mergeChapters()` | 合并章节 | 委托 ChapterRestructurer |
| `splitChapter()` | 拆分章节 | 委托 ChapterRestructurer |

### 8.2 PipelineScheduler（阶段调度器）

**文件：** `packages/core/src/pipeline/scheduler.ts`

- **阶段注册：** `registerStage(stage)`
- **依赖解析：** 拓扑排序
- **动态控制：** `disableStage(id)` / `enableStage(id)`
- **前置条件：** `precondition?(ctx)` 返回 true 时跳过

**PipelineStage 接口：** `{ id, name, dependencies[], execute(ctx), precondition?(ctx) }`

### 8.3 AtomicPipelineOps（原子操作集）

**文件：** `packages/core/src/pipeline/atomic-ops.ts`

提供 draft/audit/revise/persist 四种原子操作，每种操作包含完整的验证、执行、结果返回。

### 8.4 ChapterRestructurer

**文件：** `packages/core/src/pipeline/restructurer.ts`

- **mergeChapters** — 合并相邻章节（LLM 融合内容 + 重编号 + 更新索引）
- **splitChapter** — 拆分章节（LLM 分割 + 重编号 + 更新索引）

### 8.5 TruthValidation

**文件：** `packages/core/src/pipeline/truth-validation.ts`

真相文件验证：比对 truth 文件与 manifest 的一致性。

### 8.6 DetectionRunner

**文件：** `packages/core/src/pipeline/detection-runner.ts`

检测运行器：统一调用各类检测 Agent。

---

## 9. Studio API Layer（Studio API 层）

### 9.1 Core Bridge（核心桥接）

**文件：** `packages/studio/src/api/core-bridge.ts`

**职责：** 在 Studio 进程中管理 PipelineRunner 和 LLMProvider 的单例

**关键函数：**
- `getStudioPipelineRunner(bookId?)` — 获取/创建 PipelineRunner 实例
- `getStudioLLMProvider()` — 获取/创建 LLMProvider 实例（支持 RoutedProvider 多模型路由）
- `readStudioBookRuntime(bookId)` — 读取 StudioRuntimeBookRecord
- `updateStudioBookRuntime(book)` — 更新书籍运行时记录
- `hasStudioBookRuntime(bookId)` — 检查书籍是否存在
- `getStudioRuntimeRootDir()` — 获取运行时根目录

**StudioRuntimeBookRecord：** 扩展 Book 模型，增加 `expandedBrief`, `planningBrief`, `modelConfig`, `platform`, `targetWordsPerChapter`

### 9.2 Pipeline Routes（流水线路由）

**文件：** `packages/studio/src/api/routes/pipeline.ts`

| 路由 | 方法 | 功能 | 响应模式 |
|------|------|------|----------|
| `/write-next` | POST | 写下一章（完整流水线） | 异步（202 + SSE 通知） |
| `/fast-draft` | POST | 快速试写 | 同步 |
| `/upgrade-draft` | POST | 草稿转正 | 异步（202 + SSE 通知） |
| `/write-draft` | POST | 草稿模式 | 同步 |
| `/plan-chapter` | POST | 章节规划 | 同步 |
| `/bootstrap-story` | POST | 故事启动 | 同步 |
| `/:pipelineId` | GET | 查询流水线状态 | 同步 |

**流水线状态跟踪：** `pipelineStore` Map 存储流水线进度，通过 SSE 实时推送

**流水线阶段：** `planning → composing → writing → auditing → revising → persisting`

---

## 10. 数据流总结图

### 10.1 创建新书 → 首章写作完整路径

```
用户输入(title, genre, brief)
  ↓
BookCreate 页面 → POST /api/books
  ↓
StudioRuntimeBookRecord 写入 .runtime/
  ↓
POST /api/books/:id/pipeline/bootstrap-story
  ↓
expandInspiration() → ExpandedInspiration
  ↓
OutlinePlanner → OutlineResult
  ↓
World Bootstrap → { currentFocus, centralConflict, growthArc, worldRules, hooks }
  ↓
CharacterDesigner → CharacterDesignResult
  ↓
ChapterPlanner → ChapterPlanResult
  ↓
写入 manifest.json + book.json + index.json
  ↓
POST /api/books/:id/pipeline/write-next
  ↓
ContextCard → ContextCardOutput (从 manifest 构建上下文)
  ↓
ChapterPlan 获取 (manifest.chapterPlans 或 IntentDirector)
  ↓
ChapterExecutor → 生成草稿 content
  ↓
ScenePolisher → polishedContent
  ↓
#auditAndRevise() → 审计修订循环 → 最终 content
  ↓
#extractMemory() → 更新 manifest (新 facts/hooks)
  ↓
#persistChapter() → chapter-XXXX.md (YAML frontmatter + 正文)
  ↓
#updateStateAfterChapter() → 更新 index.json + manifest
  ↓
SSE 通知 chapter_complete
```

### 10.2 关键数据流转

```
Manifest ←→ RuntimeStateStore ←→ manifest.json
  ↓ 读取
ContextCard ← 构建 formattedText
  ↓ 传入
ChapterExecutor ← ChapterPlan
  ↓ 生成
polishedContent → auditAndRevise → finalContent
  ↓ 提取
MemoryDelta → applyRuntimeStateDelta → Manifest (更新)
  ↓ 持久化
chapter-XXXX.md + index.json + manifest.json
```

### 10.3 错误处理模式

| 层级 | 策略 |
|------|------|
| Agent 层 | try/catch → `{ success: false, error: message }` |
| Pipeline 层 | 污染检测（分数下降回滚）+ 降级处理（accept_with_warnings / pause） |
| 持久化层 | 临时文件 + rename 原子操作 |
| State 层 | 不可变更新 + versionToken 乐观锁 |
| 锁层 | wx 原子创建 + PID 检测陈旧锁 |
| 审计修订 | maxRevisionRetries + fallbackAction |
| 记忆提取 | 失败不影响主流程（返回 null） |
| Bootstrap | 降级到默认值（fillDefaults + genreDefaultFallbacks） |

---

*数据流分析：2026-04-23*
