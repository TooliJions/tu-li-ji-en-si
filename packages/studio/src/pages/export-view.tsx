import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BookOpen, Download, FileOutput, FileText, LoaderCircle } from 'lucide-react';
import { fetchBooks, fetchChapters, startExport, type ExportFormat } from '../lib/api';

interface Book {
  id: string;
  title: string;
  genre: string;
  chapterCount: number;
  targetChapterCount: number;
  currentWords: number;
}

const EXPORT_FORMATS: Array<{
  value: ExportFormat;
  label: string;
  description: string;
}> = [
  { value: 'markdown', label: 'Markdown', description: '保留章节结构，适合继续编辑与归档。' },
  { value: 'txt', label: 'TXT', description: '纯文本导出，适合快速交付与校对。' },
  { value: 'epub', label: 'EPUB', description: '电子书格式，适合设备阅读与分发。' },
];

export default function ExportView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedBookId = searchParams.get('bookId') || '';
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedBookId, setSelectedBookId] = useState(requestedBookId);
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('markdown');
  const [exporting, setExporting] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [chapterCount, setChapterCount] = useState(0);
  const [useChapterRange, setUseChapterRange] = useState(false);
  const [chapterFrom, setChapterFrom] = useState(1);
  const [chapterTo, setChapterTo] = useState(1);

  useEffect(() => {
    fetchBooks()
      .then((data) => {
        setBooks(data);
        const defaultBookId = requestedBookId || data[0]?.id || '';
        setSelectedBookId(defaultBookId);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : '加载书籍失败');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [requestedBookId]);

  const selectedBook = useMemo(
    () => books.find((book) => book.id === selectedBookId) ?? null,
    [books, selectedBookId]
  );

  useEffect(() => {
    if (!selectedBookId) {
      setChapterCount(0);
      return;
    }
    fetchChapters(selectedBookId)
      .then((chapters) => {
        const count = chapters.length;
        setChapterCount(count);
        setChapterTo(count);
        setChapterFrom(1);
      })
      .catch(() => setChapterCount(0));
  }, [selectedBookId]);

  async function handleExport() {
    if (!selectedBookId || exporting) {
      return;
    }

    setExporting(true);
    setResultMessage(null);

    try {
      const options = useChapterRange
        ? {
            chapterFrom: Math.min(chapterFrom, chapterTo),
            chapterTo: Math.max(chapterFrom, chapterTo),
          }
        : undefined;
      const result = await startExport(selectedBookId, selectedFormat, options);
      const formatLabel =
        EXPORT_FORMATS.find((item) => item.value === result.format)?.label ?? result.format;
      setResultMessage(`已下载 ${selectedBook?.title ?? '当前书籍'}，文件：${result.filename}。`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '启动导出失败');
    } finally {
      setExporting(false);
    }
  }

  function handleBookSelect(bookId: string) {
    setSelectedBookId(bookId);
    setSearchParams(bookId ? { bookId } : {});
    setResultMessage(null);
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">加载中…</div>
    );
  }

  if (error && books.length === 0) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (books.length === 0) {
    return (
      <div className="rounded-xl border bg-card px-6 py-12 text-center text-muted-foreground">
        <BookOpen size={36} className="mx-auto mb-3 opacity-40" />
        <p className="text-base">还没有可导出的书籍</p>
        <p className="mt-1 text-sm">先创建一本书，导出页才会出现格式选择和下载入口。</p>
        <Link
          to="/book-create"
          className="mt-4 inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm hover:bg-accent"
        >
          <BookOpen size={16} />
          去创建书籍
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">导出</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            选择一本书并发起 Markdown、TXT 或 EPUB 导出，统一承接侧边栏与书籍详情中的导出入口。
          </p>
        </div>
        {selectedBook && (
          <Link
            to={`/book/${selectedBook.id}`}
            className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm hover:bg-accent"
          >
            <FileText size={16} />
            返回书籍详情
          </Link>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <BookOpen size={18} />
            <h2 className="text-lg font-semibold">选择书籍</h2>
          </div>
          <div className="mt-4 grid gap-3">
            {books.map((book) => {
              const isSelected = book.id === selectedBookId;
              return (
                <button
                  key={book.id}
                  type="button"
                  onClick={() => handleBookSelect(book.id)}
                  className={`rounded-xl border px-4 py-4 text-left transition-colors ${
                    isSelected
                      ? 'border-primary bg-primary/5 shadow-sm'
                      : 'border-border hover:bg-accent/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-base font-semibold text-foreground">{book.title}</div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {book.genre} · {book.chapterCount}/{book.targetChapterCount} 章 ·{' '}
                        {book.currentWords.toLocaleString()} 字
                      </p>
                    </div>
                    {isSelected && (
                      <span className="rounded-full bg-primary px-2.5 py-1 text-xs text-primary-foreground">
                        当前导出目标
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <FileOutput size={18} />
            <h2 className="text-lg font-semibold">选择格式</h2>
          </div>

          <div className="mt-4 space-y-3">
            {EXPORT_FORMATS.map((format) => {
              const active = format.value === selectedFormat;
              return (
                <button
                  key={format.value}
                  type="button"
                  onClick={() => setSelectedFormat(format.value)}
                  className={`w-full rounded-xl border px-4 py-4 text-left transition-colors ${
                    active ? 'border-primary bg-primary/5' : 'hover:bg-accent/40'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-foreground">{format.label}</div>
                      <p className="mt-1 text-sm text-muted-foreground">{format.description}</p>
                    </div>
                    {active && (
                      <span className="rounded-full bg-primary px-2 py-1 text-xs text-primary-foreground">
                        已选择
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex items-center gap-2">
            <input
              type="checkbox"
              id="chapter-range-toggle"
              checked={useChapterRange}
              onChange={(e) => setUseChapterRange(e.target.checked)}
              className="rounded border"
            />
            <label htmlFor="chapter-range-toggle" className="text-sm">
              指定章节范围
            </label>
          </div>

          {useChapterRange && chapterCount > 0 && (
            <div className="mt-3 flex items-center gap-3">
              <input
                type="number"
                min={1}
                max={chapterCount}
                value={chapterFrom}
                onChange={(e) => setChapterFrom(Number(e.target.value))}
                className="w-20 rounded-md border px-2 py-1.5 text-sm bg-background"
                aria-label="起始章节"
              />
              <span className="text-sm text-muted-foreground">至</span>
              <input
                type="number"
                min={1}
                max={chapterCount}
                value={chapterTo}
                onChange={(e) => setChapterTo(Number(e.target.value))}
                className="w-20 rounded-md border px-2 py-1.5 text-sm bg-background"
                aria-label="结束章节"
              />
              <span className="text-xs text-muted-foreground">共 {chapterCount} 章</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleExport}
            disabled={!selectedBookId || exporting}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {exporting ? (
              <LoaderCircle size={16} className="animate-spin" />
            ) : (
              <Download size={16} />
            )}
            {exporting ? '正在启动导出…' : '开始导出'}
          </button>

          {resultMessage && (
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {resultMessage}
            </div>
          )}
          {error && books.length > 0 && (
            <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
