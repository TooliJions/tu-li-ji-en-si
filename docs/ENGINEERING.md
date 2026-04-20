# CyberNovelist v7.0 工程档案

> 版本: 1.0 | 日期: 2026-04-20 | 状态: 开发中

---

## 1. 项目概述

**CyberNovelist v7.0** 是面向长篇网络小说创作的 **本地优先 AI 写作系统**，采用 TypeScript Monorepo 架构，融合成熟流水线架构与精细化治理体系，提供从创意输入到 EPUB 导出的完整创作闭环。

### 1.1 产品定位

| 维度 | 描述 |
|------|------|
| 目标用户 | 网文作者、同人创作者、写作爱好者 |
| 核心价值 | 全自动创作闭环、一致性保障、反 AI 味、本地优先、多模型路由、人工意图优先 |
| 技术路线 | TypeScript Monorepo + React + Hono + SQLite |

### 1.2 六大核心价值

1. **全自动创作闭环**：大纲 → 角色 → 规划 → 生成 → 审计 → 修订 → 持久化
2. **一致性保障**：33 维连续性审计 + 伏笔治理 + 真相文件，防止角色漂移和时间线冲突
3. **反 AI 味**：9 类 AI 痕迹检测 + 4 种智能修复策略 + 文风仿写
4. **本地优先**：所有数据存储在本地文件系统 + SQLite，隐私安全
5. **多模型路由**：按 Agent 粒度配置不同 LLM 提供商，自动故障切换
6. **人工意图优先**：伏笔系统支持手动标注长线伏笔回收窗口，系统尊重作者叙事节奏

---

## 2. 技术栈

| 领域 | 技术 | 说明 |
|------|------|------|
| 主语言 | TypeScript | 类型安全，Zod 校验 + 编译时检查 |
| 包管理 | pnpm workspace | Monorepo 管理 |
| 测试 | Vitest + Playwright | 单元测试 + E2E 测试 |
| 状态存储 | SQLite（WAL 模式） | 本地优先，时序记忆 |
| Web 框架 | React + Hono + SSE | 前端 + 轻量 API + 实时推送 |
| 校验 | Zod | 运行时类型校验 |
| 代码质量 | ESLint + Prettier + Husky | 代码规范 + 提交钩子 |
| UI 组件 | Tailwind CSS + lucide-react + Recharts | 样式 + 图标 + 图表 |

---

## 3. 架构设计

### 3.1 三层架构

```
┌─────────────────────────────────────────────────────────┐
│                    交互层 (Interface)                      │
│  CyberNovelist Studio (React + Hono + SSE, Vite)         │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────┼────────────────────────────────┐
│                    核心引擎层 (Core Engine)                │
│  PipelineRunner ← 唯一外部入口                              │
│  ├── Agent 层 (22 个模块化 Agent)                          │
│  ├── LLM Provider 层 + 模型路由 + 声誉系统                  │
│  ├── 治理层 (Governance): 5 层伏笔治理                      │
│  ├── 质量层 (Quality): 9 类 AI 检测 + 4 种修复策略          │
│  └── 状态层 (State): 三层架构 + 原子事务                    │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────┼────────────────────────────────┐
│                    存储层 (Storage)                        │
│  文件系统 (books/) + SQLite (memory.db) + 快照备份         │
└─────────────────────────────────────────────────────────┘
```

### 3.2 Monorepo 结构

```
cybernovelist/
├── packages/core/          # 核心引擎（纯业务逻辑，无 UI 依赖）
│   └── src/
│       ├── agents/          # 22 个模块化 Agent（继承 BaseAgent）
│       ├── pipeline/        # PipelineRunner + 原子操作 + 修订循环
│       ├── state/           # 状态管理（Manager/Store/Reducer/SQLite/快照/恢复）
│       ├── governance/      # 伏笔治理（Policy/Agenda/Governance/Arbiter/Lifecycle）
│       ├── quality/         # 质量检测（AI 检测/修复策略/基线/审计分类）
│       ├── llm/             # Provider 抽象 + 模型路由
│       ├── scheduler/       # 守护进程调度（SmartInterval + QuotaGuard）
│       ├── daemon.ts        # 守护进程主入口
│       ├── export/          # 导出器（EPUB/TXT/Markdown/平台适配）
│       ├── notify/          # 通知推送（Telegram/飞书/企微/Webhook）
│       ├── prompts/         # 提示词模板（版本化 v1/v2/latest）
│       ├── fanfic.ts        # 同人创作模式
│       └── models/          # Zod schemas
├── packages/studio/         # Web 工作台（React + Hono + SSE）
│   └── src/
│       ├── api/routes/      # 14 个 Hono 路由模块
│       ├── pages/           # 14 个前端页面
│       └── components/      # 可复用组件
├── docs/                    # 项目文档
├── pnpm-workspace.yaml
└── tsconfig.json
```

### 3.3 PipelineRunner — 创作流水线

所有创作操作通过 `PipelineRunner` 协调，它是系统外部唯一入口。

| 方法 | 说明 | 场景 |
|------|------|------|
| `writeNextChapter()` | 完整链路（15 步） | 正式创作 |
| `writeFastDraft()` | 快速试写（单次 LLM 调用，<15s，不持久化） | 灵感探索 |
| `writeDraft()` | 草稿模式（跳过审计，标记 draft，<30s） | 快速产出 |
| `upgradeDraft()` | 草稿转正（含上下文漂移防护检查） | 草稿升级 |
| `mergeChapters()` | 章节合并 | 内容重组 |
| `splitChapter()` | 章节拆分 | 内容重组 |

**writeNextChapter 完整链路（15 步）：**

1. 书籍加锁 → 2. 确保控制文档 → 3. 准备输入 → 4. 生成治理产物 → 5. 记忆抽取 → 6. 草稿生成（多 Agent） → 7. 字数归一化（审计前） → 8. 33 维审计 → 9. AI 痕迹检测 → 10. 修复策略决策 → 11. 执行修订 → 12. 字数归一化（修订后） → 13. 构建持久化输出 → 14. 状态矛盾校验 → 15. 持久化

### 3.4 Agent 系统 — 22 个模块

| 类型 | Agent | 温度 |
|------|-------|------|
| 规划类 | OutlinePlanner, CharacterDesigner, ChapterPlanner | 0.7-0.9 |
| 执行类 | ChapterExecutor, ContextCard, ScenePolisher, StyleRefiner, IntentDirector, MemoryExtractor | 0.7-0.9 |
| 审计类 | QualityReviewer, FactChecker, EntityAuditor, StyleAuditor, TitleVoiceAuditor, ComplianceReviewer, HookAuditor, FatigueAnalyzer | 0.1-0.3 |
| 特殊类 | AuditTierClassifier, MarketInjector, StyleFingerprint, EntityRegistry, SurgicalRewriter | 0.1-0.5 |

### 3.5 伏笔治理 — 5 层架构

```
HookPolicy（策略） → HookAgenda（排班） → HookGovernance（治理） → HookArbiter（仲裁） → HookLifecycle（生命周期）
```

**生命周期状态机**：open → progressing → deferred → dormant → resolved/abandoned

**dormant vs deferred 区别**：
- deferred：系统自动判定，仍在排班队列，参与逾期检测
- dormant：作者手动标记，移出排班队列，不参与逾期检测，有预期回收窗口

**惊群平滑**：当单章唤醒伏笔数超过阈值（默认 3），系统按优先级分批唤醒，超出部分分配到后续章节。

### 3.6 质量检测 — 多引擎

**33 维审计三级分类**：
- 阻断级（12 项）：必须通过，否则拒绝落盘
- 警告级（12 项）：失败仍可继续，UI 强烈提示
- 建议级（9 项）：失败仅记录，不阻断流程

**9 类 AI 痕迹检测**：套话、句式单调、语义重复、元叙事、意象重复、逻辑跳跃、情感虚假、描述空洞、分析报告

**4 种修复策略**：局部替换 → 段落重排 → 节拍重写 → 整章重写

**审计失败降级路径**：maxRevisionRetries（默认 2） → fallbackAction（accept_with_warnings / pause）

### 3.7 状态管理 — 三层架构

```
StateManager（锁/路径/索引） → RuntimeStateStore（加载/构建/保存） → StateReducer（不可变更新）
```

**关键设计原则**：
- 单章写入为原子事务：章节文件 → index.json → facts/hooks → 快照 → SQLite 提交
- 崩溃后通过 WAL 自动回滚未提交事务
- 不直接修改真相文件，Agent 输出结构化 JSON delta，Reducer 做不可变更新

### 3.8 LLM 模型路由

按 Agent 粒度配置不同 LLM 提供商，支持 DashScope/Gemini/OpenAI/DeepSeek/Local(Ollama)，主 Provider 失败时自动切换至备用，失败计数影响声誉评分。

---

## 4. 存储设计

### 4.1 文件系统布局

```
books/{book-id}/
├── book.json                 # 书籍配置
├── story/
│   ├── state/                # 结构化状态（JSON 权威来源）
│   │   ├── manifest.json
│   │   ├── current_state.json
│   │   ├── hooks.json
│   │   ├── chapter_summaries.json
│   │   ├── subplot_board.json
│   │   ├── emotional_arcs.json
│   │   └── character_matrix.json
│   ├── runtime/              # 运行时产物
│   ├── author_intent.md      # 长期作者意图
│   ├── current_focus.md      # 当前阶段关注
│   ├── snapshots/            # 状态快照
│   └── memory.db             # SQLite 时序记忆
├── chapters/                 # 章节文件
└── index.json                # 章节索引
```

### 4.2 SQLite 核心表

| 表名 | 用途 | 关键字段 |
|------|------|----------|
| facts | 事实表 | chapter, entity_type, entity_name, fact_text, valid_from, valid_until, confidence |
| chapter_summaries | 章节摘要 | chapter, summary, key_events, state_changes |
| hooks | 伏笔表 | planted_ch, description, status, priority, expected_resolution_min/max, is_dormant |
| memory_snapshots | 记忆快照 | chapter, snapshot(JSON) |

---

## 5. Web 工作台（Studio）

### 5.1 全局布局

非写作页面采用统一三栏布局：
- **左侧边栏**（220px）：三级导航分组（主导航 5 项 / 二级导航 5 项 / 系统导航 3 项）
- **主内容区**（flex-1）：页面主体内容
- **右侧面板**（320px，可选）：上下文敏感信息

写作页面支持**心流模式**：全屏暗化，隐藏侧边栏和面板，实体词汇虚线底纹标注，悬停显示上下文卡片。

### 5.2 页面清单

| # | 页面 | 路由 | 核心功能 |
|---|------|------|----------|
| 1 | Dashboard | `/` | 仪表盘：统计卡片、书籍列表表格、最近活动、质量趋势图 |
| 2 | BookCreate | `/book-create` | 创建新书：两步向导（基本信息 → 创作设置） |
| 3 | BookDetail | `/book/:bookId` | 书籍详情：单行标题头、快速操作、章节列表表格、合并/拆分/回滚 |
| 4 | WritingPlan | `/writing-plan?bookId=` | 创作规划：步骤导航、章节列表、详细规划表单、AI 辅助生成 |
| 5 | Writing | `/writing?bookId=` | 正文创作：快速试写、完整流水线进度、记忆透视、质量仪表盘 |
| 6 | ChapterReader | `/book/:bookId/chapter/:num` | 章节阅读：两栏布局、编辑/审计/心流、污染隔离横幅 |
| 7 | DaemonControl | `/daemon?bookId=` | 守护进程：启停控制、智能间隔配置、配额保护、事件日志 |
| 8 | HookPanel | `/hooks?bookId=` | 伏笔管理：5 张概览卡片、伏笔列表、双轨视图（小地图 + 放大镜） |
| 9 | Analytics | `/analytics?bookId=` | 数据分析：字数柱状图、审计通过率、Token 用量、AI 痕迹趋势 |
| 10 | ConfigView | `/config` | 配置：全局模型、Agent 路由、备用 Provider、通知配置 |
| 11 | TruthFiles | `/truth-files?bookId=` | 真相文件：7 个标签页（当前状态/伏笔/章节摘要/角色矩阵等） |
| 12 | PromptVersion | `/book/:bookId/prompts` | 提示词版本：版本列表、切换、对比 |
| 13 | DoctorView | `/doctor?bookId=` | 系统诊断：环境检查、会话恢复检查、一键修复 |

### 5.3 API 路由模块

| 模块 | 路径 | 端点数 |
|------|------|--------|
| 书籍管理 | `/api/books` | 4 |
| 章节管理 | `/api/chapters` | 6 |
| 创作流水线 | `/api/pipeline` | 6 |
| 状态管理 | `/api/state` | 5 |
| 守护进程 | `/api/daemon` | 4 |
| 伏笔管理 | `/api/hooks` | 4 |
| 数据分析 | `/api/analytics` | 3 |
| 配置 | `/api/config` | 3 |
| 导出 | `/api/export` | 3 |
| 系统诊断 | `/api/system` | 3 |
| 提示词版本 | `/api/prompts` | 2 |
| 上下文查询 | `/api/context` | 2 |
| 文风管理 | `/api/style` | 2 |
| 同人模式 | `/api/fanfic` | 2 |
| SSE 推送 | `/api/sse` | 1 连接 |

---

## 6. 文档体系

| 文档 | 路径 | 内容 |
|------|------|------|
| 产品需求 | `docs/PRDs/CyberNovelist-PRD.md` | 完整需求（93 个 PRD + 15 个 NFR） |
| 技术架构 | `docs/Architecture/architecture.md` | 架构设计、数据流、存储设计 |
| UI 原型 | `docs/UI/ui-prototype.md` | 13 个页面线框图 + 交互流程 |
| API 文档 | `docs/API/api-reference.md` | 14 个模块 57 个端点 |
| 开发任务 | `docs/Development/tasks.md` | 124 个原子任务，11 个阶段 |
| 修复计划 | `docs/Development/remediation-plan.md` | 修复计划 |
| 测试报告 | `docs/Development/full-function-test-report.md` | 功能测试报告 |

---

## 7. 开发进展

### 7.1 总体进度

| 阶段 | 任务数 | 状态 |
|------|--------|------|
| 阶段 1：基础设施 | 8 | ✅ 完成 |
| 阶段 2：状态层 | 12 | ✅ 完成 |
| 阶段 3：核心 Agent | 22 | ✅ 完成 |
| 阶段 4：流水线编排 | 13 | ✅ 完成 |
| 阶段 5：治理层 | 10 | ✅ 完成 |
| 阶段 6：质量层 | 12 | ✅ 完成 |
| 阶段 6 补：守护进程调度 | 4 | ✅ 完成 |
| 阶段 7：Studio 工作台 | 27 | ✅ 完成 |
| 阶段 8：导出与通知 | 5 | ✅ 完成 |
| 阶段 9：异常交互 | 4 | ✅ 完成 |
| 阶段 10：测试与优化 | 8 | ✅ 完成 |

**总计：124/124 任务完成**

### 7.2 测试覆盖

| 指标 | 数值 |
|------|------|
| 测试文件 | 49 个 |
| 测试用例 | 448 个 |
| 通过率 | 100% |
| TypeScript 编译 | 零错误 |

### 7.3 关键里程碑

| 里程碑 | 日期 | 状态 |
|--------|------|------|
| M1: 基础设施就绪 | 2026-04-18 | ✅ 达成 |
| M2: 核心引擎就绪 | 2026-04-19 | ✅ 达成 |
| M3: Studio 工作台上线 | 2026-04-19 | ✅ 达成 |
| M4: UI 页面对齐完成 | 2026-04-20 | ✅ 达成 |

---

## 8. 安全设计

| 层面 | 措施 |
|------|------|
| API 密钥 | config.local.json，gitignore，不提交到版本控制 |
| 文件锁 | `open("wx")` 排他创建，消除并发写入竞态 |
| 导出路径 | 限制在项目目录内部，防止路径穿越 |
| 输入验证 | XSS 过滤（Studio 端），SQL 参数化查询（SQLite） |
| 权限边界 | Pipeline 操作需先获取书籍锁 |
| LLM 安全 | Prompt 注入防护，输出验证 |
| 崩溃恢复 | WAL 自动回滚 + 僵尸锁清理 |

---

## 9. 性能指标

| 指标 | 目标 | 说明 |
|------|------|------|
| 快速试写 | <15s | 单次 LLM 调用，不持久化 |
| 草稿模式 | <30s | 生成并持久化，跳过审计 |
| 完整创作 | 60-120s（云端） | 含审计修订 |
| 章节加载 | <500ms | 本地文件系统读取 |
| 上下文注入 | <80% token 上限 | 20+ 章后 |
| 守护进程间隔 | 动态 0-300s | RPM 监控自适应 |
| 配额保护 | 1s 内暂停 | 到达 Token 上限 |

---

## 10. 术语表

| 术语 | 含义 |
|------|------|
| 真相文件 | 存储小说世界状态的结构化文件，是单一事实来源 |
| Agent | 具有特定职责的 AI 智能体 |
| 流水线 | 按顺序执行的创作阶段 |
| 伏笔 | 故事中埋设的悬念或未解冲突 |
| 审计 | 对已生成章节进行 33 维度连续性检查 |
| 守护进程 | 后台自动写章服务 |
| 快照 | 某一章节点时的完整状态备份 |
| 心流模式 | 全屏暗化的沉浸式写作模式 |
| 惊群 | 多个伏笔在同一章节同时达到唤醒条件 |
| 时间回溯拨盘 | 回滚操作的交互方式 |
| 质量基线 | 第 3 章完成后自动建立的基准质量水平 |

---

## 11. 运行指南

### 11.1 环境要求

- Node.js >= 20
- pnpm >= 9

### 11.2 安装与启动

```bash
pnpm install          # 安装依赖
pnpm build            # 编译 TypeScript
pnpm dev              # 启动开发服务器（localhost:3000）
pnpm test             # 运行单元测试
pnpm test:e2e         # 运行 E2E 测试
pnpm lint             # 代码检查
pnpm format           # 代码格式化
```

### 11.3 配置

API 密钥存储在 `config.local.json`（已加入 .gitignore），不提交到版本控制。

---

*本档案基于项目源码及文档生成，最后更新：2026-04-20*
