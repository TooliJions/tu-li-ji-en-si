# Requirements: CyberNovelist v7.0

**Defined:** 2026-04-21
**Core Value:** 全自动产出风格一致、逻辑连贯的长篇小说章节，人工只需审核与微调。

## v1 Requirements

Milestone v1.0 — 初始版本。覆盖 PRD 中 P0 和部分关键 P1 需求。

### 项目初始化

- [ ] **INIT-01**: 用户可创建新书，设置书名、题材、目标字数、语言
- [ ] **INIT-02**: 系统提供题材模板库（都市、玄幻、科幻、仙侠等），预置题材规则
- [ ] **INIT-03**: 用户可上传创作简报（支持 Markdown 文件导入已有设定）

### 创作规划

- [ ] **PLAN-01**: 用户输入灵感后，AI 辅助生成大纲（三幕结构/章节概要）
- [ ] **PLAN-02**: 用户可设计角色：姓名、性格、背景、能力、关系网络
- [ ] **PLAN-03**: 用户可设定世界观：力量体系、地理、势力、时间线
- [ ] **PLAN-04**: 系统可生成分章规划：每章目标、出场人物、关键事件、伏笔埋设
- [ ] **PLAN-05**: 用户可通过世界规则编辑器设定不可违反的硬性约束

### 章节创作

- [ ] **WRITE-01**: 系统可执行单章完整创作：草稿 → 审计 → 修订 → 持久化
- [ ] **WRITE-02**: 用户可指定起止章号进行连续写章
- [ ] **WRITE-03**: 草稿模式可生成草稿并持久化，跳过审计修订，结果标记为 draft 状态
- [ ] **WRITE-04**: 快速试写仅单次 LLM 调用生成草稿，不持久化
- [ ] **WRITE-05**: 快速试写按钮可在 UI 上一键生成，首段产出 <15s
- [ ] **WRITE-06**: 草稿升级时可自动刷新上下文卡片，检测世界状态变更并提示
- [ ] **WRITE-07**: 系统可结合长期意图和当前焦点生成章节意图
- [ ] **WRITE-08**: 系统可按相关性自动选择上下文，避免膨胀
- [ ] **WRITE-09**: 系统可编译规则栈：聚合世界规则、角色契约、题材约束
- [ ] **WRITE-10**: 守护进程可后台自动批量写章，支持启停/恢复
- [ ] **WRITE-11**: 智能间隔策略可监控 RPM 限流自动延长间隔，支持间隔=0 即时启动
- [ ] **WRITE-12**: 重组安全机制通过 reorg.lock + 哨兵 + staging 原子提交防止崩溃误判
- [ ] **WRITE-13**: 审计失败可降级：maxRevisionRetries（默认 2 次）+ fallbackAction
- [ ] **WRITE-14**: 降级污染隔离可将 accept_with_warnings 章节从质量基线排除

### 质量控制

- [ ] **QUAL-01**: 系统可识别 9 类 AI 生成特征（套话/句式单调/语义重复等）
- [ ] **QUAL-02**: 系统可执行 33 维连续性审计（角色状态/时间线/伏笔/实体/物理法则等）
- [ ] **QUAL-03**: 审计分层降级：33 维分三级（阻断级/警告级/建议级），单维失败自动重试
- [ ] **QUAL-04**: 系统支持 4 种智能修复策略：局部替换/段落重排/节拍重写/整章重写
- [ ] **QUAL-05**: 系统可执行字数治理：目标/软区间/硬区间，安全网防止毁章
- [ ] **QUAL-06**: 系统可执行 POV 过滤确保叙事视角一致性
- [ ] **QUAL-07**: 系统可执行跨章重复检测：中文 6 字 ngram / 英文 3 词短语
- [ ] **QUAL-08**: 系统可执行写后验证：角色位置/资源/关系变更的合法性校验

### 伏笔管理

- [ ] **HOOK-01**: 系统可自动识别与注册伏笔（埋设时）
- [ ] **HOOK-02**: 系统可为每个伏笔安排推进计划（排班）
- [ ] **HOOK-03**: 系统支持伏笔生命周期：open → progressing → deferred → dormant → resolved/abandoned
- [ ] **HOOK-04**: 用户可手动标注长线伏笔预期回收窗口 [min_chapter, max_chapter]
- [ ] **HOOK-05**: 休眠状态伏笔不参与排班、不消耗活跃槽位、不报逾期
- [ ] **HOOK-06**: 系统可自动唤醒伏笔：章节到达 expected_resolution_min 时 dormant → open

### 状态与记忆

- [ ] **STATE-01**: 系统维护 7 真相文件体系：current_state/hooks/chapter_summaries/subplot_board/emotional_arcs/character_matrix/manifest
- [ ] **STATE-02**: 状态使用结构化 JSON + Zod 校验，不可变更新
- [ ] **STATE-03**: SQLite 时序记忆库支持按章节查询"某角色此时知道什么"
- [ ] **STATE-04**: 系统支持章节快照与回滚：回滚到任意已快照章节
- [ ] **STATE-05**: 系统可检测状态矛盾，阻断明显矛盾状态落盘

### 导出

- [ ] **EXPORT-01**: 系统可导出 EPUB 3.0：完整 OPF + NCX + XHTML 结构
- [ ] **EXPORT-02**: 系统可导出 TXT / Markdown 格式

### 异常交互

- [ ] **UX-01**: 状态脱节时以自然语言翻译差异，不暴露技术术语
- [ ] **UX-02**: accept_with_warnings 章节有视觉强化标识（橙色边框+斜纹背景）
- [ ] **UX-03**: 回滚操作通过时间回溯拨盘交互确认，强调不可逆性

### 非功能需求

- [ ] **NFR-01**: 快速试写首段产出 < 15s
- [ ] **NFR-02**: 草稿模式生成并持久化 < 30s
- [ ] **NFR-03**: 单章完整创作：本地模型 < 120s，云端模型 < 60s
- [ ] **NFR-04**: 章节加载延迟 < 500ms
- [ ] **NFR-05**: 20+ 章后上下文注入 < 模型 token 上限的 80%
- [ ] **NFR-06**: SQLite 并发写入支持（WAL 模式 + busy_timeout）
- [ ] **NFR-07**: 单章写入事务原子性，未提交事务自动回滚
- [ ] **NFR-08**: API 密钥不提交到 git
- [ ] **NFR-09**: 导出路径限制在项目目录内部，防止路径穿越
- [ ] **NFR-10**: 文件锁防止并发写入损坏
- [ ] **NFR-11]: 非正常退出恢复：断电/崩溃后自动回滚未提交事务
- [ ] **NFR-12**: 核心单元测试覆盖率 > 80%

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### 同人创作

- **FANFIC-01**: 同人模式初始化（canon/au/ooc/cp 四种模式）
- **FANFIC-02**: 文风仿写：分析参考作品提取风格指纹并注入

### 高级规划

- **ADVPLAN-01**: 情感弧线编辑器：追踪角色情感变化轨迹

### 高级质量

- **ADVQUAL-01**: 叙事疲劳分析：长跨度写作中的套路化检测
- **ADVQUAL-02**: 对话质量检查：多角色场景至少一轮带阻力的直接交锋
- **ADVQUAL-03**: 审计报告可视化：8 维度雷达图 + 33 维明细折叠展示
- **ADVQUAL-04**: 记忆抽取透视：词云图动画展示事实碎片和世界规则

### 高级伏笔

- **ADVHOOK-01**: 伏笔仲裁：检测伏笔冲突（时间/角色/主题重叠）
- **ADVHOOK-02**: 伏笔健康度分析：活跃度/逾期/债务分析
- **ADVHOOK-03**: 伏笔准入控制：重复伏笔家族自动拦截
- **ADVHOOK-04**: 伏笔可视化面板：状态总览、逾期提醒、回收建议
- **ADVHOOK-05**: 伏笔调度时间轴（双轨视图）
- **ADVHOOK-06**: 惊群平移动画化

### 通知与监控

- **NOTIF-01**: 通知推送：Telegram / 飞书 / 企业微信 / Webhook
- **NOTIF-02**: 守护进程事件通知：启动/暂停/停止/章节完成/配额耗尽
- **NOTIF-03**: 数据分析面板：字数统计、审计通过率、章节排名、Token 用量
- **NOTIF-04**: 质量仪表盘：8 维度评分
- **NOTIF-05**: 质量基线快照：第 3 章完成后自动建立基线
- **NOTIF-06**: 质量漂移柔和建议 + 灵感洗牌按钮
- **NOTIF-07**: 日志查看与搜索
- **NOTIF-08**: 提示词版本化：prompts 按 v1/v2/... 组织

### 发布与运维

- **PUB-01**: 平台适配导出（起点/番茄等平台格式）
- **PUB-02**: 批量导出：支持指定章节范围
- **PUB-03**: 系统诊断（doctor）：配置问题、环境检查
- **PUB-04**: 提示词灰度发布：latest 软链接 + 单书固定版本

### 高级写作

- **ADVWRITE-01**: 每日配额保护：单日最大 Token 消耗上限
- **ADVWRITE-02**: 章节合并：mergeChapters(from, to)
- **ADVWRITE-03**: 章节拆分：splitChapter(chapter, atPosition)
- **ADVWRITE-04**: 自然语言 Agent 模式：用对话方式指挥创作

### 高级状态

- **ADVSTATE-01**: 真相文件可视化编辑器
- **ADVSTATE-02**: 状态投影双向校验：检测 Markdown 手动编辑 + 警告弹窗
- **ADVSTATE-03**: 状态导入 UI：TruthFiles 编辑器「导入 Markdown」按钮

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| 云端同步/多设备协作 | 本地优先架构，不在 v1.0 范围 |
| 移动端 App | Web-first，移动端后期考虑 |
| 多人协作创作 | 核心用户场景是单人创作 |
| 语音输入/输出 | 非核心写作流程需求 |
| AI 生成封面/插图 | 文字创作为核心，视觉内容为附加功能 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

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
| WRITE-10 | Phase 6 | Pending |
| WRITE-11 | Phase 6 | Pending |
| WRITE-12 | Phase 4 | Pending |
| WRITE-13 | Phase 6 | Pending |
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
- v1 requirements: 65 total
- Mapped to phases: 65
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-21*
*Last updated: 2026-04-21 after initial definition*
