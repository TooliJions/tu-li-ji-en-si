---
created: 2026-04-22T13:54:44
title: 修复 DeterministicProvider 硬编码模板无视用户灵感
area: api
files:
  - packages/studio/src/api/core-bridge.ts:152-280
---

## Problem

`core-bridge.ts` 中的 `DeterministicProvider.#buildJsonResponse()` 方法为以下 Agent 类型注入了固定硬编码的 JSON 响应：

- `世界观构建师` → 始终返回"校园竞赛"设定（林晨、王老师、苏小雨）
- `大纲策划师` → 始终返回三幕结构：重新入局→压力升级→逆袭兑现
- `角色设计师` → 始终返回林晨等三个固定角色
- `章节策划师` → 始终返回"竞赛邀约"章节规划

**无论用户输入什么题材（玄幻/科幻/历史等）、提供什么创作灵感（`book.brief`），AI 返回的都是同一个校园竞赛模板。**

这是 `/review` 代码审查中发现的最高优先级正确性问题。`buildStoryBootstrap()` 流程中调用 OutlinePlanner、CharacterDesigner、ChapterPlanner 时，虽然 prompt 中包含了用户的 `book.brief`，但 DeterministicProvider 通过 `prompt.includes('世界观构建师')` 等字符串匹配直接返回硬编码值，完全无视用户输入。

## Solution

1. **短期修复**：在 DeterministicProvider 中解析 `book.brief` 和 `genre`，将硬编码值替换为基于用户输入的动态生成逻辑（至少做变量替换）
2. **中期修复**：替换 DeterministicProvider 为真实 LLM 调用，或至少建立一个模板引擎，根据 genre 选择不同的模板数据
3. **关键文件**：`packages/studio/src/api/core-bridge.ts` 第 152-280 行（`#buildJsonResponse` 方法）
