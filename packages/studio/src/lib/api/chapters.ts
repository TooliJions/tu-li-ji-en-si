export async function fetchChapters(bookId: string) {
  const res = await fetch(`/api/books/${bookId}/chapters`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.data || [];
}

export async function mergeChapters(bookId: string, fromChapter: number, toChapter: number) {
  const res = await fetch(`/api/books/${bookId}/chapters/merge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fromChapter, toChapter }),
  });
  return res.ok;
}

export async function splitChapter(bookId: string, chapterNumber: number) {
  const res = await fetch(`/api/books/${bookId}/chapters/${chapterNumber}/split`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ splitAtPosition: 100 }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.data;
}

export async function rollbackChapter(bookId: string, chapterNumber: number, snapshotId: string) {
  const res = await fetch(`/api/books/${bookId}/chapters/${chapterNumber}/rollback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ toSnapshot: snapshotId }),
  });
  return res.ok;
}

export async function fetchChapterSnapshots(bookId: string, chapterNumber: number) {
  const res = await fetch(`/api/books/${bookId}/chapters/${chapterNumber}/snapshots`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.data || [];
}

export async function fetchChapter(bookId: string, chapterNumber: number) {
  const res = await fetch(`/api/books/${bookId}/chapters/${chapterNumber}`);
  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    const msg = errBody?.error?.message || `获取章节 ${chapterNumber} 失败`;
    throw new Error(msg);
  }
  const data = await res.json();
  return data.data;
}

export async function deleteChapter(bookId: string, chapterNumber: number) {
  const res = await fetch(`/api/books/${bookId}/chapters/${chapterNumber}`, {
    method: 'DELETE',
  });
  return res.ok;
}

export async function fetchEntityContext(
  bookId: string,
  entityName: string,
  chapterNumber?: number,
) {
  const suffix =
    chapterNumber !== undefined
      ? `?chapterNumber=${encodeURIComponent(String(chapterNumber))}`
      : '';
  const res = await fetch(
    `/api/books/${bookId}/context/${encodeURIComponent(entityName)}${suffix}`,
  );
  if (!res.ok) throw new Error('实体上下文不存在');
  const data = await res.json();
  return data.data;
}

export async function fetchMemoryPreview(bookId: string) {
  const res = await fetch(`/api/books/${bookId}/context/memory-preview`);
  if (!res.ok) throw new Error('记忆透视不存在');
  const data = await res.json();
  return data.data;
}

export async function fetchAuditReport(bookId: string, chapterNumber: number) {
  const res = await fetch(`/api/books/${bookId}/chapters/${chapterNumber}/audit-report`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.data;
}

export async function updateChapter(bookId: string, chapterNumber: number, content: string) {
  const res = await fetch(`/api/books/${bookId}/chapters/${chapterNumber}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error('更新失败');
  const data = await res.json();
  return data.data;
}

export async function runAudit(bookId: string, chapterNumber: number) {
  const res = await fetch(`/api/books/${bookId}/chapters/${chapterNumber}/audit`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('审计失败');
  const data = await res.json();
  return data.data;
}

export async function fetchWordCount(bookId: string) {
  const res = await fetch(`/api/books/${bookId}/analytics/word-count`);
  if (!res.ok) throw new Error('获取字数统计失败');
  const data = await res.json();
  return data.data;
}

export async function fetchAuditRate(bookId: string) {
  const res = await fetch(`/api/books/${bookId}/analytics/audit-rate`);
  if (!res.ok) throw new Error('获取审计率失败');
  const data = await res.json();
  return data.data;
}

export async function fetchTokenUsage(bookId: string) {
  const res = await fetch(`/api/books/${bookId}/analytics/token-usage`);
  if (!res.ok) throw new Error('获取Token用量失败');
  const data = await res.json();
  return data.data;
}

export async function fetchAiTrace(bookId: string) {
  const res = await fetch(`/api/books/${bookId}/analytics/ai-trace`);
  if (!res.ok) throw new Error('获取AI痕迹失败');
  const data = await res.json();
  return data.data;
}

export async function fetchQualityBaseline(bookId: string) {
  const res = await fetch(`/api/books/${bookId}/analytics/quality-baseline`);
  if (!res.ok) throw new Error('获取质量基线失败');
  const data = await res.json();
  return data.data;
}

export async function fetchBaselineAlert(bookId: string) {
  const res = await fetch(`/api/books/${bookId}/analytics/baseline-alert`);
  if (!res.ok) throw new Error('获取基线告警失败');
  const data = await res.json();
  return data.data;
}

export async function triggerInspirationShuffle(bookId: string) {
  const res = await fetch(`/api/books/${bookId}/analytics/inspiration-shuffle`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('灵感洗牌失败');
  const data = await res.json();
  return data.data;
}

export async function applyInspirationShuffle(
  bookId: string,
  alternative: {
    id: string;
    style: string;
    text: string;
  },
) {
  const res = await fetch(`/api/books/${bookId}/analytics/apply-shuffle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(alternative),
  });
  if (!res.ok) throw new Error('应用灵感方案失败');
  const data = await res.json();
  return data.data;
}

export async function fetchHooks(bookId: string, status?: string) {
  const url = status ? `/api/books/${bookId}/hooks?status=${status}` : `/api/books/${bookId}/hooks`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('获取伏笔列表失败');
  const data = await res.json();
  return data.data;
}

export async function fetchHookHealth(bookId: string) {
  const res = await fetch(`/api/books/${bookId}/hooks/health`);
  if (!res.ok) throw new Error('获取伏笔健康度失败');
  const data = await res.json();
  return data.data;
}

export async function fetchHookTimeline(bookId: string, fromChapter = 1, toChapter = 100) {
  const res = await fetch(
    `/api/books/${bookId}/hooks/timeline?fromChapter=${fromChapter}&toChapter=${toChapter}`,
  );
  if (!res.ok) throw new Error('获取伏笔时间轴失败');
  const data = await res.json();
  return data.data;
}

export async function fetchHookWakeSchedule(bookId: string) {
  const res = await fetch(`/api/books/${bookId}/hooks/wake-schedule`);
  if (!res.ok) throw new Error('获取伏笔唤醒排班失败');
  const data = await res.json();
  return data.data;
}

export async function createHook(
  bookId: string,
  hook: { description: string; chapter: number; priority: string },
) {
  const res = await fetch(`/api/books/${bookId}/hooks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(hook),
  });
  if (!res.ok) throw new Error('创建伏笔失败');
  const data = await res.json();
  return data.data;
}

export async function updateHook(bookId: string, hookId: string, updates: { status?: string }) {
  const res = await fetch(`/api/books/${bookId}/hooks/${hookId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error('更新伏笔失败');
  const data = await res.json();
  return data.data;
}

export async function declareHookIntent(
  bookId: string,
  hookId: string,
  intent: { min?: number; max?: number; setDormant?: boolean },
) {
  const res = await fetch(`/api/books/${bookId}/hooks/${hookId}/intent`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(intent),
  });
  if (!res.ok) throw new Error('设置意图失败');
  const data = await res.json();
  return data.data;
}

export async function wakeHook(bookId: string, hookId: string, targetStatus = 'open') {
  const res = await fetch(`/api/books/${bookId}/hooks/${hookId}/wake`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetStatus }),
  });
  if (!res.ok) throw new Error('唤醒伏笔失败');
  const data = await res.json();
  return data.data;
}
