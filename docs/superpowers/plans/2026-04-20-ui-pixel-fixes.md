# UI 像素级修复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Studio 前端 13 个页面的 UI 实现修复到与 ui-prototype.md 原型 100% 对齐

**Architecture:** 按优先级分三批执行——P0（关键功能缺失，3项）、P1（重要差距，5项）、P2（视觉/UX优化，4项）。每项修复包含测试先行、最小实现、验证、提交。

**Tech Stack:** React, Tailwind CSS, lucide-react, Vitest + Testing Library, Hono SSE

---

## 文件映射总览

| 修复项 | 文件 | 操作 |
|--------|------|------|
| P0.1 合并/拆分确认弹窗 | `packages/studio/src/pages/book-detail.tsx` | 修改 |
| P0.2 守护进程 SSE 实时日志 | `packages/studio/src/pages/daemon-control.tsx` | 修改 |
| P0.2 SSE 日志组件 | `packages/studio/src/components/daemon-log-stream.tsx` | 创建 |
| P0.3 书籍详情统计行+快捷操作补齐 | `packages/studio/src/pages/book-detail.tsx` | 修改 |
| P1.1 写作页质量仪表盘 | `packages/studio/src/pages/writing.tsx` | 修改 |
| P1.2 分析页 AI 痕迹琥珀关注区 | `packages/studio/src/pages/analytics.tsx` | 修改 |
| P1.3 伏笔面板健康度进度条 | `packages/studio/src/pages/hook-panel.tsx` | 修改 |
| P1.4 真相文件角色卡片 | `packages/studio/src/pages/truth-files.tsx` | 修改 |
| P1.5 ConfigView 通知配置+备用Provider表格 | `packages/studio/src/pages/config-view.tsx` | 修改 |
| P2.1 记忆透视3秒淡出 | `packages/studio/src/pages/writing.tsx` | 修改 |
| P2.2 侧边栏底部书籍进度 | `packages/studio/src/components/layout/sidebar.tsx` | 修改 |
| P2.3 DoctorView 环境检查+修复所有 | `packages/studio/src/pages/doctor-view.tsx` | 修改 |
| P2.4 ChapterReader 心流模式审计隐藏 | `packages/studio/src/pages/chapter-reader.tsx` | 修改 |

---

### Task P0-1: 合并/拆分操作确认弹窗

**Files:**
- Modify: `packages/studio/src/pages/book-detail.tsx`
- Test: `packages/studio/src/pages/book-detail.test.tsx`

- [ ] **Step 1: 编写确认弹窗组件测试**

在 `book-detail.test.tsx` 中添加：

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BookDetail from './book-detail';
import * as api from '../lib/api';

vi.mock('../lib/api', () => ({
  fetchBook: vi.fn(() => Promise.resolve({
    id: 'book-1', title: '测试书籍', genre: '都市',
    targetWords: 300000, currentWords: 100000,
    chapterCount: 5, targetChapterCount: 100,
    status: 'active', updatedAt: '2026-04-18T10:00:00Z',
  })),
  fetchChapters: vi.fn(() => Promise.resolve([
    { number: 1, title: '第一章', content: '内容1', status: 'published', wordCount: 3000, qualityScore: 88, auditStatus: 'passed' },
    { number: 2, title: '第二章', content: '内容2', status: 'published', wordCount: 3100, qualityScore: 85, auditStatus: 'passed' },
  ])),
  mergeChapters: vi.fn(() => Promise.resolve(true)),
  splitChapter: vi.fn(() => Promise.resolve(null)),
  rollbackChapter: vi.fn(),
  deleteChapter: vi.fn(),
  fetchChapterSnapshots: vi.fn(() => Promise.resolve([])),
}));

describe('BookDetail - 操作确认弹窗', () => {
  it('点击合并时显示确认弹窗', async () => {
    render(<BookDetail />, { wrapper: ({ children }) => <div>{children}</div> });
    // 打开第2章的操作菜单
    const menuBtn = screen.getAllByTitle('更多操作')[1];
    fireEvent.click(menuBtn);
    // 点击合并按钮
    const mergeBtn = screen.getByText('与上一章合并');
    fireEvent.click(mergeBtn);
    // 验证确认弹窗出现
    await waitFor(() => {
      expect(screen.getByText(/确认合并/)).toBeInTheDocument();
      expect(screen.getByText(/将「第2章/)).toBeInTheDocument();
    });
  });

  it('点击拆分时显示拆分配置弹窗', async () => {
    render(<BookDetail />, { wrapper: ({ children }) => <div>{children}</div> });
    const menuBtn = screen.getAllByTitle('更多操作')[0];
    fireEvent.click(menuBtn);
    const splitBtn = screen.getByText('拆分为两章');
    fireEvent.click(splitBtn);
    await waitFor(() => {
      expect(screen.getByText(/拆分/)).toBeInTheDocument();
      expect(screen.getByText(/选择拆分位置/)).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd packages/studio && npx vitest run src/pages/book-detail.test.tsx -t "操作确认弹窗"
```

预期：FAIL — 确认弹窗组件不存在

- [ ] **Step 3: 添加确认弹窗状态和组件**

在 `book-detail.tsx` 中，在现有 state 后面添加：

```typescript
const [mergeConfirm, setMergeConfirm] = useState<{ from: number; fromTitle: string; to: number; toTitle: string } | null>(null);
const [splitDialog, setSplitDialog] = useState<{ chapterNumber: number; title: string; totalParagraphs: number } | null>(null);
const [splitPosition, setSplitPosition] = useState(1);
const [newChapterTitle, setNewChapterTitle] = useState('');
```

在 `handleMerge` 函数中，替换直接执行为显示弹窗：

```typescript
function handleMerge(fromNumber: number, toNumber: number) {
  if (!bookId) return;
  const fromCh = chapters.find((c) => c.number === fromNumber);
  const toCh = chapters.find((c) => c.number === toNumber);
  setMergeConfirm({
    from: fromNumber,
    fromTitle: fromCh?.title ?? `第${fromNumber}章`,
    to: toNumber,
    toTitle: toCh?.title ?? `第${toNumber}章`,
  });
  setActionMenu(null);
}

async function confirmMerge() {
  if (!mergeConfirm || !bookId) return;
  const ok = await mergeChapters(bookId, mergeConfirm.from, mergeConfirm.to);
  if (ok) {
    setChapters((prev) => prev.filter((ch) => ch.number !== mergeConfirm.from));
  }
  setMergeConfirm(null);
  setActionMenu(null);
}
```

拆分函数改为显示弹窗：

```typescript
function handleSplit(chapterNumber: number) {
  if (!bookId) return;
  const ch = chapters.find((c) => c.number === chapterNumber);
  // 估算段落数（按空行分割）
  const paragraphs = (ch?.content ?? '').split(/\n\n+/).filter(Boolean).length;
  setSplitDialog({ chapterNumber, title: ch?.title ?? `第${chapterNumber}章`, totalParagraphs: Math.max(paragraphs, 1) });
  setSplitPosition(Math.ceil(paragraphs / 2));
  setNewChapterTitle('');
  setActionMenu(null);
}

async function confirmSplit() {
  if (!splitDialog || !bookId) return;
  const data = await splitChapter(bookId, splitDialog.chapterNumber);
  if (data) {
    setChapters((prev) =>
      prev.map((ch) => (ch.number === splitDialog.chapterNumber ? data[0] : ch)).concat(data.slice(1))
    );
  }
  setSplitDialog(null);
}
```

在 TimeDial 组件后面、div 闭合前添加两个弹窗组件：

```tsx
{/* Merge Confirmation Dialog */}
{mergeConfirm && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div className="bg-card rounded-lg border p-6 w-[480px]">
      <h3 className="text-lg font-semibold mb-4">确认合并</h3>
      <p className="text-sm text-muted-foreground mb-4">
        将「第{mergeConfirm.from}章 {mergeConfirm.fromTitle}」合并到「第{mergeConfirm.to}章 {mergeConfirm.toTitle}」
      </p>
      <div className="rounded border bg-muted p-4 mb-4">
        <p className="text-sm font-medium mb-2">合并后效果：</p>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>• 两章正文合并为一章，章号保留第{mergeConfirm.to}章</li>
          <li>• 后续章节号自动重编号</li>
          <li>• 伏笔、快照、事实时间线自动重锚定</li>
        </ul>
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={() => setMergeConfirm(null)} className="px-4 py-1.5 rounded text-sm hover:bg-accent border">
          取消
        </button>
        <button onClick={confirmMerge} className="px-4 py-1.5 bg-primary text-primary-foreground rounded text-sm hover:bg-primary/90">
          确认合并
        </button>
      </div>
    </div>
  </div>
)}

{/* Split Dialog */}
{splitDialog && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div className="bg-card rounded-lg border p-6 w-[520px]">
      <h3 className="text-lg font-semibold mb-4">拆分「第{splitDialog.chapterNumber}章 {splitDialog.title}」</h3>
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium block mb-2">选择拆分位置：</label>
          <p className="text-xs text-muted-foreground mb-2">段落: 第{splitPosition}段 / 共{splitDialog.totalParagraphs}段</p>
          <input
            type="range"
            min={1}
            max={splitDialog.totalParagraphs}
            value={splitPosition}
            onChange={(e) => setSplitPosition(Number(e.target.value))}
            className="w-full"
          />
          <div className="rounded border bg-muted p-3 mt-3 text-sm">
            <p className="text-muted-foreground">前{splitPosition}段将保留在第{splitDialog.chapterNumber}章</p>
            <div className="border-t border-dashed my-2 py-1 text-center text-xs text-muted-foreground">─── 拆分线 ───</div>
            <p className="text-muted-foreground">后{splitDialog.totalParagraphs - splitPosition}段将成为新章节</p>
          </div>
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">新章节标题：</label>
          <input
            value={newChapterTitle}
            onChange={(e) => setNewChapterTitle(e.target.value)}
            placeholder="新章节标题"
            className="w-full px-3 py-2 rounded border bg-background text-sm"
          />
        </div>
      </div>
      <div className="flex gap-2 justify-end mt-4">
        <button onClick={() => setSplitDialog(null)} className="px-4 py-1.5 rounded text-sm hover:bg-accent border">
          取消
        </button>
        <button onClick={confirmSplit} className="px-4 py-1.5 bg-primary text-primary-foreground rounded text-sm hover:bg-primary/90">
          确认拆分
        </button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd packages/studio && npx vitest run src/pages/book-detail.test.tsx -t "操作确认弹窗"
```

预期：PASS

- [ ] **Step 5: 提交**

```bash
git add packages/studio/src/pages/book-detail.tsx packages/studio/src/pages/book-detail.test.tsx
git commit -m "fix(ui): add confirmation dialogs for merge/split chapter operations

Adds a merge confirmation dialog explaining the effects (renumbering,
hook re-anchoring) and a split dialog with paragraph position slider
and new chapter title input, matching the prototype spec."

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

---

### Task P0-2: 守护进程 SSE 实时日志

**Files:**
- Create: `packages/studio/src/components/daemon-log-stream.tsx`
- Modify: `packages/studio/src/pages/daemon-control.tsx`
- Test: `packages/studio/src/pages/daemon-control.test.tsx`

- [ ] **Step 1: 编写 SSE 日志组件测试**

在 `daemon-control.test.tsx` 中添加：

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import DaemonControl from './daemon-control';

describe('DaemonControl - SSE实时日志', () => {
  let mockEventSource: any;

  beforeEach(() => {
    // Mock EventSource
    mockEventSource = {
      close: vi.fn(),
      onmessage: null,
      addEventListener: vi.fn((event, handler) => {
        if (event === 'daemon_event') mockEventSource.onmessage = handler;
      }),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal('EventSource', vi.fn(() => mockEventSource));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('建立SSE连接并接收日志事件', async () => {
    render(<DaemonControl />);
    await waitFor(() => {
      expect(EventSource).toHaveBeenCalledWith(expect.stringContaining('/api/daemon/events'));
    });
  });

  it('渲染接收到的SSE日志事件', async () => {
    render(<DaemonControl />);
    // 模拟SSE事件到达
    if (mockEventSource.onmessage) {
      mockEventSource.onmessage({
        data: JSON.stringify({
          type: 'chapter_complete',
          chapter: 52,
          timestamp: '2026-04-18T15:02:33Z',
          auditPassed: true,
          aiTraceScore: 0.001,
        }),
      });
    }
    await waitFor(() => {
      expect(screen.getByText(/第52章/)).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd packages/studio && npx vitest run src/pages/daemon-control.test.tsx -t "SSE"
```

预期：FAIL — SSE 日志组件不存在

- [ ] **Step 3: 创建 daemon-log-stream.tsx 组件**

```typescript
import { useState, useEffect, useRef } from 'react';

interface DaemonLogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  chapter?: number;
  details?: string;
}

interface DaemonLogStreamProps {
  bookId: string;
  levelFilter: 'all' | 'info' | 'warn' | 'error';
}

export default function DaemonLogStream({ bookId, levelFilter }: DaemonLogStreamProps) {
  const [logs, setLogs] = useState<DaemonLogEntry[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!bookId) return;

    const es = new EventSource(`/api/daemon/events?bookId=${bookId}`);
    esRef.current = es;

    es.addEventListener('daemon_event', (event) => {
      try {
        const data = JSON.parse(event.data);
        const entry: DaemonLogEntry = {
          timestamp: data.timestamp ?? new Date().toISOString(),
          level: data.level ?? 'info',
          message: formatDaemonMessage(data),
          chapter: data.chapter,
          details: data.details,
        };
        setLogs((prev) => [...prev.slice(-100), entry]); // Keep last 100
      } catch {
        // parse error, ignore
      }
    });

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [bookId]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs]);

  const filtered = logs.filter((l) => levelFilter === 'all' || l.level === levelFilter);

  return (
    <div
      ref={containerRef}
      className="rounded border bg-background font-mono text-xs p-3 h-48 overflow-y-auto"
    >
      {filtered.length === 0 ? (
        <p className="text-muted-foreground">等待事件...</p>
      ) : (
        filtered.map((log, i) => (
          <div key={i} className="flex gap-2 py-0.5">
            <span className="text-muted-foreground shrink-0">
              {new Date(log.timestamp).toLocaleTimeString('zh-CN')}
            </span>
            <span className={`shrink-0 w-5 ${
              log.level === 'error' ? 'text-red-500' :
              log.level === 'warn' ? 'text-amber-500' : 'text-green-500'
            }`}>
              {log.level === 'error' ? '✗' : log.level === 'warn' ? '⚠' : '✓'}
            </span>
            <span className="text-foreground">{log.message}</span>
          </div>
        ))
      )}
    </div>
  );
}

function formatDaemonMessage(data: any): string {
  switch (data.type) {
    case 'chapter_start':
      return `第${data.chapter}章 开始写作`;
    case 'chapter_complete':
      return `第${data.chapter}章 完成${data.auditPassed ? '  审计通过' : '  审计警告'}  AI痕迹 ${((data.aiTraceScore ?? 0) * 100).toFixed(1)}%`;
    case 'daemon_start':
      return `守护进程启动  从第${data.fromChapter}章到第${data.toChapter}章`;
    case 'daemon_pause':
      return `守护进程已暂停`;
    case 'daemon_stop':
      return `守护进程已停止`;
    case 'daemon_resume':
      return `守护进程已恢复`;
    case 'rpm_throttle':
      return `RPM 限流触发，间隔延长至 ${data.newInterval}s`;
    case 'quota_warning':
      return `Token 配额警告: ${data.used}/${data.limit}`;
    case 'consecutive_downgrade':
      return `⚠ 连续降级: 第${data.chapter}章 accept_with_warnings（${data.count}/${data.max}次）`;
    default:
      return data.message ?? JSON.stringify(data);
  }
}
```

- [ ] **Step 4: 修改 daemon-control.tsx 使用 SSE 组件**

在 `daemon-control.tsx` 顶部添加 import：

```typescript
import DaemonLogStream from '../components/daemon-log-stream';
```

找到 MOCK_LOGS 使用处，替换为：

```tsx
<DaemonLogStream bookId={bookId ?? ''} levelFilter={logLevel} />
```

确保组件关闭时正确清理 EventSource（已在组件内部处理）。

- [ ] **Step 5: 运行测试确认通过**

```bash
cd packages/studio && npx vitest run src/pages/daemon-control.test.tsx -t "SSE"
```

预期：PASS

- [ ] **Step 6: 提交**

```bash
git add packages/studio/src/components/daemon-log-stream.tsx packages/studio/src/pages/daemon-control.tsx packages/studio/src/pages/daemon-control.test.tsx
git commit -m "fix(ui): replace MOCK_LOGS with SSE real-time daemon log stream

Creates DaemonLogStream component that connects to /api/daemon/events
via EventSource, formats and displays events in real-time with level
filtering and auto-scroll. Removes mock data from daemon-control page."

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

---

### Task P0-3: 书籍详情统计行+快捷操作补齐

**Files:**
- Modify: `packages/studio/src/pages/book-detail.tsx`
- Test: `packages/studio/src/pages/book-detail.test.tsx`

- [ ] **Step 1: 添加测试**

在 `book-detail.test.tsx` 中添加：

```typescript
describe('BookDetail - 统计行和快捷操作', () => {
  it('底部显示章节统计信息', async () => {
    render(<BookDetail />);
    await waitFor(() => {
      expect(screen.getByText(/已完成/)).toBeInTheDocument();
      expect(screen.getByText(/草稿/)).toBeInTheDocument();
    });
  });

  it('快速操作区包含守护进程和系统诊断按钮', async () => {
    render(<BookDetail />);
    await waitFor(() => {
      expect(screen.getByText(/守护进程/)).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

- [ ] **Step 3: 添加统计行和补齐快捷操作**

在 book-detail.tsx 快速操作区域添加守护进程和系统诊断按钮：

```typescript
import { Play, Stethoscope } from 'lucide-react'; // 添加到已有 import
```

在快速操作 flex 区域内已有按钮后面添加：

```tsx
<Link
  to={`/daemon?bookId=${bookId}`}
  className="inline-flex items-center gap-2 px-4 py-2 border rounded-md text-sm hover:bg-accent"
>
  <Play size={14} />
  守护进程
</Link>
<Link
  to={`/doctor?bookId=${bookId}`}
  className="inline-flex items-center gap-2 px-4 py-2 border rounded-md text-sm hover:bg-accent"
>
  <Stethoscope size={14} />
  系统诊断
</Link>
```

在章节列表 div 后面、TimeDial 前面添加统计行：

```tsx
{/* Stats Footer */}
{(() => {
  const published = chapters.filter((c) => c.status === 'published').length;
  const draft = chapters.filter((c) => c.status === 'draft').length;
  const unpublished = Math.max(book.targetChapterCount - chapters.length, 0);
  return (
    <div className="text-sm text-muted-foreground border-t pt-4">
      统计: 已完成 {published} 章 | 草稿 {draft} 章 | 未创作 {unpublished} 章
    </div>
  );
})()}
```

- [ ] **Step 4: 运行测试确认通过**

- [ ] **Step 5: 提交**

```bash
git add packages/studio/src/pages/book-detail.tsx packages/studio/src/pages/book-detail.test.tsx
git commit -m "fix(ui): add stats footer and daemon/doctor quick-action buttons to book detail

Adds chapter count statistics (published/draft/uncreated) at bottom
of chapter list, and adds 守护进程 and 系统诊断 buttons to quick-action
area, matching prototype layout."

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

---

### Task P1-1: 写作页质量仪表盘 8 维度进度条

**Files:**
- Modify: `packages/studio/src/pages/writing.tsx`
- Test: `packages/studio/src/pages/writing.test.tsx`

- [ ] **Step 1: 添加测试**

在 `writing.test.tsx` 中添加：

```typescript
describe('Writing - 质量仪表盘', () => {
  it('完整创作模式下显示8维度质量仪表盘', async () => {
    render(<Writing />);
    // 切换到完整创作
    fireEvent.click(screen.getByText(/完整创作/));
    await waitFor(() => {
      expect(screen.getByText('质量仪表盘')).toBeInTheDocument();
      expect(screen.getByText('AI痕迹')).toBeInTheDocument();
      expect(screen.getByText('连贯性')).toBeInTheDocument();
      expect(screen.getByText('节奏')).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

- [ ] **Step 3: 添加质量仪表盘组件**

在 writing.tsx 中，找到流水线进度和日志面板区域，在它们下方（或左侧）添加质量仪表盘。原型定义了两个并排面板：左侧质量仪表盘（8维度），右侧日志输出。

在 writing.tsx 的 state 中添加质量分数：

```typescript
const [qualityMetrics, setQualityMetrics] = useState({
  aiTrace: 0, coherence: 0, pacing: 0, dialogue: 0,
  description: 0, emotion: 0, creativity: 0, completeness: 0,
});
const [qualityPhase, setQualityPhase] = useState<'waiting' | 'computing' | 'done'>('waiting');
```

在 SSE pipeline_progress 事件中，当阶段完成后更新质量分数：

```typescript
// 在现有的 pipeline 事件处理中，当阶段为 'complete' 时：
if (stage === 'complete') {
  setQualityPhase('computing');
  // 从 SSE 事件中提取质量分数，或使用默认值
  const q = event.qualityMetrics;
  if (q) {
    setQualityMetrics({
      aiTrace: q.aiTrace ?? 0,
      coherence: q.coherence ?? 0,
      pacing: q.pacing ?? 0,
      dialogue: q.dialogue ?? 0,
      description: q.description ?? 0,
      emotion: q.emotion ?? 0,
      creativity: q.creativity ?? 0,
      completeness: q.completeness ?? 0,
    });
    setQualityPhase('done');
  }
}
```

添加质量仪表盘渲染函数：

```tsx
function QualityDashboard() {
  const dims = [
    { key: 'aiTrace', label: 'AI痕迹', invert: true },
    { key: 'coherence', label: '连贯性' },
    { key: 'pacing', label: '节奏' },
    { key: 'dialogue', label: '对话' },
    { key: 'description', label: '描写' },
    { key: 'emotion', label: '情感' },
    { key: 'creativity', label: '创新' },
    { key: 'completeness', label: '完整性' },
  ] as const;

  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="text-sm font-semibold mb-3">质量仪表盘</h3>
      <div className="space-y-2">
        {dims.map((d) => {
          const val = qualityMetrics[d.key];
          const displayVal = qualityPhase === 'done' ? `${(val * 100).toFixed(0)}%` : '等待中';
          const pct = qualityPhase === 'done' ? val * 100 : 0;
          return (
            <div key={d.key} className="flex items-center gap-2 text-xs">
              <span className="w-16 text-muted-foreground">{d.label}:</span>
              <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    d.invert
                      ? pct > 30 ? 'bg-red-400' : 'bg-green-400'
                      : 'bg-primary'
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="w-12 text-right text-muted-foreground">{displayVal}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

在流水线进度和日志面板的 grid 布局中，将质量仪表盘加入：

```tsx
<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
  <QualityDashboard />
  {/* 已有的日志面板 */}
  <div className="rounded-lg border bg-card p-4">
    <h3 className="text-sm font-semibold mb-3">日志输出</h3>
    <LogPanel ... />
  </div>
</div>
```

- [ ] **Step 4: 运行测试确认通过**

- [ ] **Step 5: 提交**

```bash
git add packages/studio/src/pages/writing.tsx packages/studio/src/pages/writing.test.tsx
git commit -m "feat(ui): add 8-dimension quality dashboard to writing page

Adds AI痕迹/连贯性/节奏/对话/描写/情感/创新/完整性 progress
bars that update via SSE pipeline events. Matches prototype spec
with progress bars and '等待中' placeholder during generation."

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

---

### Task P1-2: 分析页 AI 痕迹琥珀渐变关注区 + 建议气泡

**Files:**
- Modify: `packages/studio/src/pages/analytics.tsx`
- Test: `packages/studio/src/pages/analytics.test.tsx`

- [ ] **Step 1: 添加测试**

```typescript
describe('Analytics - AI痕迹关注区', () => {
  it('AI痕迹图显示琥珀渐变关注区域', async () => {
    render(<Analytics />);
    await waitFor(() => {
      // 检查关注区 SVG 元素
      const attentionZone = document.querySelector('[data-attention-zone]');
      expect(attentionZone).toBeInTheDocument();
    });
  });

  it('显示建议气泡', async () => {
    render(<Analytics />);
    await waitFor(() => {
      expect(screen.getByText(/近期的文字似乎有些刻板/)).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

- [ ] **Step 3: 添加琥珀渐变关注区和建议气泡**

在 analytics.tsx 的 AI 痕迹图表中，添加关注区渲染。假设使用 recharts 或自定义 SVG：

```tsx
{/* AI 痕迹趋势图 - 添加关注区 */}
<div className="relative">
  {/* 现有的图表 */}
  <ResponsiveContainer width="100%" height={200}>
    <LineChart data={aiTraceData}>
      {/* 现有 axes/lines */}
      {/* 关注区域 - 0.20 以上的琥珀渐变 */}
      <ReferenceArea
        y1={0.20}
        y2={2.0}
        fill="url(#amberGradient)"
        fillOpacity={0.15}
        stroke="none"
      />
      {/* 基线 */}
      <ReferenceLine y={baseline ?? 0.15} stroke="#888" strokeDasharray="3 3" label={{ value: `基线 ${baseline?.toFixed(2)}`, position: 'left' }} />
      {/* 关注线 */}
      <ReferenceLine y={0.20} stroke="#d97706" strokeDasharray="3 3" label={{ value: '关注区 0.20', position: 'right' }} />
    </LineChart>
  </ResponsiveContainer>
  {/* 琥珀渐变 SVG 定义 */}
  <svg width="0" height="0" className="absolute">
    <defs>
      <linearGradient id="amberGradient" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.3" />
        <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.05" />
      </linearGradient>
    </defs>
  </svg>
</div>
```

添加建议气泡组件：

```tsx
{/* 建议气泡 - 当近3章趋势进入关注区时显示 */}
{showAttentionBubble && (
  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 relative">
    <div className="absolute -top-2 left-8 w-4 h-4 bg-amber-50 border-l border-t border-amber-200 transform rotate-45" />
    <p className="text-sm font-medium text-amber-800 mb-2">💡 建议</p>
    <p className="text-sm text-amber-700 mb-2">近期的文字似乎有些刻板，可能的原因：</p>
    <ul className="text-sm text-amber-700 space-y-1 mb-3">
      <li>• 当前模型的表达风格趋于模式化</li>
      <li>• 大纲结构可能限制了叙事自由度</li>
      <li>• 角色情感弧线进入平缓期</li>
    </ul>
    <p className="text-sm font-medium text-amber-800 mb-2">试试这样做：</p>
    <div className="flex gap-2">
      <button className="px-3 py-1.5 bg-amber-100 text-amber-800 rounded text-sm hover:bg-amber-200">
        切换至 gpt-4o（更具创造力）
      </button>
      <button className="px-3 py-1.5 bg-amber-100 text-amber-800 rounded text-sm hover:bg-amber-200">
        灵感洗牌：重写当前段落
      </button>
    </div>
  </div>
)}
```

- [ ] **Step 4: 运行测试确认通过**

- [ ] **Step 5: 提交**

```bash
git add packages/studio/src/pages/analytics.tsx packages/studio/src/pages/analytics.test.tsx
git commit -m "feat(ui): add amber gradient attention zone and suggestion bubble to AI trace chart

Adds amber gradient reference area above 0.20 threshold on AI trace
chart, baseline and attention reference lines, and a floating suggestion
bubble with actionable recommendations when recent chapters trend into
the attention zone."

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

---

### Task P1-3: 伏笔面板健康度进度条 + 惊群折叠面板

**Files:**
- Modify: `packages/studio/src/pages/hook-panel.tsx`
- Test: `packages/studio/src/pages/hook-panel.test.tsx`

- [ ] **Step 1: 添加测试**

```typescript
describe('HookPanel - 健康度进度条', () => {
  it('显示伏笔健康度进度条', async () => {
    render(<HookPanel />);
    await waitFor(() => {
      expect(screen.getByText(/活跃伏笔/)).toBeInTheDocument();
      expect(screen.getByText(/回收率/)).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

- [ ] **Step 3: 添加健康度进度条**

在 hook-panel.tsx 的概览卡片后面添加：

```tsx
{/* Hook Health Progress Bars */}
{hooks.length > 0 && (
  <div className="rounded-lg border bg-card p-4">
    <h3 className="text-sm font-semibold mb-3">伏笔健康度</h3>
    <div className="space-y-3">
      <ProgressBar
        label="活跃伏笔"
        current={activeCount}
        max={20}
        status={activeCount <= 20 ? '健康' : '过载'}
      />
      <ProgressBar
        label="休眠伏笔"
        current={dormantCount}
        max={10}
        status="不参与排班"
        muted
      />
      {overdueCount > 0 && (
        <div>
          <ProgressBar
            label="逾期债务"
            current={overdueCount}
            max={1}
            status="⚠ 需要关注"
            danger
          />
          {overdueHooks.slice(0, 3).map((h) => (
            <p key={h.id} className="text-xs text-muted-foreground ml-2 mt-1">
              ⚠ #{h.id} {h.description} (已逾期，预计回收窗口: {h.expectedStart}-{h.expectedEnd}章，当前 {currentChapter})
            </p>
          ))}
        </div>
      )}
      <ProgressBar
        label="回收率"
        current={resolvedCount}
        max={hooks.length}
        status={`${hooks.length > 0 ? ((resolvedCount / hooks.length) * 100).toFixed(0) : 0}%`}
      />
    </div>
  </div>
)}
```

添加 ProgressBar 辅助组件：

```tsx
function ProgressBar({ label, current, max, status, muted, danger }: {
  label: string; current: number; max: number; status: string;
  muted?: boolean; danger?: boolean;
}) {
  const pct = Math.min((current / max) * 100, 100);
  const barClass = danger ? 'bg-red-400' : muted ? 'bg-muted-foreground/30' : 'bg-primary';
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}:</span>
        <span className={danger ? 'text-red-600' : 'text-muted-foreground'}>{status}</span>
      </div>
      <div className="h-2 bg-secondary rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${barClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
```

添加惊群折叠面板：

```tsx
{/* Thundering Herd Collapsible */}
{thunderingHerdEvents.length > 0 && (
  <details className="rounded-lg border bg-card">
    <summary className="p-4 cursor-pointer font-medium text-sm">
      惊群调度: {thunderingHerdEvents.length} 次触发
    </summary>
    <div className="p-4 pt-0 space-y-2">
      {thunderingHerdEvents.map((event, i) => (
        <div key={i} className="rounded border bg-muted p-3 text-sm">
          <p className="font-medium">第{event.chapter}章: {event.total} 伏笔触发，Top{event.topN} 留下，{event.deferred} 伏笔分流</p>
          <div className="mt-2 space-y-1">
            {event.hooks.map((h) => (
              <p key={h.id} className="text-xs text-muted-foreground">
                #{h.id} {h.deferred ? `→ 第${h.deferredTo}章唤醒 (平滑平移)` : '✓ 留下'}
              </p>
            ))}
          </div>
        </div>
      ))}
    </div>
  </details>
)}
```

- [ ] **Step 4: 运行测试确认通过**

- [ ] **Step 5: 提交**

```bash
git add packages/studio/src/pages/hook-panel.tsx packages/studio/src/pages/hook-panel.test.tsx
git commit -m "feat(ui): add hook health progress bars and thundering herd collapsible

Adds health overview with progress bars for active/dormant/overdue/recovery
metrics, and a collapsible thundering-herd panel showing deferral details
per chapter. Matches prototype spec."

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

---

### Task P1-4: 真相文件"当前世界状态"角色卡片

**Files:**
- Modify: `packages/studio/src/pages/truth-files.tsx`
- Test: `packages/studio/src/pages/truth-files.test.tsx`

- [ ] **Step 1: 添加测试**

```typescript
describe('TruthFiles - 当前世界状态', () => {
  it('概览Tab显示角色卡片', async () => {
    render(<TruthFiles />);
    await waitFor(() => {
      expect(screen.getByText(/当前世界状态/)).toBeInTheDocument();
      // 检查角色卡片结构
      expect(screen.getByText(/位置/)).toBeInTheDocument();
      expect(screen.getByText(/健康/)).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

- [ ] **Step 3: 添加角色卡片**

在 truth-files.tsx 的概览 Tab 中添加"当前世界状态"区块：

```tsx
{/* 当前世界状态 */}
<div className="rounded-lg border bg-card p-4">
  <h3 className="text-sm font-semibold mb-4">当前世界状态 (current_state.json 投影)</h3>
  {currentState?.characters && (
    <div className="space-y-3 mb-4">
      <p className="text-xs text-muted-foreground font-medium">角色:</p>
      {Object.entries(currentState.characters).map(([name, data]: [string, any]) => (
        <div key={name} className="rounded border bg-muted p-3">
          <h4 className="font-medium text-sm mb-2">{name}</h4>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div><span className="text-muted-foreground">位置:</span> {data.location ?? '未知'}</div>
            <div><span className="text-muted-foreground">健康:</span> {data.health ?? '良好'}</div>
            <div><span className="text-muted-foreground">情感状态:</span> {data.emotion ?? '未知'}</div>
            <div><span className="text-muted-foreground">资源:</span> {data.inventory?.join('、') ?? '无'}</div>
          </div>
          {data.knownInfo && data.knownInfo.length > 0 && (
            <div className="mt-2 text-xs">
              <span className="text-muted-foreground">已知信息:</span> {data.knownInfo.join('、')}
            </div>
          )}
        </div>
      ))}
    </div>
  )}
  <div className="grid grid-cols-3 gap-4 text-xs text-muted-foreground mb-4">
    <div><span className="font-medium">世界时间:</span> 第{currentState?.chapter ?? '-'}章</div>
    <div><span className="font-medium">物理法则:</span> {currentState?.physics ?? '现实世界'}</div>
    <div><span className="font-medium">力量体系:</span> {currentState?.powerSystem ?? '无'}</div>
  </div>
  <div className="flex gap-2">
    <button className="px-3 py-1.5 text-sm border rounded hover:bg-accent">编辑</button>
    <button className="px-3 py-1.5 text-sm border rounded hover:bg-accent">从 JSON 查看</button>
    <button className="px-3 py-1.5 text-sm border rounded hover:bg-accent">回滚到上一章状态</button>
  </div>
</div>
```

- [ ] **Step 4: 运行测试确认通过**

- [ ] **Step 5: 提交**

```bash
git add packages/studio/src/pages/truth-files.tsx packages/studio/src/pages/truth-files.test.tsx
git commit -m "feat(ui): add current world state character cards to truth files overview

Adds character cards showing position/health/emotion/resources/known-info
from current_state.json projection, plus world time/physics/power-system
metadata and edit/view-json/rollback buttons. Matches prototype spec."

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

---

### Task P1-5: ConfigView 通知配置 + 备用 Provider 状态表格

**Files:**
- Modify: `packages/studio/src/pages/config-view.tsx`
- Test: `packages/studio/src/pages/config-view.test.tsx`

- [ ] **Step 1: 添加测试**

```typescript
describe('ConfigView - 通知配置和备用Provider', () => {
  it('显示通知配置区域', async () => {
    render(<ConfigView />);
    await waitFor(() => {
      expect(screen.getByText(/通知配置/)).toBeInTheDocument();
    });
  });

  it('显示备用Provider状态表格', async () => {
    render(<ConfigView />);
    await waitFor(() => {
      expect(screen.getByText(/备用 Provider/)).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

- [ ] **Step 3: 添加通知配置和备用 Provider 表格**

在 config-view.tsx 中，在 Agent Routing 区块后面添加：

```tsx
{/* Backup Providers Table */}
<div className="rounded-lg border bg-card p-6">
  <div className="flex items-center gap-2 mb-4">
    <Zap size={18} />
    <h2 className="text-lg font-semibold">备用 Provider（故障切换）</h2>
  </div>
  <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b">
          <th className="text-left py-2 px-3 font-medium">Provider</th>
          <th className="text-left py-2 px-3 font-medium">API Key</th>
          <th className="text-left py-2 px-3 font-medium">模型</th>
          <th className="text-left py-2 px-3 font-medium">状态</th>
        </tr>
      </thead>
      <tbody>
        {config.providers.map((p) => (
          <tr key={p.name} className="border-b last:border-0">
            <td className="py-2 px-3 font-medium">{p.name}</td>
            <td className="py-2 px-3 text-muted-foreground">
              {p.apiKey ? '•'.repeat(12) + p.apiKey.slice(-4) : 'N/A'}
            </td>
            <td className="py-2 px-3 text-muted-foreground">{p.defaultModel ?? '-'}</td>
            <td className="py-2 px-3">
              <span className={`px-2 py-0.5 rounded text-xs ${
                p.status === 'connected' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
              }`}>
                {p.status === 'connected' ? '● 在线' : '○ 离线'}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
</div>

{/* Notification Config */}
<div className="rounded-lg border bg-card p-6">
  <h2 className="text-lg font-semibold mb-4">通知配置</h2>
  <div className="space-y-3">
    <div className="flex gap-4 items-end">
      <div className="flex-1">
        <label className="text-xs text-muted-foreground block mb-1">Telegram Bot Token</label>
        <input
          value={notificationConfig.telegramToken}
          onChange={(e) => setNotificationConfig({ ...notificationConfig, telegramToken: e.target.value })}
          placeholder="Bot Token"
          className="w-full px-3 py-2 rounded border bg-background text-sm"
          type="password"
        />
      </div>
      <button
        onClick={handleTestTelegram}
        className="px-3 py-2 border rounded text-sm hover:bg-accent flex items-center gap-1"
      >
        <TestTube size={14} />
        测试推送
      </button>
    </div>
    <div>
      <label className="text-xs text-muted-foreground block mb-1">Chat ID</label>
      <input
        value={notificationConfig.telegramChatId}
        onChange={(e) => setNotificationConfig({ ...notificationConfig, telegramChatId: e.target.value })}
        placeholder="Chat ID"
        className="w-full px-3 py-2 rounded border bg-background text-sm max-w-xs"
      />
    </div>
  </div>
</div>
```

添加通知配置 state：

```typescript
const [notificationConfig, setNotificationConfig] = useState({
  telegramToken: '',
  telegramChatId: '',
});

async function handleTestTelegram() {
  // 调用 API 测试推送
  try {
    // fetch('/api/notify/test', ...)
  } catch {
    // failed
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

- [ ] **Step 5: 提交**

```bash
git add packages/studio/src/pages/config-view.tsx packages/studio/src/pages/config-view.test.tsx
git commit -m "feat(ui): add backup provider table and notification config to config view

Adds a backup provider status table showing all providers with their
online/offline status, and a notification config section with Telegram
Bot Token and Chat ID fields plus test push button. Matches prototype."

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

---

### Task P2-1: 记忆透视 3 秒淡出动画

**Files:**
- Modify: `packages/studio/src/pages/writing.tsx`

- [ ] **Step 1: 添加 3 秒 CSS 淡出动画**

在 writing.tsx 中找到 MemoryWordcloud 渲染处，添加淡出逻辑：

```typescript
const [wordcloudFade, setWordcloudFade] = useState(1);

// 在流水线进入"正文生成"阶段时启动计时
useEffect(() => {
  if (currentStage === 'ScenePolisher' || currentStage === 'writing') {
    const timer = setTimeout(() => {
      setWordcloudFade(0);
    }, 3000);
    return () => clearTimeout(timer);
  } else {
    setWordcloudFade(1);
  }
}, [currentStage]);
```

在 MemoryWordcloud 容器上应用透明度：

```tsx
<div
  className="rounded-lg border bg-card p-4 transition-opacity duration-1000"
  style={{ opacity: wordcloudFade }}
>
  <MemoryWordcloud ... />
</div>
```

- [ ] **Step 2: 提交**

```bash
git add packages/studio/src/pages/writing.tsx
git commit -m "fix(ui): add 3-second fade-out animation to memory wordcloud

Wordcloud fades out 3 seconds after body generation starts, letting
the generated content take focus. Matches prototype spec."

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

---

### Task P2-2: 侧边栏底部书籍进度

**Files:**
- Modify: `packages/studio/src/components/layout/sidebar.tsx`

- [ ] **Step 1: 添加书籍进度显示**

在 sidebar.tsx 底部（版本号后面）添加：

```tsx
{/* Current Book Progress */}
{currentBook && (
  <div className="px-4 py-3 border-t mt-auto">
    <p className="text-xs text-muted-foreground truncate">当前书: {currentBook.title}</p>
    <p className="text-xs text-muted-foreground mt-1">进度: {currentBook.chapterCount}/{currentBook.targetChapterCount} 章</p>
    <div className="h-1.5 bg-secondary rounded-full overflow-hidden mt-1">
      <div
        className="h-full bg-primary rounded-full"
        style={{ width: `${Math.min((currentBook.chapterCount / currentBook.targetChapterCount) * 100, 100)}%` }}
      />
    </div>
  </div>
)}
```

确保 sidebar 使用 flex-col 布局，底部区域使用 `mt-auto`。

- [ ] **Step 2: 提交**

```bash
git add packages/studio/src/components/layout/sidebar.tsx
git commit -m "fix(ui): add current book progress bar to sidebar bottom

Shows current book name, chapter progress (X/Y chapters), and a
mini progress bar at the bottom of the sidebar. Matches prototype."

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

---

### Task P2-3: DoctorView 环境检查 + 修复所有按钮

**Files:**
- Modify: `packages/studio/src/pages/doctor-view.tsx`

- [ ] **Step 1: 添加环境检查区块和全局操作按钮**

在 doctor-view.tsx 顶部操作按钮区修改为：

```tsx
<div className="flex gap-2 mb-6">
  <button onClick={runDiagnostics} className="px-4 py-2 bg-primary text-primary-foreground rounded text-sm hover:bg-primary/90">
    运行诊断
  </button>
  <button onClick={fixAllIssues} className="px-4 py-2 border rounded text-sm hover:bg-accent">
    修复所有
  </button>
  <button onClick={cleanZombieLocks} className="px-4 py-2 border rounded text-sm hover:bg-accent">
    仅清理僵尸锁
  </button>
</div>
```

添加环境检查区块：

```tsx
{/* Environment Check */}
<div className="rounded-lg border bg-card p-4 mb-6">
  <h3 className="text-sm font-semibold mb-3">环境检查</h3>
  <div className="space-y-2 text-sm">
    <EnvCheckItem pass={envInfo.nodeVersion.startsWith('v20')} label={`Node.js ${envInfo.nodeVersion}`} />
    <EnvCheckItem pass={envInfo.safeMode} label="已启用安全模式" />
    <EnvCheckItem pass={envInfo.diskAvailableGB > 5} label={`${envInfo.diskAvailableGB} GB 可用`} />
    <EnvCheckItem pass={envInfo.aiReachable} label="qwen3.6-plus 可达" />
  </div>
</div>
```

添加 EnvCheckItem 辅助组件：

```tsx
function EnvCheckItem({ pass, label }: { pass: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={pass ? 'text-green-600' : 'text-red-600'}>{pass ? '✓' : '✗'}</span>
      <span>{label}</span>
    </div>
  );
}
```

- [ ] **Step 2: 提交**

```bash
git add packages/studio/src/pages/doctor-view.tsx
git commit -m "fix(ui): add environment check block and fix-all/clean-locks buttons to doctor view

Adds Node.js/disk/AI connectivity environment checks, and '修复所有'
and '仅清理僵尸锁' global action buttons. Matches prototype spec."

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

---

### Task P2-4: ChapterReader 心流模式审计面板默认隐藏

**Files:**
- Modify: `packages/studio/src/pages/chapter-reader.tsx`

- [ ] **Step 1: 修复心流模式下审计面板隐藏**

在 chapter-reader.tsx 的心流模式渲染部分（flowMode 为 true 时的 return），确保不显示审计面板。当前代码在心流模式下可能仍显示了审计面板。

修改心流模式的 return，确保审计报告面板不渲染：

```tsx
// 在 flowMode 的 return 中，移除或条件隐藏审计面板
// 确认 showAudit 在心流模式下为 false
useEffect(() => {
  if (flowMode) {
    setShowAudit(false);
  }
}, [flowMode]);
```

同时确保心流模式顶部有 "上一章/下一章" 按钮：

```tsx
<div className="flex items-center justify-between mb-6">
  <button
    onClick={() => setFlowMode(false)}
    className="text-sm text-slate-400 hover:text-slate-200 transition-colors"
  >
    ← 返回
  </button>
  <div className="flex items-center gap-3">
    <Link
      to={`/book/${bookId}/chapter/${Math.max(1, chNum - 1)}`}
      className="text-sm text-slate-400 hover:text-slate-200"
    >
      ◀ 上一章
    </Link>
    <Link
      to={`/book/${bookId}/chapter/${chNum + 1}`}
      className="text-sm text-slate-400 hover:text-slate-200"
    >
      下一章 ▶
    </Link>
    <button onClick={() => setFlowMode(false)} className="text-sm text-slate-400">
      Esc
    </button>
  </div>
</div>
```

- [ ] **Step 2: 提交**

```bash
git add packages/studio/src/pages/chapter-reader.tsx
git commit -m "fix(ui): hide audit panel by default in flow mode, add chapter nav buttons

Audit panel now auto-hides when entering flow mode. Added prev/next
chapter navigation buttons to flow mode header. Matches prototype spec."

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

---

## 执行顺序建议

1. **P0 优先**：P0-1 → P0-2 → P0-3（功能安全 + 实时能力）
2. **P1 其次**：P1-1 → P1-2 → P1-3 → P1-4 → P1-5（重要差距补齐）
3. **P2 收尾**：P2-1 → P2-2 → P2-3 → P2-4（视觉/UX 细节）

每个 Task 独立可提交，按顺序执行互不冲突。

## 验证清单

全部 Task 完成后，运行：

```bash
# 单元测试
cd packages/studio && npx vitest run

# 类型检查
npx tsc --noEmit

# 启动 dev server 手动验证
pnpm dev
```

逐页对照原型文档 `docs/UI/ui-prototype.md` 确认每个元素、布局、交互已实现。
