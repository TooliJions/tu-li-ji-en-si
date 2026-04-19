# CyberNovelist API 接口文档

> 版本: 1.0 | 日期: 2026-04-18 | 状态: 初始版本

## 1. 概述

### 1.1 技术栈

| 项目 | 值 |
|------|------|
| 框架 | Hono（轻量高性能 API 框架） |
| 协议 | RESTful JSON + SSE（Server-Sent Events） |
| 数据格式 | JSON（请求/响应） |
| 认证 | 本地运行，无需认证（仅 localhost 访问） |
| 基础路径 | `http://localhost:3000/api` |

### 1.2 通用约定

- 所有时间字段为 ISO 8601 格式
- 分页使用 `page` + `pageSize` 参数
- 错误响应统一格式：`{ "error": { "code": string, "message": string } }`
- 成功响应统一格式：`{ "data": T }`
- 列表响应统一格式：`{ "data": T[], "total": number }`

---

## 2. 书籍管理 (`/api/books`)

### 2.1 获取书籍列表

```
GET /api/books
```

**Query 参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| status | string | 否 | 过滤状态：all/active/archived |
| genre | string | 否 | 按题材过滤 |

**响应：**

```json
{
  "data": [
    {
      "id": "book-001",
      "title": "重生-从高考满分作文开始",
      "genre": "都市",
      "targetWords": 1000000,
      "currentWords": 342500,
      "chapterCount": 45,
      "status": "active",
      "createdAt": "2026-04-15T10:00:00Z",
      "updatedAt": "2026-04-18T14:30:00Z"
    }
  ],
  "total": 1
}
```

### 2.2 获取书籍详情

```
GET /api/books/:bookId
```

**响应：**

```json
{
  "data": {
    "id": "book-001",
    "title": "重生-从高考满分作文开始",
    "genre": "都市",
    "targetWords": 1000000,
    "currentWords": 342500,
    "chapterCount": 45,
    "targetChapterCount": 100,
    "status": "active",
    "createdAt": "2026-04-15T10:00:00Z",
    "updatedAt": "2026-04-18T14:30:00Z",
    "fanficMode": null,
    "promptVersion": "v2"
  }
}
```

### 2.3 创建书籍

```
POST /api/books
```

**请求体：**

```json
{
  "title": "书名",
  "genre": "都市",
  "targetWords": 1000000,
  "language": "zh-CN",
  "brief": "创作简报内容（可选）"
}
```

**响应：** `201 Created`，返回书籍详情对象

### 2.4 更新书籍

```
PATCH /api/books/:bookId
```

**请求体：** 需更新的字段（title / targetWords / status / promptVersion 等）

### 2.5 删除书籍

```
DELETE /api/books/:bookId
```

**响应：** `204 No Content`

### 2.6 获取书籍最近活动

```
GET /api/books/:bookId/activity
```

**Query 参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| limit | number | 否 | 返回条数，默认 10 |

**响应：**

```json
{
  "data": [
    {
      "type": "chapter_created",
      "chapterId": "chapter-045",
      "timestamp": "2026-04-18T14:30:00Z",
      "detail": "第45章「逆袭开始」创作完成"
    }
  ]
}
```

---

## 3. 章节管理 (`/api/books/:bookId/chapters`)

### 3.1 获取章节列表

```
GET /api/books/:bookId/chapters
```

**Query 参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| status | string | 否 | draft/published/all |

**响应：**

```json
{
  "data": [
    {
      "number": 45,
      "title": "逆袭开始",
      "status": "published",
      "wordCount": 3200,
      "qualityScore": 85,
      "aiTraceScore": 0.15,
      "auditStatus": "passed",
      "createdAt": "2026-04-18T14:30:00Z",
      "updatedAt": "2026-04-18T14:35:00Z"
    },
    {
      "number": 46,
      "title": null,
      "status": "draft",
      "wordCount": 800,
      "qualityScore": null,
      "createdAt": "2026-04-18T16:00:00Z"
    }
  ],
  "total": 46
}
```

### 3.2 获取章节详情

```
GET /api/books/:bookId/chapters/:chapterNumber
```

**响应：**

```json
{
  "data": {
    "number": 45,
    "title": "逆袭开始",
    "content": "正文内容...",
    "status": "published",
    "wordCount": 3200,
    "qualityScore": 85,
    "auditReport": { "passed": true, "dimensions": [] },
    "aiTraceScore": 0.15,
    "createdAt": "2026-04-18T14:30:00Z",
    "updatedAt": "2026-04-18T14:35:00Z"
  }
}
```

### 3.3 更新章节

```
PATCH /api/books/:bookId/chapters/:chapterNumber
```

**请求体：**

```json
{
  "content": "修改后的正文内容",
  "title": "修改后的标题"
}
```

### 3.4 合并章节

```
POST /api/books/:bookId/chapters/merge
```

**请求体：**

```json
{
  "fromChapter": 44,
  "toChapter": 45
}
```

**响应：** 合并后的章节对象

### 3.5 拆分章节

```
POST /api/books/:bookId/chapters/:chapterNumber/split
```

**请求体：**

```json
{
  "splitAtPosition": 15
}
```

`splitAtPosition` 为段落编号（从 1 开始）

**响应：** 拆分后的两个章节对象

### 3.6 回滚章节

```
POST /api/books/:bookId/chapters/:chapterNumber/rollback
```

**请求体：**

```json
{
  "toSnapshot": "snapshot-20260418-143000"
}
```

**响应：** 回滚后的章节对象

---

## 4. 创作流水线 (`/api/books/:bookId/pipeline`)

### 4.1 开始完整创作

```
POST /api/books/:bookId/pipeline/write-next
```

**请求体：**

```json
{
  "chapterNumber": 46,
  "customIntent": "自定义意图描述（可选）",
  "skipAudit": false
}
```

**响应：** `202 Accepted`

```json
{
  "data": {
    "pipelineId": "pipeline-20260418-143000",
    "status": "running",
    "stages": ["planning", "composing", "writing", "auditing", "revising", "persisting"]
  }
}
```

### 4.2 快速试写

```
POST /api/books/:bookId/pipeline/fast-draft
```

**请求体：**

```json
{
  "customIntent": "自定义意图（可选）",
  "wordCount": 800
}
```

**响应：**

```json
{
  "data": {
    "content": "草稿正文...",
    "wordCount": 800,
    "elapsedMs": 12000,
    "llmCalls": 1,
    "draftId": "draft-temp-20260418-160000"
  }
}
```

### 4.3 草稿转正

```
POST /api/books/:bookId/pipeline/upgrade-draft
```

**请求体：**

```json
{
  "draftId": "draft-temp-20260418-160000",
  "content": "可能已手动编辑的草稿正文"
}
```

**响应：** `202 Accepted`，返回 pipelineId

### 4.4 草稿模式（跳过审计）

```
POST /api/books/:bookId/pipeline/write-draft
```

**请求体：**

```json
{
  "chapterNumber": 46
}
```

**响应：** 生成的草稿写入章节文件，返回章节对象（status: "draft"）

### 4.5 获取流水线进度

```
GET /api/books/:bookId/pipeline/:pipelineId
```

**响应：**

```json
{
  "data": {
    "pipelineId": "pipeline-20260418-143000",
    "status": "running",
    "currentStage": "auditing",
    "progress": {
      "planning": { "status": "completed", "elapsedMs": 5200 },
      "composing": { "status": "completed", "elapsedMs": 3100 },
      "writing": { "status": "completed", "elapsedMs": 8500 },
      "auditing": { "status": "running", "elapsedMs": 0 },
      "revising": { "status": "pending", "elapsedMs": 0 },
      "persisting": { "status": "pending", "elapsedMs": 0 }
    },
    "startedAt": "2026-04-18T14:30:00Z"
  }
}
```

### 4.6 手动审计

```
POST /api/books/:bookId/chapters/:chapterNumber/audit
```

**响应：** 审计报告对象

### 4.7 获取审计报告（33 维分组）

```
GET /api/books/:bookId/chapters/:chapterNumber/audit-report
```

**响应：**

```json
{
  "data": {
    "chapterNumber": 46,
    "overallStatus": "passed_with_warnings",
    "tiers": {
      "blocker": { "total": 12, "passed": 12, "failed": 0, "items": [] },
      "warning": {
        "total": 12,
        "passed": 11,
        "failed": 1,
        "items": [
          {
            "dimension": "hook_progression",
            "label": "伏笔推进",
            "severity": "warning",
            "detail": "#12 已 8 章未推进",
            "suggestion": "建议在本章或下章推进此伏笔"
          }
        ]
      },
      "suggestion": { "total": 9, "passed": 9, "failed": 0, "items": [] }
    },
    "radarScores": [
      { "dimension": "ai_trace", "label": "AI 痕迹", "score": 0.12 },
      { "dimension": "coherence", "label": "连贯性", "score": 0.91 },
      { "dimension": "pacing", "label": "节奏", "score": 0.78 },
      { "dimension": "dialogue", "label": "对话", "score": 0.85 },
      { "dimension": "description", "label": "描写", "score": 0.72 },
      { "dimension": "emotion", "label": "情感", "score": 0.88 },
      { "dimension": "innovation", "label": "创新", "score": 0.65 },
      { "dimension": "completeness", "label": "完整性", "score": 0.95 }
    ]
  }
}
```

---

## 5. 状态管理 (`/api/books/:bookId/state`)

### 5.1 获取真相文件列表

```
GET /api/books/:bookId/state
```

**响应：**

```json
{
  "data": {
    "versionToken": 13,
    "files": [
      { "name": "current_state", "updatedAt": "2026-04-18T14:42:18Z", "size": 2048 },
      { "name": "hooks", "updatedAt": "2026-04-18T14:30:00Z", "size": 1024 },
      { "name": "chapter_summaries", "updatedAt": "2026-04-18T14:30:00Z", "size": 4096 },
      { "name": "subplot_board", "updatedAt": "2026-04-18T14:00:00Z", "size": 512 },
      { "name": "emotional_arcs", "updatedAt": "2026-04-18T13:00:00Z", "size": 768 },
      { "name": "character_matrix", "updatedAt": "2026-04-18T14:30:00Z", "size": 3072 },
      { "name": "manifest", "updatedAt": "2026-04-18T14:42:18Z", "size": 256 }
    ]
  }
}
```

### 5.2 获取单个真相文件

```
GET /api/books/:bookId/state/:fileName
```

`:fileName` 为 `current_state` / `hooks` / `chapter_summaries` 等

**响应：** 文件内容（JSON）

### 5.3 更新真相文件

```
PUT /api/books/:bookId/state/:fileName
```

**请求体：** 新的 JSON 内容

**响应：** 更新后的文件内容 + 新 `versionToken`

### 5.4 导入 Markdown 状态

```
POST /api/books/:bookId/state/import-markdown
```

**请求体：**

```json
{
  "fileName": "current_state",
  "markdownContent": "# 当前状态\n..."
}
```

**响应：**

```json
{
  "data": {
    "parsed": { "versionToken": 14, "diff": [...] },
    "preview": "变更预览摘要"
  }
}
```

### 5.5 回滚状态

```
POST /api/books/:bookId/state/rollback
```

**请求体：**

```json
{
  "targetChapter": 44
}
```

### 5.6 获取状态投影校验结果

```
GET /api/books/:bookId/state/projection-status
```

**响应：** JSON 与 Markdown 的哈希对比结果

---

## 6. 守护进程 (`/api/books/:bookId/daemon`)

### 6.1 获取守护进程状态

```
GET /api/books/:bookId/daemon
```

**响应：**

```json
{
  "data": {
    "status": "running",
    "nextChapter": 46,
    "chaptersCompleted": 45,
    "intervalSeconds": 30,
    "dailyTokenUsed": 450000,
    "dailyTokenLimit": 1000000,
    "consecutiveFallbacks": 0,
    "startedAt": "2026-04-18T10:00:00Z"
  }
}
```

### 6.2 启动守护进程

```
POST /api/books/:bookId/daemon/start
```

**请求体：**

```json
{
  "fromChapter": 46,
  "toChapter": 60,
  "interval": 30,
  "dailyTokenLimit": 1000000
}
```

### 6.3 暂停守护进程

```
POST /api/books/:bookId/daemon/pause
```

### 6.4 停止守护进程

```
POST /api/books/:bookId/daemon/stop
```

---

## 7. 伏笔管理 (`/api/books/:bookId/hooks`)

### 7.1 获取伏笔列表

```
GET /api/books/:bookId/hooks
```

**Query 参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| status | string | 否 | open/progressing/deferred/dormant/resolved/abandoned |

**响应：**

```json
{
  "data": [
    {
      "id": "hook-001",
      "description": "父亲失踪之谜",
      "plantedChapter": 3,
      "status": "open",
      "priority": "critical",
      "lastAdvancedChapter": 42,
      "expectedResolutionWindow": { "min": 50, "max": 60 },
      "healthScore": 80
    }
  ]
}
```

### 7.2 创建伏笔

```
POST /api/books/:bookId/hooks
```

**请求体：**

```json
{
  "description": "伏笔描述",
  "chapter": 45,
  "priority": "major",
  "expectedResolutionWindow": { "min": 55, "max": 65 }
}
```

### 7.3 更新伏笔状态

```
PATCH /api/books/:bookId/hooks/:hookId
```

**请求体：**

```json
{
  "status": "dormant",
  "expectedResolutionWindow": { "min": 65, "max": 80 }
}
```

### 7.4 获取伏笔健康度

```
GET /api/books/:bookId/hooks/health
```

**响应：**

```json
{
  "data": {
    "total": 25,
    "active": 15,
    "dormant": 2,
    "resolved": 6,
    "overdue": 1,
    "recoveryRate": 0.24,
    "overdueList": [
      { "hookId": "hook-005", "description": "竞赛报名截止", "expectedBy": 55, "currentChapter": 46 }
    ]
  }
}
```

### 7.5 获取伏笔调度时间轴（甘特图数据）

```
GET /api/books/:bookId/hooks/timeline
```

**Query 参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| fromChapter | number | 否 | 起始章节，默认 1 |
| toChapter | number | 否 | 结束章节，默认 100 |
| status | string | 否 | 过滤状态 |

**响应：**

```json
{
  "data": {
    "chapterRange": { "from": 1, "to": 100 },
    "densityHeatmap": [
      { "chapter": 1, "density": 2 }, { "chapter": 2, "density": 3 },
      { "chapter": 47, "density": 5, "thunderHerd": true },
      { "chapter": 100, "density": 1 }
    ],
    "hooks": [
      {
        "id": "hook-001",
        "description": "父亲失踪之谜",
        "plantedChapter": 3,
        "status": "open",
        "priority": "critical",
        "segments": [
          { "fromChapter": 3, "toChapter": 42, "type": "active" }
        ],
        "recurrenceChapter": null
      },
      {
        "id": "hook-004",
        "description": "王老师的过去",
        "plantedChapter": 20,
        "status": "dormant",
        "segments": [
          { "fromChapter": 20, "toChapter": 64, "type": "dormant" },
          { "fromChapter": 65, "toChapter": 80, "type": "pending_wake" }
        ],
        "recurrenceChapter": null
      },
      {
        "id": "hook-011",
        "description": "地下室的钥匙",
        "plantedChapter": 30,
        "status": "deferred",
        "segments": [
          { "fromChapter": 30, "toChapter": 46, "type": "active" },
          { "fromChapter": 47, "toChapter": 47, "type": "deferred" },
          { "fromChapter": 48, "toChapter": 48, "type": "scheduled_wake" }
        ],
        "recurrenceChapter": 48,
        "originalWakeChapter": 47,
        "deferReason": "thundering_herd_smoothing"
      }
    ],
    "thunderingHerdAnimations": [
      {
        "triggerChapter": 47,
        "kept": [
          { "hookId": "hook-008", "reason": "priority_top3" },
          { "hookId": "hook-009", "reason": "priority_top3" },
          { "hookId": "hook-010", "reason": "priority_top3" }
        ],
        "parabolicDefers": [
          {
            "hookId": "hook-011",
            "deferredTo": 48,
            "animation": { "arcHeight": 60, "color": "orange", "curveThickness": 3 }
          },
          {
            "hookId": "hook-012",
            "deferredTo": 49,
            "animation": { "arcHeight": 90, "color": "green", "curveThickness": 2 }
          }
        ]
      }
    ],
    "thunderingHerdAlerts": [
      {
        "chapter": 47,
        "totalHooks": 5,
        "maxAllowed": 3,
        "deferred": [
          { "hookId": "hook-011", "deferredTo": 48 },
          { "hookId": "hook-012", "deferredTo": 49 }
        ]
      }
    ]
  }
}
```

### 7.6 获取伏笔唤醒排班

```
GET /api/books/:bookId/hooks/wake-schedule
```

**响应：**

```json
{
  "data": {
    "currentChapter": 46,
    "maxWakePerChapter": 3,
    "pendingWakes": [
      { "hookId": "hook-008", "wakeAtChapter": 47, "reason": "priority" },
      { "hookId": "hook-009", "wakeAtChapter": 47, "reason": "priority" },
      { "hookId": "hook-011", "wakeAtChapter": 48, "reason": "deferred_by_smoothing" }
    ]
  }
}
```

---

## 8. 数据分析 (`/api/books/:bookId/analytics`)

### 8.1 获取字数统计

```
GET /api/books/:bookId/analytics/word-count
```

**响应：**

```json
{
  "data": {
    "totalWords": 342500,
    "averagePerChapter": 3080,
    "chapters": [
      { "number": 45, "wordCount": 3200 },
      { "number": 44, "wordCount": 2950 }
    ]
  }
}
```

### 8.2 获取审计通过率

```
GET /api/books/:bookId/analytics/audit-rate
```

### 8.3 获取 Token 用量

```
GET /api/books/:bookId/analytics/token-usage
```

**响应：**

```json
{
  "data": {
    "totalTokens": 472500,
    "perChapter": {
      "writer": 4500,
      "auditor": 2200,
      "planner": 1800,
      "composer": 1200,
      "reviser": 800
    }
  }
}
```

### 8.4 获取 AI 痕迹趋势

```
GET /api/books/:bookId/analytics/ai-trace
```

### 8.5 获取质量基线与漂移

```
GET /api/books/:bookId/analytics/quality-baseline
```

**响应：**

```json
{
  "data": {
    "baseline": {
      "version": 1,
      "basedOnChapters": [1, 2, 3],
      "createdAt": "2026-04-15T14:30:00Z",
      "metrics": {
        "aiTraceScore": 0.15,
        "sentenceDiversity": 0.82,
        "avgParagraphLength": 48
      }
    },
    "current": {
      "aiTraceScore": 0.38,
      "sentenceDiversity": 0.61,
      "avgParagraphLength": 72,
      "driftPercentage": 153,
      "alert": true
    }
  }
}
```

### 8.6 获取基线漂移告警状态

```
GET /api/books/:bookId/analytics/baseline-alert?metric=aiTraceScore&window=3
```

**说明：** 计算指定指标在最近 N 章的滑动平均值，对比基线 + 30% 警戒线，返回是否触发告警及告警详情。

**响应：**

```json
{
  "data": {
    "metric": "aiTraceScore",
    "baseline": 0.15,
    "threshold": 0.20,
    "windowSize": 3,
    "slidingAverage": 0.38,
    "chaptersAnalyzed": [44, 45, 46],
    "triggered": true,
    "consecutiveChapters": 3,
    "severity": "suggestion",
    "suggestedAction": {
      "type": "model_switch",
      "from": "qwen3.6-plus",
      "to": ["gpt-4o", "qwen-opus"],
      "suggestionText": "近期的文字似乎有些刻板，建议切换至【更具创造力的模型】"
    },
    "inspirationShuffle": {
      "available": true,
      "targetChapter": 46,
      "suggestionText": "试试「灵感洗牌」，为您生成三种不同节奏的重写方案"
    }
  }
}
```

### 8.7 灵感洗牌（局部重写方案生成）

```
POST /api/books/:bookId/analytics/inspiration-shuffle
```

**说明：** 针对指定章节的当前段落，生成三种不同节奏和视角的重写方案，帮助作者打破创作僵局。

**请求体：**

```json
{
  "chapterNumber": 46,
  "paragraphRange": { "from": 1, "to": 12 },
  "styles": ["fast_paced", "inner_monologue", "bystander"],
  "maxAlternatives": 3
}
```

**响应（SSE 流式返回）：**

```json
{
  "data": {
    "alternatives": [
      {
        "id": "A",
        "style": "fast_paced",
        "label": "快节奏视角",
        "text": "铃声尖锐地划破空气。林晨手中的笔一顿，最后那道题——还剩十五分钟。",
        "wordCount": 2800,
        "characteristics": ["短句为主", "紧张感拉满", "动作描写优先"]
      },
      {
        "id": "B",
        "style": "inner_monologue",
        "label": "内心独白视角",
        "text": "林晨盯着卷子，脑海中却闪过父亲离开那天的背影。这道题，他非做对不可。",
        "wordCount": 3500,
        "characteristics": ["第一人称内心描写", "情感深沉", "回忆穿插"]
      },
      {
        "id": "C",
        "style": "bystander",
        "label": "旁观者视角",
        "text": "教室后排的苏小雨注意到，林晨握笔的指节已经泛白。",
        "wordCount": 3200,
        "characteristics": ["侧面烘托", "留白手法", "群像描写"]
      }
    ],
    "generationTime": 8.2
  }
}
```

---

## 9. 配置 (`/api/config`)

### 9.1 获取全局配置

```
GET /api/config
```

**响应：**

```json
{
  "data": {
    "defaultProvider": "DashScope",
    "defaultModel": "qwen3.6-plus",
    "agentRouting": [
      { "agent": "Writer", "model": "qwen3.6-plus", "provider": "DashScope", "temperature": 0.8 },
      { "agent": "Auditor", "model": "gpt-4o", "provider": "OpenAI", "temperature": 0.2 }
    ],
    "providers": [
      { "name": "DashScope", "status": "connected" },
      { "name": "OpenAI", "status": "connected" },
      { "name": "Gemini", "status": "connected" }
    ]
  }
}
```

### 9.2 更新全局配置

```
PUT /api/config
```

**请求体：** 完整配置对象

### 9.3 测试连接

```
POST /api/config/test-provider
```

**请求体：**

```json
{
  "provider": "DashScope",
  "apiKey": "sk-xxx",
  "model": "qwen3.6-plus"
}
```

---

## 10. 导出 (`/api/books/:bookId/export`)

### 10.1 导出 EPUB

```
POST /api/books/:bookId/export/epub
```

**请求体：**

```json
{
  "chapterRange": { "from": 1, "to": 45 }
}
```

**响应：** 文件下载

### 10.2 导出 TXT

```
POST /api/books/:bookId/export/txt
```

### 10.3 导出 Markdown

```
POST /api/books/:bookId/export/markdown
```

---

## 11. 系统诊断 (`/api/system`)

### 11.1 获取诊断信息

```
GET /api/system/doctor
```

**响应：**

```json
{
  "data": {
    "issues": [
      { "type": "stale_lock", "path": "books/book-001/.pipeline.lock", "severity": "warning" }
    ],
    "reorgSentinels": [],
    "qualityBaseline": { "status": "established", "version": 1 },
    "providerHealth": [
      { "provider": "DashScope", "status": "online", "latencyMs": 320 },
      { "provider": "OpenAI", "status": "online", "latencyMs": 450 }
    ]
  }
}
```

### 11.2 修复僵尸锁

```
POST /api/system/doctor/fix-locks
```

### 11.3 重组中断恢复

```
POST /api/system/doctor/reorg-recovery
```

**请求体：**

```json
{
  "bookId": "book-001"
}
```

### 11.4 状态差异对比

```
GET /api/books/:bookId/state/diff?file=current_state
```

**说明：** 比较 JSON 真相文件与 Markdown 投影的差异，返回结构化 diff + 自然语言翻译（前端直接使用 naturalLanguage 字段展示，禁止暴露 path 字段）。

**响应：**

```json
{
  "data": {
    "file": "current_state",
    "summary": "系统从您的小说文本中提取到 3 处设定变更",
    "changes": [
      {
        "character": "林晨",
        "field": "location",
        "oldValue": "教室",
        "newValue": "办公室",
        "category": "position",
        "naturalLanguage": "系统发现您在文本中将【林晨】的位置改为了【办公室】，当前记忆为「教室」。是否将位置更新同步到核心记忆库？"
      },
      {
        "character": "林晨",
        "field": "mood",
        "oldValue": "紧张",
        "newValue": "自信",
        "category": "emotion",
        "naturalLanguage": "系统发现您在文本中将【林晨】的心情改为了【自信】，当前记忆为「紧张」。是否将心情更新同步到核心记忆库？"
      },
      {
        "character": "苏小雨",
        "field": "relationship",
        "oldValue": "同桌",
        "newValue": "同桌/好友",
        "category": "relationship",
        "naturalLanguage": "系统发现您将【苏小雨】和【林晨】的关系描述为「同桌/好友」，当前记忆仅为「同桌」。是否更新这段关系？"
      }
    ],
    "changeCount": 3,
    "categories": ["position", "emotion", "relationship"]
  }
}
```

---

## 12. 提示词版本 (`/api/books/:bookId/prompts`)

### 12.1 获取提示词版本列表

```
GET /api/books/:bookId/prompts
```

### 12.2 切换提示词版本

```
POST /api/books/:bookId/prompts/set
```

**请求体：**

```json
{
  "version": "v1"
}
```

### 12.3 版本对比

```
GET /api/books/:bookId/prompts/diff?from=v1&to=v2
```

---

## 13. SSE 实时推送 (`/api/books/:bookId/sse`)

### 13.1 连接 SSE

```
GET /api/books/:bookId/sse
```

**事件类型：**

| 事件 | 数据格式 | 触发时机 |
|------|----------|----------|
| `pipeline_progress` | `{ "pipelineId": "...", "stage": "writing", "progress": 0.6 }` | 流水线阶段更新 |
| `memory_extracted` | `{ "fragments": 18, "rules": 3, "categories": { "characters": ["林晨", "苏小雨"], "locations": ["教室"], "items": ["竞赛试卷"], "hooks": ["#1"] } }` | 记忆抽取完成，正文生成前 |
| `chapter_complete` | `{ "chapterNumber": 46, "wordCount": 3200, "qualityScore": 85 }` | 章节创作完成 |
| `daemon_event` | `{ "type": "chapter_done", "chapter": 46 }` | 守护进程事件 |
| `hook_wake` | `{ "hookId": "...", "description": "...", "fromStatus": "dormant", "toStatus": "open" }` | 伏笔自动唤醒 |
| `thundering_herd` | `{ "chapter": 47, "wakeCount": 5, "maxAllowed": 3, "schedule": [...] }` | 惊群平滑触发 |
| `quality_drift` | `{ "aiTraceScore": 0.38, "driftPercentage": 153, "alert": true }` | 质量漂移告警 |
| `context_changed` | `{ "fileName": "current_state", "oldVersionToken": 12, "newVersionToken": 13 }` | 真相文件变更 |

### 13.2 SSE 事件示例

```
event: pipeline_progress
data: {"pipelineId":"pipeline-20260418-143000","stage":"auditing","progress":0.6,"elapsedMs":16800}

event: chapter_complete
data: {"chapterNumber":46,"wordCount":3200,"qualityScore":85,"aiTraceScore":0.12,"elapsedMs":45000}
```

---

## 14. 上下文查询 (`/api/books/:bookId/context`)

### 14.1 按实体名查询上下文

```
GET /api/books/:bookId/context/:entityName
```

`:entityName` 为角色名/地点名/道具名等

**响应：**

```json
{
  "data": {
    "name": "林晨",
    "type": "character",
    "currentLocation": "教室",
    "emotion": "专注",
    "inventory": ["竞赛试卷", "笔"],
    "relationships": [
      { "with": "苏小雨", "type": "同桌", "affinity": "好感" }
    ],
    "activeHooks": [
      { "id": "hook-001", "description": "父亲失踪", "status": "open" }
    ]
  }
}
```

---

## 15. 错误码

| 错误码 | HTTP 状态码 | 说明 |
|--------|------------|------|
| `BOOK_NOT_FOUND` | 404 | 书籍不存在 |
| `CHAPTER_NOT_FOUND` | 404 | 章节不存在 |
| `PIPELINE_BUSY` | 409 | 流水线正在运行 |
| `INVALID_STATE` | 400 | 状态数据格式无效 |
| `PROJECTION_MISMATCH` | 400 | JSON 与 Markdown 投影不一致 |
| `HOOK_CONFLICT` | 409 | 伏笔重复/冲突 |
| `REORG_LOCKED` | 409 | 章节重组锁定中 |
| `DAEMON_RUNNING` | 409 | 守护进程运行中 |
| `DAILY_QUOTA_EXCEEDED` | 429 | 每日 Token 配额已用完 |
| `LLM_PROVIDER_ERROR` | 502 | LLM 提供商请求失败 |
| `INTERNAL_ERROR` | 500 | 内部服务器错误 |
| `CONTEXT_STALE` | 400 | 草稿生成后上下文已变化 |
| `BASELINE_DRIFT` | 422 | 质量漂移超出阈值（建议性，非阻断） |

---

## 16. 端点总览

| 模块 | 路径 | 方法数 |
|------|------|--------|
| 书籍管理 | `/api/books` | 6 |
| 章节管理 | `/api/books/:bookId/chapters` | 6 |
| 创作流水线 | `/api/books/:bookId/pipeline` | 7 |
| 状态管理 | `/api/books/:bookId/state` | 6 |
| 守护进程 | `/api/books/:bookId/daemon` | 4 |
| 伏笔管理 | `/api/books/:bookId/hooks` | 6 |
| 数据分析 | `/api/books/:bookId/analytics` | 7 |
| 配置 | `/api/config` | 3 |
| 导出 | `/api/books/:bookId/export` | 3 |
| 上下文查询 | `/api/books/:bookId/context` | 1 |
| 系统诊断 | `/api/system` | 4 |
| 提示词版本 | `/api/books/:bookId/prompts` | 3 |
| SSE 推送 | `/api/books/:bookId/sse` | 1（事件流） |
