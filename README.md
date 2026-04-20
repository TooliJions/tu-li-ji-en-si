# CyberNovelist v7.0

> 本地优先 AI 写作系统 — 从灵感到成书的完整创作闭环

![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)
![Node](https://img.shields.io/badge/Node-%3E%3D20-green)
![Tests](https://img.shields.io/badge/Tests-448%20passing-brightgreen)
![License](https://img.shields.io/badge/License-Private-red)

---

## 简介

CyberNovelist 是面向长篇网络小说创作的 AI 写作系统。它融合了成熟的流水线架构与精细化的治理体系，支持从创意输入、大纲规划、章节创作、质量审计到 EPUB 导出的完整创作闭环。

**核心价值：**

- **全自动创作闭环** — 大纲 → 角色 → 规划 → 生成 → 审计 → 修订 → 持久化
- **一致性保障** — 33 维连续性审计 + 伏笔治理 + 真相文件，防止角色漂移
- **反 AI 味** — 9 类 AI 痕迹检测 + 4 种智能修复策略 + 文风仿写
- **本地优先** — 所有数据存储在本地文件系统 + SQLite，隐私安全
- **多模型路由** — 按 Agent 粒度配置不同 LLM 提供商，自动故障切换
- **人工意图优先** — 伏笔系统支持手动标注长线伏笔回收窗口

---

## 快速开始

### 环境要求

- Node.js >= 20
- pnpm >= 9

### 安装与启动

```bash
# 安装依赖
pnpm install

# 启动开发服务器（http://localhost:3000）
pnpm dev

# 构建
pnpm build

# 运行测试
pnpm test

# 完整验证（lint + typecheck + test + build）
pnpm verify
```

---

## 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                    交互层 (Interface)                         │
│  CyberNovelist Studio (React + Hono + SSE)                   │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────┼────────────────────────────────────┐
│                    核心引擎层 (Core Engine)                    │
│  PipelineRunner ← 唯一外部入口                                 │
│  ├── 22 个模块化 Agent                                         │
│  ├── LLM Provider + 模型路由 + 声誉系统                         │
│  ├── 5 层伏笔治理                                               │
│  ├── 9 类 AI 检测 + 4 种修复策略                                │
│  └── 3 层状态管理 + 原子事务                                    │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────┼────────────────────────────────────┐
│                    存储层 (Storage)                            │
│  文件系统 (books/) + SQLite (memory.db) + 快照备份             │
└─────────────────────────────────────────────────────────────┘
```

---

## Monorepo 结构

| 包 | 路径 | 说明 |
|----|------|------|
| `@cybernovelist/core` | `packages/core/` | 核心引擎：Agent 系统、流水线、状态管理、治理、质量 |
| `@cybernovelist/studio` | `packages/studio/` | Web 工作台：React 前端 + Hono API + SSE 推送 |

---

## Studio 页面

| 页面 | 路由 | 功能 |
|------|------|------|
| 仪表盘 | `/` | 统计卡片、书籍列表、最近活动、质量趋势 |
| 创建新书 | `/book-create` | 两步向导：基本信息 → 创作设置 |
| 书籍详情 | `/book/:bookId` | 快速操作、章节列表、合并/拆分/回滚 |
| 创作规划 | `/writing-plan?bookId=` | 步骤导航、章节规划、AI 辅助生成 |
| 正文创作 | `/writing?bookId=` | 快速试写、完整流水线、记忆透视 |
| 章节阅读 | `/book/:bookId/chapter/:num` | 编辑、审计、心流模式、污染隔离 |
| 守护进程 | `/daemon?bookId=` | 启停控制、智能间隔、配额保护 |
| 伏笔管理 | `/hooks?bookId=` | 概览卡片、伏笔列表、双轨视图 |
| 数据分析 | `/analytics?bookId=` | 字数统计、审计通过率、Token 用量 |
| 配置 | `/config` | 全局模型、Agent 路由、通知配置 |
| 真相文件 | `/truth-files?bookId=` | 世界状态、角色矩阵、情感弧线 |
| 提示词版本 | `/book/:bookId/prompts` | 版本列表、切换、对比 |
| 系统诊断 | `/doctor?bookId=` | 环境检查、会话恢复、一键修复 |

---

## API

RESTful JSON + SSE 推送，14 个模块 57 个端点。

- **基础路径：** `http://localhost:3000/api`
- **SSE 端点：** `http://localhost:3000/api/sse`

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

API 密钥存储在 `config.local.json`（已加入 `.gitignore`），不提交到版本控制。

支持以下 LLM 提供商：

| Provider | 模型示例 | 说明 |
|----------|----------|------|
| DashScope | qwen3.6-plus | 默认 Writer |
| OpenAI | gpt-4o | 默认 Auditor |
| Gemini | gemini-2.0 | 备用 |
| DeepSeek | deepseek-chat | 备用 |
| Local (Ollama) | qwen2.5:7b | 本地推理 |

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
| 单元测试 | Vitest | 448 个用例 |
| E2E 测试 | Playwright | 主流程 |

```bash
# 运行单元测试
pnpm test

# 运行 E2E 测试
pnpm test:e2e
```

---

## License

Private. 所有权利保留。
