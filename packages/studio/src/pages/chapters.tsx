import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  BookOpen,
  FileText,
  PenTool,
  GitBranch,
  Heart,
  Sparkles,
  Palette,
  Archive,
} from 'lucide-react';
import { fetchBooks } from '../lib/api';

interface Book {
  id: string;
  title: string;
  genre: string;
  targetWords: number;
  currentWords: number;
  chapterCount: number;
  targetChapterCount: number;
  status: 'active' | 'archived';
  updatedAt: string;
}

type FilterValue = 'all' | 'active' | 'archived';

const FILTERS: Array<{ value: FilterValue; label: string }> = [
  { value: 'all', label: '全部书籍' },
  { value: 'active', label: '创作中' },
  { value: 'archived', label: '已归档' },
];

export default function ChaptersPage() {
  const location = useLocation();
  const isReviewMode = location.pathname === '/review';

  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterValue>('all');

  useEffect(() => {
    fetchBooks()
      .then((data) => {
        setBooks(data);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : '加载书籍失败');
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const visibleBooks = useMemo(() => {
    if (filter === 'all') {
      return books;
    }
    return books.filter((book) => book.status === filter);
  }, [books, filter]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">加载中…</div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{isReviewMode ? '审阅' : '书籍与章节'}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isReviewMode
              ? '审阅书籍内容，检查章节质量与创作进度。'
              : '这里集中提供已落地的书籍入口、章节列表入口，以及书籍级工作台跳转。'}
          </p>
        </div>
        <Link
          to="/book-create"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
        >
          <BookOpen size={16} />
          去创建书籍
        </Link>
      </div>

      <section className="rounded-xl border bg-card p-5">
        <h2 className="text-base font-semibold">页面说明</h2>
        <div className="mt-3 space-y-2 text-sm text-muted-foreground">
          <p>
            所有核心页面已开放：书籍详情、章节阅读、写作、伏笔面板、伏笔时间线、数据分析、真相文件、题材管理、文风管理、导出、导入、守护进程、系统诊断、日志、创作计划、情感弧线、同人模式、提示词版本、自然Agent。
          </p>
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setFilter(item.value)}
            className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
              filter === item.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {visibleBooks.length === 0 ? (
        <div className="rounded-xl border bg-card px-6 py-12 text-center text-muted-foreground">
          <Archive size={36} className="mx-auto mb-3 opacity-40" />
          <p className="text-base">还没有书籍可供浏览</p>
          <p className="mt-1 text-sm">创建第一本书后，这里会成为你的章节与书籍级工具总入口。</p>
          <Link
            to="/book-create"
            className="mt-4 inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm hover:bg-accent"
          >
            <BookOpen size={16} />
            去创建书籍
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {visibleBooks.map((book) => {
            const progress =
              book.targetWords > 0
                ? Math.min((book.currentWords / book.targetWords) * 100, 100)
                : 0;

            return (
              <section key={book.id} className="rounded-xl border bg-card p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">{book.title}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {book.genre} · {book.chapterCount}/{book.targetChapterCount} 章 ·{' '}
                      {book.currentWords.toLocaleString()} / {book.targetWords.toLocaleString()} 字
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      book.status === 'active'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {book.status === 'active' ? '创作中' : '已归档'}
                  </span>
                </div>

                <div className="mt-4">
                  <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                    <span>总字数进度</span>
                    <span>{progress.toFixed(1)}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-secondary">
                    <div
                      className="h-2 rounded-full bg-primary transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    最近更新：{new Date(book.updatedAt).toLocaleString('zh-CN')}
                  </p>
                </div>

                <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  <ActionLink to={`/book/${book.id}`} icon={FileText} label="打开章节列表" />
                  <ActionLink
                    to={`/book/${book.id}/chapter/${Math.max(book.chapterCount, 1)}`}
                    icon={BookOpen}
                    label="继续阅读"
                  />
                  <ActionLink to={`/writing?bookId=${book.id}`} icon={PenTool} label="快速试写" />
                  <ActionLink to={`/hooks?bookId=${book.id}`} icon={GitBranch} label="伏笔面板" />
                  <ActionLink
                    to={`/style-manager?bookId=${book.id}`}
                    icon={Palette}
                    label="文风配置"
                  />
                  <ActionLink
                    to={`/fanfic-init?bookId=${book.id}`}
                    icon={Sparkles}
                    label="同人模式"
                  />
                  <ActionLink
                    to={`/book/${book.id}/emotional-arcs`}
                    icon={Heart}
                    label="情感弧线"
                  />
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ActionLink({
  to,
  icon: Icon,
  label,
}: {
  to: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
}) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors hover:bg-accent"
    >
      <Icon size={15} className="text-muted-foreground" />
      {label}
    </Link>
  );
}
