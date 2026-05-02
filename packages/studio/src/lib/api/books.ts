export async function fetchBooks(params?: { status?: string; genre?: string }) {
  const search = new URLSearchParams();
  if (params?.status) {
    search.set('status', params.status);
  }
  if (params?.genre) {
    search.set('genre', params.genre);
  }

  const suffix = search.toString() ? `?${search.toString()}` : '';
  const res = await fetch(`/api/books${suffix}`);
  if (!res.ok) throw new Error('获取书籍列表失败');
  const data = await res.json();
  return data.data || [];
}

export async function deleteBook(bookId: string) {
  const res = await fetch(`/api/books/${bookId}`, { method: 'DELETE' });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const msg = body?.error?.message || '删除书籍失败';
    throw new Error(msg);
  }
  if (res.status === 204) return true;
  const data = await res.json().catch(() => ({}));
  return data.data ?? true;
}

export async function fetchBook(bookId: string) {
  const res = await fetch(`/api/books/${bookId}`);
  if (!res.ok) throw new Error('书籍不存在');
  const data = await res.json();
  return data.data;
}

export async function fetchGenres() {
  const res = await fetch('/api/genres');
  if (!res.ok) throw new Error('获取题材列表失败');
  const data = await res.json();
  return data.data;
}

export async function updateGenre(
  genreId: string,
  updates: { name?: string; description?: string; constraints?: string[]; tags?: string[] },
) {
  const res = await fetch(`/api/genres/${genreId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error('更新题材失败');
  const data = await res.json();
  return data.data;
}

export type ExportFormat = 'markdown' | 'txt' | 'epub';

export async function startExport(
  bookId: string,
  format: ExportFormat,
  options?: { chapterFrom?: number; chapterTo?: number },
) {
  const params = new URLSearchParams();
  params.set('format', format);
  if (options?.chapterFrom) params.set('chapterFrom', String(options.chapterFrom));
  if (options?.chapterTo) params.set('chapterTo', String(options.chapterTo));

  const res = await fetch(`/api/books/${bookId}/export?${params.toString()}`);
  if (!res.ok) throw new Error('启动导出失败');

  const filename =
    res.headers.get('content-disposition')?.match(/filename="?([^";]+)"?/i)?.[1] ??
    `导出.${format === 'epub' ? 'epub' : format === 'txt' ? 'txt' : 'md'}`;

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return { filename, format };
}
