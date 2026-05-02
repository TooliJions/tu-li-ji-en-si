# CyberNovelist v7.0 工程档案

> 版本: 2.0 | 日期: 2026-05-02 | 状态: 7 阶段流程瘦身后正式发布

---

## 1. 项目概述

**CyberNovelist v7.0** 是面向长篇网络小说创作的 **本地优先 AI 系统**,采用 TypeScript Monorepo 架构,把整个产品能力固化为 **7 阶段同步流程**:

```
① 灵感输入 → ② 规划 → ③ 总纲规划 → ④ 细纲规划 → ⑤ 章节正文 → ⑥ 质量检查 → ⑦ 导出
```

### 1.1 产品定位

| 维度 | 描述 |
|------|------|
| 目标用户 | 网文作者、写作爱好者 |
| 核心价值 | 7 阶段结构化流程、总纲全自动生成、细纲自给自足、质量保障、本地优先、多模型路由 |
| 技术路线 | TypeScript Monorepo + React + Hono + SQLite |

### 1.2 核心价值

1. **结构化创作流程** — 7 阶段层层推进,每步产物可单独修订
2. **总纲全自动生成** — 单 Agent 一次 LLM 调用产出三层 `StoryBlueprint`(meta + base + typeSpecific)
3. **细纲自给自足** — 每章预生成 `contextForWriter`,正文阶段直接消费,大幅减少 LLM 重复调用
4. **一致性保障** — 33 维连续性审计 + 9 类 AI 痕迹检测 + 4 种修复策略
5. **本地优先** — 所有数据存储在本地文件系统 + SQLite,隐私安全
6. **多模型路由** — 按 Agent 粒度配置不同 LLM 提供商,自动故障切换
7. **伏笔治理** — 5 层架构,支持人工意图声明和惊群平滑

---

## 2. 技术栈

| 领域 | 技术 | 说明 |
|------|------|------|
| 主语言 | TypeScript | 类型安全,Zod 校验 + 编译时检查 |
| 包管理 | pnpm workspace | Monorepo 管理 |
| 测试 | Vitest + Playwright | 单元测试 + E2E 测试 |
| 状态存储 | SQLite(WAL 模式) | 本地优先,时序记忆 |
| Web 框架 | React + Hono + SSE | 前端 + 轻量 API + 实时推送 |
| 校验 | Zod | 运行时类型校验 |
| 代码质量 | ESLint + Prettier + Husky | 代码规范 + 提交钩子 |
| UI 组件 | Tailwind CSS + lucide-react + Recharts | 样式 + 图标 + 图表 |

---

## 3. 架构设计

### 3.1 三层架构

```
┌─────────────────────────────────────────────────────────┐
│                    交互层(Interface)                      │
│  CyberNovelist Studio(React + Hono + SSE,Vite)          │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────┼────────────────────────────────┐
│                    核心引擎层(Core Engine)                │
│  7 阶段工作流(workflow/contracts + services)            │
│  ① 灵感 → ② 规划 → ③ 总纲 → ④ 细纲 → ⑤ 正文 → ⑥ 质量 → ⑦ 导出│
│                                                          │
│  ├── Agent 系统(agents/) — 按阶段分组                     │
│  ├── PipelineRunner(pipeline/) — ⑤ 唯一入口              │
│  ├── 5 层伏笔治理(governance/) — 跨 ④⑤⑥                │
│  ├── 33 维审计 + 9 类 AI 检测(quality/) — ⑥             │
│  ├── LLM Provider(llm/) — 模型路由                       │
│  ├── 状态管理(state/) — 三层架构 + 原子事务               │
│  └── 导出器(export/) — EPUB / TXT / Markdown / 平台适配  │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────┼────────────────────────────────┐
│                    存储层(Storage)                        │
│  workflow-store(JSON)+ books/ + memory.db(SQLite)     │
└─────────────────────────────────────────────────────────┘
```

### 3.2 Monorepo 结构

```
cybernovelist/
├── packages/core/             # 核心引擎(纯业务逻辑)
│   └── src/
│       ├── workflow/
│       │   ├── contracts/     # 7 阶段契约(Zod schema)
│       │   └── services/      # 7 阶段服务层
│       ├── agents/            # 按阶段分组的 Agent
│       ├── pipeline/          # PipelineRunner + 章节正文编排
│       ├── governance/        # 5 层伏笔治理
│       ├── quality/           # 33 维审计 + 9 类 AI 检测
│       ├── state/             # 三层状态管理 + SQLite + 快照
│       ├── llm/               # Provider 抽象 + 模型路由
│       ├── export/            # EPUB / TXT / Markdown / 平台适配
│       ├── prompts/           # 提示词模板(版本化)
│       └── models/            # 顶层 Zod schemas
├── packages/studio/           # Web 工作台(React + Hono + SSE)
│   └── src/
│       ├── api/routes/        # 阶段路由
│       ├── pages/             # 前端页面(按阶段)
│       └── components/
├── docs/                      # 项目文档
├── pnpm-workspace.yaml
└── tsconfig.json
```

### 3.3 PipelineRunner — 章节正文唯一入口

`packages/core/src/pipeline/runner.ts` 是阶段 ⑤ 章节正文的唯一外部入口。

| 方法 | 说明 | 场景 |
|------|------|------|
| `writeNextChapter()` | 完整链路(15 步) | 正式创作 |
| `writeFastDraft()` | 快速试写(单次 LLM,<15s,不持久化) | 灵感探索 |
| `writeDraft()` | 草稿模式(跳过审计,<30s) | 快速产出 |
| `upgradeDraft()` | 草稿转正(含上下文漂移防护) | 草稿升级 |
| `mergeChapters()` | 章节合并 | 内容重组 |
| `splitChapter()` | 章节拆分 | 内容重组 |

**writeNextChapter 完整链路**(简化版):IntentDirector → ContextCard → 读细纲 contextForWriter → Executor → ScenePolisher → StyleRefiner → 33 维审计 + AI 检测 → RevisionLoop → MemoryExtractor → AtomicOps.commit。

### 3.4 Agent 系统(按阶段分组)

| 阶段 | Agent | 职责 |
|---|---|---|
| ③ 总纲 | `OutlineGenerator` | 单 Agent 一次产出三层 StoryBlueprint |
| ④ 细纲 | `DetailedOutlineGenerator` | 卷骨架 + 逐卷 chapters + contextForWriter |
| ⑤ 正文 | `IntentDirector`、`ContextCard`、`Executor`、`ScenePolisher`、`StyleRefiner`、`ChapterPlanner`(降级)、`MemoryExtractor`、`StyleFingerprint`、`MarketInjector`、`Character`、`EntityRegistry`、`ChapterSummarizer`、`SummaryCompressor` | 章节执行链路 |
| ⑥ 质量 | `QualityReviewer`、`FactChecker`、`EntityAuditor`、`StyleAuditor`、`TitleVoiceAuditor`、`ComplianceReviewer`、`HookAuditor`、`FatigueAnalyzer`、`AuditTierClassifier`、`SurgicalRewriter` | 审计与修复 |

### 3.5 伏笔治理 — 5 层架构(跨 ④⑤⑥)

```
HookPolicy(策略) → HookAgenda(排班) → HookGovernance(治理) → HookArbiter(仲裁) → HookLifecycle(生命周期)
```

**生命周期状态机**:`open → progressing → deferred → dormant → resolved/abandoned`

**dormant vs deferred**:
- `deferred` — 系统自动判定,仍在排班队列,参与逾期检测
- `dormant` — 作者手动标记,移出排班队列,不参与逾期检测,有预期回收窗口

**惊群平滑**:当单章唤醒伏笔数超过阈值(默认 3),系统按优先级分批唤醒,超出部分分配到后续章节。

### 3.6 质量检测 — 多引擎

**33 维审计三级分类**:
- 阻断级(12 项):必须通过,否则拒绝落盘
- 警告级(12 项):失败仍可继续,UI 强烈提示
- 建议级(9 项):失败仅记录,不阻断流程

**9 类 AI 痕迹检测**:套话、句式单调、语义重复、过度连接词、抽象描述、排比堆叠、格式化结构、同质化情感、缺乏感官细节。

**4 种修复策略**:局部替换 → 段落重排 → 节拍重写 → 整章重写。

**审计失败降级路径**:`maxRevisionRetries`(默认 2)→ `fallbackAction`(`accept_with_warnings` / `pause`)。

### 3.7 状态管理 — 三层架构

```
StateManager(锁/路径/索引)→ RuntimeStateStore(加载/构建/保存)→ StateReducer(不可变更新)
```

**关键设计原则**:
- 单章写入为原子事务:章节文件 → index.json → facts/hooks → 快照 → SQLite 提交
- 崩溃后通过 WAL 自动回滚未提交事务
- 不直接修改真相文件,Agent 输出结构化 JSON delta,Reducer 做不可变更新

### 3.8 LLM 模型路由

按 Agent 粒度配置不同 LLM 提供商,支持 DashScope / Claude / Gemini / DeepSeek / Local(Ollama),主 Provider 失败时自动切换至备用,失败计数影响声誉评分。

---

## 4. 存储设计

### 4.1 文件系统布局

```
books/{book-id}/
├── book.json                 # 书籍配置
├── story/
│   ├── workflow/             # 7 阶段工作流文档
│   │   ├── inspiration-seed.json
│   │   ├── planning-brief.json
│   │   ├── story-outline.json   # 三层 StoryBlueprint
│   │   ├── detailed-outline.json # 全书细纲 + contextForWriter
│   │   ├── quality-report.json
│   │   └── export-artifact.json
│   ├── state/                # 真相文件
│   │   ├── manifest.json
│   │   ├── current_state.json
│   │   ├── hooks.json
│   │   ├── chapter_summaries.json
│   │   ├── subplot_board.json
│   │   ├── emotional_arcs.json
│   │   └── character_matrix.json
│   ├── runtime/              # 运行时产物
│   ├── snapshots/            # 状态快照
│   └── memory.db             # SQLite 时序记忆
├── chapters/                 # 章节文件
└── index.json                # 章节索引
```

### 4.2 SQLite 核心表

| 表名 | 用途 | 关键字段 |
|------|------|----------|
| `chapters` | 章节元数据 | chapterNumber, title, wordCount, status, hash |
| `facts` | 事实碎片 | chapter, content, confidence, polluted |
| `hooks` | 伏笔状态 | id, status, plantedChapter, expectedResolution, priority |
| `entities` | 实体登记 | name, type, firstAppearance, attributes |
| `character_states` | 角色状态时序 | chapter, characterId, powerLevel, emotionalState |
| `audit_results` | 审计结果 | chapter, dimension, severity, message, fixed |
| `tokens_usage` | Token 用量 | chapter, agent, prompt_tokens, completion_tokens |
| `quality_baselines` | 质量基线快照 | metric, value, capturedAtChapter |

---

## 5. Web 工作台(Studio)

### 5.1 全局布局

非写作页面采用统一三栏布局:
- **左侧边栏**(220px):三级导航(主导航 / 二级导航 / 系统导航)
- **主内容区**(flex-1):页面主体
- **右侧面板**(320px,可选):上下文敏感信息

写作页面支持 **心流模式**:全屏暗化,隐藏侧边栏和面板,实体词汇虚线底纹标注,悬停显示上下文卡片。

### 5.2 页面清单(按阶段)

| # | 页面 | 路由 | 阶段 |
|---|------|------|------|
| 1 | Dashboard | `/` | - |
| 2 | BookCreate | `/book-create` | - |
| 3 | BookDetail | `/book/:bookId` | - |
| 4 | InspirationInput | `/inspiration?bookId=` | ① |
| 5 | PlanningBrief | `/planning-brief?bookId=` | ② |
| 6 | StoryOutline | `/story-outline?bookId=` | ③ |
| 7 | DetailedOutline | `/detailed-outline?bookId=` | ④ |
| 8 | Writing | `/writing?bookId=` | ⑤ |
| 9 | ChapterReader | `/book/:bookId/chapter/:num` | ⑤ |
| 10 | QualityGate | `/quality-gate?bookId=` | ⑥ |
| 11 | Analytics | `/analytics?bookId=` | ⑥ |
| 12 | TruthFiles | `/truth-files?bookId=` | ⑥ |
| 13 | EmotionalArcs | `/emotional-arcs?bookId=` | ⑥ |
| 14 | HookPanel | `/hooks?bookId=` | ④⑤⑥ |
| 15 | StyleManager | `/style?bookId=` | ⑤⑥ |
| 16 | ExportView | `/export?bookId=` | ⑦ |
| 17 | ConfigView | `/config` | - |
| 18 | PromptVersion | `/book/:bookId/prompts` | - |
| 19 | DoctorView | `/doctor?bookId=` | - |

### 5.3 API 路由模块(按阶段)

| 阶段 | 模块 | 路径前缀 | 端点数 |
|---|---|---|---|
| ① | inspiration | `/api/books/:bookId/inspiration` | 3 |
| ② | planning-brief | `/api/books/:bookId/planning-brief` | 3 |
| ③ | story-outline | `/api/books/:bookId/story-outline` | 4 |
| ④ | detailed-outline | `/api/books/:bookId/detailed-outline` | 4 |
| ⑤ | chapters / pipeline / writing | `/api/books/:bookId/{chapters,pipeline,writing}` | ~15 |
| ⑥ | quality / analytics / hooks / state | `/api/books/:bookId/{quality,analytics,hooks,state}` | ~15 |
| ⑦ | export | `/api/books/:bookId/export` | 4 |
| 基础 | books / config / system / prompts / context / sse / style / genres | 各自前缀 | ~15 |

---

## 6. 文档体系

| 文档 | 路径 | 内容 |
|------|------|------|
| 产品需求 | `docs/PRDs/CyberNovelist-PRD.md` | 7 阶段 PRD + NFR |
| 技术架构 | `docs/Architecture/architecture.md` | 7 阶段架构、数据流、存储 |
| UI 原型 | `docs/UI/ui-prototype.md` | 页面线框图 + 交互流程 |
| API 文档 | `docs/API/api-reference.md` | 7 阶段路由总览 |
| 开发任务 | `docs/Development/tasks.md` | 7 阶段原子任务清单 |

---

## 7. 安全设计

| 层面 | 措施 |
|------|------|
| API 密钥 | `config.local.json`,gitignore,不提交到版本控制 |
| 文件锁 | `open("wx")` 排他创建,消除并发写入竞态 |
| 导出路径 | 限制在项目目录内部,防止路径穿越 |
| 输入验证 | XSS 过滤(Studio 端),SQL 参数化查询(SQLite) |
| 权限边界 | Pipeline 操作需先获取书籍锁 |
| LLM 安全 | Prompt 注入防护,输出验证 |
| 崩溃恢复 | WAL 自动回滚 + 僵尸锁清理 |

---

## 8. 性能指标

| 指标 | 目标 | 说明 |
|------|------|------|
| 灵感输入保存 | <100ms | 仅 schema 校验 |
| 规划简报保存 | <100ms | 仅 schema 校验 |
| 总纲 AI 生成 | <30s | 单 Agent 一次 LLM 调用 |
| 细纲 AI 生成(50 章) | <60s | 卷骨架 + 逐卷补 chapters |
| 细纲 AI 生成(200 章) | <5min | 按卷分批 |
| 快速试写 | <15s | 单次 LLM 调用,不持久化 |
| 草稿模式 | <30s | 生成并持久化,跳过审计 |
| 完整创作 | 60-120s(云端)| 含审计修订 |
| 章节加载 | <500ms | 本地文件系统读取 |
| 上下文注入 | <80% token 上限 | 20+ 章后 |

---

## 9. 术语表

| 术语 | 含义 |
|------|------|
| 7 阶段流程 | 灵感输入 → 规划 → 总纲规划 → 细纲规划 → 章节正文 → 质量检查 → 导出 |
| StoryBlueprint | 总纲三层 schema(meta / base / typeSpecific) |
| DetailedOutline | 全书细纲,含 volumes / chapters / contextForWriter |
| contextForWriter | 每章自给自足写作上下文,正文阶段直接消费 |
| ArchitectureMode | 总纲架构模式(lotus_map / multiverse / org_ensemble / map_upgrade) |
| 真相文件 | 存储小说世界状态的结构化文件,是单一事实来源 |
| Agent | 具有特定职责的 AI 智能体 |
| 流水线 | 章节正文创作的内部阶段(草稿→审计→修订→持久化) |
| 伏笔 | 故事中埋设的悬念或未解冲突 |
| 审计 | 对已生成章节进行 33 维度连续性检查 |
| 快照 | 某一章节点时的完整状态备份 |
| 心流模式 | 全屏暗化的沉浸式写作模式 |
| 惊群 | 多个伏笔在同一章节同时达到唤醒条件 |
| 时间回溯拨盘 | 回滚操作的交互方式 |
| 质量基线 | 第 3 章完成后自动建立的基准质量水平 |

---

## 10. 运行指南

### 10.1 环境要求

- Node.js >= 20
- pnpm >= 9

### 10.2 安装与启动

```bash
pnpm install          # 安装依赖
pnpm build            # 编译 TypeScript
pnpm dev              # 启动开发服务器(localhost:3000)
pnpm test             # 运行单元测试
pnpm test:e2e         # 运行 E2E 测试
pnpm lint             # 代码检查
pnpm format           # 代码格式化
pnpm verify           # 完整验证(lint + typecheck + test + build)
```

### 10.3 配置

API 密钥存储在 `config.local.json`(已加入 `.gitignore`),不提交到版本控制。

---

*本档案配套 7 阶段流程瘦身重构后的 v7.0,最后更新:2026-05-02*
