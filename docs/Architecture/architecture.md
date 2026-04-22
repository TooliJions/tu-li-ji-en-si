# CyberNovelist 技术架构文档

> 版本: 1.0 | 日期: 2026-04-18 | 状态: 正式发布

---

## 1. 总体架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                        交互层 (Interface Layer)                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │   CyberNovelist Studio                                       │   │
│  │   (React + Hono + SSE, Vite + shadcn/ui)                     │   │
│  └──────────────────────┬───────────────────────────────────────┘   │
└──────────────────────────┼─────────────────────────────────────────┘
                           │
┌────────────────────────────────┼─────────────────────────────────────┐
│                     核心引擎层 (Core Engine Layer)                     │
│                                │                                      │
│  │                    PipelineRunner                              │   │
│  │  外部唯一入口 + 内部阶段协调器                                  │   │
│  └──┬───────┬───────┬───────┬───────┬───────┬───────┬────────────┘   │
│     │       │       │       │       │       │       │                │
│  ┌──┴──┐ ┌──┴──┐ ┌──┴──┐ ┌──┴──┐ ┌──┴──┐ ┌──┴──┐ ┌──┴──┐          │
│  │Plan │ │Comp │ │Arch │ │Write│ │Obsrv│ │Auditor│ │Revise│          │
│  │ner  │ |oser  │ |itect │ |r    │ |er   │ |       │ |r     │          │
│  └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └───────┘ └──────┘          │
│                                                                        │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │                    Agent 层 (21+ 模块化)                         │   │
│  │  规划类: OutlinePlanner, CharacterDesigner, ChapterPlanner      │   │
│  │  执行类: ChapterExecutor, ContextCard, ScenePolisher, Refiner    │   │
│  │  审计类: QualityReviewer, FactChecker, EntityAuditor, StyleAudit │   │
│  │  特殊类: SurgicalRewriter, HookAuditor, FatigueAnalyzer...       │   │
│  └────────────────────────────────────────────────────────────────┘   │
│                                                                        │
│  ┌─────────────────────┐  ┌─────────────────────┐                    │
│  │   LLM Provider 层    │  │   模型路由 + 声誉系统 │                    │
│  │  OpenAI/兼容接口      │  │  按 Agent 粒度配置    │                    │
│  │  DashScope/Gemini... │  │  自动故障切换        │                    │
│  └─────────────────────┘  └─────────────────────┘                    │
│                                                                        │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │                    治理层 (Governance)                            │   │
│  │  HookAgenda(排班) → HookArbiter(仲裁) → HookGovernance(治理)     │   │
│  │  → HookLifecycle(生命周期) → HookPolicy(策略)                    │   │
│  └────────────────────────────────────────────────────────────────┘   │
│                                                                        │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │                    质量层 (Quality)                               │   │
│  │  AIGCDetector(9类检测) → RepairDecider(4种策略) → PostWriteVal   │   │
│  │  → POFilter → CadenceAnalyzer → LengthNormalizer                 │   │
│  └────────────────────────────────────────────────────────────────┘   │
│                                                                        │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │                    状态层 (State)                                 │   │
│  │  StateManager → RuntimeStateStore → StateReducer → Validator     │   │
│  │  SQLite MemoryDB → SnapshotManager → RuntimeStore                │   │
│  └────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────┬─────────────────────────────────────┘
                                 │
┌────────────────────────────────┼─────────────────────────────────────┐
│                     存储层 (Storage Layer)                             │
│                                                                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │
│  │ 文件系统       │  │ SQLite 数据库 │  │ 快照备份      │               │
│  │ books/        │  │ memory.db    │  │ snapshots/   │               │
│  │  chapters/    │  │              │  │              │               │
│  │  story/state/ │  │              │  │              │               │
│  └──────────────┘  └──────────────┘  └──────────────┘               │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Monorepo 结构

```
cybernovelist/
├── packages/
│   ├── core/              # 核心引擎（纯业务逻辑，无 UI 依赖）
│   │   ├── src/
│   │   │   ├── agents/          # 21+ 模块化 Agent
│   │   │   │   ├── base.ts            # BaseAgent 抽象类
│   │   │   │   ├── planner.ts         # 大纲规划
│   │   │   │   ├── character.ts       # 角色设计
│   │   │   │   ├── chapter-planner.ts # 章节规划
│   │   │   │   ├── executor.ts        # 章节执行
│   │   │   │   ├── context-card.ts    # 上下文卡片
│   │   │   │   ├── scene-polisher.ts  # 正文扩写
│   │   │   │   ├── refiner.ts         # 风格精修
│   │   │   │   ├── quality-reviewer.ts
│   │   │   │   ├── fact-checker.ts
│   │   │   │   ├── entity-auditor.ts
│   │   │   │   ├── style-auditor.ts
│   │   │   │   ├── title-voice-auditor.ts
│   │   │   │   ├── compliance-reviewer.ts
│   │   │   │   ├── surgical-rewriter.ts
│   │   │   │   ├── memory-manager.ts
│   │   │   │   ├── hook-auditor.ts
│   │   │   │   ├── fatigue-analyzer.ts
│   │   │   │   ├── intent-director.ts
│   │   │   │   ├── market-injector.ts
│   │   │   │   ├── style-fingerprint.ts
│   │   │   │   └── entity-registry.ts
│   │   │   ├── pipeline/
│   │   │   │   ├── runner.ts          # PipelineRunner 主编排器
│   │   │   │   ├── atomic-ops.ts      # draft/audit/revise/persist
│   │   │   │   ├── detection-runner.ts
│   │   │   │   ├── review-cycle.ts
│   │   │   │   ├── persistence.ts
│   │   │   │   ├── scheduler.ts
│   │   │   │   ├── truth-validation.ts
│   │   │   │   └── restructurer.ts    # ChapterRestructurer（合并/拆分）
│   │   │   ├── llm/
│   │   │   │   ├── provider.ts        # LLM Provider 抽象接口
│   │   │   │   ├── routed-provider.ts # 模型路由 + 声誉系统
│   │   │   │   └── config.ts          # 配置分层
│   │   │   ├── state/
│   │   │   │   ├── manager.ts         # StateManager（书籍锁/路径/索引）
│   │   │   │   ├── runtime-store.ts   # 运行时状态存储
│   │   │   │   ├── reducer.ts         # 不可变状态更新
│   │   │   │   ├── validator.ts       # 结构校验（Zod）
│   │   │   │   ├── memory-db.ts       # SQLite 时序记忆
│   │   │   │   ├── snapshot.ts        # 章节快照
│   │   │   │   ├── recovery.ts        # 会话恢复（崩溃回滚 + 一致性校验）
│   │   │   │   ├── lock-manager.ts    # 锁管理（僵尸锁清理）
│   │   │   │   ├── reorg-lock.ts      # 重组专用锁（阻止守护进程/恢复介入）
│   │   │   │   ├── staging-manager.ts # staging 临时目录管理（原子替换）
│   │   │   │   ├── sync-validator.ts  # 投影双向校验（哈希对比 + Markdown 导入）
│   │   │   │   ├── bootstrap.ts       # 状态引导
│   │   │   │   └── projections.ts     # JSON → Markdown 投影
│   │   │   ├── governance/
│   │   │   │   ├── hook-agenda.ts     # 伏笔排班
│   │   │   │   ├── hook-arbiter.ts    # 伏笔仲裁
│   │   │   │   ├── hook-governance.ts # 伏笔治理
│   │   │   │   ├── hook-lifecycle.ts  # 伏笔生命周期
│   │   │   │   └── hook-policy.ts     # 伏笔策略
│   │   │   ├── quality/
│   │   │   │   ├── ai-detector.ts     # 9 类 AI 痕迹检测
│   │   │   │   ├── repair-strategy.ts # 4 种修复策略
│   │   │   │   ├── post-write-validator.ts
│   │   │   │   ├── pov-filter.ts
│   │   │   │   ├── cadence.ts         # 节奏分析
│   │   │   │   ├── length-normalizer.ts
│   │   │   │   ├── baseline.ts        # 质量基线快照与漂移检测
│   │   │   │   └── audit-tier-classifier.ts # 审计三级分类与降级
│   │   │   ├── models/
│   │   │   │   ├── book.ts            # Zod schemas
│   │   │   │   ├── chapter.ts
│   │   │   │   ├── state.ts
│   │   │   │   ├── hooks.ts
│   │   │   │   └── schemas.ts
│   │   │   ├── notify/                # 通知推送（Telegram/飞书/企微/Webhook）
│   │   │   ├── export/                # 导出器（EPUB/TXT/Markdown）
│   │   │   ├── prompts/               # 提示词模板（版本化）
│   │   │   │   ├── v1/                # v1 提示词集（初始版本）
│   │   │   │   ├── v2/                # v2 提示词集（改进版本）
│   │   │   │   ├── latest -> v2       # 软链接指向最新版本
│   │   │   │   └── registry.json      # 版本注册表（版本/变更日志/适用场景）
│   │   │   ├── daemon.ts              # 守护进程（智能间隔 + 配额保护）
│   │   │   ├── scheduler/             # 资源调度器
│   │   │   │   ├── smart-interval.ts  # 动态间隔策略（RPM 监控 + 本地模式）
│   │   │   │   └── quota-guard.ts     # 每日 Token 配额保护
│   │   │   ├── fanfic.ts              # 同人创作
│   │   │   └── index.ts               # 公开 API 门面
│   │   └── package.json
│   │
│   └── studio/            # Web 工作台（React + Hono）
│       ├── src/
│       │   ├── api/               # Hono API + SSE
│       │   │   ├── server.ts
│       │   │   └── routes/        # 路由分组
│       │   │       ├── books.ts           # 书籍管理
│       │   │       ├── chapters.ts        # 章节管理
│       │   │       ├── pipeline.ts        # 创作流水线
│       │   │       ├── state.ts           # 状态管理
│       │   │       ├── daemon.ts          # 守护进程
│       │   │       ├── hooks.ts           # 伏笔管理
│       │   │       ├── analytics.ts       # 数据分析
│       │   │       ├── config.ts          # 配置
│       │   │       ├── export.ts          # 导出
│       │   │       ├── system.ts          # 系统诊断
│       │   │       ├── prompts.ts         # 提示词版本
│       │   │       ├── context.ts         # 上下文查询（心流模式悬停感知 + 全局搜索）
│       │   │       ├── state.ts           # 状态差异对比（JSON vs Markdown diff）
│       │   │       └── sse.ts             # SSE 推送
│       │   ├── components/        # 可复用组件
│       │   │   ├── sidebar.tsx
│       │   │   ├── flow-mode-toggle.tsx   # 心流模式切换按钮（已内联于 writing.tsx / chapter-reader.tsx）
│       │   │   ├── context-popup.tsx      # 上下文悬浮卡片（悬停触发，心流模式专属）
│       │   │   ├── entity-highlight.tsx   # 实体词汇虚线底纹高亮（心流模式被动感知）
│       │   │   ├── memory-wordcloud.tsx   # 记忆抽取词云（渐隐渐显动画，置信度布局）
│       │   │   │                          # 注：memory-preview.tsx 已合并至此组件
│       │   │   ├── audit-report.tsx       # 33 维审计报告（三级折叠+雷达图）
│       │   │   ├── state-diff-view.tsx    # 自然语言差异对比（技术数据→语义化翻译）
│       │   │   ├── pollution-badge.tsx    # 污染隔离视觉组件（橙色边框+斜纹背景）
│       │   │   ├── time-dial.tsx          # 时间回溯拨盘（拖拽旋转+阻力感）
│       │   │   ├── quality-dashboard.tsx  # 质量仪表盘 8 维度（已内联于 writing.tsx）
│       │   │   ├── baseline-chart.tsx     # 基线趋势图（虚线基线+琥珀渐变关注区）
│       │   │   ├── suggestion-bubble.tsx  # 柔和建议气泡（飘出动画，替代告警闪烁）
│       │   │   ├── inspiration-shuffle.tsx# 灵感洗牌（三种重写方案对比）
│       │   │   ├── daemon-panel.tsx
│       │   │   ├── log-viewer.tsx
│       │   │   ├── world-rules-editor.tsx
│       │   │   └── daemon-log-stream.tsx  # 守护进程日志流
│       │   ├── hooks/             # React Hooks
│       │   │   ├── use-api.ts
│       │   │   ├── use-sse.ts
│       │   │   └── use-i18n.ts
│       │   ├── pages/             # 页面
│       │   │   ├── dashboard.tsx
│       │   │   ├── book-create.tsx
│       │   │   ├── book-detail.tsx
│       │   │   ├── chapter-reader.tsx
│       │   │   ├── writing.tsx        # 创作页（快速试写 + 完整流水线）
│       │   │   ├── analytics.tsx
│       │   │   ├── genre-manager.tsx
│       │   │   ├── style-manager.tsx
│       │   │   ├── import-manager.tsx
│       │   │   ├── truth-files.tsx
│       │   │   ├── config-view.tsx
│       │   │   ├── daemon-control.tsx
│       │   │   ├── hook-panel.tsx
│       │   │   ├── hook-timeline.tsx      # 伏笔调度双轨视图（全局小地图+局部放大镜）
│       │   │   ├── hook-minimap.tsx       # 全局热力色带小地图（可拖拽窗口）
│       │   │   ├── hook-magnifier.tsx     # 局部放大镜（前后10章窗口甘特图）
│       │   │   ├── thunder-anim.tsx       # 惊群抛物线平移动画（分流可视化）
│       │   │   ├── log-viewer-page.tsx
│       │   │   └── doctor-view.tsx
│       │   ├── App.tsx
│       │   └── main.tsx
│       └── package.json
│
├── genres/                # 题材模板
├── skills/                # OpenClaw Skill 定义
├── tests/                 # E2E 测试
├── docs/                  # 文档
├── package.json           # 根配置（pnpm workspace）
├── pnpm-workspace.yaml
└── tsconfig.json
```

---

## 3. 核心模块详细设计

### 3.1 PipelineRunner — 主编排器

`PipelineRunner` 是系统的外部唯一入口，Studio 的所有创作操作都汇聚到这里。

```
PipelineRunner
├── initBook()          # 初始化新书 + 真相文件
├── planChapter()       # 生成本章意图（Planner Agent）
├── composeChapter()    # 生成上下文/规则栈/轨迹
├── writeDraft()        # 草稿模式：生成草稿并持久化（标记 draft 状态），跳过审计修订
├── writeFastDraft()    # 快速试写：仅 ScenePolisher，单次 LLM 调用，不持久化
├── upgradeDraft()      # 草稿转正：上下文刷新检查 → 必要时重新润色 → 完整审计修订流水线
├── writeNextChapter()  # 完整流水线：草稿 → 审计 → 修订 → 持久化
├── auditDraft()        # 连续性审计
├── reviseDraft()       # 按审计结果修订
├── reviseWithFallback() # 修订+降级：含 maxRevisionRetries 和 fallbackAction
├── mergeChapters()     # 章节合并：合并正文、聚合摘要、重算事实时间线
└── splitChapter()      # 章节拆分：分割正文、继承状态快照
```

**writeNextChapter 完整链路：**

```
1. StateManager.acquireBookLock()              # 书籍加锁，防止并发写入
2. ensureControlDocuments()                     # 确保 author_intent.md + current_focus.md 存在
3. prepareWriteInput()                          # 准备本章输入（意图 + 记忆检索）
4. createGovernedArtifacts()                    # 生成本章意图、上下文包、规则栈
5. MemoryExtractor.extract()                    # 记忆抽取：抓取事实碎片 + 世界规则（可视化透视）
6. IntentDirector → ContextCard → ScenePolisher # 草稿生成（多 Agent 协作）
7. LengthNormalizer.normalizeDraft()            # 字数归一化（审计前一次）
8. ContinuityAuditor.auditChapter()             # 33 维连续性审计
9. AIGCDetector.detect()                        # 9 类 AI 痕迹检测
10. RepairDecider.decide()                       # 智能决策修复策略
11. ReviserAgent.reviseChapter()                # 执行修订（如有需要）
12. LengthNormalizer.normalizeDraft()           # 字数归一化（修订后一次）
13. buildPersistenceOutput()                    # 汇总正文/标题/摘要/真相更新
14. StateValidator.validate()                   # 状态矛盾校验
15. persistChapter()                            # 写入章节 + 索引 + 快照 + 状态
```

**轻量草稿模式（writeFastDraft）：**

```
1. 加载上下文卡片（已有 context.json 或快速生成）
2. ScenePolisher.generate()                     # 单次 LLM 调用，temperature 0.8
3. 返回草稿文本，不持久化                       # 存于临时缓冲区
4. UI 展示草稿 + 「转为正式章节」按钮           # 升级入口
```

轻量草稿与完整流水线的区别：

| 维度 | 轻量草稿 (writeFastDraft) | 完整流水线 (writeNextChapter) |
|------|---------------------------|-------------------------------|
| LLM 调用次数 | 1 次 | 6-8 次 |
| 响应时间 | <15s | 60-120s |
| 持久化 | 不持久化，临时缓存 | 写入章节 + 状态 + 快照 |
| 审计 | 无 | 33 维连续性审计 + 9 类 AI 检测 |
| 修订 | 无 | 智能修复策略 |
| 使用场景 | 灵感探索、快速试写 | 正式创作、批量写章 |

草稿转正流程：用户点击「转为正式章节」→ 调用 `upgradeDraft()` → 进入上下文漂移防护检查 → 通过后从 `writeNextChapter()` 步骤 6 开始执行。

**上下文漂移防护（upgradeDraft 入口）：**

```
1. 读取草稿生成时的上下文快照版本（draftContextSnapshotId）
2. 对比当前真相文件 mtime / versionToken
3. 若一致 → 直接跳过，进入审计流水线
4. 若不一致 → 触发上下文刷新：
   ├─ 重新生成上下文卡片（ContextCard.refresh()）
   ├─ UI 弹窗提示："检测到世界状态已更新，是否基于新状态重新润色草稿？"
   │   ├─ 是 → 调用 ScenePolisher.regenerate()（基于新上下文，保留原草稿意图）
   │   └─ 否 → 使用旧草稿，但审计时标注 context_stale=true
   └─ 进入 writeNextChapter() 步骤 6（LengthNormalizer）
```

**设计要点：**
- `draftContextSnapshotId` 存储于草稿临时缓冲区的元数据中，记录生成时的真相文件版本。
- 真相文件每次变更后递增 `versionToken`（存储于 `story/state/manifest.json`），保证可追踪。
- 即使作者选择「使用旧草稿」，审计流水线也会收到 `context_stale=true` 标记，LengthNormalizer 和 Auditor 据此降低误报阈值（位置/资源类矛盾自动降级为 Warning）。

**审计失败降级路径（RevisionLoop）：**

```
正常修订流程：
  草稿 → 审计 → 发现问题 → RepairDecider 决策 → Reviser 执行 → 再审计
                                                        │
                                              审计通过 → 持久化
                                              审计失败 → 进入下一轮修订循环
                                                        │
                                              达到 maxRevisionRetries (默认 2)？
                                                        │
                                              ┌─── 是 ──┴── 否 ───┐
                                              ▼                    ▼
                                      触发 fallbackAction      继续修订循环
                                              │
                              ┌───────────────┴────────────────┐
                              ▼                                ▼
                      accept_with_warnings                  pause
                      • 强制接受最后结果                      • 暂停流水线
                      • 元数据标记 ⚠️                        • 推送人工介入通知
                      • 持久化到章节文件                      • 等待人工复核
                      • 通知推送「强制通过」                    • 不消耗额外 Token
                      • 从质量基线滑动窗口中排除                │
                      • 标记 exclude_from_training             │
                      • SQLite 事实降低置信度                   │
```

**配置结构：**

```typescript
interface RevisionPolicy {
  maxRevisionRetries: number;       // 默认 2，最大修订重试次数
  fallbackAction: "accept_with_warnings" | "pause";  // 降级行为
  notifyOnFallback: boolean;        // 触发降级时推送通知
}
```

**元数据标记：**

```json
{
  "chapter": 46,
  "status": "accepted_with_warnings",
  "flags": ["force_accepted", "revision_limit_reached", "exclude_from_training"],
  "revision_history": [
    { "attempt": 1, "issues": 3, "strategy": "paragraph_reorder" },
    { "attempt": 2, "issues": 2, "strategy": "full_rewrite" }
  ],
  "fallback_reason": "max_revision_retries exceeded (2/2)",
  "requires_manual_review": true,
  "confidence": "low",
  "exclude_from_baseline": true
}
```

**accept_with_warnings 污染隔离机制：**

```
accept_with_warnings 触发的连锁反应：
  │
  ├── 1. 质量基线滑动窗口排除此章
  │     └── baseline.ts 计算连续 3 章均值时跳过该章
  │         → 防止低质量章节误触发漂移告警
  │
  ├── 2. SQLite 事实置信度降级
  │     └── facts 表增加 confidence 字段 = "low"
  │         → ContextCard 检索时降低该章事实权重
  │         → UI 显示 ⚠️ 低置信度标记
  │
  ├── 3. 守护进程连续降级计数器
  │     └── daemon 维护 consecutive_fallbacks 计数器
  │         ├── 计数 < 2 → 继续（通知已推送）
  │         └── 计数 >= 2 → 自动暂停守护进程
  │             → 推送「连续 2 章审计降级，建议人工检查上下文或切换模型」
  │             → 需人工确认后手动恢复
  │
  └── 4. 后续章节上下文注入
        └── 审计此章作为上下文时自动添加 ⚠️ 标记
            → Auditor 知道引用了低质量章节
            → 不将引用内容作为事实判定依据
```

**安全约束**：

| 约束 | 处理方式 |
|------|----------|
| Token 保护 | 每次修订消耗 Token 计入日配额，触发降级后停止消耗 |
| 防止静默降级 | 强制通过的章节在 UI 醒目位置显示 ⚠️ 标记 |
| 可追溯性 | revision_history 记录每轮审计问题数和修复策略 |
| 守护进程 | pause 模式下守护进程挂起，不继续下一章 |
| 污染隔离 | accept_with_warnings 章节从质量基线滑动窗口中排除 |
| 事实置信度 | 降级章节的 SQLite facts 标记 confidence=low，ContextCard 降低权重 |
| 连续降级 | 守护进程连续 2 次 accept_with_warnings 自动暂停，需人工确认恢复 |
| 上下文标记 | 后续章节引用降级章节时自动添加 ⚠️ 标记，Auditor 不将其作为事实依据 |

### 3.2 Agent 系统 — 模块化设计

每个 Agent 继承自 `BaseAgent`，独立文件、独立职责。

```typescript
abstract class BaseAgent {
  abstract readonly name: string;
  abstract readonly temperature: number;
  abstract execute(ctx: AgentContext): Promise<AgentResult>;

  // 统一 LLM 调用
  protected async generate(prompt: string): Promise<string>;
  protected async generateJSON<T>(prompt: string): Promise<T>;
}
```

**节点温度策略：**

| Agent 类型 | 温度 | 原因 |
|-----------|------|------|
| 创作类（ScenePolisher, Planner, Writer） | 0.7-0.9 | 需要创造性和变化 |
| 审计类（Auditor, FactChecker, AIGCDetector） | 0.1-0.3 | 需要精确和一致性 |
| 治理类（HookArbiter, RepairDecider） | 0.3-0.5 | 需要判断但不需要创造性 |

### 3.3 状态管理 — 三层架构

```
┌──────────────────────────────────────────────┐
│  StateManager                                 │
│  - 书籍锁 (open "wx" 排他创建)                  │
│  - 路径计算                                    │
│  - 章节索引                                    │
│  - 控制文档管理                                │
└──────────────────┬───────────────────────────┘
                   │
┌──────────────────┴───────────────────────────┐
│  RuntimeStateStore                            │
│  - 加载 story/state/*.json                    │
│  - buildRuntimeStateArtifacts(delta)          │
│  - renderMarkdownProjection(snapshot)         │
│  - saveRuntimeStateSnapshot()                 │
└──────────────────┬───────────────────────────┘
                   │
┌──────────────────┴───────────────────────────┐
│  StateReducer                                 │
│  - applyRuntimeStateDelta() [不可变更新]        │
│  - HookOps: upsert / mention / resolve / defer / dormant │
│  - validateRuntimeState() [Zod 校验]           │
└──────────────────────────────────────────────┘
```

**关键设计原则：**
1. 不直接修改真相文件
2. Agent 输出结构化 JSON delta
3. Reducer 做不可变更新
4. Zod 校验拒绝非法状态
5. 最后才投影成 Markdown 给人读

**会话恢复机制（SessionRecovery）：**

```
┌──────────────────────────────────────────────────────────────────┐
│                    单章写入事务（原子性）                           │
│                                                                  │
│  适用范围：writeNextChapter 的单章写入流程                         │
│  注意：不适用于 ChapterRestructurer（见 3.9 重组安全机制）         │
│                                                                  │
│  步骤 1: 写入章节文件 (chapters/chXX.md)                          │
│     ▼                                                            │
│  步骤 2: 更新 index.json（内存中）                                │
│     ▼                                                            │
│  步骤 3: 插入 SQLite facts / hooks 记录                           │
│     ▼                                                            │
│  步骤 4: 保存状态快照 (memory_snapshots 表)                        │
│     ▼                                                            │
│  步骤 5: db.transaction(() => { /* 提交 */ })                     │
│                                                                  │
│  若步骤 1-4 完成但步骤 5 未执行（崩溃/断电）：                      │
│  → WAL 文件保留未提交事务                                          │
│  → 下次启动时 SQLite 自动回滚（WAL 原子提交保证）                   │
│  → 恢复器检测到 index.json 有章节但 SQLite 无对应记录              │
│  → 自动清理残留章节文件 + 回滚 index.json                          │
└──────────────────────────────────────────────────────────────────┘
```

**恢复流程：**

```
SessionRecovery（启动时自动检查）
  │
  ├── 0. 检查重组哨兵文件 (.reorg_in_progress)
  │     ├── 存在 → 重组操作中途崩溃 → 禁止自动修复
  │     │         → 推送人工介入请求 → 等待 reorg.lock 释放后手动处理
  │     └── 不存在 → 继续常规检查
  │
  ├── 1. 检查书籍锁 (.lock 文件)
  │     ├── 锁存在 + 进程不存在 → 僵尸锁 → 自动清理（或 --fix-locks）
  │     └── 锁存在 + 进程存在   → 正在运行 → 拒绝访问
  │
  ├── 2. 检查 SQLite WAL 文件
  │     ├── WAL 有未提交事务 → SQLite 自动回滚
  │     └── WAL 正常         → 继续
  │
  ├── 3. 一致性校验
  │     ├── index.json 章节数 vs SQLite chapter_summaries 记录数
  │     ├── 章节文件存在性 vs index.json 条目
  │     └── 伏笔状态 vs hooks 表
  │
  └── 4. 修复建议
        ├── 自动：回滚不一致项
        └── 手动：--fix-locks 清理僵尸锁
```

**doctor --fix-locks（UI 诊断面板）：**

通过 Studio DoctorView 一键执行。

**状态投影双向校验（ProjectionSync）：**

```
┌──────────────────────────────────────────────────────────────────┐
│                    Markdown ↔ JSON 双向同步                       │
│                                                                  │
│  数据流向（标准）：                                               │
│    JSON（权威）───投影───▶  Markdown（给人读）                    │
│                                                                  │
│  数据流向（反向导入）：                                           │
│    Markdown（手动编辑）───LLLM 解析──▶  JSON Delta ──▶ 合并       │
│                                                                  │
│  检测机制：                                                       │
│  1. 每次保存 JSON 时，计算 SHA-256 哈希写入 .state-hash 隐藏文件  │
│  2. 加载状态时对比：                                              │
│     ├── .state-hash 中的哈希 vs 当前 JSON 计算哈希                │
│     ├── JSON 文件 mtime vs Markdown 投影 mtime                   │
│     └── 若 Markdown 更新且哈希不匹配 → 触发脱节警告               │
│                                                                  │
│  脱节处理流程：                                                   │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │ ⚠️ 检测到手动编辑的真相文件投影                           │     │
│  │                                                         │     │
│  │ 文件: current_state.md                                  │     │
│  │ Markdown 修改时间: 2026-04-18 16:30                     │     │
│  │ JSON 状态时间:     2026-04-18 14:22                     │     │
│  │                                                         │     │
│  │ 注意：系统当前使用的是 JSON 状态，您的 Markdown 修改     │     │
│  │       尚未同步到系统中。                                  │     │
│  │                                                         │     │
│  │ [导入变更]  [忽略]  [查看差异]                           │     │
│  └─────────────────────────────────────────────────────────┘     │
│                                                                  │
│  导入流程（[导入变更] 按钮触发）：                                 │
│  1. 读取 Markdown 投影文件内容                                    │
│  2. 调用轻量 LLM 解析 Markdown → 结构化 JSON Delta                │
│     提示词：「从以下 Markdown 提取状态变更，输出 JSON Patch 格式」 │
│  3. Zod 校验验证 JSON Delta 结构合法性                            │
│  4. StateReducer.applyDelta() 做不可变合并                        │
│  5. 重新投影 Markdown（覆盖手动编辑版本）                          │
│  6. 更新 .state-hash                                             │
│  7. 显示导入结果：「成功同步 3 项变更」                            │
└──────────────────────────────────────────────────────────────────┘
```

**state import（UI 状态导入）：**

通过 TruthFiles 编辑器的「导入 Markdown」按钮执行。

导入过程：
1. 解析 Markdown → JSON Delta（AI 辅助）
2. 校验 Delta 结构
3. 显示变更预览
4. 确认后合并到 JSON 状态
5. 重新生成 Markdown 投影

### 3.4 伏笔治理 — 5 层架构

```
┌─────────────────────────────────────────────────┐
│  HookPolicy (策略层)                              │
│  - maxActiveHooks, overdueThreshold, etc.         │
│  - expected_resolution_window 支持                │
└──────────────────┬──────────────────────────────┘
                   │
┌──────────────────┴──────────────────────────────┐
│  HookAgenda (排班层)                              │
│  - scheduleHook() 为每个伏笔安排推进计划            │
│  - checkOverdue() 检查逾期（跳过 dormant 伏笔）     │
│  - isWithinResolutionWindow() 窗口期校验           │
└──────────────────┬──────────────────────────────┘
                   │
┌──────────────────┴──────────────────────────────┐
│  HookGovernance (治理层)                           │
│  - evaluateAdmission() 伏笔准入控制                │
│  - validatePayoff() 伏笔回收验证                   │
│  - checkHealth() 健康度检查                        │
│  - markDormant() 人工意图声明：休眠伏笔             │
└──────────────────┬──────────────────────────────┘
                   │
┌──────────────────┴──────────────────────────────┐
│  HookArbiter (仲裁层)                             │
│  - 检测冲突: timing/character/theme overlap       │
│  - 优先级: critical > major > minor               │
│  - 解决: 低优先级延后                              │
│  - dormant 伏笔不参与冲突检测                      │
└──────────────────┬──────────────────────────────┘
                   │
┌──────────────────┴──────────────────────────────┐
│  HookLifecycle (生命周期层)                        │
│  - 状态机: open → progressing → deferred → dormant│
│             → resolved/abandoned                  │
│  - 事件通知: onPlanted/onAdvanced/onDormant/onWake/onResolved│
│  - 自动唤醒: onChapterReached(minChapter)          │
│              dormant → open                       │
└─────────────────────────────────────────────────┘
```

**dormant vs deferred 的区别：**

| 维度 | deferred（延期） | dormant（休眠） |
|------|-----------------|-----------------|
| 触发方式 | 系统自动判定暂不推进 | 作者手动标记 |
| 排班 | 仍在排班队列，可能被检查 | 移出排班队列，不参与排班 |
| 逾期检测 | 参与逾期检测 | 不参与，不产生警告 |
| 活跃槽位 | 占用 | 不占用 |
| 预期回收 | 未知 | 有明确的 [min_chapter, max_chapter] |
| 典型场景 | 当前章节不适合推进 | 长线伏笔（数十章后回收） |
| 唤醒方式 | 系统自动恢复推进 | 章节到达 minChapter 触发 onWake 自动唤醒，或手动提前唤醒 |
| 惊群平滑 | 不适用 | 超阈值时 deferred 分布到未来章节 |

**伏笔自动唤醒与惊群平滑策略：**

```
┌──────────────────────────────────────────────────────────────────┐
│                    伏笔唤醒机制（WakeMechanism）                   │
│                                                                  │
│  触发时机：每章创作完成后自动检查                                    │
│                                                                  │
│  1. HookAgenda.onChapterReached(currentChapter)                  │
│     ├── 扫描所有 dormant 伏笔                                      │
│     ├── 过滤 expected_resolution_min <= currentChapter 的伏笔     │
│     ├── 收集待唤醒伏笔列表: wakeCandidates                         │
│     └── 若无候选 → 返回                                           │
│                                                                  │
│  2. 惊群检测（WakeSmoothing）：                                     │
│     ├── 统计 wakeCandidates 数量                                   │
│     ├── 数量 <= maxWakePerChapter (默认 3)                         │
│     │     → 全部唤醒: dormant → open                               │
│     │     → 正常排班                                              │
│     └── 数量 > maxWakePerChapter → 触发惊群平滑                    │
│                                                                  │
│  3. 惊群平滑（WakeSmoothing）：                                     │
│     ┌─────────────────────────────────────────────────────────┐  │
│     │ 同一章 N 个伏笔同时唤醒 → 排班队列爆满                     │  │
│     │                                                          │  │
│     │ 排序: wakeCandidates 按优先级降序 + 埋设章号升序          │  │
│     │                                                          │  │
│     │ 前 maxWakePerChapter 个:                                  │  │
│     │   → dormant → open → 立即加入排班                         │  │
│     │                                                          │  │
│     │ 剩余伏笔:                                                │  │
│     │   → dormant → deferred（而非 open）                       │  │
│     │   → 分配到后续章节唤醒队列: wake_at_chapter               │  │
│     │     ├── 第 current+1 章唤醒: 下一批 (最多 2 个)           │  │
│     │     ├── 第 current+2 章唤醒: 再下一批 (最多 2 个)         │  │
│     │     └── 依此类推                                          │  │
│     │                                                          │  │
│     │ 通知推送: 「第X章有N个伏笔到达回收窗口，                     │  │
│     │   已唤醒M个，其余N-M个分批在第X+1~X+K章唤醒」              │  │
│     └─────────────────────────────────────────────────────────┘  │
│                                                                  │
│  4. HookAgenda.wakeDeferredHook(hookId)                           │
│     ├── 定时检查 deferred 伏笔的 wake_at_chapter                   │
│     ├── 到达指定章节 → deferred → open                             │
│     └── 加入排班队列                                              │
└──────────────────────────────────────────────────────────────────┘
```

**唤醒配置（HookPolicy）：**

```typescript
interface WakePolicy {
  maxWakePerChapter: number;       // 默认 3，每章最多唤醒伏笔数
  wakeBatchSize: number;           // 默认 2，每批唤醒数量
  wakeInterval: number;            // 默认 1，唤醒批次间隔章数
  autoWakeEnabled: boolean;        // 默认 true，是否自动唤醒
}
```

### 3.5 质量检测 — 多引擎

```
┌──────────────────────────────────────────────────┐
│                   质量引擎                         │
│                                                    │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  │
│  │ AIGCDetector│  │RepairStrategy│  │PostWriteVal│  │
│  │            │  │            │  │            │  │
│  │ 9类检测:    │  │ 4种策略:    │  │ 角色位置    │  │
│  │ - AI套话    │  │ - 局部替换  │  │ 资源变更    │  │
│  │ - 句式单调  │  │ - 段落重排  │  │ 关系变化    │  │
│  │ - 分析报告  │  │ - 节拍重写  │  │ 合法性校验  │  │
│  │ - 元叙事    │  │ - 整章重写  │  │            │  │
│  │ - 意象重复  │  │            │  │            │  │
│  │ - 语义重复  │  │ 智能决策器  │  │            │  │
│  │ - 逻辑跳跃  │  │ 按问题类型  │  │            │  │
│  │ - 情感虚假  │  │ 自动选择    │  │            │  │
│  │ - 描述空洞  │  │            │  │            │  │
│  └────────────┘  └────────────┘  └────────────┘  │
│                                                    │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  │
│  │ POFilter   │  │ Cadence    │  │ LengthNorm │  │
│  │ POV一致性   │  │ 节奏分析    │  │ 字数归一化  │  │
│  └────────────┘  └────────────┘  └────────────┘  │
└──────────────────────────────────────────────────┘
```

**33 维审计分层降级（AuditTierClassifier）：**

```
┌──────────────────────────────────────────────────────────────────┐
│                    审计维度三级分类                                │
│                                                                  │
│  阻断级 (Blocker) — 必须通过，否则拒绝落盘：                       │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 1. 角色状态一致性    2. 实体存在性    3. 时间线顺序       │    │
│  │ 4. 物理法则一致性    5. POV 合法性    6. 已死亡角色出场    │    │
│  │ 7. 资源变更合法性    8. 关系状态一致性  9. 地点连续性      │    │
│  │ 10. 能力等级连续性   11. 年龄/外貌一致性 12. 时间跨度合理性│    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  警告级 (Warning) — 失败仍可继续，UI 强烈提示：                    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 13. 伏笔逾期        14. 描写重复      15. 对话阻力不足    │    │
│  │ 16. 情感弧线断裂    17. 称谓不一致    18. 语体漂移        │    │
│  │ 19. 跨章重复        20. 场景过渡生硬   21. 节奏失衡       │    │
│  │ 22. 信息密度异常    23. 悬念缺失      24. 伏笔推进缺失    │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  建议级 (Suggestion) — 失败仅记录，不阻断流程：                    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 25. 氛围一致性      26. 节奏建议      27. 创新度评估      │    │
│  │ 28. 语言多样性      29. 描写层次感    30. 对话自然度      │    │
│  │ 31. 情节张力        32. 叙事新鲜感    33. 完整性评分      │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  单维度 LLM 调用失败处理流程：                                     │
│                                                                  │
│  失败维度 → 自动重试 1 次                                         │
│     │                                                            │
│     ├── 成功 → 正常纳入审计报告                                   │
│     └── 仍失败                                                   │
│           │                                                      │
│           ├── 阻断级 → 降级为警告级 + 记录 "审计降级: {维度}"      │
│           ├── 警告级 → 跳过 + 记录 "审计跳过: {维度}"              │
│           └── 建议级 → 跳过 + 静默记录                             │
│                                                                  │
│  落盘决策：                                                       │
│  ├── 阻断级全部通过 → 允许落盘                                    │
│  ├── 阻断级有降级（重试失败后降级为警告）→ 允许落盘 + ⚠️ 标记      │
│  └── 阻断级有明确失败（非降级）→ 拒绝落盘，进入修订循环             │
└──────────────────────────────────────────────────────────────────┘
```

**质量基线快照（QualityBaseline）：**

```
┌──────────────────────────────────────────────────────────────────┐
│                    质量基线与漂移检测                              │
│                                                                  │
│  基线建立（第 3 章完成后自动触发）：                                │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 质量基线快照 (quality_baseline.json)                     │    │
│  │                                                          │    │
│  │ 基于章节: 1-3                                           │    │
│  │ 建立时间: 2026-04-18 14:30                              │    │
│  │                                                          │    │
│  │ 指标:                                                    │    │
│  │   ai_trace_score:       0.15  (越低越好)                  │    │
│  │   sentence_diversity:   0.82  (越高越好)                  │    │
│  │   avg_paragraph_length: 48    (字符)                      │    │
│  │   repetition_rate:      0.03  (重复率)                    │    │
│  │   coherence_score:      0.91  (连贯性)                    │    │
│  │   pacing_score:         0.78  (节奏)                      │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  漂移检测（每章完成后触发）：                                      │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 连续 3 章滑动窗口对比基线                                  │    │
│  │                                                          │    │
│  │ 算法:                                                    │    │
│  │   1. 取最近 3 章指标平均值                                 │    │
│  │   2. 与基线对比，计算恶化率                                │    │
│  │      deterioration = (current - baseline) / baseline     │    │
│  │   3. ai_trace_score 恶化 > 30% → 触发告警                 │    │
│  │      其他指标恶化 > 25% → 记录警告                        │    │
│  │                                                          │    │
│  │ 告警内容:                                                │    │
│  │   "近 3 章 AI 痕迹得分比基线升高 42%"                     │    │
│  │   "建议：检查上下文是否过长，或考虑切换模型"                │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  基线管理：                                                       │
│  ├── 作者可手动重新建立基线（确认当前质量水平可接受时）            │
│  ├── 基线版本化：每次重建保留旧基线用于趋势对比                    │
│  └── 基线随书籍初始化，存储在项目目录 story/quality/               │
└──────────────────────────────────────────────────────────────────┘
```

### 3.6 LLM Provider — 模型路由

```
┌───────────────────────────────────────────────┐
│                RoutedLLMProvider               │
│                                                │
│  调用请求 → 查找 Agent 模型配置                  │
│       │                                        │
│       ├─ 有配置 → 使用指定 Provider             │
│       │                                        │
│       └─ 无配置 → 回退全局 Provider             │
│                                                │
│  Provider 选择:                                │
│  ├─ Local (Ollama/vLLM)                        │
│  ├─ DashScope (qwen3.6-plus)                   │
│  ├─ Gemini                                     │
│  ├─ OpenAI / 中转站                             │
│  └─ DeepSeek                                   │
│                                                │
│  故障切换: 主 Provider 失败 → 声誉系统扣分        │
│           → 自动切换到备用 Provider               │
└───────────────────────────────────────────────┘
```

### 3.7 守护进程智能间隔与资源调度

```
┌─────────────────────────────────────────────────────────┐
│                    SmartInterval                         │
│                                                         │
│  云端模式（Cloud Mode）:                                 │
│  ┌───────────────────────────────────────────────────┐ │
│  │ 监控 LLM API 响应头:                                │ │
│  │   x-ratelimit-remaining-requests                   │ │
│  │   x-ratelimit-reset-requests                       │ │
│  │                                                    │ │
│  │ 间隔动态调整算法:                                    │ │
│  │   remaining > 50%  → interval = base (默认 5s)     │ │
│  │   remaining 20-50% → interval = base * 1.5         │ │
│  │   remaining < 20%  → interval = base * 3           │ │
│  │   429 响应       → interval = reset + 5s (退避)    │ │
│  └───────────────────────────────────────────────────┘ │
│                                                         │
│  本地模式（Local Mode）:                                 │
│  ┌───────────────────────────────────────────────────┐ │
│  │ interval = 0                                       │ │
│  │ 上一章落盘后立即启动下一章                           │ │
│  │ 充分利用本地 GPU，无 API 限流顾虑                    │ │
│  └───────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                    QuotaGuard                           │
│                                                         │
│  配置项:                                                 │
│  - daily_token_limit: 单日最大 Token 消耗上限             │
│  - daily_chapter_limit: 单日最大写章数（可选）            │
│                                                         │
│  运行时监控:                                             │
│  - 累计当前守护进程会话的 Token 消耗                      │
│  - 与持久化的每日用量记录累加                             │
│                                                         │
│  触发行为:                                               │
│  - 到达 80% → 发送预警通知                              │
│  - 到达 100% → 自动暂停守护进程 + 发送通知               │
│  - 次日 00:00 重置计数器                                │
└─────────────────────────────────────────────────────────┘
```

### 3.8 提示词版本化（PromptVersioning）

**提示词目录结构：**

```
prompts/
├── registry.json          # 版本注册表
├── v1/                    # 初始版本
│   ├── planner.md
│   ├── scene-polisher.md
│   ├── auditor.md
│   └── ...
├── v2/                    # 改进版本
│   ├── planner.md
│   ├── scene-polisher.md
│   ├── auditor.md
│   └── ...
└── latest -> v2           # 软链接，新书籍默认使用
```

**registry.json 结构：**

```json
{
  "versions": [
    {
      "id": "v1",
      "created": "2026-04-01",
      "changelog": "初始版本，基于三幕结构的提示词集",
      "agents": ["planner", "scene-polisher", "auditor", "reviser"]
    },
    {
      "id": "v2",
      "created": "2026-04-18",
      "changelog": "优化审计提示词，增加分层降级逻辑；ScenePolisher 增加段落节奏控制",
      "agents": ["planner", "scene-polisher", "auditor", "reviser"],
      "breaking_changes": false
    }
  ],
  "latest": "v2"
}
```

**书籍配置（book.json）：**

```json
{
  "promptVersion": "latest",
  "_promptVersionNote": "设为 'latest' 始终使用最新提示词；设为 'v1' 则固定使用 v1 版本"
}
```

**解析流程：**

```
PipelineRunner.initBook(book.json)
  │
  ├── promptVersion = "latest"
  │     ↓
  │  解析软链接 latest → 实际版本 (v2)
  │     ↓
  │  从 prompts/v2/ 加载全部提示词
  │
  └── promptVersion = "v1"
        ↓
    从 prompts/v1/ 加载全部提示词
    ↓
  不受 latest 更新影响
```

**提示词加载规则：**

| 配置值 | 行为 |
|--------|------|
| `"latest"` | 跟随软链接，使用最新版本（新书籍默认） |
| `"v1"`, `"v2"` | 固定使用指定版本（存量书籍保护） |
| 版本目录不存在 | 降级到 latest 并记录警告 |

### 3.9 章节重组 — ChapterRestructurer

```
┌──────────────────────────────────────────────────────────────┐
│                    ChapterRestructurer                        │
│                                                              │
│  前置保护：                                                   │
│  ├── 1. 获取 reorg.lock（专用重组锁，独立于 book.lock）       │
│  │     ├── 获取成功 → 继续                                     │
│  │     └── 获取失败 → 重组进行中，拒绝请求                     │
│  ├── 2. 写入 .reorg_in_progress 哨兵文件                       │
│  │     └── 恢复程序检测到此文件 → 禁止自动修复                  │
│  └── 3. 暂停守护进程（如运行中）                                │
│                                                              │
│  合并操作 mergeChapters(fromChapter, toChapter)：              │
│                                                              │
│  阶段一：准备（在 staging/ 临时目录中构建）                     │
│  ├── 1. 读取两章正文 → 拼接为新正文 → 写入 staging/chXX.md     │
│  ├── 2. 聚合两章摘要 → 合并为单条 chapter_summary              │
│  ├── 3. 准备 SQLite 事实变更批处理                              │
│  ├── 4. 准备伏笔重锚定批处理                                    │
│  └── 5. 准备快照合并批处理                                      │
│                                                              │
│  阶段二：原子提交                                              │
│  ├── 6. 开启 SQLite 事务                                       │
│  │     ├── 重算 facts 时间线                                    │
│  │     ├── 伏笔重锚定                                           │
│  │     └── 快照合并                                             │
│  ├── 7. fs.rename() 原子替换章节文件（staging → chapters/）     │
│  ├── 8. 更新 index.json（删除 to 章，更新 from 章）             │
│  ├── 9. 提交 SQLite 事务                                       │
│  └── 10. 真相文件更新 → current_state 章节号重编号              │
│                                                              │
│  阶段三：清理                                                  │
│  ├── 11. 删除 .reorg_in_progress 哨兵文件                       │
│  ├── 12. 释放 reorg.lock                                       │
│  └── 13. 清理 staging/ 临时目录                                │
│                                                              │
│  拆分操作 splitChapter(chapter, atPosition)：                  │
│  └── 同合并操作三阶段，方向相反                                  │
│                                                              │
│  崩溃恢复（.reorg_in_progress 存在时启动 doctor）：              │
│  ├── staging/ 目录保留完整的新文件集                            │
│  ├── SQLite 事务未提交 → 自动回滚到重组前状态                    │
│  ├── 恢复器不执行任何自动清理                                   │
│  └── 推送人工介入：「检测到重组操作中断，请确认回滚或继续完成」   │
│       ├── [回滚到重组前状态] → 丢弃 staging，清理哨兵            │
│       └── [继续完成重组]   → 从 staging 重做阶段二              │
└──────────────────────────────────────────────────────────────┘
```

**安全约束**：

| 约束 | 处理方式 |
|------|----------|
| 原子性 | 三阶段提交：staging 准备 → fs.rename 原子替换 → SQLite 事务 |
| 并发隔离 | reorg.lock 专用锁阻止守护进程和恢复程序介入 |
| 恢复安全 | .reorg_in_progress 哨兵阻止自动修复，仅推送人工介入 |
| 索引一致性 | index.json 与 SQLite 双重校验，不一致时阻断 |
| 伏笔完整性 | 重锚定前后校验伏笔总数不变，无孤儿伏笔 |
| 快照链完整 | 操作前后快照链的 valid_from/valid_until 连续无缺口 |

**Studio UI 入口**：章节列表每行操作菜单增加「合并到上一章」「从此处拆分」。

---

## 4. 数据流

### 4.1 章节创作数据流

```
用户意图 (author_intent.md)
当前焦点 (current_focus.md)
SQLite 记忆检索
         │
         ▼
    Planner Agent
         │ 产出: chapter-XXXX.intent.md
         ▼
    Composer Agent
         │ 产出: context.json, rule-stack.yaml, trace.json
         ▼
    Architect Agent
         │ 产出: 章节结构（场景/节拍/节奏）
         ▼
    Writer Agent (ScenePolisher)
         │ 产出: draft content + 自检表 + 结算表
         ▼
    LengthNormalizer (审计前)
         │
         ▼
    Auditor Agent (33 维检查)
         │ 产出: audit report (critical/warning/info)
         ▼
    AIGCDetector (9 类检测)
         │ 产出: AI 痕迹报告
         ▼
    RepairDecider
         │ 产出: 修复策略选择
         ▼
    Reviser Agent (如需)
         │ 产出: revised content
         ▼
    LengthNormalizer (修订后)
         │
         ▼
    StateValidator (阻断矛盾)
         │
         ▼
    StateReducer (不可变更新)
         │
         ▼
    RuntimeStateStore (持久化)
         │
         ▼
    文件系统: chapters/, story/state/, snapshots/
```

### 4.2 轻量草稿数据流

```
用户点击「快速试写」
         │
         ▼
    加载/生成上下文卡片（已有则跳过）
         │    记录 draftContextSnapshotId = manifest.versionToken
         ▼
    ScenePolisher.generate()  —  单次 LLM 调用
         │
         ▼
    返回草稿文本 → 临时缓冲区（不持久化）
         │    附带元数据: { contextSnapshotId, timestamp }
         ▼
    UI 展示草稿 + 三个选项:
         ├─ 丢弃
         ├─ 手动编辑（停留在草稿态）
         └─ 转为正式章节 → upgradeDraft()
                              │
                              ▼
                         上下文漂移防护检查:
                         对比 manifest.versionToken
                              │
                    ┌─ 一致 ──┤
                    │         └─ 不一致
                    │              │
                    │              ▼
                    │         重新生成上下文卡片
                    │              │
                    │              ▼
                    │         UI 弹窗:
                    │         "世界状态已更新，
                    │          是否重新润色？"
                    │              │
                    │         是 → ScenePolisher.regenerate()
                    │         否 → context_stale=true，审计降级
                    │              │
                    ▼              ▼
                         进入完整流水线
                         （从 LengthNormalizer 开始）
```

### 4.3 状态更新流

```
Agent 产出 JSON delta
         │
         ▼
    Zod Schema 校验
         │ 失败 → 报错，拒绝落盘
         ▼
    StateReducer.applyRuntimeStateDelta()
         │ 不可变更新，产生新 snapshot
         ▼
    RuntimeStateStore.saveRuntimeStateSnapshot()
         │ 写入 story/state/*.json
         ▼
    renderMarkdownProjection()
         │ 投影成 Markdown 给人读
         ▼
    文件系统: current_state.md, hooks.md, chapter_summaries.md
```

---

## 5. 存储设计

### 5.1 文件系统布局

```
books/
├── {book-id}/
│   ├── book.json              # 书籍配置
│   ├── story/
│   │   ├── state/             # 结构化状态（JSON 权威来源）
│   │   │   ├── manifest.json
│   │   │   ├── current_state.json
│   │   │   ├── hooks.json             # 伏笔状态（含 expected_resolution_window + dormant 标记）
│   │   │   ├── chapter_summaries.json
│   │   │   ├── subplot_board.json
│   │   │   ├── emotional_arcs.json
│   │   │   └── character_matrix.json
│   │   ├── runtime/           # 运行时产物
│   │   │   ├── chapter-0001.intent.md
│   │   │   ├── chapter-0001.context.json
│   │   │   ├── chapter-0001.rule-stack.yaml
│   │   │   └── chapter-0001.trace.json
│   │   ├── author_intent.md   # 长期作者意图
│   │   ├── current_focus.md   # 当前阶段关注
│   │   ├── snapshots/         # 状态快照（每章一个）
│   │   └── memory.db          # SQLite 时序记忆
│   ├── chapters/              # 章节文件
│   │   ├── chapter-0001-{hash}.md
│   │   └── ...
│   └── index.json             # 章节索引
```

### 5.2 SQLite 表结构

```sql
-- 事实表：支持时间有效性查询
CREATE TABLE facts (
    id          INTEGER PRIMARY KEY,
    chapter     INTEGER NOT NULL,
    entity_type TEXT    NOT NULL,  -- character/location/resource/relation/etc
    entity_name TEXT    NOT NULL,
    fact_text   TEXT    NOT NULL,
    valid_from  INTEGER NOT NULL,  -- 从第几章开始有效
    valid_until INTEGER,           -- 到第几章失效（NULL 表示持续有效）
    confidence  TEXT    NOT NULL DEFAULT 'high',  -- high | medium | low
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- 章节摘要表
CREATE TABLE chapter_summaries (
    chapter  INTEGER PRIMARY KEY,
    summary  TEXT    NOT NULL,
    key_events TEXT,                -- JSON array
    state_changes TEXT,            -- JSON object
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 伏笔表
CREATE TABLE hooks (
    id                      INTEGER PRIMARY KEY,
    planted_ch              INTEGER NOT NULL,  -- 埋设章节
    description             TEXT    NOT NULL,
    status                  TEXT    NOT NULL,  -- open/progressing/deferred/dormant/resolved/abandoned
    priority                TEXT    NOT NULL,  -- critical/major/minor
    last_advanced           INTEGER,           -- 最后一次推进的章节
    resolved_ch             INTEGER,           -- 回收章节
    expected_resolution_min INTEGER,           -- 人工意图声明：预期最早回收章节
    expected_resolution_max INTEGER,           -- 人工意图声明：预期最晚回收章节
    is_dormant              INTEGER NOT NULL DEFAULT 0,  -- 1 = 休眠（不参与排班/逾期检测）
    created_at              TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- 记忆快照表
CREATE TABLE memory_snapshots (
    chapter    INTEGER PRIMARY KEY,
    snapshot   TEXT    NOT NULL,  -- JSON: 完整的 memory_bank 状态
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- 索引
CREATE INDEX idx_facts_entity ON facts(entity_type, entity_name);
CREATE INDEX idx_facts_validity ON facts(valid_from, valid_until);
CREATE INDEX idx_hooks_status ON hooks(status);
```

---

## 6. 安全设计

| 层面 | 措施 |
|------|------|
| API 密钥 | config.local.json，gitignore，不提交到版本控制 |
| 文件锁 | `open("wx")` 排他创建，消除并发写入竞态 |
| 导出路径 | 限制在项目目录内部，防止路径穿越 |
| 输入验证 | XSS 过滤（Studio 端），SQL 参数化查询（SQLite） |
| 权限边界 | Pipeline 操作需先获取书籍锁 |
| LLM 安全 | Prompt 注入防护，输出验证 |

---

## 7. 测试策略

| 层级 | 框架 | 覆盖范围 |
|------|------|----------|
| 单元测试 | Vitest | 每个 Agent、Pipeline 操作、State Reducer、Quality 引擎 |
| 集成测试 | Vitest | PipelineRunner 完整链路、State 不可变更新 |
| E2E 测试 | Playwright | 书籍创建 → 写章 → 审计 → 导出 完整流程 |
| 性能测试 | Vitest benchmark | 单章生成时间、SQLite 查询性能 |

**关键测试文件：**
- `pipeline-runner.test.ts` — 端到端流水线
- `fast-draft.test.ts` — 轻量草稿单次调用 + 草稿转正流程 + 上下文漂移防护
- `upgrade-draft.test.ts` — 上下文漂移检测 + versionToken 对比 + ScenePolisher.regenerate()
- `state-reducer.test.ts` — 不可变状态更新
- `hook-governance.test.ts` — 伏笔全生命周期 + 人工意图声明 + dormant 状态 + 惊群平滑
- `hook-agenda.test.ts` — 逾期检测跳过 dormant 伏笔和窗口期内伏笔 + onWake 触发
- `ai-detector.test.ts` — 9 类检测准确性
- `runtime-state-store.test.ts` — 状态持久化
- `repair-strategy.test.ts` — 4 种策略决策正确性
- `length-normalizer.test.ts` — 字数归一化安全网
- `audit-tier-classifier.test.ts` — 33 维三级分类 + 单维重试 + 阻断级降级
- `quality-baseline.test.ts` — 基线快照 + 漂移检测 + exclude_from_baseline 隔离
- `revision-loop.test.ts` — accept_with_warnings + 污染隔离 + 连续降级计数
- `reorg-lock.test.ts` — reorg.lock 互斥 + .reorg_in_progress 哨兵 + staging 原子提交
- `session-recovery.test.ts` — WAL 原子回滚 + 残留清理 + 哨兵阻止误判
