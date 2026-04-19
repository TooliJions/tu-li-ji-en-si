import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, PenTool, TrendingUp, AlertCircle, Plus } from 'lucide-react';

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

export default function Dashboard() {
  const [books, setBooks] = useState<Book[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const [booksRes] = await Promise.all([fetch('/api/books')]);

        if (!booksRes.ok) throw new Error('Failed to fetch books');

        const booksData = await booksRes.json();
        setBooks(booksData.data || []);

        // Load recent activity from first active book
        if (booksData.data?.length > 0) {
          const activeBook =
            booksData.data.find((b: Book) => b.status === 'active') || booksData.data[0];
          const actRes = await fetch(`/api/books/${activeBook.id}/activity`);
          if (actRes.ok) {
            const actData = await actRes.json();
            setActivities(actData.data || []);
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
        <StatCard icon={AlertCircle} label="待处理伏笔" value={0} color="text-amber-500" />
      </div>

      {/* Books List */}
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
              <Link
                key={book.id}
                to={`/book/${book.id}`}
                className="block p-4 hover:bg-accent transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">{book.title}</h3>
                    <p className="text-sm text-muted-foreground">
                      {book.genre} · {book.chapterCount}/{book.targetChapterCount} 章
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">{book.currentWords.toLocaleString()} 字</p>
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
            ))}
          </div>
        )}
      </div>

      {/* Recent Activity */}
      <div className="rounded-lg border bg-card">
        <div className="p-4 border-b">
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
