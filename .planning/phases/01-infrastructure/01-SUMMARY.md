---
phase: 1
plan: 01
status: complete
gap_closure: true
---

# 01-PLAN Summary: Phase 1 基础设施差距修复

## Objective

补齐 Phase 1 CONTEXT.md 中识别的 3 项代码差距：多 LLM 提供商、流式输出、补充 Schemas。

## What Was Built

### Task 1: 多 LLM 提供商 + 流式支持
- **provider.ts**: 扩展 `LLMProvider` 抽象类，新增 `generateStream()` 抽象方法和 `LLMStreamChunk` 接口；`OpenAICompatibleProvider` 实现流式输出（基于 OpenAI SDK `stream: true`）
- **claude-provider.ts**: 新建 `ClaudeProvider`，使用 `@anthropic-ai/sdk` 原生客户端，实现 generate/generateJSON/generateJSONWithMeta/generateStream 四个方法
- **ollama-provider.ts**: 新建 `OllamaProvider`，复用 OpenAI SDK 连接 Ollama 的 OpenAI 兼容端点（`http://localhost:11434/v1`），默认 baseURL/apiKey
- **routed-provider.ts**: 重构为支持多类型 Provider（`type: 'openai'|'claude'|'ollama'`），`providers` Map 从 `OpenAICompatibleProvider` 泛化为 `LLMProvider`，新增 `registerProvider()` 运行时注册方法，新增 `generateStream()` 路由方法
- **package.json**: 添加 `@anthropic-ai/sdk` 依赖
- **core-bridge.ts**: Studio `DeterministicProvider` 补充 `generateStream()` 实现（修复新增编译错误）

### Task 2: 补充 Pipeline/Quality/Agent Schemas
- **models/pipeline.ts**: 7 个 schema（PipelineStep、PipelineState、FallbackActionEnum、PipelineConfigSchema、PipelineStepRecord、ContextDriftWarning）
- **models/quality.ts**: 8 个 schema（AuditSeverity、RepairStrategy、AuditIssue、AuditReport、QualityBaselineRecord、RepairConfig）
- **models/agent.ts**: 5 个 schema（AgentType、AgentConfig、AgentOutput、AgentRegistry）
- **models/schemas.ts**: 聚合导出从 3 模块扩展到 7 模块（+pipeline/quality/agent）
- **index.ts**: 统一从 schemas.ts 导出模型，移除单独 book/chapter/state/hooks 导出（消除重复导出冲突）

### Task 3: 验证构建、测试、CI
- Core 包 `pnpm build` 零错误
- 测试从 1623 增至 1658（+35 个新测试），全部通过
- CI 工作流 `.github/workflows/verify.yml` 配置完整（lint + typecheck + test + build）
- Studio 剩余 3 个已知编译错误（非本次引入），留到 Phase 10

## Key Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `core/src/llm/provider.ts` | Modified | Added generateStream abstract method + LLMStreamChunk interface |
| `core/src/llm/claude-provider.ts` | Created | Claude provider using @anthropic-ai/sdk |
| `core/src/llm/ollama-provider.ts` | Created | Ollama provider using OpenAI SDK |
| `core/src/llm/routed-provider.ts` | Modified | Multi-type provider support, generateStream routing |
| `core/src/llm/claude-provider.test.ts` | Created | 5 tests for ClaudeProvider |
| `core/src/llm/ollama-provider.test.ts` | Created | 7 tests for OllamaProvider |
| `core/src/models/pipeline.ts` | Created | Pipeline schemas (7) |
| `core/src/models/quality.ts` | Created | Quality schemas (8) |
| `core/src/models/agent.ts` | Created | Agent schemas (5) |
| `core/src/models/schemas.ts` | Modified | Extended aggregate exports |
| `core/src/models/pipeline.test.ts` | Created | 8 tests for pipeline schemas |
| `core/src/models/quality.test.ts` | Created | 8 tests for quality schemas |
| `core/src/models/agent.test.ts` | Created | 8 tests for agent schemas |
| `core/src/index.ts` | Modified | Unified model exports, added LLM provider exports |
| `core/package.json` | Modified | Added @anthropic-ai/sdk dependency |
| `studio/src/api/core-bridge.ts` | Modified | DeterministicProvider.generateStream() implementation |

## Self-Check: PASSED

- Core build: zero errors
- Core tests: 1658/1658 passed (85 test files)
- No breaking changes to existing code
- Studio DeterministicProvider compile error fixed
- 3 known Studio errors remain (pre-existing, Phase 10 scope)
