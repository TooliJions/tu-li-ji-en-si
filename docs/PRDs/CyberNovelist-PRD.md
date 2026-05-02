# CyberNovelist v7.0 产品需求文档

> 版本: 2.0 | 日期: 2026-05-02 | 状态: 7 阶段流程瘦身后正式发布

## 1. 产品定位

CyberNovelist 是面向长篇网络小说创作的 **本地优先 AI 系统**,采用 **7 阶段同步流程** 把创作从灵感推进到成书:

```
① 灵感输入  →  ② 规划  →  ③ 总纲规划  →  ④ 细纲规划  →  ⑤ 章节正文  →  ⑥ 质量检查  →  ⑦ 导出
```

每个阶段都有独立的契约 schema、服务层、API 路由与前端页面,前一阶段产出是后一阶段输入。作者按顺序推进,每阶段都可单独修订。

### 1.1 目标用户

| 用户类型 | 需求 | 使用场景 |
|----------|------|----------|
| 网文作者 | 高效稳定产出、风格一致、避免 AI 味 | 日更 4000-10000 字连载 |
| 写作爱好者 | 降低长篇创作门槛、辅助规划 | 从灵感到成书的全流程 |

### 1.2 核心价值主张

1. **结构化创作流程** — 7 阶段层层推进,每步产物可单独修订
2. **总纲全自动生成** — 单 Agent 一次 LLM 调用产出三层 `StoryBlueprint`(meta + base + typeSpecific)
3. **细纲自给自足** — 每章预生成 `contextForWriter`,正文阶段直接消费,大幅减少 LLM 重复调用
4. **质量保障** — 33 维连续性审计 + 9 类 AI 痕迹检测 + 4 种修复策略
5. **本地优先** — 所有数据存储在本地文件系统 + SQLite,隐私安全
6. **多模型路由** — 按 Agent 粒度配置不同 LLM 提供商,自动故障切换
7. **伏笔治理** — 5 层架构,支持人工意图声明和惊群平滑

---

## 2. 功能需求(按 7 阶段组织)

### 2.1 阶段 ① 灵感输入(inspiration)

输入产物:`InspirationSeed`(`packages/core/src/workflow/contracts/inspiration.ts`)

| 编号 | 需求 | 优先级 |
|------|------|--------|
| PRD-101 | 灵感输入表单:原始灵感(必填) + 题材、主题、核心冲突、基调、约束(选填) | P0 |
| PRD-102 | 灵感来源类型:`manual` / `shuffle` / `import`(原 natural-agent 选项已移除) | P0 |
| PRD-103 | 灵感洗牌:从题材模板库随机生成灵感种子 | P1 |
| PRD-104 | Markdown 导入:支持已有设定文件导入,自动解析关键字段 | P1 |
| PRD-105 | 灵感版本管理:同一书籍允许保留多版灵感,可对比与切换 | P2 |

### 2.2 阶段 ② 规划(planning)

输入产物:`PlanningBrief`(`packages/core/src/workflow/contracts/planning.ts`)

| 编号 | 需求 | 优先级 |
|------|------|--------|
| PRD-201 | 规划简报表单:受众、题材策略、风格目标、字数目标(必填) | P0 |
| PRD-202 | 禁忌规则、市场目标、创作约束:每行一条,可自由编辑 | P0 |
| PRD-203 | 规划状态:`draft` / `ready` / `approved`,只有 `ready` 以上才能进入总纲 | P0 |
| PRD-204 | 规划简报修订历史:保留最近 5 次编辑快照 | P2 |

### 2.3 阶段 ③ 总纲规划(outline)

输入产物:`StoryBlueprint`(三层 schema,参照 `C:\Users\18223\Desktop\AI` Python 项目设计)

| 编号 | 需求 | 优先级 |
|------|------|--------|
| PRD-301 | 总纲三层结构:`meta`(类型/架构模式/标题/字数/结局) + `base`(卖点/主题/黄金三章/角色/伏笔种子/完本设计/写作风格) + `typeSpecific`(按架构模式 5 选 1) | P0 |
| PRD-302 | 单 Agent 一次性 LLM 自动生成:`POST /api/books/:bookId/story-outline { mode: 'generate' }` 调用 `OutlineGenerator`,从 InspirationSeed + PlanningBrief 直接产出完整三层 StoryBlueprint | P0 |
| PRD-303 | 4 种架构模式自动映射: 玄幻/仙侠/奇幻 → `lotus_map`(莲花地图);科幻 → `multiverse`(平行宇宙);都市/悬疑/言情/历史 → `org_ensemble`(组织群像);游戏/末世 → `map_upgrade`(地图升级) | P0 |
| PRD-304 | 类型专属内容(typeSpecific 5 种 discriminated union):Fantasy(power_system+golden_finger)、Mystery(mystery_design+revelation_schedule)、Urban(system_panel+world_building)、Romance(emotional_arc+relationship_system)、SciFi(tech_levels+interstellar_politics) | P0 |
| PRD-305 | 5 条一致性校验规则:R-01(架构模式与类型匹配)、R-02(typeSpecific 与 novelType 匹配)、R-03(关系引用必须存在)、R-04(至少 1 主角)、R-05(meta.endingType == base.completionDesign.endingType) | P0 |
| PRD-306 | 总纲手动模式:`POST /api/books/:bookId/story-outline { mode: 'manual', ... }` 完全人工编辑 | P0 |
| PRD-307 | 校验失败展示:违反规则时返回 issues 列表,前端按 R-XX 分组展示供作者修复 | P0 |
| PRD-308 | 黄金三章(`base.goldenOpening`):chapter_1 必含开场钩子(first_hook),chapter_3 必含签约钩子(signing_hook) | P0 |
| PRD-309 | 伏笔种子(`base.foreshadowingSeed`):总纲层埋设主线伏笔,被细纲消费 | P0 |
| PRD-310 | 总纲修订支持局部更新(PATCH),不需重新跑 LLM | P1 |
| PRD-311 | 总纲版本对比:同一书允许保留多版 StoryBlueprint,UI 展示字段级 diff | P2 |

### 2.4 阶段 ④ 细纲规划(detailed-outline)

输入产物:`DetailedOutline`(`packages/core/src/workflow/contracts/detailed-outline.ts`)

| 编号 | 需求 | 优先级 |
|------|------|--------|
| PRD-401 | 细纲全书章节地图:`volumes[].chapters[]`,每章含 chapterNumber/title/wordCountTarget/sceneSetup/charactersPresent/coreEvents/emotionArc/chapterEndHook/foreshadowingOps/satisfactionType/keyDialogueHints/writingNotes/contextForWriter | P0 |
| PRD-402 | 单 Agent 一次性 LLM 生成:`DetailedOutlineGenerator` 读取 StoryBlueprint,卷骨架 → 逐卷补 chapters,每章带完整 contextForWriter | P0 |
| PRD-403 | 自给自足 contextForWriter:storyProgress(必填)、chapterPositionNote、characterStates(每角色当时的 powerLevel/emotionalState/keySecret/relationshipWithPov)、activeWorldRules、activeForeshadowingStatus、precedingChapterBridge、nextChapterSetup | P0 |
| PRD-404 | Token 控制:超过 50 章时按卷分批生成,卷间独立 LLM 请求 | P0 |
| PRD-405 | 章节级修订:细纲单章可独立编辑,不影响其他章 | P0 |
| PRD-406 | 细纲规则校验:R-06(每章 writingNotes 非空)、R-07(每章 keyDialogueHints 非空)、R-08(每章 contextForWriter.storyProgress 非空)、R-09(charactersPresent 必须存在于角色档案)、R-10(foreshadowingOps.foreshadowingId 必须存在于伏笔种子)、R-11(章节号连续递增)、R-12(必须存在第 1/2/3 章) | P0 |
| PRD-407 | 细纲漂移检测:正文写作过程中如果实际偏离细纲,提示作者更新细纲或回归 | P1 |
| PRD-408 | 细纲导出:把全书章节地图导出为 JSON / Markdown 用于人工审阅 | P1 |
| PRD-409 | 细纲增量补齐:针对超长篇(>200 章),先生成前 N 卷,后续按需补齐 | P2 |

### 2.5 阶段 ⑤ 章节正文(writing)

入口:`PipelineRunner`(`packages/core/src/pipeline/runner.ts`)

| 编号 | 需求 | 优先级 |
|------|------|--------|
| PRD-501 | 单章完整创作:草稿 → 审计 → 修订 → 持久化(`writeNextChapter`) | P0 |
| PRD-502 | 连续写章:指定起止章号自动连续创作 | P0 |
| PRD-503 | 草稿模式(`writeDraft`):生成草稿并持久化,跳过审计修订;结果标记为 draft 状态 | P0 |
| PRD-504 | 快速试写(`writeFastDraft`):单次 LLM 调用生成草稿,不持久化,首段产出 < 15s | P0 |
| PRD-505 | 草稿升级(`upgradeDraft`):草稿转正,启动审计修订流程 | P1 |
| PRD-506 | 上下文漂移防护:`upgradeDraft` 执行时自动刷新上下文卡片;若真相文件已更新,UI 弹窗提示 | P0 |
| PRD-507 | 心流模式实体感知:屏幕可见区域内实体词汇下方显示微弱虚线底纹,光标悬停展示上下文卡片 | P0 |
| PRD-508 | 意图导演(`IntentDirector`):结合长期意图和当前焦点生成章节意图 | P0 |
| PRD-509 | 上下文治理:按相关性自动选择上下文,避免膨胀 | P0 |
| PRD-510 | 规则栈编译:聚合世界规则、角色契约、题材约束 | P0 |
| PRD-511 | 优先消费细纲:章节正文从 `DetailedOutline.chapters[N].contextForWriter` 直接读取上下文,不重新调 ChapterPlanner | P0 |
| PRD-512 | ChapterPlanner 降级为补全器:若细纲缺失或不完整,才走原全量生成路径 | P0 |
| PRD-513 | 章节合并(`mergeChapters`):合并正文、聚合摘要、重算事实时间线 | P1 |
| PRD-514 | 章节拆分(`splitChapter`):分割正文、继承状态快照 | P1 |
| PRD-515 | 重组安全机制:reorg.lock 专用锁 + .reorg_in_progress 哨兵 + staging 原子提交 | P0 |
| PRD-516 | 审计失败降级路径:`maxRevisionRetries`(默认 2)+ `fallbackAction`(`accept_with_warnings` / `pause`)| P0 |
| PRD-517 | 降级污染隔离:`accept_with_warnings` 章节从质量基线排除 + SQLite 事实置信度降级 | P0 |
| PRD-518 | 风格指纹与文风仿写:从参考作品提取风格指纹并注入正文生成 | P1 |
| PRD-519 | 市场化爽点注入(`MarketInjector`):按题材规则在合适位置注入爽点节拍 | P2 |

### 2.6 阶段 ⑥ 质量检查(quality)

输出产物:`QualityReport`(`packages/core/src/workflow/contracts/quality.ts`)

#### 2.6.1 审计与检测

| 编号 | 需求 | 优先级 |
|------|------|--------|
| PRD-601 | 9 类 AI 痕迹检测:套话/句式单调/语义重复/过度连接词/抽象描述/排比堆叠/格式化结构/同质化情感/缺乏感官细节 | P0 |
| PRD-602 | 33 维连续性审计:角色状态/时间线/伏笔/实体/物理法则等 | P0 |
| PRD-603 | 审计分层降级:33 维三级(阻断 12 / 警告 12 / 建议 9),单维 LLM 失败自动重试,仍失败则阻断级降级为警告级 | P0 |
| PRD-604 | 审计报告可视化:8 维度雷达图(AI 痕迹/连贯性/节奏/对话/描写/情感/创新/完整性)+ 33 维明细按三级折叠 | P1 |
| PRD-605 | 记忆抽取透视:正文生成前以词云图渐隐渐显展示已抓取的事实碎片和世界规则 | P1 |
| PRD-606 | 4 种智能修复策略:局部替换 / 段落重排 / 节拍重写 / 整章重写 | P0 |
| PRD-607 | 字数治理:目标/软区间/硬区间,安全网防止毁章 | P0 |
| PRD-608 | POV 过滤:确保叙事视角一致性 | P1 |
| PRD-609 | 跨章重复检测:中文 6 字 ngram / 英文 3 词短语 | P1 |
| PRD-610 | 叙事疲劳分析:长跨度写作中的套路化检测 | P2 |
| PRD-611 | 写后验证:角色位置/资源/关系变更的合法性校验 | P1 |
| PRD-612 | 对话质量检查:多角色场景至少一轮带阻力的直接交锋 | P2 |
| PRD-613 | 质量基线快照:第 3 章完成后自动建立基线 | P1 |
| PRD-614 | 质量漂移柔和建议:趋势图绘制初始基线虚线 + 恶化 30% 琥珀色关注区,触发阈值时飘出柔和建议气泡 | P1 |
| PRD-615 | 灵感洗牌按钮:针对当前段落提供三种不同节奏和视角的重写方案 | P1 |
| PRD-616 | 数据分析面板:字数统计、审计通过率、章节排名、Token 用量 | P1 |
| PRD-617 | 质量仪表盘:8 维度评分汇总 | P1 |

#### 2.6.2 伏笔治理(5 层架构,跨 ④⑤⑥)

| 编号 | 需求 | 优先级 |
|------|------|--------|
| PRD-651 | 伏笔自动识别与注册(埋设时) | P0 |
| PRD-652 | 伏笔排班:为每个伏笔安排推进计划 | P0 |
| PRD-653 | 伏笔仲裁:检测伏笔冲突(时间/角色/主题重叠) | P1 |
| PRD-654 | 伏笔生命周期:`open → progressing → deferred → dormant → resolved/abandoned` | P0 |
| PRD-655 | 伏笔健康度分析:活跃度/逾期/债务分析 | P1 |
| PRD-656 | 伏笔准入控制:重复伏笔家族自动拦截 | P2 |
| PRD-657 | 伏笔可视化面板:状态总览、逾期提醒、回收建议 | P1 |
| PRD-658 | 伏笔调度时间轴(双轨视图):顶部全局小地图热力色带 + 下方局部放大镜聚焦窗口 | P1 |
| PRD-659 | 惊群平移动画化:超出 maxWakePerChapter 阈值的伏笔卡片沿抛物线动画平滑落入后续章节 | P1 |
| PRD-660 | 人工意图声明:手动标注长线伏笔预期回收窗口 `[min_chapter, max_chapter]` | P0 |
| PRD-661 | 休眠状态:标记为 `dormant` 的伏笔不参与排班、不消耗活跃槽位、不报逾期 | P0 |
| PRD-662 | 伏笔自动唤醒:章节到达 `expected_resolution_min` 时 `dormant → open` | P0 |

#### 2.6.3 状态与记忆管理(基础设施,服务于 ⑥)

| 编号 | 需求 | 优先级 |
|------|------|--------|
| PRD-681 | 7 真相文件体系:current_state / hooks / chapter_summaries / subplot_board / emotional_arcs / character_matrix / manifest | P0 |
| PRD-682 | 结构化 JSON 状态 + Zod 校验,不可变更新 | P0 |
| PRD-683 | SQLite 时序记忆库:按章节查询"某角色此时知道什么" | P0 |
| PRD-684 | 章节快照与回滚:回滚到任意已快照章节 | P0 |
| PRD-685 | 状态矛盾检测:阻断明显矛盾状态落盘 | P0 |
| PRD-686 | 真相文件可视化编辑器 | P1 |
| PRD-687 | 状态投影双向校验:检测 Markdown 手动编辑 + 警告弹窗 + AI 辅助导入 | P1 |

### 2.7 阶段 ⑦ 导出(export)

输出产物:`ExportArtifact`(`packages/core/src/workflow/contracts/export.ts`)

| 编号 | 需求 | 优先级 |
|------|------|--------|
| PRD-701 | EPUB 3.0 导出:完整 OPF + NCX + XHTML 结构 | P0 |
| PRD-702 | TXT / Markdown 导出 | P0 |
| PRD-703 | 平台适配导出(起点/番茄等平台格式) | P2 |
| PRD-704 | 批量导出:支持指定章节范围 | P1 |
| PRD-705 | 导出路径限制:仅允许写入项目目录内部,防止路径穿越 | P0 |

---

## 3. 异常与冲突处理交互

| 编号 | 需求 | 优先级 |
|------|------|--------|
| PRD-901 | 状态脱节自然语言翻译:DoctorView 检测到 JSON 与 Markdown 投影脱节时,差异以自然语言呈现(禁用 JSON 路径等技术术语) | P0 |
| PRD-902 | 污染隔离视觉强化:`accept_with_warnings` 章节卡片橙色 #FF8C00 边框 + 45° 倾斜警戒线条纹底纹 + 「污染隔离」红色标签 | P0 |
| PRD-903 | 回滚确认增强:执行「回滚到此章」时弹出「时间回溯拨盘」对话框,鼠标逆时针拖拽至目标章节 | P0 |

---

## 4. 非功能需求

### 4.1 性能

| 编号 | 需求 |
|------|------|
| NFR-001 | 快速试写(`writeFastDraft`):首段产出 < 15s |
| NFR-002 | 草稿模式(`writeDraft`):生成并持久化 < 30s |
| NFR-003 | 单章完整创作(含审计修订):本地模型 < 120s,云端模型 < 60s |
| NFR-004 | 章节加载延迟 < 500ms |
| NFR-005 | 20+ 章后上下文注入 < 模型 token 上限的 80% |
| NFR-006 | SQLite 并发写入支持(WAL 模式 + busy_timeout) |
| NFR-007 | 单章写入事务原子性:章节文件 → index.json → facts/hooks → 快照,最后提交;未提交事务自动回滚 |
| NFR-008 | 总纲单 Agent 生成:< 30s 产出三层 StoryBlueprint |
| NFR-009 | 细纲全书生成:50 章 < 60s,200 章按卷分批后总耗时 < 5min |

### 4.2 可用性

| 编号 | 需求 |
|------|------|
| NFR-010 | Web UI 响应式设计,支持桌面/平板 |
| NFR-011 | RESTful API 覆盖全部 7 阶段功能 |
| NFR-012 | 中文化界面(i18n 框架预留英文) |
| NFR-013 | SSE 实时推送写作进度 |

### 4.3 安全

| 编号 | 需求 |
|------|------|
| NFR-020 | API 密钥存储在 `config.local.json`,不提交到 git |
| NFR-021 | 导出路径限制在项目目录内部,防止路径穿越 |
| NFR-022 | 文件锁防止并发写入损坏 |
| NFR-023 | 输入验证(XSS/注入防护) |
| NFR-024 | 非正常退出恢复:断电/崩溃后自动回滚未提交事务,清理残留文件 |
| NFR-025 | 僵尸锁清理:Studio DoctorView 一键修复 |

### 4.4 可维护性

| 编号 | 需求 |
|------|------|
| NFR-030 | 核心单元测试覆盖率 > 80% |
| NFR-031 | E2E 测试覆盖 7 阶段全流程 |
| NFR-032 | 架构文档与代码保持同步 |

---

## 5. 技术选型决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 主语言 | **TypeScript** | 类型安全;Zod 校验 + 编译时检查,减少运行时错误;前后端统一语言 |
| Web UI | **React + Hono** | React 生态成熟;Hono 轻量高性能 API 框架;支持 SSE 实时推送 |
| 状态存储 | **SQLite** | 本地优先;时序记忆是长篇写作的刚需;WAL 模式支持并发 |
| LLM SDK | **OpenAI 兼容接口** | 通用性强,可对接 DashScope/Gemini/OpenAI/DeepSeek 等多家提供商 |
| 测试 | **Vitest + Playwright** | Vitest 快速单元测试;Playwright 覆盖 E2E 主流程 |
| Agent 模块化 | **细粒度独立文件** | 每个 Agent 继承 BaseAgent,职责分离,易测试易扩展 |
| 总纲生成 | **单 Agent 一次 LLM 调用** | 参照 `C:\Users\18223\Desktop\AI` Python 项目设计,简化协作链路 |
| 细纲存储 | **JSON 文档(workflow-store)** | 与其他 6 阶段一致,工作流文档驱动 |

---

## 6. 术语表

| 术语 | 含义 |
|------|------|
| 7 阶段流程 | 灵感输入 → 规划 → 总纲规划 → 细纲规划 → 章节正文 → 质量检查 → 导出 |
| StoryBlueprint | 总纲三层 schema(meta/base/typeSpecific) |
| DetailedOutline | 全书细纲,含 volumes/chapters/contextForWriter |
| contextForWriter | 每章自给自足写作上下文,正文阶段直接消费 |
| ArchitectureMode | 总纲架构模式(lotus_map / multiverse / org_ensemble / map_upgrade) |
| TypeSpecific | 类型专属内容(Fantasy / Mystery / Urban / Romance / SciFi 5 选 1) |
| 真相文件 | 存储小说世界状态的结构化文件,是单一事实来源 |
| Agent | 具有特定职责的 AI 智能体(如 OutlineGenerator / IntentDirector) |
| 流水线 | 章节正文创作的内部阶段(草稿→审计→修订→持久化) |
| 伏笔 | 故事中埋设的悬念或未解冲突,需要在后续章节回收 |
| 审计 | 对已生成章节进行 33 维度连续性检查 |
| 修复 | 根据审计结果自动或半自动修改章节内容 |
| 快照 | 某一章节点时的完整状态备份,支持回滚 |
| 延期(deferred) | 系统判定当前章节暂不适合推进的伏笔;**仍在排班队列**,参与逾期检测,占用活跃槽位 |
| 休眠(dormant) | 作者手动标记的长线伏笔;**移出排班队列**,不参与逾期检测,不占用活跃槽位 |
| 草稿模式(writeDraft) | 生成草稿并持久化,跳过审计修订流程;结果写入章节文件但标记为 draft 状态 |
| 快速试写(writeFastDraft) | 仅单次 LLM 调用生成草稿,**不持久化**,存于临时缓冲区;用于灵感探索 |
| 惊群(thundering herd) | 多个伏笔在同一章节同时达到唤醒条件,超过系统设定的最大唤醒数上限 |
| 惊群平滑 | 当惊群触发时,系统按优先级分批唤醒伏笔,超出部分沿抛物线动画分流至后续章节 |
| 灵感洗牌 | 针对当前段落生成三种不同节奏和视角的重写方案,帮助打破创作僵局 |
| 时间回溯拨盘 | 回滚操作的交互方式,通过逆时针拖拽旋转选择目标章节 |
| 琥珀关注区 | 质量趋势图上标记恶化 30% 阈值的琥珀色渐变区域,替代红色警戒带 |
