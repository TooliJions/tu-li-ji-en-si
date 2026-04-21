# Phase 1: 基础设施 - Context

**Gathered:** 2026-04-21
**Status:** Ready for planning

<domain>
## Phase Boundary

项目可编译、测试、LLM 可调用。覆盖 Monorepo 搭建、LLM Provider 抽象（多提供商+流式）、Zod Schemas 补充、测试配置、CI/CD 流程。

</domain>

<decisions>
## Implementation Decisions

### LLM Provider 抽象层
- **D-01:** 支持三种提供商：OpenAI 兼容接口、Claude API（Anthropic）、Ollama 本地模型
- **D-02:** LLM Provider 需要支持流式输出（stream），为 Studio SSE 推送提供基础
- **D-03:** 保留现有 RoutedLLMProvider 架构（声誉系统 + 故障切换），在此基础上扩展新提供商
- **D-04:** 流式输出通过 `generateStream()` 方法实现，返回 AsyncIterable<string>

### Zod Schemas 补充
- **D-05:** 补充 Pipeline 相关 schemas：PipelineStep（步骤类型）、RevisionHistory（修订记录）、PipelineConfig（流水线配置）
- **D-06:** 补充 Quality 相关 schemas：AuditReport（审计报告，含 33 维分类）、RepairStrategy（修复策略枚举）、QualityBaseline（质量基线）
- **D-07:** 补充 Agent 相关 schemas：AgentConfig（Agent 配置）、AgentOutput（Agent 输出结构）、AgentRegistry（Agent 注册表）
- **D-08:** 所有新 schemas 放在 `packages/core/src/models/` 目录下，通过 `schemas.ts` 聚合导出

### 构建与测试配置
- **D-09:** 构建工具继续使用 tsc --build，保持类型安全
- **D-10:** CI 使用 GitHub Actions，push/PR 时执行 lint + typecheck + test + build
- **D-11:** 单元测试覆盖率目标 Phase 1 > 80%（核心 LLM Provider + Schemas）
- **D-12:** core 包的 `pnpm test` 使用 vitest run，studio 包使用 vitest run + jsdom

### Claude's Discretion
- 流式输出的具体实现细节（SSE 封装方式）
- GitHub Actions 工作流的具体 YAML 结构
- 新增 schemas 的字段命名和细节结构

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### LLM Provider
- `docs/Architecture/architecture.md` — LLM Provider 抽象层架构设计
- `docs/PRDs/CyberNovelist-PRD.md` — LLM 多模型路由需求

### Schemas
- `docs/PRDs/CyberNovelist-PRD.md` — 数据模型定义（Book/Chapter/Agent/Pipeline/Quality）

### Build & CI
- `docs/Development/tasks.md` — Phase 1 开发任务清单

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/core/src/llm/provider.ts` — 已有 LLMProvider 抽象类和 OpenAICompatibleProvider 实现，可在此基础上扩展 Claude 和 Ollama 提供商
- `packages/core/src/llm/routed-provider.ts` — 已有 RoutedLLMProvider 带声誉系统和故障切换，保留并扩展
- `packages/core/src/models/` — 已有 book.ts、chapter.ts、state.ts、hooks.ts 四个 schema 文件，架构成熟
- `packages/core/src/models/schemas.ts` — 已有聚合导出模式，新增 schemas 沿用此模式

### Established Patterns
- Monorepo 使用 pnpm workspace + TypeScript project references
- 所有包使用 `"private": true`，version 统一为 7.0.0
- core 包 `main` 指向 `dist/index.js`，通过 tsc --build 编译
- ESLint + Prettier + Husky + lint-staged 已配置完成
- Vitest 用于单元测试，Playwright 用于 E2E

### Integration Points
- 新增 LLM Provider 需注册到 `RoutedLLMProvider` 的 providers 数组
- 新增 schemas 需通过 `schemas.ts` 聚合导出
- CI 工作流需读取 `pnpm-workspace.yaml` 中的包结构

</code_context>

<specifics>
## Specific Ideas

- 多提供商全支持：OpenAI 兼容 + Claude + Ollama，Phase 1 就到位
- 流式输出为后续 Studio SSE 推送打基础
- 补充 Pipeline/Quality/Agent 三类 schemas，覆盖后续 Phase 3-6 的数据模型需求
- 构建工具保持 tsc，不引入额外复杂度

</specifics>

<deferred>
## Deferred Ideas

- changesets 版本管理 — 后期发布 npm 包时需要
- API 文档自动生成（Typedoc） — 后期需要
- tsup/esbuild 打包优化 — 如果 dist 体积成为问题

</deferred>

---

*Phase: 01-infrastructure*
*Context gathered: 2026-04-21*
