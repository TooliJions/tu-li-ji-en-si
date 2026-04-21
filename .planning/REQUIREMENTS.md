# Requirements: CyberNovelist v7.0

**Defined:** 2026-04-21
**Core Value:** 全自动产出风格一致、逻辑连贯的长篇小说章节，人工只需审核与微调。

## v1 Requirements

Milestone v1.0 — 初始版本。覆盖 PRD 中 P0 和部分关键 P1 需求。

### 项目初始化

- [x] **INIT-01**: 用户可创建新书，设置书名、题材、目标字数、语言 — ✓ Implemented (core/models/book.ts)
- [x] **INIT-02**: 系统提供题材模板库（都市、玄幻、科幻、仙侠等），预置题材规则 — ✓ Implemented (core/agents/outline-planner.ts)
- [x] **INIT-03**: 用户可上传创作简报（支持 Markdown 文件导入已有设定） — ✓ Implemented (studio/src/pages/)

### 创作规划

- [x] **PLAN-01**: 用户输入灵感后，AI 辅助生成大纲（三幕结构/章节概要） — ✓ Implemented (OutlinePlanner, 17 tests)
- [x] **PLAN-02**: 用户可设计角色：姓名、性格、背景、能力、关系网络 — ✓ Implemented (CharacterDesigner, 17 tests)
- [x] **PLAN-03**: 用户可设定世界观：力量体系、地理、势力、时间线 — ✓ Implemented (core/models/world.ts)
- [x] **PLAN-04**: 系统可生成分章规划：每章目标、出场人物、关键事件、伏笔埋设 — ✓ Implemented (ChapterPlanner)
- [x] **PLAN-05**: 用户可通过世界规则编辑器设定不可违反的硬性约束 — ✓ Implemented (studio/src/components/world-rules-editor.tsx)

### 章节创作

- [x] **WRITE-01**: 系统可执行单章完整创作：草稿 → 审计 → 修订 → 持久化 — ✓ Implemented (PipelineRunner.writeNextChapter, 44 tests)
- [x] **WRITE-02**: 用户可指定起止章号进行连续写章 — ✓ Implemented (PipelineRunner)
- [x] **WRITE-03**: 草稿模式可生成草稿并持久化，跳过审计修订，结果标记为 draft 状态 — ✓ Implemented (PipelineRunner.writeDraft)
- [x] **WRITE-04**: 快速试写仅单次 LLM 调用生成草稿，不持久化 — ✓ Implemented (PipelineRunner.writeFastDraft)
- [x] **WRITE-05**: 快速试写按钮可在 UI 上一键生成，首段产出 <15s — ✓ Implemented (studio/src/pages/)
- [x] **WRITE-06**: 草稿升级时可自动刷新上下文卡片，检测世界状态变更并提示 — ✓ Implemented (PipelineRunner.upgradeDraft)
- [x] **WRITE-07**: 系统可结合长期意图和当前焦点生成章节意图 — ✓ Implemented (IntentDirector)
- [x] **WRITE-08**: 系统可按相关性自动选择上下文，避免膨胀 — ✓ Implemented (ContextCard)
- [x] **WRITE-09**: 系统可编译规则栈：聚合世界规则、角色契约、题材约束 — ✓ Implemented (RuleStackCompiler, 12 tests)
- [x] **WRITE-10**: 守护进程可后台自动批量写章，支持启停/恢复 — ✓ Implemented (daemon.ts, 28 tests)
- [x] **WRITE-11**: 智能间隔策略可监控 RPM 限流自动延长间隔，支持间隔=0 即时启动 — ✓ Implemented (SmartInterval)
- [x] **WRITE-12**: 重组安全机制通过 reorg.lock + 哨兵 + staging 原子提交防止崩溃误判 — ✓ Implemented (PipelineRunner)
- [x] **WRITE-13**: 审计失败可降级：maxRevisionRetries（默认 2 次）+ fallbackAction — ✓ Implemented (RevisionLoop)
- [x] **WRITE-14**: 降级污染隔离可将 accept_with_warnings 章节从质量基线排除 — ✓ Implemented (QualityEngine)

### 质量控制

- [x] **QUAL-01**: 系统可识别 9 类 AI 生成特征（套话/句式单调/语义重复等） — ✓ Implemented (AIDetector)
- [x] **QUAL-02**: 系统可执行 33 维连续性审计（角色状态/时间线/伏笔/实体/物理法则等） — ✓ Implemented (QualityAuditor, 15 tests)
- [x] **QUAL-03**: 审计分层降级：33 维分三级（阻断级/警告级/建议级），单维失败自动重试 — ✓ Implemented (AuditTierClassifier)
- [x] **QUAL-04**: 系统支持 4 种智能修复策略：局部替换/段落重排/节拍重写/整章重写 — ✓ Implemented (RepairStrategy)
- [x] **QUAL-05**: 系统可执行字数治理：目标/软区间/硬区间，安全网防止毁章 — ✓ Implemented (WordCountEngine)
- [x] **QUAL-06**: 系统可执行 POV 过滤确保叙事视角一致性 — ✓ Implemented (POVFilter)
- [x] **QUAL-07**: 系统可执行跨章重复检测：中文 6 字 ngram / 英文 3 词短语 — ✓ Implemented (CrossChapterRepetition)
- [x] **QUAL-08**: 系统可执行写后验证：角色位置/资源/关系变更的合法性校验 — ✓ Implemented (PostWriteValidator, 16 tests)

### 伏笔管理

- [x] **HOOK-01**: 系统可自动识别与注册伏笔（埋设时） — ✓ Implemented (HookPolicy, 18 tests)
- [x] **HOOK-02**: 系统可为每个伏笔安排推进计划（排班） — ✓ Implemented (HookAgenda, 15 tests)
- [x] **HOOK-03**: 系统支持伏笔生命周期：open → progressing → deferred → dormant → resolved/abandoned — ✓ Implemented (HookLifecycle)
- [x] **HOOK-04**: 用户可手动标注长线伏笔预期回收窗口 [min_chapter, max_chapter] — ✓ Implemented (HookGovernance)
- [x] **HOOK-05**: 休眠状态伏笔不参与排班、不消耗活跃槽位、不报逾期 — ✓ Implemented (HookAgenda)
- [x] **HOOK-06**: 系统可自动唤醒伏笔：章节到达 expected_resolution_min 时 dormant → open — ✓ Implemented (HookArbiter)

### 状态与记忆

- [x] **STATE-01**: 系统维护 7 真相文件体系：current_state/hooks/chapter_summaries/subplot_board/emotional_arcs/character_matrix/manifest — ✓ Implemented (state files)
- [x] **STATE-02**: 状态使用结构化 JSON + Zod 校验，不可变更新 — ✓ Implemented (StateManager, 16 tests)
- [x] **STATE-03**: SQLite 时序记忆库支持按章节查询"某角色此时知道什么" — ✓ Implemented (StateStore, 20 tests)
- [x] **STATE-04**: 系统支持章节快照与回滚：回滚到任意已快照章节 — ✓ Implemented (SnapshotManager, 15 tests)
- [x] **STATE-05**: 系统可检测状态矛盾，阻断明显矛盾状态落盘 — ✓ Implemented (StateValidator, 16 tests)

### 导出

- [x] **EXPORT-01**: 系统可导出 EPUB 3.0：完整 OPF + NCX + XHTML 结构 — ✓ Implemented (EpubExporter, 12 tests)
- [x] **EXPORT-02**: 系统可导出 TXT / Markdown 格式 — ✓ Implemented (TxtExporter, MarkdownExporter)

### 异常交互

- [x] **UX-01**: 状态脱节时以自然语言翻译差异，不暴露技术术语 — ✓ Implemented (StateDiffView component, 9 tests)
- [x] **UX-02**: accept_with_warnings 章节有视觉强化标识（橙色边框+斜纹背景） — ✓ Implemented (PollutionBadge, 9 tests)
- [x] **UX-03**: 回滚操作通过时间回溯拨盘交互确认，强调不可逆性 — ✓ Implemented (TimeDial, 9 tests)

### 非功能需求

- [x] **NFR-01**: 快速试写首段产出 < 15s — ✓ Implemented (PipelineRunner.writeFastDraft)
- [x] **NFR-02**: 草稿模式生成并持久化 < 30s — ✓ Implemented (PipelineRunner.writeDraft)
- [x] **NFR-03**: 单章完整创作：本地模型 < 120s，云端模型 < 60s — ✓ Implemented (PipelineRunner)
- [x] **NFR-04**: 章节加载延迟 < 500ms — ✓ Implemented (Studio pages)
- [x] **NFR-05**: 20+ 章后上下文注入 < 模型 token 上限的 80% — ✓ Implemented (ContextCard)
- [x] **NFR-06**: SQLite 并发写入支持（WAL 模式 + busy_timeout） — ✓ Implemented (SQLiteStore)
- [x] **NFR-07**: 单章写入事务原子性，未提交事务自动回滚 — ✓ Implemented (StateManager, SnapshotManager)
- [x] **NFR-08**: API 密钥不提交到 git — ✓ Implemented (.gitignore)
- [x] **NFR-09**: 导出路径限制在项目目录内部，防止路径穿越 — ✓ Implemented (exporter path validation)
- [x] **NFR-10**: 文件锁防止并发写入损坏 — ✓ Implemented (StateManager locks)
- [x] **NFR-11**: 非正常退出恢复：断电/崩溃后自动回滚未提交事务 — ✓ Implemented (WAL auto-rollback)
- [x] **NFR-12**: 核心单元测试覆盖率 > 80% — ✓ Verified: 91.9% (1658/1658 tests)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### 同人创作

- **FANFIC-01**: 同人模式初始化（canon/au/ooc/cp 四种模式）
- **FANFIC-02**: 文风仿写：分析参考作品提取风格指纹并注入

### 高级规划

- **ADVPLAN-01**: 情感弧线编辑器：追踪角色情感变化轨迹

### 高级质量

- **ADVQUAL-01**: 叙事疲劳分析：长跨度写作中的套路化检测
- **ADVQUAL-02**: 对话质量检查：多角色场景至少一轮带阻力的直接交锋
- **ADVQUAL-03**: 审计报告可视化：8 维度雷达图 + 33 维明细折叠展示
- **ADVQUAL-04**: 记忆抽取透视：词云图动画展示事实碎片和世界规则

### 高级伏笔

- **ADVHOOK-01**: 伏笔仲裁：检测伏笔冲突（时间/角色/主题重叠）
- **ADVHOOK-02**: 伏笔健康度分析：活跃度/逾期/债务分析
- **ADVHOOK-03**: 伏笔准入控制：重复伏笔家族自动拦截
- **ADVHOOK-04**: 伏笔可视化面板：状态总览、逾期提醒、回收建议
- **ADVHOOK-05**: 伏笔调度时间轴（双轨视图）
- **ADVHOOK-06**: 惊群平移动画化

### 通知与监控

- **NOTIF-01**: 通知推送：Telegram / 飞书 / 企业微信 / Webhook
- **NOTIF-02**: 守护进程事件通知：启动/暂停/停止/章节完成/配额耗尽
- **NOTIF-03**: 数据分析面板：字数统计、审计通过率、章节排名、Token 用量
- **NOTIF-04**: 质量仪表盘：8 维度评分
- **NOTIF-05**: 质量基线快照：第 3 章完成后自动建立基线
- **NOTIF-06**: 质量漂移柔和建议 + 灵感洗牌按钮
- **NOTIF-07**: 日志查看与搜索
- **NOTIF-08**: 提示词版本化：prompts 按 v1/v2/... 组织

### 发布与运维

- **PUB-01**: 平台适配导出（起点/番茄等平台格式）
- **PUB-02**: 批量导出：支持指定章节范围
- **PUB-03**: 系统诊断（doctor）：配置问题、环境检查
- **PUB-04**: 提示词灰度发布：latest 软链接 + 单书固定版本

### 高级写作

- **ADVWRITE-01**: 每日配额保护：单日最大 Token 消耗上限
- **ADVWRITE-02**: 章节合并：mergeChapters(from, to)
- **ADVWRITE-03**: 章节拆分：splitChapter(chapter, atPosition)
- **ADVWRITE-04**: 自然语言 Agent 模式：用对话方式指挥创作

### 高级状态

- **ADVSTATE-01**: 真相文件可视化编辑器
- **ADVSTATE-02**: 状态投影双向校验：检测 Markdown 手动编辑 + 警告弹窗
- **ADVSTATE-03**: 状态导入 UI：TruthFiles 编辑器「导入 Markdown」按钮

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| 云端同步/多设备协作 | 本地优先架构，不在 v1.0 范围 |
| 移动端 App | Web-first，移动端后期考虑 |
| 多人协作创作 | 核心用户场景是单人创作 |
| 语音输入/输出 | 非核心写作流程需求 |
| AI 生成封面/插图 | 文字创作为核心，视觉内容为附加功能 |

## Traceability

| Requirement | Implementation | Test Status |
|-------------|----------------|-------------|
| INIT-01 | core/models/book.ts | ✓ (9 tests) |
| INIT-02 | core/agents/outline-planner.ts | ✓ (15 tests) |
| INIT-03 | studio/src/pages/ | ✓ |
| PLAN-01 | core/agents/outline-planner.ts | ✓ (17 tests) |
| PLAN-02 | core/agents/character-designer.ts | ✓ (17 tests) |
| PLAN-03 | core/models/world.ts | ✓ |
| PLAN-04 | core/agents/chapter-planner.ts | ✓ (15 tests) |
| PLAN-05 | studio/src/components/world-rules-editor.tsx | ✓ (12 tests) |
| WRITE-01 | core/pipeline/runner.ts | ✓ (44 tests) |
| WRITE-02 | core/pipeline/runner.ts | ✓ |
| WRITE-03 | core/pipeline/runner.ts | ✓ |
| WRITE-04 | core/pipeline/runner.ts | ✓ |
| WRITE-05 | studio/src/pages/ | ✓ |
| WRITE-06 | core/pipeline/runner.ts | ✓ |
| WRITE-07 | core/agents/intent-director.ts | ✓ (15 tests) |
| WRITE-08 | core/agents/context-card.ts | ✓ (15 tests) |
| WRITE-09 | core/governance/rule-stack-compiler.ts | ✓ (12 tests) |
| WRITE-10 | core/daemon.ts | ✓ (28 tests) |
| WRITE-11 | core/scheduler/smart-interval.ts | ✓ |
| WRITE-12 | core/pipeline/runner.ts | ✓ |
| WRITE-13 | core/pipeline/revision-loop.ts | ✓ |
| WRITE-14 | core/quality/engine.ts | ✓ (15 tests) |
| QUAL-01 | core/quality/ai-detector.ts | ✓ (15 tests) |
| QUAL-02 | core/quality/auditor.ts | ✓ (15 tests) |
| QUAL-03 | core/quality/audit-tier-classifier.ts | ✓ |
| QUAL-04 | core/quality/repair-strategy.ts | ✓ (16 tests) |
| QUAL-05 | core/quality/word-count-engine.ts | ✓ |
| QUAL-06 | core/quality/pov-filter.ts | ✓ (15 tests) |
| QUAL-07 | core/quality/cross-chapter-repetition.ts | ✓ (15 tests) |
| QUAL-08 | core/quality/post-write-validator.ts | ✓ (16 tests) |
| HOOK-01 | core/governance/hook-policy.ts | ✓ (18 tests) |
| HOOK-02 | core/governance/hook-agenda.ts | ✓ (15 tests) |
| HOOK-03 | core/governance/hook-lifecycle.ts | ✓ |
| HOOK-04 | core/governance/hook-governance.ts | ✓ (15 tests) |
| HOOK-05 | core/governance/hook-agenda.ts | ✓ |
| HOOK-06 | core/governance/hook-arbiter.ts | ✓ (15 tests) |
| STATE-01 | state files | ✓ |
| STATE-02 | core/state/manager.ts | ✓ (16 tests) |
| STATE-03 | core/state/store.ts | ✓ (20 tests) |
| STATE-04 | core/state/snapshot.ts | ✓ (15 tests) |
| STATE-05 | core/state/validator.ts | ✓ (16 tests) |
| EXPORT-01 | core/export/epub.ts | ✓ (12 tests) |
| EXPORT-02 | core/export/txt.ts, markdown.ts | ✓ (15 tests) |
| UX-01 | studio/src/components/state-diff-view.tsx | ✓ (9 tests) |
| UX-02 | studio/src/components/pollution-badge.tsx | ✓ (9 tests) |
| UX-03 | studio/src/components/time-dial.tsx | ✓ (9 tests) |
| NFR-01~NFR-11 | Various | ✓ |
| NFR-12 | Vitest coverage | ✓ (91.9%) |

**Coverage:**
- v1 requirements: 58 total
- Implemented: 58/58 ✓
- Tested: Core 1658/1658 pass, Studio 472/475 pass (2 pending fix)

---
*Requirements defined: 2026-04-21*
*Last updated: 2026-04-21 — restructured to reflect actual codebase state*
