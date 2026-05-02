# CyberNovelist v7.0 可执行开发计划

> 版本: 3.0 | 日期: 2026-05-02 | 状态: 7 阶段流程瘦身后正式发布
>
> 共约 **80 个原子任务**,分为 9 个阶段,总计约 **300h**(单人 38 工作日 / 1.7 个月)。
>
> 任务按 7 阶段流程组织,加入瘦身重构期(P0 即时)与基础设施期(P00 持续)。

---

## 任务总览

| 期 | 任务数 | 耗时 | 阻断关系 |
|---|---|---|---|
| **P0 瘦身重构** | 16 | 50h | 必须先完成,阻断后续 |
| **P00 基础设施** | 12 | 60h | 持续推进 |
| **阶段 ① 灵感输入** | 4 | 12h | 依赖 P0/P00 |
| **阶段 ② 规划** | 4 | 12h | 依赖 ① |
| **阶段 ③ 总纲规划** | 14 | 60h | 依赖 ② |
| **阶段 ④ 细纲规划** | 12 | 50h | 依赖 ③ |
| **阶段 ⑤ 章节正文** | 8 | 30h | 依赖 ④ |
| **阶段 ⑥ 质量检查** | 6 | 18h | 与 ⑤ 并行 |
| **阶段 ⑦ 导出** | 4 | 8h | 依赖 ⑤ |

---

## P0 瘦身重构期(50h,必须先做)

### P0.1 文档定调(6h)

- T-P0-001 删除 `docs/Architecture/refactoring-plan.md`(0.1h)
- T-P0-002 重写 `CLAUDE.md` 按 7 阶段定调(1h)
- T-P0-003 重写 `README.md`(0.5h)
- T-P0-004 重写 `docs/PRDs/CyberNovelist-PRD.md`(1.5h)
- T-P0-005 重写 `docs/Architecture/architecture.md`(2h)
- T-P0-006 重写 `docs/API/api-reference.md`(0.5h)
- T-P0-007 重写 `docs/Development/tasks.md`(0.4h)
- T-P0-008 选择性更新 `docs/UI/ui-prototype.md`、`docs/ENGINEERING.md`(0.5h)

### P0.2 代码删除与连锁修复(44h)

- T-P0-101 删除整目录:`packages/core/src/scheduler/`、`packages/core/src/notify/`、`packages/studio/src/daemon/`(0.5h)
- T-P0-102 删除单文件:`daemon.ts`、`fanfic.ts`、`pipeline/scheduler.ts`、`task-worker.ts`、`task-executor.ts` 及其测试(0.5h)
- T-P0-103 删除路由:`api/routes/{daemon,fanfic,natural-agent}.ts` 及其测试(0.5h)
- T-P0-104 删除前端页面:`pages/{daemon-control,fanfic-init,natural-agent}.tsx` 及其测试 + `components/daemon-log-stream.tsx`(0.5h)
- T-P0-105 修复 `packages/core/src/index.ts` barrel export(4 处)(0.5h)
- T-P0-106 修复 `packages/studio/src/api/server.ts` 路由注册(6 行)(0.5h)
- T-P0-107 修复 `packages/studio/src/api/core-bridge.ts` daemon-registry 依赖(1h)
- T-P0-108 修复 `packages/studio/src/runtime/book-repository.ts`(1h)
- T-P0-109 修复 `packages/studio/src/App.tsx` 三处 lazy import + Route(1h)
- T-P0-110 修复 `packages/studio/src/components/layout/sidebar.tsx`(0.5h)
- T-P0-111 删除 `lib/api/pipeline.ts:107-140`(daemon API 客户端)(1h)
- T-P0-112 删除 `lib/api/books.ts:57-68`(initFanfic)+ 关联测试(1h)
- T-P0-113 修复 `pages/chapters.tsx`(去 fanfic-init 链接)、`pages/inspiration-input.tsx`(去 natural-agent 选项)(1h)
- T-P0-114 修复 `workflow/contracts/inspiration.ts`(`InspirationSourceTypeSchema` 删 `'natural-agent'`)(0.5h)
- T-P0-115 修复 `api/sse.ts` `SSEEventType` 删 `'daemon_event'`(0.5h)
- T-P0-116 清理 `e2e/*.spec.ts` 中 4 个文件的 daemon/fanfic/natural-agent 导航(2h)

完成后 `pnpm verify` 通过即可结束 P0。

---

## P00 基础设施期(60h,与各阶段并行)

### 状态层(已完成,持续维护)

- T-P00-001 SQLite 时序记忆库(已完成)
- T-P00-002 三层状态架构(已完成)
- T-P00-003 章节快照与回滚(已完成)

### LLM 与 Provider

- T-P00-101 多 Provider 适配器(已完成)
- T-P00-102 模型路由 + 声誉系统(已完成)
- T-P00-103 输出校验 `LLMOutputRule`(已完成)
- T-P00-104 新增 `normalizers.ts` 提供 Zod `.preprocess` 容错预处理(8h)

### 工作流文档与持久化

- T-P00-201 `workflow-store.ts` IO 层(已完成)
- T-P00-202 7 阶段工作流文档统一约定(8h)
- T-P00-203 阶段间依赖检查(`UPSTREAM_REQUIRED` 错误码)(4h)

### 前端基础设施

- T-P00-301 React Router + 7 阶段路由表(已完成)
- T-P00-302 SSE 事件订阅(已完成)
- T-P00-303 通用错误展示组件 + 规则校验 issues 列表(8h)

---

## 阶段 ① 灵感输入(12h)

- T-S1-001 [P0] 灵感输入表单完善(`pages/inspiration-input.tsx`)(3h)
- T-S1-002 [P0] `DefaultInspirationService` 单元测试覆盖(2h)
- T-S1-003 [P1] 灵感洗牌 UI(从题材模板库随机生成)(4h)
- T-S1-004 [P1] Markdown 导入(AI 解析关键字段)(3h)

---

## 阶段 ② 规划(12h)

- T-S2-001 [P0] 规划简报表单完善(`pages/planning-brief.tsx`)(3h)
- T-S2-002 [P0] `DefaultPlanningService` 单元测试覆盖(2h)
- T-S2-003 [P0] 规划状态流转(draft / ready / approved)(2h)
- T-S2-004 [P2] 规划简报修订历史(5h)

---

## 阶段 ③ 总纲规划(60h,核心改造)

### ③.1 Schema 重写(15h)

- T-S3-001 [P0] 重写 `workflow/contracts/outline.ts` 为三层 schema(meta+base+typeSpecific)(3h)
- T-S3-002 [P0] 拆分子 schema 到 `workflow/contracts/types/`:
  - `architecture.ts`(4 种架构模式)
  - `type-specific.ts`(5 种 typeSpecific discriminated union)
  - `golden-opening.ts`(黄金三章)
  - `selling-points.ts`、`theme.ts`、`writing-style.ts`、`character.ts`、`relationship.ts`、`foreshadowing-seed.ts`、`completion-design.ts`(6h)
- T-S3-003 [P0] 旧 `StoryBlueprint` 兼容读取层(`StoryBlueprintCompatSchema = z.union([新, 旧])`)+ 迁移函数(4h)
- T-S3-004 [P0] 子 schema Zod `.preprocess` 容错(用 normalizers.ts)(2h)

### ③.2 OutlineGenerator Agent(20h)

- T-S3-101 [P0] 新增 `agents/outline-generator.ts`(继承 BaseAgent)(4h)
- T-S3-102 [P0] 提示词模板:合并 AI 项目 intent+theme+world+character+foreshadow 五个 prompt(6h)
- T-S3-103 [P0] `LLMOutputRule` 强约束(meta.titleSuggestions / characters / typeSpecific.kind 等)(3h)
- T-S3-104 [P0] 测试用例覆盖 4 种架构模式 + 5 种 typeSpecific(7h)

### ③.3 服务层与规则校验(10h)

- T-S3-201 [P0] 改写 `outline-service.ts` 加 `generateBlueprint(seed, brief, provider)`(3h)
- T-S3-202 [P0] 实现 5 条一致性校验规则(R-01..R-05)(3h)
- T-S3-203 [P0] `OutlineValidationError` 错误类型 + issues 列表(2h)
- T-S3-204 [P0] 扩展 `genre-guidance.ts` 加 `GENRE_TO_ARCHITECTURE` 映射(2h)

### ③.4 路由与前端(15h)

- T-S3-301 [P0] 改写 `api/routes/story-outline.ts` POST 加 mode='generate' 分支(3h)
- T-S3-302 [P0] 重写 `pages/story-outline.tsx`:三层结果展示 + AI 自动生成按钮(8h)
- T-S3-303 [P0] 校验失败时 issues 列表 UI(按 R-XX 分组折叠)(2h)
- T-S3-304 [P1] 总纲版本对比 UI(2h)

---

## 阶段 ④ 细纲规划(50h)

### ④.1 契约与服务(12h)

- T-S4-001 [P0] 新增 `workflow/contracts/detailed-outline.ts`(VolumeEntry / ChapterEntry / ContextForWriter)(4h)
- T-S4-002 [P0] 新增 `workflow/services/detailed-outline-service.ts`(create / update / getChapterContext)(4h)
- T-S4-003 [P0] 实现 7 条细纲规则校验(R-06..R-12)(4h)

### ④.2 DetailedOutlineGenerator Agent(20h)

- T-S4-101 [P0] 重命名 `agents/planner.ts` → `agents/detailed-outline-generator.ts`(0.5h)
- T-S4-102 [P0] 重写两阶段生成:卷骨架 → 逐卷补 chapters,每章带 contextForWriter(8h)
- T-S4-103 [P0] Token 控制:超过 50 章按卷分批(3h)
- T-S4-104 [P0] 提示词模板参考 AI 项目 outline.py + 增加 contextForWriter 输出要求(4h)
- T-S4-105 [P0] 测试覆盖短篇(三幕)与长篇(>50 章)(4.5h)

### ④.3 ChapterPlanner 降级(10h)

- T-S4-201 [P0] 修改 `agents/chapter-planner.ts` 加"读细纲优先"路径(`#executeFromPrebuilt`)(4h)
- T-S4-202 [P0] 命中细纲时仅调 LLM 补 sceneBreakdown / openingHook / closingHook(3h)
- T-S4-203 [P0] PipelineRunner 第 5 步从细纲读 contextForWriter,跳过 ChapterPlanner(3h)

### ④.4 路由与前端(8h)

- T-S4-301 [P0] 新增 `api/routes/detailed-outline.ts`(GET / POST mode=generate / PATCH / GET context)(3h)
- T-S4-302 [P0] 新增 `pages/detailed-outline.tsx` 全书章节地图视图(替代 chapter-plans.tsx)(5h)

---

## 阶段 ⑤ 章节正文(30h,大部分已完成)

- T-S5-001 [P0] PipelineRunner 优先消费细纲 contextForWriter(4h)
- T-S5-002 [P0] writeNextChapter 完整链路(已完成)
- T-S5-003 [P0] writeFastDraft / writeDraft / upgradeDraft(已完成)
- T-S5-004 [P0] 上下文漂移防护(已完成)
- T-S5-005 [P1] 心流模式实体感知(8h)
- T-S5-006 [P1] 章节合并 / 拆分(已完成)
- T-S5-007 [P0] 重组安全机制 reorg.lock + staging(已完成)
- T-S5-008 [P0] 审计失败降级 + 污染隔离(已完成,18h 项余下)

---

## 阶段 ⑥ 质量检查(18h,大部分已完成)

- T-S6-001 [P0] 33 维审计(已完成)
- T-S6-002 [P0] 9 类 AI 检测(已完成)
- T-S6-003 [P0] 4 种修复策略(已完成)
- T-S6-004 [P1] 8 维度雷达图 UI(6h)
- T-S6-005 [P1] 质量基线快照与漂移柔和建议(8h)
- T-S6-006 [P1] 灵感洗牌(局部重写方案)(4h)

---

## 阶段 ⑦ 导出(8h)

- T-S7-001 [P0] EPUB 3.0 导出(已完成)
- T-S7-002 [P0] TXT / Markdown 导出(已完成)
- T-S7-003 [P1] 批量导出指定章节范围(3h)
- T-S7-004 [P2] 平台适配导出(起点 / 番茄)(5h)

---

## E2E 测试覆盖(15h)

- T-E2E-001 [P0] 7 阶段全流程 E2E(`e2e/studio-7-stage.spec.ts`)(6h)
- T-E2E-002 [P0] 总纲规则校验失败修复流(2h)
- T-E2E-003 [P0] 细纲漂移检测与修复(2h)
- T-E2E-004 [P1] 章节回滚与快照恢复(3h)
- T-E2E-005 [P1] 污染隔离视觉强化展示(2h)

---

## 优先级说明

- **P0(必做)**:7 阶段闭环正常工作的最小集合
- **P1(应做)**:提升体验的关键功能
- **P2(可选)**:锦上添花,可推迟

P0 任务全部完成即可作为 v7.0 正式版本发布;P1/P2 任务可在后续小版本中迭代。

---

## 关键路径

```
P0 文档定调 → P0 代码删除连锁修复 → 阶段③ Schema 重写 → 阶段③ OutlineGenerator
                                  ↓
              阶段④ DetailedOutline 契约 → 阶段④ Generator → 阶段⑤ PipelineRunner 消费细纲
                                                          ↓
                                                  E2E 7 阶段全流程 → 发布 v7.0
```
