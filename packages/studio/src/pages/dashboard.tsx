import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Plus, AlertCircle, Trash2, X } from 'lucide-react';
import { fetchBooks, deleteBook } from '../lib/api';
import { DashboardPageSkeleton } from '../components/page-loading-skeletons';

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

export default function Dashboard() {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ bookId: string; title: string } | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    async function fetchData() {
      try {
        const booksData = await fetchBooks();
        setBooks(booksData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  function requestDeleteBook(bookId: string, title: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDeleteConfirm({ bookId, title });
  }

  async function confirmDeleteBook() {
    if (!deleteConfirm || deleting) return;
    setDeleteError(null);
    setDeleting(true);
    try {
      await deleteBook(deleteConfirm.bookId);
      setBooks((prev) => prev.filter((b) => b.id !== deleteConfirm.bookId));
      setDeleteConfirm(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return <DashboardPageSkeleton />;
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
        <h1 className="text-2xl font-bold">我的书籍</h1>
        <Link
          to="/book-create"
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90"
        >
          <Plus size={16} />
          新建书籍
        </Link>
      </div>

      {books.length === 0 ? (
        <div className="rounded-lg border bg-card p-12 text-center text-muted-foreground">
          <BookOpen size={48} className="mx-auto mb-3 opacity-40" />
          <p className="mb-4">还没有书籍，点击下方按钮开始创作</p>
          <Link
            to="/book-create"
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90"
          >
            <Plus size={16} />
            新建书籍
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {books.map((book) => (
            <Link
              key={book.id}
              to={`/writing?bookId=${encodeURIComponent(book.id)}`}
              className="group rounded-lg border bg-card p-5 hover:shadow-md hover:border-primary/50 transition-all"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium truncate">{book.title}</h3>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {book.genre} · {book.chapterCount}/{book.targetChapterCount} 章
                  </p>
                </div>
                <button
                  className="ml-2 text-muted-foreground opacity-0 group-hover:opacity-100 hover:!opacity-100 hover:text-destructive transition-all shrink-0"
                  title="删除书籍"
                  onClick={(e) => requestDeleteBook(book.id, book.title, e)}
                >
                  <X size={16} />
                </button>
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                  <span>{book.currentWords.toLocaleString()} 字</span>
                  <span>
                    {Math.min(Math.round((book.currentWords / book.targetWords) * 100), 100)}%
                  </span>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{
                      width: `${Math.min((book.currentWords / book.targetWords) * 100, 100)}%`,
                    }}
                  />
                </div>
              </div>

              <p className="text-xs text-muted-foreground mt-3">
                更新于 {new Date(book.updatedAt).toLocaleDateString('zh-CN')}
              </p>
            </Link>
          ))}
        </div>
      )}

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
                disabled={deleting}
                className="px-4 py-2 bg-destructive text-destructive-foreground rounded text-sm hover:bg-destructive/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleting ? '删除中…' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
