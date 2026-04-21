# CyberNovelist v7.0

## What This Is

CyberNovelist 是面向长篇网络小说创作的 **本地优先 AI 写作系统**，提供从创意输入到 EPUB 导出的完整创作闭环。目标用户是网文作者、同人创作者和写作爱好者，核心能力是全自动创作流水线（大纲 → 角色 → 规划 → 生成 → 审计 → 修订 → 持久化）与 33 维连续性审计 + 伏笔治理，确保长篇小说的一致性和反 AI 味。

## Core Value

全自动产出风格一致、逻辑连贯的长篇小说章节，人工只需审核与微调。

## Current Milestone: v1.0 初始版本

**Goal:** 完成 CyberNovelist v7.0 核心功能，覆盖 PRD 中 P0 和部分 P1 需求

**Target features:**
- 项目初始化（书名/题材/大纲/角色/世界观）
- 章节创作流水线（草稿→审计→修订→持久化）
- 守护进程批量写章
- 33维质量审计 + AI痕迹检测
- 伏笔治理系统
- Studio Web 工作台
- EPUB/TXT 导出

## Current State (代码库真实状态)

**已完成（已验证）：**
- Core 引擎：1658/1658 测试通过，typecheck 全绿
- 22 个 Agent 模块（12704 行代码）
- PipelineRunner 完整 15 步链路
- 33 维审计 + 4 种修复策略
- 伏笔治理 5 层架构
- 守护进程调度（SmartInterval + QuotaGuard）
- StateManager + SQLite 时序库 + 快照回滚
- EPUB/TXT/Markdown 导出器
- 通知推送（Telegram/飞书/企微/Webhook）
- Hono API 14 路由模块
- Studio 前端 43 页面 + 36 组件

**遗留问题：**
- Studio 测试：472/475 通过，2 失败（sidebar.test.tsx 导入管理链接查找）
- 未提交文件：Dockerfile、E2E spec、多个新组件/页面
- 3 个编译错误（已修复，typecheck 全绿）

**技术栈确认：**
- TypeScript Monorepo（pnpm workspace）
- 状态存储：SQLite（WAL 模式）+ 文件系统
- Web 框架：React + Hono + SSE
- 校验：Zod
- 测试：Vitest（单元）+ Playwright（E2E）

## Constraints

- **[Tech stack]**: TypeScript + React + Hono + SQLite — 不可更换
- **[Local-first]**: 所有数据存储在本地，无云端依赖
- **[LLM provider]**: OpenAI 兼容接口，支持多模型路由和故障切换
- **[Performance]**: 快速试写 <15s，草稿模式 <30s

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| PipelineRunner 作为唯一外部入口 | 统一创作操作入口，简化 API 设计 | ✓ Verified |
| 三层状态架构 + 原子事务 | 保证崩溃恢复和数据一致性 | ✓ Verified |
| 伏笔治理 5 层架构 | 支持复杂叙事的长期追踪 | ✓ Verified |
| 多 LLM Provider（OpenAI/Claude/Ollama） | 兼容多种模型供应商 | ✓ Verified |
| Vite 内嵌 Hono 中间件 | 开发时无需单独启动 API 服务器 | ✓ Verified |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-21 — restructured based on actual codebase state*
