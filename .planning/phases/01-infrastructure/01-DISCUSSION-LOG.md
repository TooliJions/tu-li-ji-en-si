# Phase 1: 基础设施 - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-21
**Phase:** 01-infrastructure
**Areas discussed:** LLM Provider 抽象层, Zod Schemas 完整度, 构建与测试配置, 开发体验工具链

---

## LLM Provider 抽象层

| Option | Description | Selected |
|--------|-------------|----------|
| 仅 OpenAI 兼容接口 | 当前只有 OpenAI 兼容接口，v1.0 只支持这一种 | |
| OpenAI + Claude 双提供商 | 额外支持 Claude API | |
| 多提供商全支持（推荐） | OpenAI 兼容 + Claude + Ollama 本地模型 | ✓ |

**User's choice:** 多提供商全支持
**Notes:** Phase 1 就需要三种提供商都支持。

### 流式输出

| Option | Description | Selected |
|--------|-------------|----------|
| 需要流式支持（推荐） | Phase 1 需要支持流式输出，Studio SSE 推送依赖它 | ✓ |
| Phase 1 不需要 | 流式留给 Studio 阶段 | |

**User's choice:** 需要流式支持

---

## Zod Schemas 完整度

| Option | Description | Selected |
|--------|-------------|----------|
| 现有已够用 | 已有 Book/Chapter/Character/Hook/WorldRule/Manifest 等 | |
| 需要补充 Pipeline/Quality/Agent schemas（推荐） | 补充流水线、质量、Agent 相关 schemas | ✓ |

**User's choice:** 需要补充 Pipeline/Quality/Agent schemas

---

## 构建与测试配置

### CI 平台

| Option | Description | Selected |
|--------|-------------|----------|
| GitHub Actions（推荐） | push/PR 时自动 lint + typecheck + test + build | ✓ |
| 暂不配置 CI | 本地验证即可 | |

**User's choice:** GitHub Actions

### 构建工具

| Option | Description | Selected |
|--------|-------------|----------|
| 继续用 tsc（推荐） | 保持当前 tsc --build，类型安全 | ✓ |
| 改用 tsup/esbuild | 编译更快，支持 bundling | |

**User's choice:** 继续用 tsc

---

## 开发体验工具链

| Option | Description | Selected |
|--------|-------------|----------|
| Phase 1 不需要（推荐） | 基础设施能跑通即可 | ✓ |
| 需要 changesets | 管理包版本和 changelog | |

**User's choice:** Phase 1 不需要

---

## Claude's Discretion

- 流式输出的具体实现细节
- GitHub Actions 工作流的具体 YAML 结构
- 新增 schemas 的字段命名和细节结构

## Deferred Ideas

- changesets 版本管理 — 后期发布 npm 包时需要
- API 文档自动生成（Typedoc） — 后期需要
- tsup/esbuild 打包优化 — 如果 dist 体积成为问题
