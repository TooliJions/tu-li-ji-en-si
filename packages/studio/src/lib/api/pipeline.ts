export async function startFastDraft(
  bookId: string,
  customIntent?: string,
  wordCount: number = 800,
) {
  const res = await fetch(`/api/books/${bookId}/pipeline/fast-draft`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customIntent, wordCount }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const msg = body?.error?.message || '快速试写失败';
    throw new Error(msg);
  }
  const data = await res.json();
  return data.data;
}

export async function startWriteNext(
  bookId: string,
  chapterNumber: number,
  customIntent?: string,
  skipAudit: boolean = false,
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
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const msg = body?.error?.message || '草稿模式失败';
    throw new Error(msg);
  }
  const data = await res.json();
  return data.data;
}

export async function startUpgradeDraft(
  bookId: string,
  chapterNumber: number,
  userIntent?: string,
) {
  const res = await fetch(`/api/books/${bookId}/pipeline/upgrade-draft`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chapterNumber, userIntent }),
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

export async function fetchEmotionalArcs(bookId: string) {
  const res = await fetch(`/api/books/${bookId}/analytics/emotional-arcs`);
  if (!res.ok) throw new Error('获取情感弧线失败');
  const data = await res.json();
  return data.data;
}

export async function fetchPromptVersions(bookId: string) {
  const res = await fetch(`/api/books/${bookId}/prompts`);
  if (!res.ok) throw new Error('获取提示词版本失败');
  const data = await res.json();
  return data.data;
}

export async function setPromptVersion(bookId: string, version: string) {
  const res = await fetch(`/api/books/${bookId}/prompts/set`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ version }),
  });
  if (!res.ok) throw new Error('切换提示词版本失败');
  const data = await res.json();
  return data.data;
}

export async function fetchPromptDiff(bookId: string, from: string, to: string) {
  const res = await fetch(`/api/books/${bookId}/prompts/diff?from=${from}&to=${to}`);
  if (!res.ok) throw new Error('获取提示词差异失败');
  const data = await res.json();
  return data.data;
}

export async function extractStyleFingerprint(
  bookId: string,
  input: { referenceText: string; genre: string },
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
  config: { fingerprint: object; intensity: number },
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
