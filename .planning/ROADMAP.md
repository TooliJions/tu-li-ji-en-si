# Roadmap: CyberNovelist v7.0

**Milestone:** v1.0 初始版本
**Created:** 2026-04-21
**Granularity:** Fine (11 phases — complex AI system with natural delivery boundaries)

## Phases

- [x] **Phase 1: 基础设施** — Monorepo 搭建、LLM Provider 抽象、Zod Schemas、测试配置
- [x] **Phase 2: 状态层** — StateManager、RuntimeStateStore、SQLite 时序库、快照回滚
- [x] **Phase 3: 核心 Agent** — OutlinePlanner、CharacterDesigner、IntentDirector、ContextCard、ScenePolisher 等 22 个 Agent
- [x] **Phase 4: 流水线编排** — PipelineRunner、修订循环、原子事务、章节拆分合并
- [x] **Phase 5: 伏笔治理** — HookPolicy、HookAgenda、HookGovernance、HookArbiter、HookLifecycle
- [x] **Phase 6: 质量层** — 33 维审计、AI 痕迹检测、修复策略、降级路径
- [x] **Phase 6 补: 守护进程** — Daemon 调度、SmartInterval、QuotaGuard
- [ ] **Phase 7: Studio 工作台** — Web UI、Hono API、SSE 推送、核心页面
- [x] **Phase 8: 导出与通知** — EPUB/TXT 导出、路径安全、通知推送
- [ ] **Phase 9: 异常交互** — 状态脱节翻译、污染隔离视觉、时间回溯拨盘
- [ ] **Phase 10: 测试与优化** — 单元测试、E2E 测试、性能优化

## Phase Details

### Phase 1: 基础设施
**Goal**: 项目可编译、测试、LLM 可调用
**Depends on**: Nothing (first phase)
**Requirements**: NFR-08
**Success Criteria** (what must be TRUE):
  1. `pnpm install` → `pnpm build` → `pnpm test` 全绿
  2. 可实例化 LLM Provider 并调用 `generate(prompt)` 返回字符串
  3. Zod schema 可校验示例 JSON，`z.infer` 类型正确导出
  4. `pnpm lint` 和 `pnpm format` 可执行，提交时自动格式化
**Plans**: TBD

### Phase 2: 状态层
**Goal**: 书籍状态可读写、快照回滚、并发安全
**Depends on**: Phase 1
**Requirements**: STATE-01, STATE-02, STATE-03, STATE-04, STATE-05, NFR-06, NFR-07, NFR-10, NFR-11
**Success Criteria** (what must be TRUE):
  1. 可创建新书并获取排他锁，路径计算正确
  2. 可加载 `story/state/*.json` 构建运行时状态，快照写入正确
  3. SQLite 可查询某角色在指定章节的知识状态
  4. 崩溃后未提交事务自动回滚，WAL 模式无并发冲突
  5. 明显矛盾状态被检测并阻断落盘
**Plans**: TBD

### Phase 3: 核心 Agent
**Goal**: 22 个 Agent 模块可独立运行，完成大纲、角色、世界观、意图生成
**Depends on**: Phase 1, Phase 2
**Requirements**: PLAN-01, PLAN-02, PLAN-03, WRITE-07, WRITE-08, WRITE-09
**Success Criteria** (what must be TRUE):
  1. 输入灵感后可生成三幕结构大纲和章节概要
  2. 可创建角色卡片（姓名/性格/背景/能力/关系）并通过 Zod 校验
  3. 可生成世界观设定（力量体系/地理/势力/时间线）
  4. 意图 Director 可结合长期意图和当前焦点生成章节意图
  5. 上下文治理可按相关性自动选择上下文，避免膨胀
  6. 规则栈可聚合世界规则、角色契约、题材约束
**Plans**: TBD

### Phase 4: 流水线编排
**Goal**: 章节可端到端生成（草稿→审计→修订→持久化）
**Depends on**: Phase 2, Phase 3
**Requirements**: WRITE-01, WRITE-02, WRITE-03, WRITE-04, WRITE-06, WRITE-12, WRITE-13, NFR-01, NFR-02, NFR-03, NFR-05, QUAL-05
**Success Criteria** (what must be TRUE):
  1. `writeNextChapter()` 可完整执行 15 步链路，章节文件正确持久化
  2. `writeDraft()` 可生成草稿并标记 draft 状态
  3. `writeFastDraft()` 单次 LLM 调用 <15s 返回草稿，不持久化
  4. 连续写章可指定起止章号自动连续创作
  5. 草稿升级时自动刷新上下文卡片，检测世界状态变更
  6. 重组安全机制通过 reorg.lock + 哨兵防止崩溃误判
  7. 审计失败降级路径生效（maxRevisionRetries=2 + fallbackAction）
  8. 20+ 章后上下文注入 < 模型 token 上限 80%
**Plans**: TBD

### Phase 5: 伏笔治理
**Goal**: 伏笔可自动注册、排班、生命周期管理、人工意图声明
**Depends on**: Phase 2, Phase 3
**Requirements**: HOOK-01, HOOK-02, HOOK-03, HOOK-04, HOOK-05, HOOK-06
**Success Criteria** (what must be TRUE):
  1. 章节生成时伏笔自动识别并注册到 hooks 真相文件
  2. HookAgenda 可为每个伏笔安排推进计划
  3. 伏笔生命周期正确流转：open → progressing → deferred → dormant → resolved/abandoned
  4. 用户可手动标注长线伏笔预期回收窗口 [min_chapter, max_chapter]
  5. dormant 伏笔不参与排班、不消耗活跃槽位、不报逾期
  6. 章节到达 expected_resolution_min 时 dormant 自动唤醒为 open
**Plans**: TBD

### Phase 6: 质量层
**Goal**: 33 维审计、AI 痕迹检测、4 种修复策略、质量评估
**Depends on**: Phase 4
**Requirements**: QUAL-01, QUAL-02, QUAL-03, QUAL-04, QUAL-06, QUAL-07, QUAL-08, WRITE-14
**Success Criteria** (what must be TRUE):
  1. 9 类 AI 生成特征可被正确识别
  2. 33 维审计可对生成章节输出审计报告，分阻断级/警告级/建议级
  3. 单维 LLM 失败自动重试，仍失败则降级处理
  4. 4 种修复策略可按严重程度选择执行
  5. POV 过滤可确保叙事视角一致性
  6. 跨章重复检测可识别中文 6 字 ngram / 英文 3 词短语
  7. 写后验证可校验角色位置/资源/关系变更的合法性
  8. accept_with_warnings 章节从质量基线排除，事实置信度降级
**Plans**: TBD

### Phase 6 补: 守护进程
**Goal**: 后台自动批量写章，智能间隔和配额保护
**Depends on**: Phase 4, Phase 6
**Requirements**: WRITE-10, WRITE-11
**Success Criteria** (what must be TRUE):
  1. 守护进程可启动/暂停/恢复/停止，后台连续写章
  2. 云端模式检测到 RPM 限流后 2s 内自动延长间隔
  3. 本地模式支持间隔=0 即时启动下一章
**Plans**: TBD

### Phase 7: Studio 工作台
**Goal**: Web UI 可访问，核心页面可操作，API 完整覆盖
**Depends on**: Phase 4
**Requirements**: INIT-03, PLAN-05, WRITE-05, NFR-04
**Success Criteria** (what must be TRUE):
  1. 可上传创作简报（Markdown 文件）
  2. 可通过世界规则编辑器设定硬性约束
  3. 快速试写按钮可在 UI 上一键生成，首段产出 <15s
  4. 章节加载延迟 <500ms
**UI hint**: yes
**Plans**: TBD

### Phase 8: 导出与通知
**Goal**: 作品可导出为 EPUB/TXT，路径安全
**Depends on**: Phase 4
**Requirements**: EXPORT-01, EXPORT-02, NFR-09
**Success Criteria** (what must be TRUE):
  1. 可导出 EPUB 3.0 文件（完整 OPF + NCX + XHTML 结构）
  2. 可导出 TXT / Markdown 格式文件
  3. 导出路径限制在项目目录内部，路径穿越被拒绝
**Plans**: TBD

### Phase 9: 异常交互
**Goal**: 异常状态可理解地呈现给用户，操作安全确认
**Depends on**: Phase 7
**Requirements**: UX-01, UX-02, UX-03
**Success Criteria** (what must be TRUE):
  1. 状态脱节时差异以自然语言呈现，不暴露 JSON 路径等技术术语
  2. accept_with_warnings 章节有橙色边框+斜纹背景+「污染隔离」标签
  3. 回滚操作通过时间回溯拨盘交互确认，有碎裂淡出动画
**UI hint**: yes
**Plans**: TBD

### Phase 10: 测试与优化
**Goal**: 核心测试覆盖达标，性能符合要求
**Depends on**: Phase 1, Phase 4, Phase 6
**Requirements**: NFR-12
**Success Criteria** (what must be TRUE):
  1. 核心单元测试覆盖率 >80%
  2. 关键 E2E 测试覆盖主流程（创建书 → 生成大纲 → 写章 → 导出）
  3. 所有性能指标（NFR-01~NFR-07）通过基准测试验证
**Plans**: TBD

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. 基础设施 | 1/1 | Complete | 2026-04-21 |
| 2. 状态层 | 1/1 | Complete | 2026-04-21 |
| 3. 核心 Agent | 1/1 | Complete | 2026-04-21 |
| 4. 流水线编排 | 1/1 | Complete | 2026-04-21 |
| 5. 伏笔治理 | 1/1 | Complete | 2026-04-21 |
| 6. 质量层 | 1/1 | Complete | 2026-04-21 |
| 6 补. 守护进程 | 1/1 | Complete | 2026-04-21 |
| 7. Studio 工作台 | 1/1 | Complete | 2026-04-21 |
| 8. 导出与通知 | 1/1 | Complete | 2026-04-21 |
| 9. 异常交互 | 1/1 | Complete | 2026-04-21 |
| 10. 测试与优化 | 1/1 | Complete | 2026-04-21 |

## Coverage

| Requirement | Phase | Status |
|-------------|-------|--------|
| INIT-01 | Phase 1 | Pending |
| INIT-02 | Phase 1 | Pending |
| INIT-03 | Phase 7 | Pending |
| PLAN-01 | Phase 3 | Pending |
| PLAN-02 | Phase 3 | Pending |
| PLAN-03 | Phase 3 | Pending |
| PLAN-04 | Phase 4 | Pending |
| PLAN-05 | Phase 7 | Pending |
| WRITE-01 | Phase 4 | Pending |
| WRITE-02 | Phase 4 | Pending |
| WRITE-03 | Phase 4 | Pending |
| WRITE-04 | Phase 4 | Pending |
| WRITE-05 | Phase 7 | Pending |
| WRITE-06 | Phase 4 | Pending |
| WRITE-07 | Phase 3 | Pending |
| WRITE-08 | Phase 3 | Pending |
| WRITE-09 | Phase 3 | Pending |
| WRITE-10 | Phase 6 补 | Pending |
| WRITE-11 | Phase 6 补 | Pending |
| WRITE-12 | Phase 4 | Pending |
| WRITE-13 | Phase 4 | Pending |
| WRITE-14 | Phase 6 | Pending |
| QUAL-01 | Phase 6 | Pending |
| QUAL-02 | Phase 6 | Pending |
| QUAL-03 | Phase 6 | Pending |
| QUAL-04 | Phase 6 | Pending |
| QUAL-05 | Phase 4 | Pending |
| QUAL-06 | Phase 6 | Pending |
| QUAL-07 | Phase 6 | Pending |
| QUAL-08 | Phase 6 | Pending |
| HOOK-01 | Phase 5 | Pending |
| HOOK-02 | Phase 5 | Pending |
| HOOK-03 | Phase 5 | Pending |
| HOOK-04 | Phase 5 | Pending |
| HOOK-05 | Phase 5 | Pending |
| HOOK-06 | Phase 5 | Pending |
| STATE-01 | Phase 2 | Pending |
| STATE-02 | Phase 2 | Pending |
| STATE-03 | Phase 2 | Pending |
| STATE-04 | Phase 2 | Pending |
| STATE-05 | Phase 2 | Pending |
| EXPORT-01 | Phase 8 | Pending |
| EXPORT-02 | Phase 8 | Pending |
| UX-01 | Phase 9 | Pending |
| UX-02 | Phase 9 | Pending |
| UX-03 | Phase 9 | Pending |
| NFR-01 | Phase 4 | Pending |
| NFR-02 | Phase 4 | Pending |
| NFR-03 | Phase 4 | Pending |
| NFR-04 | Phase 7 | Pending |
| NFR-05 | Phase 4 | Pending |
| NFR-06 | Phase 2 | Pending |
| NFR-07 | Phase 2 | Pending |
| NFR-08 | Phase 1 | Pending |
| NFR-09 | Phase 8 | Pending |
| NFR-10 | Phase 2 | Pending |
| NFR-11 | Phase 2 | Pending |
| NFR-12 | Phase 10 | Pending |

**Coverage:**
- v1 requirements: 58 total
- Mapped to phases: 58
- Unmapped: 0 ✓

---
*Roadmap created: 2026-04-21*
*Last updated: 2026-04-21 after milestone v1.0 roadmap creation*
