export async function fetchBook(bookId: string) {
  const res = await fetch(`/api/books/${bookId}`);
  if (!res.ok) throw new Error('书籍不存在');
  const data = await res.json();
  return data.data;
}

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

export async function fetchChapter(bookId: string, chapterNumber: number) {
  const res = await fetch(`/api/books/${bookId}/chapters/${chapterNumber}`);
  if (!res.ok) throw new Error('章节不存在');
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

export async function startFastDraft(
  bookId: string,
  customIntent?: string,
  wordCount: number = 800
) {
  const res = await fetch(`/api/books/${bookId}/pipeline/fast-draft`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customIntent, wordCount }),
  });
  if (!res.ok) throw new Error('快速试写失败');
  const data = await res.json();
  return data.data;
}

export async function startWriteNext(
  bookId: string,
  chapterNumber: number,
  customIntent?: string,
  skipAudit: boolean = false
) {
  const res = await fetch(`/api/books/${bookId}/pipeline/write-next`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chapterNumber, customIntent, skipAudit }),
  });
  if (!res.ok) throw new Error('完整创作失败');
  const data = await res.json();
  return data.data;
}

export async function startWriteDraft(bookId: string, chapterNumber: number) {
  const res = await fetch(`/api/books/${bookId}/pipeline/write-draft`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chapterNumber }),
  });
  if (!res.ok) throw new Error('草稿模式失败');
  const data = await res.json();
  return data.data;
}

export async function startUpgradeDraft(bookId: string, draftId: string, content: string) {
  const res = await fetch(`/api/books/${bookId}/pipeline/upgrade-draft`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ draftId, content }),
  });
  if (!res.ok) throw new Error('草稿转正失败');
  const data = await res.json();
  return data.data;
}

export async function getPipelineStatus(bookId: string, pipelineId: string) {
  const res = await fetch(`/api/books/${bookId}/pipeline/${pipelineId}`);
  if (!res.ok) throw new Error('流水线不存在');
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

// Truth Files
export async function fetchTruthFiles() {
  const res = await fetch('/api/state/');
  if (!res.ok) throw new Error('获取真相文件列表失败');
  const data = await res.json();
  return data.data;
}

export async function fetchTruthFile(fileName: string) {
  const res = await fetch(`/api/state/${fileName}`);
  if (!res.ok) throw new Error('获取真相文件失败');
  const data = await res.json();
  return data.data;
}

export async function updateTruthFile(fileName: string, content: string, versionToken: number) {
  const res = await fetch(`/api/state/${fileName}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, versionToken }),
  });
  if (!res.ok) throw new Error('更新真相文件失败');
  const data = await res.json();
  return data.data;
}

export async function fetchProjectionStatus() {
  const res = await fetch('/api/state/projection-status');
  if (!res.ok) throw new Error('获取投影状态失败');
  const data = await res.json();
  return data.data;
}

export async function importMarkdown(fileName: string) {
  const res = await fetch('/api/state/import-markdown', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName }),
  });
  if (!res.ok) throw new Error('导入 Markdown 失败');
  const data = await res.json();
  return data.data;
}

// Daemon Control
export async function fetchDaemonStatus(bookId: string) {
  const res = await fetch(`/api/books/${bookId}/daemon`);
  if (!res.ok) throw new Error('获取守护进程状态失败');
  const data = await res.json();
  return data.data;
}

export async function startDaemon(
  bookId: string,
  config: { fromChapter: number; toChapter: number; interval: number }
) {
  const res = await fetch(`/api/books/${bookId}/daemon/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error('启动守护进程失败');
  const data = await res.json();
  return data.data;
}

export async function pauseDaemon(bookId: string) {
  const res = await fetch(`/api/books/${bookId}/daemon/pause`, { method: 'POST' });
  if (!res.ok) throw new Error('暂停守护进程失败');
  const data = await res.json();
  return data.data;
}

export async function stopDaemon(bookId: string) {
  const res = await fetch(`/api/books/${bookId}/daemon/stop`, { method: 'POST' });
  if (!res.ok) throw new Error('停止守护进程失败');
  const data = await res.json();
  return data.data;
}

// Hooks
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
    `/api/books/${bookId}/hooks/timeline?fromChapter=${fromChapter}&toChapter=${toChapter}`
  );
  if (!res.ok) throw new Error('获取伏笔时间轴失败');
  const data = await res.json();
  return data.data;
}

export async function createHook(
  bookId: string,
  hook: { description: string; chapter: number; priority: string }
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
  intent: { min?: number; max?: number; setDormant?: boolean }
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

// Config
export async function fetchConfig() {
  const res = await fetch('/api/config');
  if (!res.ok) throw new Error('获取配置失败');
  const data = await res.json();
  return data.data;
}

export async function updateConfig(config: object) {
  const res = await fetch('/api/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error('更新配置失败');
  const data = await res.json();
  return data.data;
}

export async function testProvider(provider: {
  name: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}) {
  const res = await fetch('/api/config/test-provider', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(provider),
  });
  const data = await res.json();
  return data.data;
}

// System Doctor
export async function fetchDoctorStatus() {
  const res = await fetch('/api/system/doctor');
  if (!res.ok) throw new Error('获取诊断信息失败');
  const data = await res.json();
  return data.data;
}

export async function fixLocks() {
  const res = await fetch('/api/system/doctor/fix-locks', { method: 'POST' });
  const data = await res.json();
  return data.data;
}

export async function reorgRecovery(bookId?: string) {
  const res = await fetch('/api/system/doctor/reorg-recovery', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bookId ? { bookId } : {}),
  });
  const data = await res.json();
  return data.data;
}

export async function fetchStateDiff(file: string) {
  const res = await fetch(`/api/books/state/diff?file=${file}`);
  if (!res.ok) throw new Error('获取状态差异失败');
  const data = await res.json();
  return data.data;
}

// Fanfic
export async function initFanfic(
  bookId: string,
  config: { mode: string; description: string; canonReference?: string }
) {
  const res = await fetch(`/api/books/${bookId}/fanfic/init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  const data = await res.json();
  return data.data;
}

// Style
export async function extractStyleFingerprint(
  bookId: string,
  input: { referenceText: string; genre: string }
) {
  const res = await fetch(`/api/books/${bookId}/style/fingerprint`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error('提取风格指纹失败');
  const data = await res.json();
  return data.data;
}

export async function applyStyleImitation(
  bookId: string,
  config: { fingerprint: object; intensity: number }
) {
  const res = await fetch(`/api/books/${bookId}/style/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error('应用文风仿写失败');
  const data = await res.json();
  return data.data;
}

// Emotional Arcs
export async function fetchEmotionalArcs(bookId: string) {
  const res = await fetch(`/api/books/${bookId}/analytics/emotional-arcs`);
  if (!res.ok) throw new Error('获取情感弧线失败');
  const data = await res.json();
  return data.data;
}
