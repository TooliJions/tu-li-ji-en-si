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

## Context

- TypeScript Monorepo（pnpm workspace），core 包 + studio 包
- 状态存储：SQLite（WAL 模式）+ 文件系统
- Web 框架：React + Hono + SSE
- 已有完整的 PRD（11 阶段 124 任务，525h）和部分已实现代码
- 文档：`docs/PRDs/CyberNovelist-PRD.md`、`docs/Architecture/architecture.md`、`docs/API/api-reference.md`、`docs/Development/tasks.md`

## Constraints

- **[Tech stack]**: TypeScript + React + Hono + SQLite — 不可更换
- **[Local-first]**: 所有数据存储在本地，无云端依赖
- **[LLM provider]**: OpenAI 兼容接口，支持多模型路由和故障切换
- **[Performance]**: 快速试写 <15s，草稿模式 <30s

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| PipelineRunner 作为唯一外部入口 | 统一创作操作入口，简化 API 设计 | ✓ Good |
| 三层状态架构 + 原子事务 | 保证崩溃恢复和数据一致性 | ✓ Good |
| 伏笔治理 5 层架构 | 支持复杂叙事的长期追踪 | — Pending |

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
*Last updated: 2026-04-21 after v1.0 milestone initialization*
