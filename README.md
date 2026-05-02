# CyberNovelist v7.0

> 本地优先 AI 网络小说创作系统 — 灵感到成书的 7 阶段同步流程

![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)
![Node](https://img.shields.io/badge/Node-%3E%3D20-green)
![License](https://img.shields.io/badge/License-Private-red)

---

## 简介

CyberNovelist 是面向长篇网络小说创作的本地优先 AI 系统,采用 **7 阶段同步流程** 把创作从灵感推进到成书:

```
① 灵感输入  →  ② 规划  →  ③ 总纲规划  →  ④ 细纲规划  →  ⑤ 章节正文  →  ⑥ 质量检查  →  ⑦ 导出
inspiration   planning     outline       detailed       writing        quality       export
```

每个阶段都有独立的契约 schema、服务层、API 路由与前端页面,作者按顺序推进,前一阶段产出是后一阶段输入。

**核心价值**:

- **结构化创作流程** — 7 阶段层层推进,每步产物可单独修订
- **总纲全自动生成** — 单 Agent 一次 LLM 调用产出三层 `StoryBlueprint`(meta/base/typeSpecific)
- **细纲自给自足** — 每章预生成 `contextForWriter`,正文阶段直接消费,减少 LLM 调用
- **质量保障** — 33 维连续性审计 + 9 类 AI 痕迹检测 + 4 种修复策略
- **本地优先** — 所有数据存储在本地文件系统 + SQLite,隐私安全
- **多模型路由** — 按 Agent 粒度配置不同 LLM,自动故障切换
- **伏笔治理** — 5 层架构,支持人工意图声明和惊群平滑

---

## 快速开始

### 环境要求

- Node.js >= 20
- pnpm >= 9

### 安装与启动

```bash
# 安装依赖
pnpm install

# 启动开发服务器(http://localhost:3000)
pnpm dev

# 构建
pnpm build

# 运行测试
pnpm test

# 完整验证(lint + typecheck + test + build)
pnpm verify
```

---

## 7 阶段流程

| 阶段 | 主体契约 | 关键 Agent / 服务 | 入口路由 | 前端页面 |
|---|---|---|---|---|
| ① 灵感输入 | `InspirationSeed` | `DefaultInspirationService` | `/api/books/:bookId/inspiration` | `/inspiration?bookId=` |
| ② 规划 | `PlanningBrief` | `DefaultPlanningService` | `/api/books/:bookId/planning-brief` | `/planning-brief?bookId=` |
| ③ 总纲规划 | `StoryBlueprint`(三层) | `OutlineGenerator` | `/api/books/:bookId/story-outline` | `/story-outline?bookId=` |
| ④ 细纲规划 | `DetailedOutline` | `DetailedOutlineGenerator` | `/api/books/:bookId/detailed-outline` | `/detailed-outline?bookId=` |
| ⑤ 章节正文 | Chapter Markdown | `PipelineRunner` + 写作 Agent | `/api/books/:bookId/chapters/*` | `/writing?bookId=` |
| ⑥ 质量检查 | `QualityReport` | 33 维审计 + 9 类 AI 检测 | `/api/books/:bookId/quality` `/analytics` | `/quality-gate?bookId=` |
| ⑦ 导出 | `ExportArtifact` | EPUB / TXT / Markdown | `/api/books/:bookId/export` | `/export?bookId=` |

每个阶段细节见 [docs/PRDs/CyberNovelist-PRD.md](docs/PRDs/CyberNovelist-PRD.md)。

---

## 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                    交互层(Interface)                         │
│  CyberNovelist Studio(React + Hono + SSE)                    │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────┼────────────────────────────────────┐
│                    核心引擎层(Core Engine)                    │
│  7 阶段工作流契约与服务(workflow/)                             │
│  ├── 模块化 Agent 系统(agents/)                                │
│  ├── PipelineRunner(章节正文唯一入口)                          │
│  ├── LLM Provider + 模型路由 + 声誉系统                         │
│  ├── 5 层伏笔治理(governance/)                                  │
│  ├── 33 维审计 + 9 类 AI 检测(quality/)                         │
│  └── 3 层状态管理 + 原子事务(state/)                            │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────┼────────────────────────────────────┐
│                    存储层(Storage)                            │
│  文件系统(books/)+ SQLite(memory.db)+ 快照备份                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Monorepo 结构

| 包 | 路径 | 说明 |
|----|------|------|
| `@cybernovelist/core` | `packages/core/` | 核心引擎:7 阶段契约、Agent 系统、流水线、状态管理、治理、质量、导出 |
| `@cybernovelist/studio` | `packages/studio/` | Web 工作台:React 前端 + Hono API + SSE 推送 |

---

## Studio 页面(按阶段)

| 页面 | 路由 | 阶段 | 功能 |
|------|------|------|------|
| 仪表盘 | `/` | - | 书籍列表、最近活动、质量趋势 |
| 创建新书 | `/book-create` | - | 基本信息 + 题材选择 |
| 书籍详情 | `/book/:bookId` | - | 快速操作、章节列表、合并/拆分/回滚 |
| 灵感输入 | `/inspiration?bookId=` | ① | 原始灵感、题材、主题、冲突、基调、约束 |
| 规划简报 | `/planning-brief?bookId=` | ② | 受众、题材策略、风格、字数、禁忌 |
| 总纲规划 | `/story-outline?bookId=` | ③ | AI 自动生成三层蓝图,可手动修订 |
| 细纲规划 | `/detailed-outline?bookId=` | ④ | 全书章节地图,每章 contextForWriter |
| 章节正文 | `/writing?bookId=` | ⑤ | 快速试写、完整流水线、心流模式 |
| 章节阅读 | `/book/:bookId/chapter/:num` | ⑤ | 编辑、审计、污染隔离 |
| 质量门 | `/quality-gate?bookId=` | ⑥ | 33 维审计 + AI 痕迹评分 |
| 数据分析 | `/analytics?bookId=` | ⑥ | 字数统计、审计通过率、Token 用量 |
| 真相档案 | `/truth-files?bookId=` | ⑥ | 世界状态、角色矩阵、设定冲突 |
| 情绪弧线 | `/emotional-arcs?bookId=` | ⑥ | 章节情绪追踪 |
| 伏笔总览 | `/hooks?bookId=` | ④⑤⑥ | 双轨视图、生命周期 |
| 风格管理 | `/style?bookId=` | ⑤⑥ | 风格指纹、文风仿写 |
| 导出 | `/export?bookId=` | ⑦ | EPUB / TXT / Markdown / 平台适配 |
| 配置 | `/config` | - | 全局模型、Agent 路由 |
| 提示词版本 | `/book/:bookId/prompts` | - | 版本列表、切换、对比 |
| 系统诊断 | `/doctor?bookId=` | - | 环境检查、会话恢复、一键修复 |

---

## API

RESTful JSON + SSE 推送,按 7 阶段组织路由模块。

- **基础路径**:`http://localhost:3000/api`
- **SSE 端点**:`/api/books/:bookId/sse`

详细文档见 [docs/API/api-reference.md](docs/API/api-reference.md)。

---

## 文档

| 文档 | 路径 |
|------|------|
| 产品需求 | [docs/PRDs/CyberNovelist-PRD.md](docs/PRDs/CyberNovelist-PRD.md) |
| 技术架构 | [docs/Architecture/architecture.md](docs/Architecture/architecture.md) |
| API 文档 | [docs/API/api-reference.md](docs/API/api-reference.md) |
| UI 原型 | [docs/UI/ui-prototype.md](docs/UI/ui-prototype.md) |
| 工程档案 | [docs/ENGINEERING.md](docs/ENGINEERING.md) |
| 开发任务 | [docs/Development/tasks.md](docs/Development/tasks.md) |

---

## 配置

API 密钥存储在 `config.local.json`(已加入 `.gitignore`),不提交到版本控制。

支持以下 LLM 提供商:

| Provider | 模型示例 | 说明 |
|----------|----------|------|
| DashScope | qwen3.6-plus | 默认 Writer |
| Claude | claude-sonnet-4-6 | 默认 Auditor |
| Gemini | gemini-2.0 | 备用 |
| DeepSeek | deepseek-chat | 备用 |
| Local(Ollama)| qwen2.5:7b | 本地推理 |

---

## 开发

```bash
# 代码检查
pnpm lint
pnpm lint:fix

# 格式化
pnpm format
pnpm format:fix

# 类型检查
pnpm typecheck

# 单包测试
cd packages/core && pnpm test
cd packages/studio && pnpm test
```

提交时 Husky 会自动运行 ESLint 和 Prettier 格式化。

---

## 测试

| 类型 | 框架 | 覆盖 |
|------|------|------|
| 单元测试 | Vitest | core + studio |
| E2E 测试 | Playwright | 7 阶段全流程 |

```bash
# 运行单元测试
pnpm test

# 运行 E2E 测试
pnpm test:e2e

# 完整验证
pnpm verify
```

---

## License

Private. 所有权利保留。
