# CyberNovelist v7.0 可执行开发计划

> 版本: 2.0 | 日期: 2026-04-18 | 状态: 正式发布
> 
> 共 **124 个原子任务**，分为 11 个阶段，总计约 **525h**（单人 66 工作日 / 3 个月）
> 
> 关键路径：#6 → #14 → #10 → #11 → #9 → #24 → #25 → #27 → #28

---

## 任务汇总统计

| 阶段 | 任务数 | 预估工时 |
|------|--------|-----------|
| 阶段 1：基础设施 | 8 | 22h |
| 阶段 2：状态层 | 12 | 52h |
| 阶段 3：核心 Agent | 22 | 90h |
| 阶段 4：流水线编排 | 13 | 53h |
| 阶段 5：治理层 | 10 | 36h |
| 阶段 6：质量层 | 12 | 50h |
| 阶段 6 补：守护进程调度 | 4 | 16h |
| 阶段 7：Studio 工作台 | 27 | 122h |
| 阶段 8：导出与通知 | 5 | 20h |
| 阶段 9：异常交互 | 4 | 18h |
| 阶段 10：测试与优化 | 8 | 49h |
| **总计** | **124** | **525h** |

---

## 阶段 1：基础设施（2-3 天，无依赖）

> **里程碑 M1**：`pnpm install` → `pnpm build` → `pnpm test` 全绿，core 包可独立使用

### 1.1 初始化 Monorepo 结构 [P0, 2h]
- 使用 pnpm 创建 monorepo，建立 `packages/core` 和 `packages/studio` 两个子包
- 配置 `pnpm-workspace.yaml`
- 验收：`pnpm install` 成功，两个包 `package.json` 的 name 和 private 字段正确

### 1.2 配置 TypeScript 项目引用 [P0, 2h, 依赖 1.1]
- 为 core 和 studio 配置独立 `tsconfig.json`，设置项目引用使 studio 可导入 core 类型
- 验收：根目录 `pnpm build` 成功（先 core 后 studio），IDE 跨包类型提示正常

### 1.3 配置 Vitest 单元测试框架 [P0, 2h, 依赖 1.2]
- 在 core 包中配置 Vitest，编写示例测试
- 验收：core 包中 `pnpm test` 可运行并通过

### 1.4 配置 Playwright E2E 测试框架 [P1, 3h, 依赖 1.2]
- 在根目录配置 Playwright，编写启动 Studio 的测试
- 验收：`pnpm test:e2e` 可运行，能访问 `http://localhost:3000`

### 1.5 实现 LLM Provider 抽象层 [P0, 4h, 依赖 1.2]
- 实现 `core/src/llm/provider.ts`，定义抽象接口 + OpenAI 兼容具体 Provider
- 验收：可实例化并调用 `generate(prompt)` 返回字符串，支持 apiKey/baseURL/model 配置

### 1.5a 实现模型路由 + 声誉系统 [P1, 4h, 依赖 1.5]
- 实现 `core/src/llm/routed-provider.ts`，按 Agent 粒度配置不同 LLM 提供商，支持故障自动切换
- 验收：配置多个 Provider 后，主 Provider 故障时自动切换至备用，失败计数影响声誉评分

### 1.6 实现基础 Zod Schemas [P0, 3h, 依赖 1.2]
- 实现 `core/src/models/book.ts`, `chapter.ts`, `state.ts`
- 验收：schema 可校验示例 JSON，`z.infer` 类型正确导出

### 1.7 配置 ESLint + Prettier + Husky [P0, 2h, 依赖 1.2]
- 根目录配置 ESLint + Prettier，添加 husky + lint-staged
- 验收：`pnpm lint` 和 `pnpm format` 可执行，提交时自动格式化

---

## 阶段 2：状态层（3-4 天，依赖阶段 1）

> **里程碑 M1 达成标志**：可初始化一本书，状态可读写

### 2.1 实现 StateManager [P0, 4h, 依赖 1.5, 1.6]
- 实现 `core/src/state/manager.ts`，提供 `acquireBookLock`、`getBookPath`、`readIndex`、`writeIndex`
- 验收：使用 `open("wx")` 实现排他锁，路径计算正确，可读写 `index.json`

### 2.2 实现 RuntimeStateStore [P0, 6h, 依赖 2.1]
- 实现 `core/src/state/runtime-store.ts`，从 `story/state/*.json` 加载状态，构建运行时状态对象
- 验收：可正确加载 JSON，`saveRuntimeStateSnapshot` 写入新状态文件

### 2.3 实现 StateReducer [P0, 5h, 依赖 2.2]
- 实现 `core/src/state/reducer.ts`，提供 `applyRuntimeStateDelta` 不可变更新 + HookOps
- 验收：传入 delta 返回新状态对象（原状态不变），支持伏笔 upsert/mention/resolve/defer/dormant

### 2.4 实现 Zod 校验体系 [P0, 3h, 依赖 1.6, 2.3]
- 实现 `core/src/state/validator.ts`，基于 Zod 的运行时状态校验
- 验收：非法状态抛出明确错误，校验通过后返回合法对象

### 2.5 实现 SQLite 时序记忆库 [P0, 6h, 依赖 1.6]
- 实现 `core/src/state/memory-db.ts`，创建 facts/chapter_summaries/hooks/memory_snapshots 表
- 验收：可初始化数据库、插入事实并查询，支持 WAL 模式

### 2.6 实现 SnapshotManager [P0, 5h, 依赖 2.2, 2.5]
- 实现 `core/src/state/snapshot.ts`，提供 `createSnapshot` 和 `rollbackToSnapshot`
- 验收：可创建包含完整状态的快照，回滚后恢复 JSON 和 SQLite 数据

### 2.7 实现真相文件 Markdown 投影 [P0, 4h, 依赖 2.2]
- 实现 `core/src/state/projections.ts`，将 JSON 渲染为 Markdown（current_state.md, hooks.md 等）
- 验收：生成格式正确，状态更新后自动重新投影

### 2.8 实现状态引导 [P0, 3h, 依赖 2.1, 2.2]
- 实现 `core/src/state/bootstrap.ts`，新书创建时生成初始真相文件结构和 `manifest.json`
- 验收：新书目录结构正确创建，包含初始 JSON 文件

### 2.9 实现会话恢复 [P0, 5h, 依赖 2.1, 2.5, 2.6]
- 实现 `core/src/state/recovery.ts`，单章写入原子事务 + 启动时未提交事务自动回滚
- 验收：模拟崩溃后重启，章节文件被清理，index.json 回滚，WAL 保证 SQLite 一致性

### 2.10 实现僵尸锁清理 [P1, 3h, 依赖 2.1]
- 实现 `core/src/state/lock-manager.ts` + DoctorView 清理逻辑
- 验收：DoctorView 可显示僵尸锁并一键清理

### 2.11 实现状态投影双向校验 [P1, 4h, 依赖 2.7]
- 实现 `core/src/state/sync-validator.ts`，加载时对比 JSON 哈希和 Markdown 修改时间
- 验收：手动修改 Markdown 后弹出警告，提供导入变更入口

### 2.12 实现状态导入 UI [P1, 5h, 依赖 2.11, 3.7]
- TruthFiles 编辑器中「导入 Markdown」按钮，轻量 LLM 解析为 JSON Delta
- 验收：可正确解析手动编辑的 Markdown 并回填 JSON

---

## 阶段 3：核心 Agent 层（5-7 天，依赖阶段 2）

> BaseAgent 统一接口：所有 Agent 继承 `BaseAgent`，独立文件，继承 `generate`/`generateJSON` 方法

### 3A — 基础 + 规划类 Agent（2 天）

#### 3.1 实现 BaseAgent 抽象类 [P0, 2h, 依赖 1.5]
- 实现 `core/src/agents/base.ts`，定义 `name`、`temperature`、`execute` 抽象方法
- 验收：可继承并正确调用 LLM Provider

#### 3.2 实现 OutlinePlanner [P0, 4h, 依赖 3.1]
- 实现 `core/src/agents/planner.ts`，生成三幕结构大纲
- 验收：输入创作简报，输出结构化大纲 JSON

#### 3.3 实现 CharacterDesigner [P0, 4h, 依赖 3.1]
- 实现 `core/src/agents/character.ts`，生成角色属性、关系网络
- 验收：输出包含姓名、性格、背景、能力的角色列表

#### 3.4 实现 ChapterPlanner [P0, 5h, 依赖 3.1, 2.5]
- 实现 `core/src/agents/chapter-planner.ts`，生成本章目标/出场人物/关键事件/伏笔埋设计划
- 验收：输出包含章节意图、出场人物列表、伏笔列表

### 3B — 执行类 Agent（3 天）

#### 3.5 实现 ChapterExecutor [P0, 3h, 依赖 3.1]
- 实现 `core/src/agents/executor.ts`，章节执行骨架，协调其他 Agent
- 验收：可串联 ContextCard、ScenePolisher 等

#### 3.6 实现 ContextCard [P0, 5h, 依赖 2.5, 3.1]
- 实现 `core/src/agents/context-card.ts`，从 SQLite 和真相文件构建上下文卡片
- 验收：输出 `context.json`，包含记忆检索结果

#### 3.7 实现 ScenePolisher [P0, 6h, 依赖 3.1, 3.6]
- 实现 `core/src/agents/scene-polisher.ts`，核心写作 Agent
- 验收：可生成符合字数要求、风格一致的正文

#### 3.8 实现 StyleRefiner [P1, 4h, 依赖 3.7]
- 实现 `core/src/agents/refiner.ts`，对正文进行风格精修
- 验收：可调整语体、润色表达

#### 3.9 实现 IntentDirector [P0, 4h, 依赖 3.1, 2.5]
- 实现 `core/src/agents/intent-director.ts`，结合长期意图和当前焦点生成创作指令
- 验收：输出 `chapter-XXXX.intent.md`

#### 3.10 实现 MemoryExtractor [P1, 4h, 依赖 2.5, 3.1]
- 实现 `core/src/agents/memory-manager.ts`（类名 MemoryExtractor），从 SQLite 抓取事实碎片和世界规则
- 验收：返回事实碎片列表，区分置信度

### 3C — 审计类 Agent（2 天）

#### 3.11 实现 QualityReviewer [P0, 5h, 依赖 3.1, 各审计子Agent]
- 实现 `core/src/agents/quality-reviewer.ts`，执行 33 维连续性审计的协调逻辑
- 验收：可调用各个审计子 Agent 并汇总报告

#### 3.12 实现 FactChecker [P0, 4h, 依赖 3.1, 2.5]
- 实现 `core/src/agents/fact-checker.ts`，核对事实一致性
- 验收：可检测角色位置、资源等矛盾

#### 3.13 实现 EntityAuditor [P0, 3h, 依赖 3.1]
- 实现 `core/src/agents/entity-auditor.ts`，审计实体存在性和状态
- 验收：检测已死亡角色出场等问题

#### 3.14 实现 StyleAuditor [P1, 3h, 依赖 3.1]
- 实现 `core/src/agents/style-auditor.ts`，检查语体一致性
- 验收：检测语体漂移

#### 3.15 实现 TitleVoiceAuditor [P1, 2h, 依赖 3.1]
- 实现 `core/src/agents/title-voice-auditor.ts`，检查称谓一致性
- 验收：检测同一角色称谓前后不一致

#### 3.16 实现 ComplianceReviewer [P2, 3h, 依赖 3.1]
- 实现 `core/src/agents/compliance-reviewer.ts`，合规审核
- 验收：可检测违规内容

#### 3.17 实现 HookAuditor [P0, 4h, 依赖 2.5, 3.1]
- 实现 `core/src/agents/hook-auditor.ts`，审计伏笔状态和逾期
- 验收：输出伏笔推进建议

#### 3.18 实现 FatigueAnalyzer [P2, 4h, 依赖 3.1]
- 实现 `core/src/agents/fatigue-analyzer.ts`，检测叙事疲劳和套路化
- 验收：可识别重复的描写模式

#### 3.19 实现 AuditTierClassifier [P0, 5h, 依赖 3.11-3.18]
- 实现 `core/src/quality/audit-tier-classifier.ts`，33 维三级分类 + 单维重试 + 降级
- 验收：阻断级失败可降级为警告级并标记，单维 LLM 失败自动重试 1 次

#### 3.20 实现 MarketInjector [P2, 4h, 依赖 3.1]
- 实现 `core/src/agents/market-injector.ts`，分析目标平台（起点/番茄）热门作品特征并注入创作约束
- 验收：可根据平台特征调整章节节奏、爽点密度、金手指设定

#### 3.21 实现 StyleFingerprint [P2, 4h, 依赖 3.1]
- 实现 `core/src/agents/style-fingerprint.ts`，分析参考作品提取风格指纹（句式偏好/用词习惯/修辞倾向）
- 验收：输入参考文本可输出结构化风格指纹 JSON，供 ScenePolisher 使用

#### 3.22 实现 EntityRegistry [P2, 3h, 依赖 3.1, 2.5]
- 实现 `core/src/agents/entity-registry.ts`，统一管理角色/地点/道具注册表，自动检测新实体并注册到 SQLite
- 验收：正文生成时新实体自动注册，重复实体被拦截

---

## 阶段 4：流水线编排（3-4 天，依赖阶段 3）

> **里程碑 M2 达成标志**：可完成单章完整创作（草稿+审计+修订+持久化）

### 4.1 实现 PipelineRunner 主类 [P0, 6h, 依赖 2.1, 3.x]
- 实现 `core/src/pipeline/runner.ts`，提供 `initBook`/`planChapter`/`composeChapter`/`writeDraft`/`writeNextChapter`
- 验收：按顺序调用各阶段，正确处理锁和错误

### 4.2 实现草稿模式 writeDraft [P0, 3h, 依赖 4.1, 3.7]
- 生成草稿并持久化，标记 draft 状态，跳过审计修订
- 验收：文件在 chapters 目录下，状态为 draft，生成并持久化 <30s（NFR-001a）

### 4.3 实现快速试写 writeFastDraft [P0, 2h, 依赖 4.1, 3.7]
- 仅调用 ScenePolisher，不持久化，返回临时草稿
- 验收：首段产出 <15s，不写入文件系统

### 4.4 实现草稿转正 upgradeDraft [P0, 5h, 依赖 4.1, 2.11, 3.7]
- 上下文漂移防护检查、重新生成上下文卡片、ScenePolisher.regenerate
- 验收：检测到 versionToken 变化时弹窗提示，重新润色后正确落盘

### 4.5 实现 AtomicPipelineOps [P0, 4h, 依赖 4.1, 3.x]
- 实现 `core/src/pipeline/atomic-ops.ts`，提供 `draft_chapter`/`audit_chapter`/`revise_chapter`/`persist_chapter`
- 验收：每个操作可单独调用并记录状态

### 4.6 实现 DetectionRunner [P0, 3h, 依赖 3.14, 3.16, 6.1]
- 实现 `core/src/pipeline/detection-runner.ts`，串联 AI 检测、语体审计、合规审核
- 验收：可并行或串行执行多个检测器

### 4.7 实现 ChapterReviewCycle [P0, 4h, 依赖 3.11, 6.2]
- 实现 `core/src/pipeline/review-cycle.ts`，综合审计结果决策 rewrite/accept/skip
- 验收：可正确触发修订循环

### 4.8 实现上下文治理与规则栈编译 [P0, 4h, 依赖 3.6]
- `composeChapter` 中的上下文治理逻辑，按相关性选择上下文，编译规则栈
- 验收：生成的 `context.json` 和 `rule-stack.yaml` 符合预期

### 4.9 实现 TruthValidation [P0, 3h, 依赖 2.4]
- 实现 `core/src/pipeline/truth-validation.ts`，持久化前校验规则层真相
- 验收：检测到矛盾时拒绝落盘

### 4.10 实现 ChapterRestructurer [P1, 8h, 依赖 2.1, 2.5, 2.6]
- 实现 `core/src/pipeline/restructurer.ts`，`mergeChapters` + `splitChapter`，三阶段提交
- 验收：合并后索引/伏笔/快照链一致，拆分后事实时间线正确

### 4.11 实现重组安全机制 [P0, 5h, 依赖 4.10]
- 实现 `core/src/state/reorg-lock.ts` 和 `staging-manager.ts`，专用锁 + `.reorg_in_progress` 哨兵
- 验收：重组中断后 DoctorView 可识别并指导恢复，reorg.lock 阻止守护进程介入

### 4.12 实现 Pipeline Persistence 模块 [P1, 3h, 依赖 4.5]
- 实现 `core/src/pipeline/persistence.ts`，负责章节落盘 + 索引更新 + 快照创建 + 状态提交的原子操作
- 验收：落盘操作作为单一事务执行，中途崩溃可自动回滚

### 4.13 实现 Pipeline Scheduler 模块 [P1, 3h, 依赖 4.1, 4.5]
- 实现 `core/src/pipeline/scheduler.ts`，负责流水线内部的阶段调度和依赖解析
- 验收：可根据配置动态启用/跳过某些阶段（如草稿模式跳过审计）

---

## 阶段 5：治理层（4-5 天，依赖阶段 4）

> **里程碑 M3 达成标志**：伏笔治理完整可用

### 5.1 实现 HookPolicy [P0, 2h]
- 实现 `core/src/governance/hook-policy.ts`，最大活跃数、逾期阈值、唤醒策略配置
- 验收：配置可读可写，影响后续行为

### 5.2 实现 HookAgenda [P0, 5h, 依赖 2.5, 5.1]
- 实现 `core/src/governance/hook-agenda.ts`，排班、逾期检查（跳过 dormant）、窗口期校验
- 验收：可正确计算伏笔排班计划

### 5.3 实现 HookGovernance [P0, 4h, 依赖 5.2]
- 实现 `core/src/governance/hook-governance.ts`，准入控制、回收验证、健康度检查、休眠标记
- 验收：重复伏笔被拦截，休眠伏笔正确标记

### 5.3a 实现 HookAdmission [P2, 3h, 依赖 5.2]
- 实现 `core/src/governance/hook-admission.ts`，伏笔准入控制：基于时间/角色/主题相似度评估新伏笔是否与现有伏笔家族冲突
- 验收：重复或高度相似的伏笔被自动拦截，并提示关联的已有伏笔

### 5.4 实现 HookArbiter [P1, 4h, 依赖 5.2]
- 实现 `core/src/governance/hook-arbiter.ts`，检测伏笔冲突（时间/角色/主题），按优先级解决
- 验收：冲突伏笔正确延后低优先级

### 5.5 实现 HookLifecycle [P0, 4h, 依赖 2.5]
- 实现 `core/src/governance/hook-lifecycle.ts`，状态机 open → progressing → deferred → dormant → resolved/abandoned
- 验收：状态转换正确触发相应事件

### 5.6 集成 Planner 与 HookAgenda [P0, 3h, 依赖 3.4, 5.2]
- 修改 ChapterPlanner，使其输出包含 hookAgenda
- 验收：生成的章节意图中包含伏笔埋设计划

### 5.7 实现人工意图声明 [P0, 3h, 依赖 5.3]
- 实现 HookPanel 后端接口，提供 `expected_resolution_window` 设置和休眠标记 API
- 验收：伏笔可设置预期回收窗口并标记为 dormant，数据持久化到 SQLite

### 5.8 实现逾期检测优化 [P0, 2h, 依赖 5.2]
- 修改 `checkOverdue`，窗口期内不报逾期，dormant 不参与检测
- 验收：长线伏笔在窗口期内不产生警告

### 5.9 实现伏笔自动唤醒与惊群平滑 [P0, 6h, 依赖 5.5, 5.2]
- 实现 `core/src/governance/wake-smoothing.ts`，`onChapterReached` 触发 dormant → open
- 验收：章节到达 minChapter 时自动唤醒，超 maxWakePerChapter 时剩余伏笔 deferred

---

## 阶段 6：质量层（3-4 天，依赖阶段 3）

> **里程碑 M4 达成标志**：全部质量检测可用

### 6.1 实现 AIGCDetector [P0, 6h, 依赖 3.1]
- 实现 `core/src/quality/ai-detector.ts`，检测 9 类 AI 痕迹
- 验收：返回每类痕迹评分和具体位置，准确识别 9 类特征

### 6.2 实现 RepairDecider [P0, 4h, 依赖 3.11, 6.1]
- 实现 `core/src/quality/repair-strategy.ts`，根据审计结果选择 4 种修复策略
- 验收：正确选择局部替换/段落重排/节拍重写/整章重写

### 6.3 实现 SurgicalRewriter [P0, 5h, 依赖 3.1]
- 实现 `core/src/agents/surgical-rewriter.ts`，执行局部重写和段落重排
- 验收：可仅修改指定部分而不影响其他内容

### 6.4 实现 PostWriteValidator [P1, 3h, 依赖 2.5]
- 实现 `core/src/quality/post-write-validator.ts`，写后验证角色位置/资源/关系
- 验收：检测到非法变更时报告错误

### 6.5 实现 POFilter [P1, 3h, 依赖 3.1]
- 实现 `core/src/quality/pov-filter.ts`，确保叙事视角一致性
- 验收：检测 POV 跳变

### 6.6 实现 CadenceAnalyzer [P1, 3h]
- 实现 `core/src/quality/cadence.ts`，分析节奏（段落长度变化、句子长度分布）
- 验收：输出节奏评分和建议

### 6.7 实现 LengthNormalizer [P0, 4h, 依赖 3.1]
- 实现 `core/src/quality/length-normalizer.ts`，字数归一化 + 安全网
- 验收：字数超出软区间时自动压缩，压缩后质量不显著下降

### 6.8 实现跨章重复检测 [P1, 4h]
- 实现中文 6 字 ngram 重复检测算法（纯算法，非 LLM）
- 验收：可检测出与前几章重复的短语

### 6.8a 实现 DialogueChecker [P2, 3h, 依赖 3.1]
- 实现 `core/src/agents/dialogue-checker.ts`，检查多角色场景的对话阻力与交锋质量
- 验收：检测无阻力对话、纯陈述式交锋，并给出修改建议

### 6.9 实现 RevisionLoop [P0, 6h, 依赖 4.7, 6.2, 6.3]
- 实现 `core/src/pipeline/revision-loop.ts`，maxRevisionRetries + fallbackAction + 污染隔离
- 验收：达到最大重试后正确触发 accept_with_warnings 或 pause，污染隔离生效

### 6.10 实现 QualityBaseline [P1, 5h, 依赖 6.1, 6.6]
- 实现 `core/src/quality/baseline.ts`，第 3 章后自动建基线，滑动窗口漂移检测
- 验收：可计算漂移率并触发告警，连续 3 章恶化超 30% 时 Analytics 显示告警

### 6.11 实现 PromptVersioning [P1, 3h]
- 实现 `core/src/prompts/` 目录结构（v1/v2/latest），registry.json，book.json 中 promptVersion 字段
- 验收：可按版本加载提示词，latest 软链接生效

---

## 阶段 6 补：守护进程调度层（2-3 天，依赖阶段 4）

> **里程碑 M5 达成标志**：智能守护进程可用

### 6S.1 实现 SmartInterval [P0, 4h, 依赖 1.5]
- 实现 `core/src/scheduler/smart-interval.ts`，本地模式 interval=0，云端模式根据 RPM 动态调整
- 验收：可正确解析响应头并调整间隔

### 6S.2 实现 RPM 监控器 [P0, 3h, 依赖 6S.1]
- 集成 RPM 监控，解析 429 和限流头 X-RateLimit-Reset
- 验收：限流后 2s 内间隔自动延长，退避上限 300s

### 6S.3 实现 QuotaGuard [P1, 4h]
- 实现 `core/src/scheduler/quota-guard.ts`，跟踪每日 Token 消耗
- 验收：配额耗尽后 1s 内守护进程停止，推送通知

### 6S.4 实现 DaemonScheduler [P0, 5h, 依赖 4.1, 6S.1, 6S.3]
- 实现 `core/src/daemon.ts`，整合 SmartInterval + QuotaGuard
- 验收：可启动/暂停/恢复/停止，每章完成后触发后续任务

---

## 阶段 7：Studio 工作台（5-7 天，依赖阶段 4/5/6）

> **里程碑 M6 达成标志**：Studio 完整可用，端到端创作流程跑通

### 7A — 后端 API（2 天）

#### 7A.1 搭建 Hono 服务器框架 [P0, 2h, 依赖 1.2]
- 在 `packages/studio` 中配置 Hono，设置基础路由、CORS、日志中间件
- 验收：`pnpm dev` 可启动 API 服务在 3000 端口

#### 7A.2 实现 SSE 推送基础设施 [P0, 3h, 依赖 7A.1]
- 实现 `studio/src/api/sse.ts`，支持向特定书籍推送事件
- 验收：可建立 SSE 连接并接收测试事件，支持 pipeline_progress/memory_extracted/chapter_complete/daemon_event/hook_wake/thundering_herd/quality_drift/context_changed

#### 7A.3 实现书籍管理路由 [P0, 4h, 依赖 7A.1, 2.1]
- 实现 `studio/src/api/routes/books.ts`
- 验收：所有端点返回符合 API 文档的数据

#### 7A.4 实现章节管理路由 [P0, 5h, 依赖 7A.1, 2.1]
- 实现 `studio/src/api/routes/chapters.ts`
- 验收：可增删改查章节

#### 7A.5 实现创作流水线路由 [P0, 6h, 依赖 7A.1, 4.1]
- 实现 `studio/src/api/routes/pipeline.ts`，集成 PipelineRunner
- 验收：可通过 API 触发完整创作流程并获取进度

#### 7A.6 实现状态管理路由 [P0, 5h, 依赖 7A.1, 2.2]
- 实现 `studio/src/api/routes/state.ts`，包括导入 Markdown 和差异对比
- 验收：可读取和更新真相文件

#### 7A.7 实现守护进程路由 [P0, 3h, 依赖 7A.1, 6S.4]
- 实现 `studio/src/api/routes/daemon.ts`
- 验收：可控制守护进程启停

#### 7A.8 实现伏笔管理路由 [P0, 5h, 依赖 7A.1, 5.2, 5.9]
- 实现 `studio/src/api/routes/hooks.ts`，包括时间轴数据
- 验收：返回正确的甘特图数据

#### 7A.9 实现数据分析路由 [P0, 6h, 依赖 7A.1, 6.10, 6.9]
- 实现 `studio/src/api/routes/analytics.ts`，包括基线告警和灵感洗牌
- 验收：可获取各种统计数据

#### 7A.10 实现配置/导出/系统/提示词路由 [P0, 6h, 依赖 7A.1]
- 分别实现 `config.ts`、`export.ts`、`system.ts`、`prompts.ts`、`natural-agent.ts`（共 14 个路由模块，57 端点）
- 验收：各端点正常工作

#### 7A.11 实现上下文查询路由 [P1, 3h, 依赖 7A.1, 2.5]
- 实现 `studio/src/api/routes/context.ts`，支持按实体名查询
- 验收：可返回角色、地点等的上下文信息

#### 7A.12 实现自然语言 Agent 路由 [P2, 3h, 依赖 7A.1]
- 实现 `studio/src/api/routes/natural-agent.ts`，支持对话式指挥创作
- 验收：可通过对话方式指挥「帮我润色第三章结尾」「增加角色 A 的内心独白」等指令

### 7B — 前端页面（3-5 天）

#### 7B.1 搭建 Vite + React 项目骨架 [P0, 4h, 依赖 7A.1]
- 配置 Vite、React、shadcn/ui，设置基础布局组件（Sidebar、Header）
- 验收：`pnpm dev` 可启动前端，全局布局正常

#### 7B.2 实现 Dashboard 页面 [P0, 4h, 依赖 7B.1, 7A.3]
- 实现 `studio/src/pages/dashboard.tsx`，书籍列表、最近活动、质量趋势
- 验收：数据从 API 获取并正确渲染

#### 7B.3 实现 BookCreate 页面 [P0, 3h, 依赖 7B.1, 7A.3]
- 实现 `studio/src/pages/book-create.tsx`，两步表单创建新书
- 验收：可成功创建书籍并跳转

#### 7B.4 实现 BookDetail 页面 [P0, 6h, 依赖 7B.1, 7A.4, 4.10]
- 实现 `studio/src/pages/book-detail.tsx`，章节列表、快速操作、合并/拆分/回滚菜单
- 验收：可查看所有章节，执行基本操作

#### 7B.5 实现 ChapterReader 页面 [P0, 8h, 依赖 7B.1, 7A.4]
- 实现 `studio/src/pages/chapter-reader.tsx`，正文、审计报告、污染隔离横幅、心流模式
- 验收：可阅读和编辑，心流模式正常

#### 7B.6 实现 Writing 页面 [P0, 8h, 依赖 7B.1, 7A.5, 7A.2]
- 实现 `studio/src/pages/writing.tsx`，快速试写区域、完整流水线进度、记忆词云、质量仪表盘
- 验收：可触发快速试写和完整创作，实时进度 SSE 更新

#### 7B.7 实现 Analytics 页面 [P1, 6h, 依赖 7B.1, 7A.9]
- 实现 `studio/src/pages/analytics.tsx`，字数统计、审计通过率、Token 用量、基线漂移、灵感洗牌
- 验收：图表正确渲染，告警和洗牌功能可用

#### 7B.8 实现 TruthFiles 页面 [P1, 5h, 依赖 7B.1, 7A.6]
- 实现 `studio/src/pages/truth-files.tsx`，可视化编辑真相文件，支持导入 Markdown
- 验收：可查看和编辑 JSON/投影

#### 7B.9 实现 DaemonControl 页面 [P0, 4h, 依赖 7B.1, 7A.7]
- 实现 `studio/src/pages/daemon-control.tsx`，配置和监控守护进程
- 验收：可启停、调整间隔、查看日志

#### 7B.10 实现 HookPanel 页面 [P0, 10h, 依赖 7B.1, 7A.8]
- 实现 `studio/src/pages/hook-panel.tsx` 及子组件（小地图、放大镜、时间轴、抛物线动画）
- 验收：双轨视图正确渲染，惊群动画流畅

#### 7B.11 实现 ConfigView 页面 [P0, 4h, 依赖 7B.1, 7A.10]
- 实现 `studio/src/pages/config-view.tsx`，配置 LLM Provider 和 Agent 路由
- 验收：可增删改查 Provider 配置

#### 7B.12 实现 DoctorView 页面 [P1, 6h, 依赖 7B.1, 7A.10, 2.11]
- 实现 `studio/src/pages/doctor-view.tsx`，集成诊断、状态差异对比、重组恢复
- 验收：可运行诊断并修复，脱节对比弹窗自然语言化

#### 7B.13 实现通用组件 [P0/P1, 20h, 依赖 7B.1]
- 复用组件：entity-highlight, context-popup, memory-wordcloud, audit-report, state-diff-view, pollution-badge, time-dial, baseline-chart, suggestion-bubble, inspiration-shuffle, thunder-anim
- 验收：每个组件独立可用，符合 UI 原型

#### 7B.14 同人模式初始化页面 [P2, 4h, 依赖 7B.1, 7A.3]
- 实现 `studio/src/pages/fanfic-init.tsx`，选择同人模式（canon/au/ooc/cp），上传正典参考
- 验收：可正确初始化同人书籍，模式参数持久化

#### 7B.16 同人模式核心逻辑 [P2, 4h, 依赖 1.5a]
- 实现 `core/src/fanfic.ts`，同人模式核心逻辑：canon（遵循正典）/au（替代宇宙）/ooc（角色性格偏离）/cp（配对驱动）四种模式的约束注入
- 验收：不同模式下 Agent 输出符合对应约束规则

#### 7B.15 文风仿写配置页面 [P2, 4h, 依赖 7B.1, 7A.10]
- 实现 `studio/src/pages/style-manager.tsx`，上传参考作品，展示风格指纹提取结果，调整仿写强度
- 验收：上传文本后可预览风格指纹 JSON，调整参数后生效

---

## 阶段 8：导出与通知（2-3 天，依赖阶段 4）

### 8.1 实现 EPUB 3.0 导出器 [P0, 6h, 依赖 2.1]
- 实现 `core/src/export/epub.ts`，生成符合规范的 EPUB 文件
- 验收：可用阅读器打开生成的 EPUB

### 8.2 实现 TXT / Markdown 导出 [P0, 3h, 依赖 2.1]
- 实现 `core/src/export/txt.ts` 和 `core/src/export/markdown.ts`
- 验收：导出文件内容正确

### 8.2a 实现平台适配导出 [P2, 3h, 依赖 2.1]
- 实现 `core/src/export/platform-adapter.ts`，支持起点中文网/番茄小说等平台格式
- 验收：导出文件符合目标平台的章节分隔和元数据要求

### 8.3 实现通知推送模块 [P1, 5h]
- 实现 `core/src/notify/index.ts`，支持 Telegram/飞书/企业微信/Webhook
- 验收：可发送测试通知

### 8.4 集成守护进程事件通知 [P1, 3h, 依赖 6S.4, 8.3]
- DaemonScheduler 中调用通知模块，推送启停/章节完成/配额耗尽等事件
- 验收：守护进程事件推送到配置的渠道

---

## 阶段 9：异常交互（2-3 天，依赖阶段 7/2）

> **里程碑 M7 达成标志**：异常处理交互完整可用（分屏对比/污染视觉/回滚确认）

### 9.1 实现 StateDiffView 组件 [P0, 6h, 依赖 7A.6, 7B.13]
- 完成 `state-diff-view.tsx`，左右分屏对比 JSON 与 Markdown，自然语言翻译，逐行勾选合并
- 验收：可查看差异并选择性合并，合并后 JSON 正确更新

### 9.2 实现污染隔离视觉强化 [P0, 3h, 依赖 7B.4, 7B.5]
- BookDetail 章节列表和 ChapterReader 中集成 `pollution-badge.tsx`
- 验收：污染章节视觉上明显区分（橙色边框 #FF8C00 + 45° 斜纹背景 + 「污染隔离」标签）

### 9.3 实现回滚确认增强 [P0, 5h, 依赖 7B.4, 2.6]
- 实现 `time-dial.tsx`，回滚时弹出，拖拽旋转确认 + 碎裂动画
- 验收：回滚操作必须通过拨盘确认，动画流畅

### 9.4 实现情感弧线编辑器 [P2, 4h, 依赖 7B.1, 7A.6, 2.5]
- 实现 `studio/src/pages/emotional-arcs.tsx` + `core/src/quality/emotional-arc-tracker.ts`，追踪角色情感变化轨迹并可视化
- 验收：可查看每章角色情感状态（喜悦/愤怒/悲伤/恐惧等），情感弧线断裂时告警

---

## 阶段 10：测试与优化（3-4 天，全部完成后）

### 10.1 编写 Agent 单元测试 [P0, 8h, 依赖 所有 Agent 实现]
- 为每个 Agent 编写 Vitest 单元测试，模拟 LLM 调用
- 验收：覆盖率 >80%

### 10.2 编写 Pipeline 集成测试 [P0, 6h, 依赖 阶段 4]
- 测试完整的 writeNextChapter 链路
- 验收：可端到端生成一章

### 10.3 编写状态层单元测试 [P0, 6h, 依赖 阶段 2]
- 测试 StateReducer 不可变更新、SnapshotManager 回滚、Recovery 恢复逻辑
- 验收：核心状态逻辑测试通过

### 10.4 编写伏笔治理测试 [P0, 5h, 依赖 阶段 5]
- 测试伏笔生命周期、逾期检测、惊群平滑
- 验收：休眠/唤醒/分批行为正确

### 10.5 编写质量检测测试 [P0, 6h, 依赖 阶段 6]
- 测试 AIGCDetector 准确性、RepairDecider 策略选择、基线漂移检测
- 验收：检测准确率达标

### 10.6 编写 E2E 测试 [P0, 8h, 依赖 阶段 7/8/9]
- 关键用户路径：创建书籍 → 快速试写 → 升级为正式章节 → 守护进程写一章 → 导出 EPUB
- 验收：所有步骤成功执行

### 10.7 性能优化 [P1, 6h, 依赖 所有功能完成]
- 优化单章生成时间（本地 <120s，云端 <60s），SQLite 查询性能，前端打包体积
- 验收：性能指标达标

### 10.8 文档更新 [P1, 4h, 依赖 所有功能完成]
- 更新 README、CHANGELOG，确保架构文档与代码同步
- 验收：文档反映最终实现

---

## 依赖关系图

```
#6 阶段1 (基础设施)
├── #7 提示词版本化 (1.5→1.6→1.7) ───→ #12 Agent 层 (阶段3) ────→ #13 多模型路由 (阶段6)
│                                          │                        │
│                                          ├────────────────────────┤
│                                          ↓                        ↓
#14 状态层 (阶段2) ──→ #10 会话恢复 (2.9) → #11 投影校验 (2.11) → #9 Pipeline (阶段4)
│         │                  │                                      │
│         │                  └──────────────────────────────────────┤
│         ↓                                                         ↓
│       #22 伏笔注册 (阶段5) → #19 意图声明 (5.7)                 #8 草稿模式 (4.2)
│                                                                   #15 章节重组 (4.10)
│                                                                   #20 导出 (阶段8)
│                                                                   #21 33维审计 (3.19)
│                                                                   #23 AI检测修复 (6.1/6.9)
│                                                                   #32 守护进程 (6S.4)
│                                                                   │
└───────────────────────────────────────────────────────────────────→ #24 Hono API (7A)
                                                                       │
                                                          ┌────────────┴────────────┐
                                                          ↓                         ↓
                                                     #25 核心页面 (7B.1-7B.7)  #18 管理页面 (7B.8-7B.12)
                                                          │                         │
                                            ┌─────┬─────┼─────┬─────┐               │
                                            ↓     ↓     ↓     ↓     ↓               ↓
                                           #17   #26   #27   #30   #31           (blocked by #25+#18)
                                           心流  词云  伏笔双轨 质量趋势 污染隔离     │
                                            │     │      │     │     │               │
                                            │     └──────┼─────┘     │               │
                                            │            ↓           │               │
                                            │         #29 (Doctor翻译)               │
                                            │                                        │
                                            └────────────┬───────────┴───────────────┘
                                                         ↓
                                                    #28 测试+E2E (阶段10)
```

## 并行执行建议

| 并行组 | 可并行任务 |
|--------|-----------|
| 阶段 1 | 1.5、1.6、1.7 可在 1.2 完成后并行 |
| 阶段 2 | 2.5 可在 1.6 完成后与 2.1 并行；2.7/2.8 可在 2.2 完成后并行 |
| 阶段 3 | 3A（规划类）和 3B（执行类）部分可并行；3C（审计类）依赖 3A/3B 完成后并行开发 |
| 阶段 4 | 4.2/4.3 可在 4.1 完成后并行；4.10/4.11 可并行 |
| 阶段 5 | 5.1/5.5 可并行启动；5.2/5.3/5.4 依赖 5.1 后并行 |
| 阶段 6 | 6.1/6.6/6.8/6.11 可并行启动；6.2/6.3/6.9 串行 |
| 阶段 6 补 | 6S.1/6S.3 可并行启动；6S.2 依赖 6S.1；6S.4 最后 |
| 阶段 7 | 7A 路由可并行开发（不同路由不同人）；7B 页面可在 7A 骨架完成后并行 |
| 阶段 8 | 8.1/8.2/8.3 可并行 |
| 阶段 9 | 9.1/9.2/9.3 可并行 |
| 阶段 10 | 10.1-10.5 可并行编写；10.6 依赖功能完成后编写 |

---

## 关键里程碑

| 里程碑 | 达成标志 | 预计时间 | 依赖任务 |
|--------|----------|----------|----------|
| M1 | 可初始化一本书，状态可读写 | 第 1 周末 | 阶段 1, 2 |
| M2 | 可完成单章完整创作（草稿+审计+修订+持久化） | 第 2.5 周末 | 阶段 3, 4 |
| M3 | 伏笔治理完整可用 | 第 3 周末 | 阶段 5 |
| M4 | 全部质量检测可用 | 第 3.5 周末 | 阶段 6 |
| M5 | 智能守护进程可用 | 第 4 周末 | 阶段 6 补 |
| M6 | Studio 完整可用，端到端创作流程跑通 | 第 5.5 周末 | 阶段 7, 8 |
| M7 | 异常处理交互完整可用（分屏对比/污染视觉/回滚确认） | 第 7 周末 | 阶段 9 |

---

## 风险与应对

| 风险 | 影响 | 应对 |
|------|------|------|
| Agent 提示词调试耗时 | 质量不达标 | 保留已验证的提示词模板，按需适配调整 |
| SQLite 并发问题 | 数据损坏 | WAL 模式 + busy_timeout + 文件锁 |
| LLM API 不稳定 | 创作中断 | 多 Provider 路由 + 自动故障切换 |
| 上下文膨胀 | Token 超限 | SQLite 按相关性检索，不全量注入 |

---

## 关键文件清单

| 阶段 | 关键文件 |
|------|----------|
| 1 | `pnpm-workspace.yaml`, `tsconfig.json`, `packages/core/package.json`, `packages/core/src/llm/{provider.ts,routed-provider.ts}`, `packages/core/src/prompts/{v1/,v2/,latest,registry.json}` |
| 2 | `packages/core/src/state/manager.ts`, `reducer.ts`, `memory-db.ts`, `recovery.ts`, `lock-manager.ts`, `projections.ts`, `sync-validator.ts` |
| 3 | `packages/core/src/agents/*` (22 文件，含 base.ts/market-injector.ts/style-fingerprint.ts/entity-registry.ts) |
| 4 | `packages/core/src/pipeline/runner.ts`, `atomic-ops.ts`, `persistence.ts`, `scheduler.ts`, `fast-draft.ts`, `upgrade-draft.ts`, `restructurer.ts`, `reorg-lock.ts`, `staging-manager.ts` |
| 5 | `packages/core/src/governance/*` (9 个文件，含 hook-admission.ts + wake-smoothing.ts + intent-declaration.ts + dormant-handler.ts) |
| 6 | `packages/core/src/quality/*` (11+ 文件，含 baseline.ts + dialogue-checker.ts + emotional-arc-tracker.ts), `revision-loop.ts`, `audit-tier-classifier.ts` |
| 6 补 | `packages/core/src/scheduler/smart-interval.ts`, `quota-guard.ts`, `daemon.ts` |
| 7 | `packages/studio/src/pages/*`, `components/*`, `api/server.ts`, `api/routes/*` (14 个路由文件), `hook-timeline.tsx`, `hook-minimap.tsx`, `hook-magnifier.tsx`, `thunder-anim.tsx`, `fanfic-init.tsx`, `style-manager.tsx`, `emotional-arcs.tsx` |
| 8 | `packages/core/src/export/*` (含 epub.ts/txt.ts/markdown.ts/platform-adapter.ts), `notify/*` |
| 9 | `packages/studio/src/components/state-diff-view.tsx`, `pollution-badge.tsx`, `time-dial.tsx`, `entity-highlight.tsx`, `memory-wordcloud.tsx`, `suggestion-bubble.tsx`, `inspiration-shuffle.tsx` |
| 10 | `packages/core/**/*.test.ts`, `packages/studio/**/*.test.tsx`, `e2e/*.spec.ts` |
