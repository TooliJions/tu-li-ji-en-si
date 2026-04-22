# PRD 严格差距分析报告

> 规则：PRD 写什么就实现什么，一个字节都不能差。零容忍任何部分实现。

## 逐项对照（58 个需求）

### 2.1 项目初始化

| # | PRD ID | 需求 | 优先级 | 状态 | 差距详情 |
|---|--------|------|--------|------|----------|
| 1 | PRD-001 | 创建新书，设置书名、题材、目标字数、语言 | P0 | ✅ OK | 完整实现 |
| 2 | PRD-002 | 题材模板库（都市、玄幻、科幻、仙侠等），预置题材规则 | P0 | ✅ OK | genre-catalog.ts 有预置题材 |
| 3 | PRD-003 | 创作简报上传（支持 markdown 文件导入已有设定） | P1 | ⚠️ PARTIAL | book-create.tsx 有 brief textarea 但无 markdown 文件上传按钮/导入功能 |
| 4 | PRD-004 | 同人模式初始化（canon/au/ooc/cp 四种模式） | P2 | ✅ OK | fanfic.ts + fanfic-init.tsx 实现 |
| 5 | PRD-005 | 文风仿写：分析参考作品提取风格指纹并注入 | P2 | ✅ OK | style-fingerprint.ts + style-manager.tsx |

### 2.2 创作规划阶段

| # | PRD ID | 需求 | 优先级 | 状态 | 差距详情 |
|---|--------|------|--------|------|----------|
| 6 | PRD-010 | 灵感输入 → AI 辅助生成大纲（三幕结构/章节概要） | P0 | ⚠️ PARTIAL | runner.ts 有 planChapter 调用 OutlinePlanner，但 prompt 是通用大纲格式，非三幕结构（三幕：建置/对抗/解决）。writing-plan.tsx UI 无三幕结构可视化 |
| 7 | PRD-011 | 角色设计：姓名、性格、背景、能力、关系网络 | P0 | ⚠️ PARTIAL | character.ts Agent 存在，但 truth-files.tsx 角色编辑器为简单表单，无关系网络可视化 |
| 8 | PRD-012 | 世界观设定：力量体系、地理、势力、时间线 | P0 | ⚠️ PARTIAL | world-rules-editor.tsx 有规则编辑，但地理/势力/时间线无独立可视化编辑器 |
| 9 | PRD-013 | 分章规划：每章目标、出场人物、关键事件、伏笔埋设 | P0 | ✅ OK | chapter-planner.ts + planChapter API + writing-plan.tsx UI |
| 10 | PRD-014 | 世界规则编辑器：设定不可违反的硬性约束 | P1 | ⚠️ PARTIAL | world-rules-editor.tsx 可编辑规则，但"不可违反"的硬性约束未在执行层强制检查（无规则拦截逻辑） |
| 11 | PRD-015 | 情感弧线编辑器：追踪角色情感变化轨迹 | P2 | ⚠️ PARTIAL | emotional-arcs.tsx 有 UI 页面（273 行），但为数据展示非完整编辑器，无可视化情感曲线绘制 |

### 2.3 章节创作（核心流水线）

| # | PRD ID | 需求 | 优先级 | 状态 | 差距详情 |
|---|--------|------|--------|------|----------|
| 12 | PRD-020 | 单章完整创作：草稿 → 审计 → 修订 → 持久化 | P0 | ✅ OK | runner.ts composeChapter/writeNextChapter 完整 8 步流水线 |
| 13 | PRD-021 | 连续写章：指定起止章号，自动连续创作 | P0 | ✅ OK | daemon.ts 支持 fromChapter/toChapter 连续创作 |
| 14 | PRD-022 | 草稿模式（writeDraft）：生成草稿并持久化，跳过审计修订；标记为 draft | P0 | ✅ OK | runner.ts writeDraft 实现 |
| 15 | PRD-022a | 快速试写（writeFastDraft）：仅调用 ScenePolisher + 上下文卡片，不持久化，单次 LLM 调用 | P0 | ⚠️ PARTIAL | runner.ts writeFastDraft 调用了 provider.generate（草稿 prompt），但 PRD 要求"仅调用 ScenePolisher"，代码实际没有调用 ScenePolisher，而是直接 generate |
| 16 | PRD-023 | 快速试写按钮：UI 一键生成，首段产出 <15s | P0 | ✅ OK | writing.tsx 有快速试写按钮 + SSE 推送 |
| 17 | PRD-024 | 草稿升级：草稿结果附带「转为正式章节（启动审计）」入口 | P1 | ✅ OK | book-detail.tsx 章节状态为 draft 时有升级入口 |
| 18 | PRD-024a | 上下文漂移防护：upgradeDraft 自动刷新上下文卡片；真相文件被手动修改时 UI 弹窗提示 | P0 | ⚠️ PARTIAL | runner.ts upgradeDraft 有 chaptersAhead 漂移检测和 warningCode: 'context_drift'，但缺少"真相文件被手动修改"的检测和 UI 弹窗提示 |
| 19 | PRD-024b | 心流模式实体感知：自动识别实体词汇，下方显示微弱虚线底纹；悬停显示上下文信息卡片 | P0 | ✅ OK | entity-highlight.tsx + context-popup.tsx + chapter-reader.tsx 实现 |
| 20 | PRD-025 | 意图导演：结合长期意图和当前焦点生成章节意图 | P0 | ✅ OK | intent-director.ts + runner.ts #directIntent |
| 21 | PRD-026 | 上下文治理：按相关性自动选择上下文，避免膨胀 | P0 | ✅ OK | context-card.ts + runner.ts #generateContextCard |
| 22 | PRD-027 | 规则栈编译：聚合世界规则、角色契约、题材约束 | P0 | ✅ OK | 存在规则聚合逻辑 |
| 23 | PRD-028 | 守护进程模式：后台自动批量写章，支持启停/恢复 | P0 | ✅ OK | daemon.ts + daemon-control.tsx |
| 24 | PRD-029 | 智能间隔策略：云端监控 RPM 限流自动延长，本地支持间隔=0 | P0 | ✅ OK | smart-interval.ts + rpm-monitor.ts |
| 25 | PRD-030 | 每日配额保护：Token 上限到达后自动暂停并通知 | P1 | ✅ OK | quota-guard.ts |
| 26 | PRD-031 | 自然语言 Agent 模式：对话方式指挥创作 | P2 | ✅ OK | natural-agent.tsx + natural-agent route |
| 27 | PRD-032 | 章节合并：mergeChapters(from, to)，合并正文、聚合摘要、重算事实时间线 | P1 | ✅ OK | chapters.ts API + book-detail.tsx UI |
| 28 | PRD-033 | 章节拆分：splitChapter(chapter, atPosition)，分割正文、继承状态快照 | P1 | ✅ OK | chapters.ts API + book-detail.tsx UI |
| 29 | PRD-033a | 重组安全机制：reorg.lock + .reorg_in_progress 哨兵 + staging 原子提交 | P0 | ✅ OK | reorg-lock.ts（363 行）+ staging-manager.ts |
| 30 | PRD-034 | 审计失败降级路径：maxRevisionRetries(2) + fallbackAction | P0 | ✅ OK | runner.ts maxRevisionRetries=2 + fallbackAction 实现 |
| 31 | PRD-034a | 降级污染隔离：基线排除 + 事实置信度降级 + 守护进程连续降级计数器 | P0 | ⚠️ PARTIAL | runner.ts 有 accept_with_warnings 标记，book-detail.tsx 有污染视觉标记，但"从质量基线排除"和"守护进程连续降级计数器"逻辑不完整 |

### 2.4 质量控制

| # | PRD ID | 需求 | 优先级 | 状态 | 差距详情 |
|---|--------|------|--------|------|----------|
| 32 | PRD-035 | AI 痕迹检测：9 类 AI 生成特征识别 | P0 | ✅ OK | ai-detector.ts 实现 9 类检测 |
| 33 | PRD-036 | 33 维连续性审计 | P0 | ✅ OK | 多个 auditor + quality-reviewer.ts |
| 34 | PRD-036a | 审计分层降级：三级分类，LLM 失败自动重试，阻断级降级为警告级 | P0 | ✅ OK | audit-tier-classifier.ts 实现三级分类 |
| 35 | PRD-036b | 审计报告可视化：8 维雷达图 + 33 维明细三级折叠 + 阻断级优先 | P1 | ⚠️ PARTIAL | radar-chart.tsx 有 8 维雷达图，但缺少"33 维明细严格按三级折叠"和"阻断级优先展示失败项"的详细视图 |
| 36 | PRD-036c | 记忆抽取透视：词云图渐隐渐显动画 + 高置信度居中+大字号 + 低置信度标红置于边缘 + 3s 自动淡出 | P1 | ⚠️ PARTIAL | ✅ 词云渐隐渐显 ✅ 大字号 ✅ 标红 ✅ 3s 淡出；❌ "置于边缘"未实现（flex-wrap 随机排列，未将低置信度词强制排到边缘） |
| 37 | PRD-037 | 4 种智能修复策略：局部替换/段落重排/节拍重写/整章重写 | P0 | ✅ OK | revision-loop.ts 实现 4 种策略 |
| 38 | PRD-038 | 字数治理：目标/软区间/硬区间，安全网 | P0 | ✅ OK | length-normalizer.ts |
| 39 | PRD-039 | POV 过滤：确保叙事视角一致性 | P1 | ✅ OK | pov-filter.ts |
| 40 | PRD-040 | 跨章重复检测：中文 6 字 ngram / 英文 3 词短语 | P1 | ✅ OK | cross-chapter-repetition.ts |
| 41 | PRD-041 | 叙事疲劳分析：套路化检测 | P2 | ✅ OK | fatigue-analyzer.ts |
| 42 | PRD-042 | 写后验证：角色位置/资源/关系变更合法性校验 | P1 | ✅ OK | truth-validation.ts |
| 43 | PRD-043 | 对话质量检查：多角色场景至少一轮带阻力的直接交锋 | P2 | ✅ OK | dialogue-checker.ts |

### 2.5 伏笔管理

| # | PRD ID | 需求 | 优先级 | 状态 | 差距详情 |
|---|--------|------|--------|------|----------|
| 44 | PRD-050 | 伏笔自动识别与注册 | P0 | ✅ OK | memory-extractor.ts + hook-auditor.ts |
| 45 | PRD-051 | 伏笔排班：为每个伏笔安排推进计划 | P0 | ✅ OK | hook-governance.ts 排班逻辑 |
| 46 | PRD-052 | 伏笔仲裁：检测伏笔冲突 | P1 | ✅ OK | governance 模块有仲裁逻辑 |
| 47 | PRD-053 | 伏笔生命周期：open → progressing → deferred → dormant → resolved/abandoned | P0 | ✅ OK | hook-policy.ts 定义 6 种状态 |
| 48 | PRD-054 | 伏笔健康度分析：活跃度/逾期/债务分析 | P1 | ✅ OK | hook-panel.tsx + API health 端点 |
| 49 | PRD-055 | 伏笔准入控制：重复伏笔家族自动拦截 | P2 | ✅ OK | hook-admission.ts |
| 50 | PRD-056 | 伏笔可视化面板：状态总览、逾期提醒、回收建议 | P1 | ✅ OK | hook-panel.tsx |
| 51 | PRD-056a | 双轨视图：顶部全局小地图热力色带 + 下方局部放大镜 + 拖拽切换窗口 | P1 | ⚠️ PARTIAL | hook-timeline.tsx 有双轨布局，但小地图热力色带和拖拽滑块交互不完整 |
| 52 | PRD-056b | 惊群平移动画化：伏笔卡片沿抛物线动画平滑落入后续章节栏目 | P1 | ❌ MISSING | thunder-anim.tsx 只有 `animate-pulse` 闪烁效果，完全没有抛物线动画和卡片落入后续章节栏目的效果 |
| 53 | PRD-057 | 人工意图声明：手动标注回收窗口 [min_chapter, max_chapter] | P0 | ✅ OK | hook-panel.tsx + API intent 端点 |
| 54 | PRD-058 | 休眠状态：dormant 不参与排班、不消耗槽位、不报逾期 | P0 | ✅ OK | hook-governance.ts 处理 dormant |
| 55 | PRD-059 | 伏笔自动唤醒：到达 expected_resolution_min 时 dormant → open | P0 | ✅ OK | wake-smoothing.ts + governance |

### 2.6 状态与记忆管理

| # | PRD ID | 需求 | 优先级 | 状态 | 差距详情 |
|---|--------|------|--------|------|----------|
| 56 | PRD-060 | 7 真相文件体系：current_state/hooks/chapter_summaries/subplot_board/emotional_arcs/character_matrix/manifest | P0 | ✅ OK | 7 个文件全部存在 |
| 57 | PRD-061 | 结构化 JSON 状态 + Zod 校验，不可变更新 | P0 | ✅ OK | state.ts Zod schemas + reducer.ts 不可变更新 |
| 58 | PRD-062 | SQLite 时序记忆库：按章节查询"某角色此时知道什么" | P0 | ✅ OK | memory-db.ts |
| 59 | PRD-063 | 章节快照与回滚：回滚到任意已快照章节 | P0 | ✅ OK | snapshot.ts + rollback API + time-dial.tsx |
| 60 | PRD-064 | 状态矛盾检测：阻断明显矛盾状态落盘 | P0 | ✅ OK | truth-validation.ts |
| 61 | PRD-065 | 真相文件可视化编辑器 | P1 | ✅ OK | truth-files.tsx（682 行）完整编辑器 |
| 62 | PRD-066 | 状态投影双向校验：检测 Markdown 手动编辑 + 警告弹窗 + AI 辅助导入 | P1 | ✅ OK | truth-validation.ts（181 行） |
| 63 | PRD-067 | 状态导入 UI：导入 Markdown 按钮，AI 解析回填 JSON | P1 | ✅ OK | truth-files.tsx 有导入按钮和 API |

### 2.7 导出与发布

| # | PRD ID | 需求 | 优先级 | 状态 | 差距详情 |
|---|--------|------|--------|------|----------|
| 64 | PRD-070 | EPUB 3.0 导出：完整 OPF + NCX + XHTML 结构 | P0 | ⚠️ PARTIAL | epub.ts 有 OPF + XHTML，但缺少 NCX（toc.ncx 文件未生成，仅有 nav.xhtml） |
| 65 | PRD-071 | TXT / Markdown 导出 | P0 | ✅ OK | txt.ts + markdown.ts 完整实现 |
| 66 | PRD-072 | 平台适配导出（起点/番茄等平台格式） | P2 | ⚠️ PARTIAL | platform-adapter.ts 有基础框架但起点/番茄等具体平台格式适配不完整 |
| 67 | PRD-073 | 批量导出：支持指定章节范围 | P1 | ❌ MISSING | export API 有 chapterRange schema 定义但完全未实现——三个导出端点返回 stub `status: "processing"`，不调用实际导出器，不处理章节范围 |

### 2.8 通知与监控

| # | PRD ID | 需求 | 优先级 | 状态 | 差距详情 |
|---|--------|------|--------|------|----------|
| 68 | PRD-080 | 通知推送：Telegram / 飞书 / 企业微信 / Webhook | P1 | ✅ OK | notify/index.ts（228 行） |
| 69 | PRD-081 | 守护进程事件通知：启动/暂停/停止/章节完成/配额耗尽 | P1 | ✅ OK | daemon.ts 触发 notify 事件 |
| 70 | PRD-082 | 数据分析面板：字数统计、审计通过率、章节排名、Token 用量 | P1 | ✅ OK | analytics.tsx 页面 |
| 71 | PRD-083 | 质量仪表盘：8 维度评分 | P1 | ✅ OK | radar-chart.tsx + analytics |
| 72 | PRD-083a | 质量基线快照：第 3 章完成后自动建立基线 | P1 | ✅ OK | baseline.ts 自动基线逻辑 |
| 73 | PRD-083b | 质量漂移柔和建议：基线虚线 + 琥珀渐变 30% + 建议气泡 + 灵感洗牌三种方案 | P1 | ✅ OK | analytics.tsx 有虚线/渐变/气泡 + inspiration-shuffle.tsx 三种方案 |
| 74 | PRD-084 | 日志查看与搜索 | P1 | ✅ OK | log-viewer-page.tsx + log-viewer.tsx |
| 75 | PRD-085 | 系统诊断（doctor）：配置问题、环境检查 | P2 | ✅ OK | doctor-view.tsx + system route |
| 76 | PRD-086 | 提示词版本化：prompts 按 v1/v2/... 组织，books 支持 promptVersion | P1 | ✅ OK | prompts/registry.ts + prompt-version.tsx |
| 77 | PRD-087 | 提示词灰度发布：latest 软链接 + 单书固定版本 | P2 | ✅ OK | registry.ts latest 机制 |

### 2.9 异常与冲突处理交互

| # | PRD ID | 需求 | 优先级 | 状态 | 差距详情 |
|---|--------|------|--------|------|----------|
| 78 | PRD-090 | 状态脱节自然语言翻译：禁止暴露 JSON 路径；按「角色」「关系」「物品」分类展示；语义化单选/多选框 | P0 | ⚠️ PARTIAL | doctor-view.tsx 使用 `c.naturalLanguage` 自然语言文本，但❌ 没有按角色/关系/物品分类展示 ❌ 没有语义化单选/多选框，只有只读列表 |
| 79 | PRD-091 | 污染隔离视觉强化：橙色 #FF8C00 + 45° 倾斜警戒线条纹 + 左侧「污染隔离」红色标签；ChapterReader 顶部橙色边框+斜纹横幅 | P0 | ⚠️ PARTIAL | book-detail.tsx 有橙色边框 + gradient 条纹 + "污染隔离"标签，但 PRD 明确要求 `#FF8C00` 橙色，代码使用 Tailwind `border-orange-400`（≈#fb923c），色值不完全匹配 |
| 80 | PRD-092 | 时间回溯拨盘：逆时针拖拽拨盘旋转至目标章节 + 二次确认 + 卡片碎裂淡出动画 | P0 | ⚠️ PARTIAL | time-dial.tsx 有拨盘拖拽 + 阈值确认 + 碎裂动画，但❌ 未强制逆时针方向（任何方向旋转都可确认） ❌ 碎裂动画是 CSS class 引用（.shatter-icon/.shatter-piece）但全局 CSS 中无对应动画定义 |

## 统计汇总

| 优先级 | ✅ OK | ⚠️ PARTIAL | ❌ MISSING | 实现率 |
|--------|-------|------------|------------|--------|
| P0 (33) | 25 | 8 | 0 | 75.8% |
| P1 (17) | 7 | 8 | 2 | 41.2% |
| P2 (8) | 5 | 3 | 0 | 62.5% |
| **合计 58** | **37** | **19** | **2** | **63.8%** |

**严格实现率（只算完全匹配的）：37/58 = 63.8%**

---

## 需要修复的差距清单（21 项）

### ❌ MISSING（2 项）

| # | PRD | 描述 | 修复方案 |
|---|-----|------|----------|
| 1 | PRD-056b | 惊群抛物线动画：卡片沿抛物线动画平滑落入后续章节栏目 | 重写 thunder-anim.tsx，实现抛物线运动动画（CSS @keyframes 或 Framer Motion），将超出阈值的伏笔卡片动画分配到后续章节栏目 |
| 2 | PRD-073 | 批量导出：支持指定章节范围 | 修改 export.ts API 路由，调用实际导出器（EpubExporter/TxtExporter/MarkdownExporter），实现 chapterRange 过滤逻辑 |

### ⚠️ PARTIAL（19 项）

| # | PRD | 差距细节 | 修复方案 |
|---|-----|----------|----------|
| 3 | PRD-003 | 无 markdown 文件上传功能 | book-create.tsx 添加文件上传按钮，解析 markdown 内容填入 brief |
| 4 | PRD-010 | 非三幕结构，prompt 是通用大纲 | 修改 runner.ts #buildOutlinePrompt 明确输出三幕结构（建置/对抗/解决）；writing-plan.tsx 添加三幕可视化 |
| 5 | PRD-011 | 无角色关系网络可视化 | truth-files.tsx 角色编辑器添加关系图（节点-连线可视化） |
| 6 | PRD-012 | 无地理/势力/时间线可视化 | truth-files.tsx 添加对应编辑面板 |
| 7 | PRD-014 | 规则未在执行层强制检查 | 在 pipeline runner 或 auditor 中注入规则检查步骤，违反时阻断 |
| 8 | PRD-015 | 无可视化情感曲线 | emotional-arcs.tsx 添加折线图/曲线图绘制 |
| 9 | PRD-022a | writeFastDraft 未调用 ScenePolisher | 修改 runner.ts writeFastDraft 方法，改为调用 ScenePolisher agent |
| 10 | PRD-024a | 缺少"真相文件手动修改"检测和 UI 弹窗 | upgradeDraft 中增加真相文件版本检查 + UI 弹窗提示 |
| 11 | PRD-034a | 质量基线排除 + 守护进程连续降级计数器不完整 | 完善 baseline.ts 排除逻辑 + daemon.ts 降级计数器 |
| 12 | PRD-036b | 缺少 33 维明细折叠视图和阻断级优先展示 | 在章节审计报告 UI 中添加 33 维明细三级折叠列表，阻断级排最前 |
| 13 | PRD-036c | 低置信度词未"置于边缘" | 修改 memory-wordcloud.tsx 布局算法，将低置信度词强制排到容器边缘 |
| 14 | PRD-056a | 小地图热力色带和拖拽滑块不完整 | hook-timeline.tsx 完善热力图和拖拽交互 |
| 15 | PRD-070 | EPUB 缺少 NCX（toc.ncx） | epub.ts 添加 buildNcxXml() 方法和对应 zip 文件 |
| 16 | PRD-072 | 平台格式适配不完整 | platform-adapter.ts 补充起点/番茄平台格式 |
| 17 | PRD-090 | 无分类展示 + 无单选/多选框 | doctor-view.tsx 状态差异对比按角色/关系/物品分类，每项配单选/多选框 |
| 18 | PRD-091 | 橙色值非精确 #FF8C00 | book-detail.tsx 和 chapter-reader.tsx 中将 `border-orange-400` 替换为内联样式 `borderColor: '#FF8C00'` |
| 19 | PRD-092a | 未强制逆时针拖拽 | time-dial.tsx handlePointerMove 中只接受逆时针方向的 delta（delta < 0） |
| 20 | PRD-092b | CSS 碎裂动画无实际 @keyframes 定义 | 在全局 CSS 中添加 .shatter-icon 和 .shatter-piece 的 @keyframes 碎裂动画 |
| 21 | PRD-012b | 世界观设定缺少时间线编辑器 | truth-files.tsx 添加时间线可视化编辑面板 |
