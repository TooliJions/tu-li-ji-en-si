# CyberNovelist API 接口文档

> 版本: 2.0 | 日期: 2026-05-02 | 配套架构 v2.0 | 7 阶段流程瘦身后正式发布

## 1. 概述

CyberNovelist 提供 RESTful JSON + SSE 推送接口,严格按照 7 阶段同步流程组织路由模块。

### 1.1 技术栈

- **Web 框架**:Hono v4.6+
- **校验**:Zod 3.24+
- **数据格式**:JSON / SSE 推送
- **认证**:目前为本地优先,无需 token

### 1.2 通用约定

| 项 | 约定 |
|---|---|
| 基础路径 | `http://localhost:3000/api` |
| 内容类型 | `application/json; charset=utf-8` |
| 时间戳 | ISO 8601(`2026-05-02T08:30:00.000Z`) |
| 章节号 | 从 1 起的整数 |
| ID 格式 | `{prefix}_{uuid}`,如 `seed_abc123` |
| 错误响应 | `{ error: { code: 'XXX', message: '...' } }` |
| 成功响应 | `{ data: ... }` 或 `{ data, exists }`(GET 工作流文档时) |

### 1.3 7 阶段路由分布

| 阶段 | 路由前缀 | 端点数 | 路由文件 |
|---|---|---|---|
| ① 灵感输入 | `/api/books/:bookId/inspiration` | 3 | `routes/inspiration.ts` |
| ② 规划 | `/api/books/:bookId/planning-brief` | 3 | `routes/planning-brief.ts` |
| ③ 总纲规划 | `/api/books/:bookId/story-outline` | 4 | `routes/story-outline.ts` |
| ④ 细纲规划 | `/api/books/:bookId/detailed-outline` | 4 | `routes/detailed-outline.ts` |
| ⑤ 章节正文 | `/api/books/:bookId/chapters/*` `/pipeline` `/writing` | ~15 | `routes/chapters/`、`routes/pipeline.ts` |
| ⑥ 质量检查 | `/api/books/:bookId/quality` `/analytics` `/hooks` | ~15 | `routes/quality.ts`、`routes/analytics.ts`、`routes/hooks.ts` |
| ⑦ 导出 | `/api/books/:bookId/export` | 4 | `routes/export.ts` |
| 基础设施 | `/api/books`、`/api/state`、`/api/config`、`/api/system`、`/api/prompts`、`/api/genres`、`/api/sse` | ~15 | `routes/books.ts` 等 |

---

## 2. 基础:书籍管理(`/api/books`)

### 2.1 获取书籍列表

```
GET /api/books
```

响应:
```json
{
  "data": [
    {
      "id": "book_001",
      "title": "示例书名",
      "genre": "xuanhuan",
      "chapterCount": 12,
      "wordCount": 36000,
      "createdAt": "2026-04-18T10:00:00.000Z"
    }
  ]
}
```

### 2.2 创建书籍

```
POST /api/books
```

请求:
```json
{
  "title": "新书",
  "genre": "xuanhuan",
  "language": "zh-CN"
}
```

### 2.3 获取/更新/删除书籍

- `GET /api/books/:bookId`
- `PATCH /api/books/:bookId`
- `DELETE /api/books/:bookId`
- `GET /api/books/:bookId/recent-activity`

---

## 3. 阶段 ① 灵感输入(`/api/books/:bookId/inspiration`)

### 3.1 获取当前灵感种子

```
GET /api/books/:bookId/inspiration
```

响应:
```json
{
  "data": {
    "id": "seed_abc",
    "sourceText": "原始灵感文本...",
    "genre": "xuanhuan",
    "theme": "逆袭",
    "conflict": "身份暴露",
    "tone": "热血",
    "constraints": ["不降智", "升级明确"],
    "sourceType": "manual",
    "createdAt": "2026-05-02T08:00:00.000Z"
  },
  "exists": true
}
```

### 3.2 创建灵感种子

```
POST /api/books/:bookId/inspiration
```

请求:
```json
{
  "sourceText": "把你的灵感、片段、想法先倒进来",
  "genre": "xuanhuan",
  "theme": "逆袭",
  "conflict": "身份暴露",
  "tone": "热血",
  "constraints": ["不降智", "升级明确"],
  "sourceType": "manual"
}
```

`sourceType` 取值:`manual` / `shuffle` / `import`

### 3.3 更新灵感种子

```
PATCH /api/books/:bookId/inspiration
```

请求体为部分字段补丁。

---

## 4. 阶段 ② 规划(`/api/books/:bookId/planning-brief`)

### 4.1 获取规划简报

```
GET /api/books/:bookId/planning-brief
```

### 4.2 创建规划简报

```
POST /api/books/:bookId/planning-brief
```

请求:
```json
{
  "audience": "20-30 岁男性读者",
  "genreStrategy": "玄幻+逆袭+复仇",
  "styleTarget": "热血爽文",
  "lengthTarget": "200 万字",
  "tabooRules": ["禁止主角降智", "禁止过度狗血"],
  "marketGoals": ["进起点新书榜", "签约白银盟"],
  "creativeConstraints": ["主线 5 卷", "感情线慢热"]
}
```

### 4.3 更新规划简报

```
PATCH /api/books/:bookId/planning-brief
```

支持更新 `status` 字段(`draft` / `ready` / `approved`)。

---

## 5. 阶段 ③ 总纲规划(`/api/books/:bookId/story-outline`)

### 5.1 获取总纲

```
GET /api/books/:bookId/story-outline
```

响应:
```json
{
  "data": {
    "id": "outline_xyz",
    "planningBriefId": "brief_001",
    "meta": {
      "novelType": "xuanhuan",
      "novelSubgenre": "东方玄幻",
      "typeConfidence": 0.92,
      "typeIsAuto": true,
      "genderTarget": "male",
      "architectureMode": "lotus_map",
      "titleSuggestions": ["逆天剑帝", "仙路无终"],
      "estimatedWordCount": "200 万字",
      "endingType": "HE",
      "oneLineSynopsis": "..."
    },
    "base": {
      "sellingPoints": { ... },
      "theme": { ... },
      "goldenOpening": { "chapter1": ..., "chapter2": ..., "chapter3": ... },
      "writingStyle": { ... },
      "characters": [ ... ],
      "relationships": [ ... ],
      "outlineArchitecture": { ... },
      "foreshadowingSeed": { ... },
      "completionDesign": { ... }
    },
    "typeSpecific": {
      "kind": "fantasy",
      "data": { "powerSystem": ..., "goldenFinger": ... }
    },
    "createdAt": "...",
    "updatedAt": "..."
  },
  "exists": true
}
```

### 5.2 创建总纲(手动模式)

```
POST /api/books/:bookId/story-outline
```

请求:
```json
{
  "mode": "manual",
  "meta": { ... },
  "base": { ... },
  "typeSpecific": { ... }
}
```

### 5.3 创建总纲(AI 自动生成模式)

```
POST /api/books/:bookId/story-outline
```

请求:
```json
{ "mode": "generate" }
```

**前置条件**:必须已存在 `InspirationSeed` 和 `PlanningBrief`。

**行为**:调用 `OutlineGenerator` Agent 一次 LLM 调用产出三层 `StoryBlueprint`,自动跑 5 条规则校验:
- R-01:`architectureMode == GENRE_TO_ARCHITECTURE[novelType]`
- R-02:`typeSpecific.kind` 与 `novelType` 匹配
- R-03:关系引用必须存在
- R-04:至少 1 个主角
- R-05:`endingType` 一致

校验失败响应:
```json
{
  "error": {
    "code": "OUTLINE_VALIDATION_FAILED",
    "message": "总纲一致性校验失败",
    "issues": [
      { "rule": "R-01", "severity": "critical", "description": "架构模式不匹配" },
      { "rule": "R-04", "severity": "critical", "description": "缺少主角" }
    ]
  }
}
```

### 5.4 更新总纲

```
PATCH /api/books/:bookId/story-outline
```

支持局部字段更新,不重新跑 LLM。

---

## 6. 阶段 ④ 细纲规划(`/api/books/:bookId/detailed-outline`)

### 6.1 获取细纲

```
GET /api/books/:bookId/detailed-outline
```

响应:
```json
{
  "data": {
    "id": "detailed_001",
    "storyBlueprintId": "outline_xyz",
    "totalChapters": 200,
    "estimatedTotalWords": "200 万字",
    "volumes": [
      {
        "volumeNumber": 1,
        "title": "第一卷:出山",
        "arcSummary": "...",
        "chapterCount": 50,
        "chapters": [
          {
            "chapterNumber": 1,
            "title": "雷霆降世",
            "wordCountTarget": 3500,
            "sceneSetup": "山门外暴雨夜",
            "charactersPresent": ["mc", "mentor"],
            "coreEvents": ["主角觉醒异象", "导师离世"],
            "emotionArc": "悲愤 → 决然",
            "chapterEndHook": "敌人黑影逼近",
            "foreshadowingOps": [
              { "foreshadowingId": "f1", "operation": "plant", "detail": "黑色印记" }
            ],
            "satisfactionType": "升级",
            "keyDialogueHints": ["导师遗言"],
            "writingNotes": "节奏:短句切割,情绪密集",
            "contextForWriter": {
              "storyProgress": "故事开端,主角刚拜师",
              "chapterPositionNote": "黄金第 1 章,需建立世界观与吸引力",
              "characterStates": [
                { "characterId": "mc", "powerLevel": "凡人", "emotionalState": "迷茫", "keySecret": "血脉觉醒在即", "relationshipWithPov": "self" }
              ],
              "activeWorldRules": ["雷劫降临会唤醒血脉"],
              "activeForeshadowingStatus": [
                { "foreshadowingId": "f1", "status": "planted", "lastDevelopment": "" }
              ],
              "precedingChapterBridge": { "cliffhanger": "", "emotionalCarry": "", "unresolvedTension": "" },
              "nextChapterSetup": { "seedForNext": "黑影身份", "expectedDevelopment": "暴露追兵" }
            }
          }
        ]
      }
    ],
    "createdAt": "...",
    "updatedAt": "..."
  },
  "exists": true
}
```

### 6.2 创建细纲(AI 自动生成)

```
POST /api/books/:bookId/detailed-outline
```

请求:
```json
{ "mode": "generate" }
```

**前置条件**:必须已存在 `StoryBlueprint`。

**行为**:调用 `DetailedOutlineGenerator`,卷骨架 → 逐卷补 chapters,每章含完整 `contextForWriter`。超过 50 章按卷分批生成。

跑 7 条规则校验(R-06..R-12),校验失败时按 R-XX 返回 issues 列表。

### 6.3 更新单章细纲

```
PATCH /api/books/:bookId/detailed-outline/chapters/:chapterNumber
```

请求体为单章字段补丁。

### 6.4 获取单章上下文

```
GET /api/books/:bookId/detailed-outline/chapters/:chapterNumber/context
```

返回该章的 `contextForWriter`,供章节正文阶段消费。

---

## 7. 阶段 ⑤ 章节正文(`/api/books/:bookId/chapters/*` + `/pipeline` + `/writing`)

### 7.1 章节列表 / 详情 / 更新 / 合并 / 拆分 / 回滚

```
GET /api/books/:bookId/chapters
GET /api/books/:bookId/chapters/:chapterNumber
PATCH /api/books/:bookId/chapters/:chapterNumber
POST /api/books/:bookId/chapters/merge       # body: { from, to }
POST /api/books/:bookId/chapters/split       # body: { chapter, atPosition }
POST /api/books/:bookId/chapters/:chapterNumber/rollback
```

### 7.2 完整创作

```
POST /api/books/:bookId/pipeline/write-next
```

调用 `PipelineRunner.writeNextChapter()`,15 步完整链路。

请求(可选):
```json
{
  "userIntent": "本章要展开兵分两路的支线",
  "wordCountTarget": 3500
}
```

响应:`{ data: { chapterNumber, title, wordCount, status, auditPassed } }`

### 7.3 快速试写

```
POST /api/books/:bookId/pipeline/fast-draft
```

仅单次 LLM,首段产出 < 15s,**不持久化**。

### 7.4 草稿模式

```
POST /api/books/:bookId/pipeline/draft
```

跳过审计修订,持久化为 `draft` 状态。

### 7.5 草稿转正

```
POST /api/books/:bookId/pipeline/upgrade-draft
```

把 draft 章节启动审计修订流程。会检查上下文漂移。

### 7.6 单章计划(降级补全器)

```
POST /api/books/:bookId/chapter-plan
```

仅当细纲缺失或不完整时调用,补齐 sceneBreakdown / openingHook / closingHook。

### 7.7 流水线进度

```
GET /api/books/:bookId/pipeline/progress
```

返回最近一次调用的详细步骤进度。

### 7.8 写作意图

```
POST /api/books/:bookId/writing/intent
```

直接调用 `IntentDirector`,产出本章叙事目标。

---

## 8. 阶段 ⑥ 质量检查(`/api/books/:bookId/quality` + `/analytics` + `/hooks`)

### 8.1 手动审计

```
POST /api/books/:bookId/quality/audit
```

请求:
```json
{ "chapterNumber": 12 }
```

### 8.2 获取审计报告(33 维分组)

```
GET /api/books/:bookId/quality/report/:chapterNumber
```

响应:
```json
{
  "data": {
    "chapterNumber": 12,
    "overallScore": 84,
    "radar": {
      "aiSignature": 82, "coherence": 90, "pacing": 78,
      "dialogue": 85, "description": 80, "emotion": 88,
      "innovation": 76, "completeness": 92
    },
    "tiers": {
      "critical": [
        { "dimension": "时间线冲突", "severity": "critical", "message": "...", "fixed": false }
      ],
      "warning": [ ... ],
      "suggestion": [ ... ]
    }
  }
}
```

### 8.3 数据分析

| 端点 | 说明 |
|---|---|
| `GET /api/books/:bookId/analytics/word-count` | 字数统计 |
| `GET /api/books/:bookId/analytics/audit-pass-rate` | 审计通过率 |
| `GET /api/books/:bookId/analytics/token-usage` | Token 用量 |
| `GET /api/books/:bookId/analytics/ai-signature-trend` | AI 痕迹趋势 |
| `GET /api/books/:bookId/analytics/quality-baseline` | 质量基线与漂移 |
| `GET /api/books/:bookId/analytics/baseline-drift-alert` | 基线漂移告警状态 |
| `POST /api/books/:bookId/analytics/inspiration-shuffle` | 灵感洗牌(局部重写) |

### 8.4 伏笔管理(治理 5 层对外接口)

| 端点 | 说明 |
|---|---|
| `GET /api/books/:bookId/hooks` | 伏笔列表 |
| `POST /api/books/:bookId/hooks` | 创建伏笔 |
| `PATCH /api/books/:bookId/hooks/:hookId/status` | 更新伏笔状态 |
| `GET /api/books/:bookId/hooks/health` | 伏笔健康度 |
| `GET /api/books/:bookId/hooks/timeline` | 伏笔调度时间轴(双轨视图) |
| `GET /api/books/:bookId/hooks/wake-schedule` | 伏笔唤醒排班 |

### 8.5 状态管理(基础设施,服务于⑥)

| 端点 | 说明 |
|---|---|
| `GET /api/books/:bookId/state` | 真相文件列表 |
| `GET /api/books/:bookId/state/:fileName` | 单个真相文件 |
| `PATCH /api/books/:bookId/state/:fileName` | 更新真相文件 |
| `POST /api/books/:bookId/state/import-markdown` | 导入 Markdown 状态(AI 解析) |
| `POST /api/books/:bookId/state/rollback` | 回滚状态 |
| `GET /api/books/:bookId/state/projection-validation` | 状态投影校验结果 |

---

## 9. 阶段 ⑦ 导出(`/api/books/:bookId/export`)

### 9.1 导出 EPUB

```
POST /api/books/:bookId/export/epub
```

请求(可选):
```json
{
  "chapterRange": { "from": 1, "to": 50 },
  "includeMetadata": true
}
```

响应:返回二进制流或下载链接。

### 9.2 导出 TXT / Markdown / 平台格式

```
POST /api/books/:bookId/export/txt
POST /api/books/:bookId/export/markdown
POST /api/books/:bookId/export/platform   # body: { platform: 'qidian' | 'fanqie' }
```

---

## 10. 配置(`/api/config`)

| 端点 | 说明 |
|---|---|
| `GET /api/config` | 获取全局配置 |
| `PATCH /api/config` | 更新全局配置 |
| `POST /api/config/test-connection` | 测试 LLM 连接 |

---

## 11. 系统诊断(`/api/system`)

| 端点 | 说明 |
|---|---|
| `GET /api/system/diagnostic` | 获取诊断信息(配置 / 环境检查 / 锁状态) |
| `POST /api/system/fix-zombie-locks` | 修复僵尸锁 |
| `POST /api/system/recover-reorg` | 重组中断恢复 |
| `GET /api/system/state-diff` | 状态差异对比 |

---

## 12. 提示词版本(`/api/books/:bookId/prompts`)

| 端点 | 说明 |
|---|---|
| `GET /api/books/:bookId/prompts/versions` | 提示词版本列表 |
| `POST /api/books/:bookId/prompts/switch` | 切换版本 |
| `GET /api/books/:bookId/prompts/diff` | 版本对比 |

---

## 13. SSE 实时推送(`/api/books/:bookId/sse`)

### 13.1 连接

```
GET /api/books/:bookId/sse
Accept: text/event-stream
```

### 13.2 SSE 事件类型

| 事件 | 说明 |
|---|---|
| `pipeline_progress` | 章节正文流水线进度 |
| `memory_extracted` | 记忆抽取完成 |
| `chapter_complete` | 章节落盘完成 |
| `hook_wake` | 伏笔唤醒 |
| `thundering_herd` | 惊群事件 |
| `quality_drift` | 质量漂移告警 |
| `context_changed` | 上下文变更 |

事件示例:
```
event: chapter_complete
data: {"chapterNumber":12,"wordCount":3520,"auditPassed":true}
```

---

## 14. 上下文查询(`/api/books/:bookId/context`)

### 14.1 按实体名查询上下文

```
GET /api/books/:bookId/context?entity=林晨
```

返回该实体在当前章节附近的状态 / 关系 / 伏笔关联。

---

## 15. 错误码

| 错误码 | 含义 |
|---|---|
| `BOOK_NOT_FOUND` | 书籍不存在 |
| `INVALID_STATE` | 请求体或状态不合法 |
| `STAGE_NOT_FOUND` | 阶段尚未创建对应工作流文档 |
| `STAGE_ALREADY_EXISTS` | 阶段已存在,需用 PATCH 而非 POST |
| `UPSTREAM_REQUIRED` | 前一阶段尚未完成 |
| `OUTLINE_VALIDATION_FAILED` | 总纲规则校验失败(R-01..R-05) |
| `DETAILED_OUTLINE_VALIDATION_FAILED` | 细纲规则校验失败(R-06..R-12) |
| `LLM_ERROR` | LLM 调用失败 |
| `LOCK_TIMEOUT` | 文件锁获取超时 |
| `CHAPTER_NOT_FOUND` | 章节不存在 |
| `EXPORT_FORBIDDEN_PATH` | 导出路径越界 |

---

## 16. 端点总览

按 7 阶段汇总,共约 60 个端点。

### ① 灵感输入(3)
- `GET /api/books/:bookId/inspiration`
- `POST /api/books/:bookId/inspiration`
- `PATCH /api/books/:bookId/inspiration`

### ② 规划(3)
- `GET /api/books/:bookId/planning-brief`
- `POST /api/books/:bookId/planning-brief`
- `PATCH /api/books/:bookId/planning-brief`

### ③ 总纲规划(4)
- `GET /api/books/:bookId/story-outline`
- `POST /api/books/:bookId/story-outline`(支持 `mode: 'manual' | 'generate'`)
- `PATCH /api/books/:bookId/story-outline`
- (规则校验响应内嵌)

### ④ 细纲规划(4)
- `GET /api/books/:bookId/detailed-outline`
- `POST /api/books/:bookId/detailed-outline`(支持 `mode: 'manual' | 'generate'`)
- `PATCH /api/books/:bookId/detailed-outline/chapters/:chapterNumber`
- `GET /api/books/:bookId/detailed-outline/chapters/:chapterNumber/context`

### ⑤ 章节正文(~15)
- `GET/PATCH /api/books/:bookId/chapters[/...]`
- `POST /api/books/:bookId/chapters/merge`、`/split`、`/:n/rollback`
- `POST /api/books/:bookId/pipeline/{write-next,fast-draft,draft,upgrade-draft}`
- `GET /api/books/:bookId/pipeline/progress`
- `POST /api/books/:bookId/chapter-plan`
- `POST /api/books/:bookId/writing/intent`

### ⑥ 质量检查(~15)
- `POST /api/books/:bookId/quality/audit`
- `GET /api/books/:bookId/quality/report/:n`
- `GET /api/books/:bookId/analytics/{word-count,audit-pass-rate,token-usage,ai-signature-trend,quality-baseline,baseline-drift-alert}`
- `POST /api/books/:bookId/analytics/inspiration-shuffle`
- `GET/POST /api/books/:bookId/hooks[/...]`
- `GET/PATCH/POST /api/books/:bookId/state[/...]`

### ⑦ 导出(4)
- `POST /api/books/:bookId/export/{epub,txt,markdown,platform}`

### 基础设施(~15)
- `/api/books`
- `/api/config`
- `/api/system`
- `/api/genres`
- `/api/books/:bookId/prompts/{versions,switch,diff}`
- `/api/books/:bookId/sse`
- `/api/books/:bookId/context`
- `/api/books/:bookId/style/*`(风格管理)
