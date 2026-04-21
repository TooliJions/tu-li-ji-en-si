---
phase: 1
title: "Phase 1 基础设施 — 代码差距修复"
goal: "补齐 Phase 1 CONTEXT.md 中识别的 3 项代码差距：多 LLM 提供商、流式输出、补充 Schemas"
gap_closure: true
strategy: "sequential"
---

# Phase 1 代码差距修复计划

**目标：** 补齐 01-CONTEXT.md 中识别的 3 项缺失代码，使 Phase 1 决策全部落地。

**策略：** 顺序执行 3 个任务组，每组完成后可独立编译测试。

**总预估工时：** ~6h

---

## Task 1: 补充 ClaudeProvider 和 OllamaProvider（~3h）

**现状：** `provider.ts` 仅有 `OpenAICompatibleProvider`，缺少 D-01 决策中的 Claude 和 Ollama 提供商。

**分析：**
- `OpenAICompatibleProvider` 使用 `openai` SDK，通过 `baseURL` 兼容各 OpenAI-compatible 服务
- `ClaudeProvider` 需使用 `@anthropic-ai/sdk` 的 `Anthropic` 类，API 格式不同（messages 结构、max_tokens 参数名、response_format 不同）
- `OllamaProvider` 可使用 `openai` SDK（Ollama 提供 OpenAI 兼容端点 `http://localhost:11434/v1`），也可直接 HTTP 调用 Ollama API
- `RoutedLLMProvider` 目前硬编码 `OpenAICompatibleProvider`，需改为接收 `LLMProvider` 基类

**实施步骤：**

### 1a. 扩展 LLMProvider 基类和接口

在 `provider.ts` 中：
- 添加 `LLMStreamChunk` 接口：`{ text: string; done: boolean; usage?: { promptTokens: number; completionTokens: number } }`
- 在 `LLMProvider` 抽象类中添加 `generateStream(request: LLMRequest): AsyncIterable<LLMStreamChunk>` 抽象方法
- 在 `OpenAICompatibleProvider` 中实现 `generateStream`，使用 `openai.chat.completions.create({ stream: true })`

### 1b. 实现 ClaudeProvider

新建 `packages/core/src/llm/claude-provider.ts`：
- 使用 `@anthropic-ai/sdk` 的 `Anthropic` 客户端
- 实现 `generate()`、`generateJSON<T>()`、`generateJSONWithMeta<T>()`、`generateStream()` 四个方法
- `generateJSON` 通过 system prompt 要求返回 JSON + 手动 `JSON.parse`
- `generateStream` 使用 `stream: true` 返回文本块

### 1c. 实现 OllamaProvider

新建 `packages/core/src/llm/ollama-provider.ts`：
- 复用 `openai` SDK（Ollama 提供 OpenAI 兼容端点），默认 `baseURL: 'http://localhost:11434/v1'`
- 实现同上四个方法，逻辑与 `OpenAICompatibleProvider` 几乎一致，但独立类便于未来定制
- 流式输出同 OpenAI 兼容模式

### 1d. 重构 RoutedLLMProvider

修改 `routed-provider.ts`：
- `ProviderEntry` 添加 `type: 'openai' | 'claude' | 'ollama'` 字段
- `providers` Map 类型从 `Map<string, OpenAICompatibleProvider>` 改为 `Map<string, LLMProvider>`
- 初始化时根据 `type` 创建对应 Provider 实例
- 添加 `registerProvider(name: string, provider: LLMProvider)` 方法支持运行时注册

### 1e. 更新导出

修改 `packages/core/src/llm/index.ts`（如存在）或 `index.ts`：
- 导出 `ClaudeProvider`、`OllamaProvider`、`LLMStreamChunk`

### 1f. 编写测试

- `claude-provider.test.ts`：mock Anthropic 客户端，验证 generate/generateJSON/generateStream
- `ollama-provider.test.ts`：mock OpenAI 客户端（指向 Ollama），验证同上
- 更新 `routed-provider.test.ts`：添加多类型 provider 混合路由测试

**验收标准：**
- `pnpm build` 通过
- 新增测试全部通过
- 现有 1623 测试不受影响

---

## Task 2: 补充 Pipeline/Quality/Agent Schemas（~1.5h）

**现状：** `schemas.ts` 仅 178 字节，只导出 book/chapter/state。缺少 D-05~D-07 决策中的 schemas。

**分析：** 实际代码中已有部分 inline schema（如 `chapter.ts` 中的 `RevisionHistoryEntrySchema`），但未聚合到 `schemas.ts`。需要从现有代码中提取并补充。

**实施步骤：**

### 2a. Pipeline Schemas

新建 `packages/core/src/models/pipeline.ts`：
```typescript
// PipelineStep 枚举：intent, context, memory, draft, audit, revise, persist
export const PipelineStepSchema = z.enum(['intent', 'context', 'memory', 'draft', 'audit', 'revise', 'persist']);

// RevisionHistoryEntry（从 chapter.ts 移入或引用）
export const RevisionHistoryEntrySchema = z.object({...});

// PipelineConfig
export const PipelineConfigSchema = z.object({
  maxRevisionRetries: z.number().default(2),
  fallbackAction: z.enum(['accept_with_warnings', 'pause']).default('accept_with_warnings'),
  enableAudit: z.boolean().default(true),
  enableRevision: z.boolean().default(true),
});

// PipelineState
export const PipelineStateSchema = z.enum(['idle', 'running', 'paused', 'completed', 'failed']);
```

### 2b. Quality Schemas

新建 `packages/core/src/models/quality.ts`：
```typescript
// AuditSeverity
export const AuditSeveritySchema = z.enum(['blocking', 'warning', 'suggestion']);

// AuditIssue
export const AuditIssueSchema = z.object({
  dimension: z.string(),
  severity: AuditSeveritySchema,
  message: z.string(),
  suggestion: z.string().optional(),
});

// AuditReport
export const AuditReportSchema = z.object({
  chapterNumber: z.number(),
  overallPass: z.boolean(),
  issues: z.array(AuditIssueSchema),
  dimensions: z.record(z.string(), z.any()),
  timestamp: z.string(),
});

// RepairStrategy 枚举
export const RepairStrategySchema = z.enum(['local_replace', 'paragraph_reorder', 'beat_rewrite', 'chapter_rewrite']);

// QualityBaseline
export const QualityBaselineSchema = z.object({
  bookId: z.string(),
  chapterNumber: z.number(),
  scores: z.record(z.string(), z.number()),
  timestamp: z.string(),
});
```

### 2c. Agent Schemas

新建 `packages/core/src/models/agent.ts`：
```typescript
// AgentType 枚举
export const AgentTypeSchema = z.enum(['planner', 'executor', 'auditor', 'special']);

// AgentConfig
export const AgentConfigSchema = z.object({
  name: z.string(),
  type: AgentTypeSchema,
  temperature: z.number().default(0.7),
  maxTokens: z.number().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
});

// AgentOutput
export const AgentOutputSchema = z.object({
  agentName: z.string(),
  content: z.string(),
  metadata: z.record(z.string(), z.any()).optional(),
  usage: z.object({
    promptTokens: z.number(),
    completionTokens: z.number(),
  }).optional(),
  timestamp: z.string(),
});

// AgentRegistry
export const AgentRegistrySchema = z.object({
  agents: z.array(AgentConfigSchema),
  version: z.string(),
});
```

### 2d. 更新 schemas.ts 聚合导出

```typescript
export * from './book';
export * from './chapter';
export * from './state';
export * from './hooks';
export * from './pipeline';
export * from './quality';
export * from './agent';
```

### 2e. 编写测试

- `pipeline.test.ts`：验证 PipelineStep/PipelineConfig/PipelineState schema 校验
- `quality.test.ts`：验证 AuditReport/RepairStrategy/QualityBaseline
- `agent.test.ts`：验证 AgentConfig/AgentOutput/AgentRegistry

**验收标准：**
- `pnpm build` 通过
- 新增测试全部通过
- `schemas.ts` 聚合导出所有 7 个模块

---

## Task 3: 验证构建、测试、CI（~1.5h）

**现状：** `pnpm build` 通过，CI 工作流存在但可能因新增代码需要更新。

**实施步骤：**

### 3a. 验证完整构建

运行 `pnpm build`，确保新增文件编译无错误。

### 3b. 验证全部测试

运行 `pnpm test`，确保所有测试通过（原有 1623 + 新增测试）。

### 3c. 检查 CI 工作流

读取 `.github/workflows/verify.yml`，确认：
- 包含 `pnpm install`、`pnpm lint`、`pnpm build`、`pnpm test`
- 如需要，添加对新文件的特定检查

### 3d. 检查 package.json 依赖

确认 `@anthropic-ai/sdk` 已添加到 `packages/core/package.json` 的 dependencies（如需）。如未安装，需添加。

**验收标准：**
- `pnpm build` 零错误
- `pnpm test` 全部通过
- CI 工作流配置完整

---

## 依赖关系

```
Task 1 (Provider) ──→ Task 3 (Verify)
Task 2 (Schemas) ──→ Task 3 (Verify)
```

Task 1 和 Task 2 可独立并行，Task 3 依赖前两者完成。

## 风险提示

1. **@anthropic-ai/sdk 依赖**：引入新依赖可能影响构建体积，但该包仅 ~2MB，可接受
2. **RoutedLLMProvider 重构**：修改 providers Map 类型可能影响现有测试，需同步更新 mock
3. **Schema 迁移**：如果 `chapter.ts` 中的 `RevisionHistoryEntrySchema` 被其他地方引用，迁移时需保持向后兼容（在原位置 re-export）
