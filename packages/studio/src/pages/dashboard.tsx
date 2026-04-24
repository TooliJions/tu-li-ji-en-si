import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  PenTool,
  TrendingUp,
  AlertCircle,
  Plus,
  Activity,
  Trash2,
  X,
} from 'lucide-react';
import { fetchBooks, fetchAiTrace, deleteBook, fetchHooks } from '../lib/api';
import BaselineChart from '../components/baseline-chart';

interface Book {
  id: string;
  title: string;
  genre: string;
  targetWords: number;
  currentWords: number;
  chapterCount: number;
  targetChapterCount: number;
  status: string;
  updatedAt: string;
}

interface ActivityItem {
  id: string;
  type: string;
  description: string;
  timestamp: string;
}

interface TrendData {
  chapter: number;
  score: number;
  baseline: number;
}

export default function Dashboard() {
  const [books, setBooks] = useState<Book[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [trendData, setTrendData] = useState<TrendData[]>([]);
  const [pendingHooks, setPendingHooks] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ bookId: string; title: string } | null>(
    null
  );

  useEffect(() => {
    async function fetchData() {
      try {
        const booksData = await fetchBooks();
        setBooks(booksData);

        if (booksData.length > 0) {
          const activeBook = booksData.find((b: Book) => b.status === 'active') || booksData[0];

          // Fetch activity separately — don't let it break the main flow
          try {
            const actRes = await fetch(`/api/books/${activeBook.id}/activity`);
            if (actRes.ok) {
              const actData = await actRes.json();
              setActivities(actData.data || []);
            }
          } catch {
            // Activity fetch failed — non-critical, dashboard still works
          }

          const traceData = await fetchAiTrace(activeBook.id).catch(() => ({
            trend: [],
            average: 0,
          }));

          // Map ai-trace trend to chart format (last 7 chapters)
          const last7 = (traceData.trend || [])
            .slice(-7)
            .map((t: { chapter?: number; score?: number }) => ({
              chapter: t.chapter,
              score: t.score,
              baseline: traceData.average, // Use average as a simple baseline
            }));
          setTrendData(last7);

          // Fetch pending hooks count
          try {
            const hooksData = await fetchHooks(activeBook.id, 'open');
            setPendingHooks(Array.isArray(hooksData) ? hooksData.length : 0);
          } catch {
            // Non-critical — dashboard still works
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  const totalWords = books.reduce((sum, b) => sum + b.currentWords, 0);
  const activeBooks = books.filter((b) => b.status === 'active').length;

  function requestDeleteBook(bookId: string, title: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDeleteConfirm({ bookId, title });
  }

  async function confirmDeleteBook() {
    if (!deleteConfirm) return;
    setDeleteError(null);
    try {
      await deleteBook(deleteConfirm.bookId);
      setBooks((prev) => prev.filter((b) => b.id !== deleteConfirm.bookId));
      setDeleteConfirm(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : '删除失败');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">加载中…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 p-4 bg-destructive/10 text-destructive rounded-md">
        <AlertCircle size={18} />
        <span>{error}</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {deleteError && (
        <div
          role="alert"
          className="flex items-center gap-2 p-4 bg-destructive/10 text-destructive rounded-md"
        >
          <AlertCircle size={18} />
          <span>{deleteError}</span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">仪表盘</h1>
        <Link
          to="/book-create"
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90"
        >
          <Plus size={16} />
          新建书籍
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={BookOpen} label="书籍总数" value={books.length} color="text-blue-500" />
        <StatCard icon={PenTool} label="创作中" value={activeBooks} color="text-green-500" />
        <StatCard
          icon={TrendingUp}
          label="总字数"
          value={totalWords.toLocaleString()}
          color="text-purple-500"
        />
        <StatCard
          icon={AlertCircle}
          label="待处理伏笔"
          value={pendingHooks}
          color="text-amber-500"
        />
      </div>

      {/* Books and Activity/Trend Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Books List - Left Column (Main) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-lg border bg-card">
            <div className="p-4 border-b">
              <h2 className="text-lg font-semibold">我的书籍</h2>
            </div>
            {books.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <BookOpen size={48} className="mx-auto mb-3 opacity-40" />
                <p>还没有书籍，点击上方「新建书籍」开始创作</p>
              </div>
            ) : (
              <div className="divide-y">
                {books.map((book) => (
                  <div
                    key={book.id}
                    className="flex items-start justify-between group hover:bg-accent transition-colors"
                  >
                    <Link to={`/book/${book.id}`} className="block p-4 flex-1">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-medium">{book.title}</h3>
                          <p className="text-sm text-muted-foreground">
                            {book.genre} · {book.chapterCount}/{book.targetChapterCount} 章
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium">
                            {book.currentWords.toLocaleString()} 字
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(book.updatedAt).toLocaleDateString('zh-CN')}
                          </p>
                        </div>
                      </div>
                      {/* Progress bar */}
                      <div className="mt-2 h-1.5 bg-secondary rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{
                            width: `${Math.min((book.currentWords / book.targetWords) * 100, 100)}%`,
                          }}
                        />
                      </div>
                    </Link>
                    <button
                      className="p-4 text-muted-foreground opacity-0 group-hover:opacity-100 hover:!opacity-100 hover:text-destructive transition-all"
                      title="删除书籍"
                      onClick={(e) => requestDeleteBook(book.id, book.title, e)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar - Right Column */}
        <div className="space-y-6">
          {/* Quality Trend Chart */}
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2 mb-4 border-b pb-2">
              <Activity size={18} className="text-primary" />
              <h2 className="text-lg font-semibold">近 7 章质量评分趋势</h2>
            </div>
            {trendData.length > 0 ? (
              <div className="pt-2">
                <BaselineChart data={trendData} title="" />
                <p className="text-[10px] text-muted-foreground mt-4 italic">
                  * 评分基于 AI 痕迹检测，数值越低代表 AI 痕迹越重，创作质量可能存在漂移。
                </p>
              </div>
            ) : (
              <div className="py-12 text-center text-muted-foreground border border-dashed rounded-md">
                <TrendingUp size={32} className="mx-auto mb-2 opacity-20" />
                <p className="text-xs">暂无质量评分数据</p>
              </div>
            )}
          </div>

          {/* Recent Activity */}
          <div className="rounded-lg border bg-card">
            <div className="p-4 border-b flex items-center gap-2">
              <Activity size={18} />
              <h2 className="text-lg font-semibold">最近活动</h2>
            </div>
            <div className="p-4">
              {activities.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">暂无活动记录</p>
              ) : (
                <ul className="space-y-3">
                  {activities.map((act) => (
                    <li key={act.id} className="flex items-start gap-3">
                      <div className="w-2 h-2 rounded-full bg-primary mt-2" />
                      <div className="flex-1">
                        <p className="text-sm">{act.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(act.timestamp).toLocaleString('zh-CN')}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Delete Book Confirmation Dialog */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-lg border p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Trash2 size={18} className="text-destructive" />
                <h3 className="text-lg font-semibold">确认删除</h3>
              </div>
              <button
                onClick={() => setDeleteConfirm(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-muted-foreground mb-2">
              您确定要删除「
              <span className="font-medium text-foreground">{deleteConfirm.title}</span>」吗？
            </p>
            <p className="text-xs text-amber-600 mb-6">⚠ 此操作不可逆，书籍将被移入回收站。</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 border rounded text-sm hover:bg-accent"
              >
                取消
              </button>
              <button
                onClick={confirmDeleteBook}
                className="px-4 py-2 bg-destructive text-destructive-foreground rounded text-sm hover:bg-destructive/90"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-3">
        <Icon size={20} className={color} />
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-xl font-bold">{value}</p>
        </div>
      </div>
    </div>
  );
}
