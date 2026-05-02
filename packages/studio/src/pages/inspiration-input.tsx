import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Lightbulb, Save, Sparkles } from 'lucide-react';
import {
  createInspirationSeed,
  fetchBook,
  fetchInspirationSeed,
  updateInspirationSeed,
  type InspirationSeedDocument,
} from '../lib/api';

interface Book {
  id: string;
  title: string;
  genre: string;
}

interface InspirationFormState {
  sourceText: string;
  genre: string;
  theme: string;
  conflict: string;
  tone: string;
  constraints: string;
  sourceType: InspirationSeedDocument['sourceType'];
}

const emptyForm: InspirationFormState = {
  sourceText: '',
  genre: '',
  theme: '',
  conflict: '',
  tone: '',
  constraints: '',
  sourceType: 'manual',
};

export default function InspirationInput() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const bookId = searchParams.get('bookId') ?? '';
  const [book, setBook] = useState<Book | null>(null);
  const [form, setForm] = useState<InspirationFormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [hasDocument, setHasDocument] = useState(false);

  useEffect(() => {
    if (!bookId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    Promise.all([fetchBook(bookId), fetchInspirationSeed(bookId)])
      .then(([bookData, document]) => {
        setBook(bookData);
        if (document) {
          setForm({
            sourceText: document.sourceText,
            genre: document.genre ?? '',
            theme: document.theme ?? '',
            conflict: document.conflict ?? '',
            tone: document.tone ?? '',
            constraints: document.constraints.join('\n'),
            sourceType: document.sourceType,
          });
          setHasDocument(true);
        }
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : '加载灵感输入失败');
      })
      .finally(() => setLoading(false));
  }, [bookId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!bookId) return;

    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const payload = {
        sourceText: form.sourceText,
        genre: form.genre || undefined,
        theme: form.theme || undefined,
        conflict: form.conflict || undefined,
        tone: form.tone || undefined,
        constraints: form.constraints
          .split(/\n|，|,/)
          .map((item) => item.trim())
          .filter(Boolean),
        sourceType: form.sourceType,
      };

      if (hasDocument) {
        await updateInspirationSeed(bookId, payload);
        setNotice('灵感输入已更新');
      } else {
        await createInspirationSeed(bookId, payload);
        setHasDocument(true);
        setNotice('灵感输入已保存');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '保存灵感输入失败');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">加载中…</div>
    );
  }

  if (!bookId) {
    return (
      <div className="rounded-lg border bg-card px-6 py-12 text-center text-muted-foreground">
        请先选择一本书，再开始灵感输入。
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">灵感输入</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            先把原始灵感收敛成统一 seed，再进入规划。{book ? `当前书籍：${book.title}` : ''}
          </p>
        </div>
        <Link
          to={bookId ? `/planning-brief?bookId=${bookId}` : '#'}
          className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm hover:bg-accent"
        >
          <Sparkles size={16} />
          进入规划
        </Link>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {notice}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5 rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <Lightbulb size={18} className="text-amber-500" />
          <h2 className="text-lg font-semibold">原始灵感与核心冲突</h2>
        </div>

        <div>
          <label htmlFor="source-text" className="mb-1 block text-sm font-medium">
            原始灵感
          </label>
          <textarea
            id="source-text"
            value={form.sourceText}
            onChange={(e) => setForm((prev) => ({ ...prev, sourceText: e.target.value }))}
            className="min-h-32 w-full rounded-md border bg-background px-3 py-2 text-sm"
            placeholder="把你的灵感、片段、想法先倒进来。"
            required
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="genre" className="mb-1 block text-sm font-medium">
              题材方向
            </label>
            <input
              id="genre"
              value={form.genre}
              onChange={(e) => setForm((prev) => ({ ...prev, genre: e.target.value }))}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="例如：玄幻、都市、仙侠"
            />
          </div>
          <div>
            <label htmlFor="theme" className="mb-1 block text-sm font-medium">
              主题
            </label>
            <input
              id="theme"
              value={form.theme}
              onChange={(e) => setForm((prev) => ({ ...prev, theme: e.target.value }))}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="例如：逆袭、代价、成长"
            />
          </div>
          <div>
            <label htmlFor="conflict" className="mb-1 block text-sm font-medium">
              核心冲突
            </label>
            <input
              id="conflict"
              value={form.conflict}
              onChange={(e) => setForm((prev) => ({ ...prev, conflict: e.target.value }))}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="例如：身份暴露、资源争夺"
            />
          </div>
          <div>
            <label htmlFor="tone" className="mb-1 block text-sm font-medium">
              基调
            </label>
            <input
              id="tone"
              value={form.tone}
              onChange={(e) => setForm((prev) => ({ ...prev, tone: e.target.value }))}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="例如：热血、冷峻、悬疑"
            />
          </div>
        </div>

        <div>
          <label htmlFor="constraints" className="mb-1 block text-sm font-medium">
            约束条件
          </label>
          <textarea
            id="constraints"
            value={form.constraints}
            onChange={(e) => setForm((prev) => ({ ...prev, constraints: e.target.value }))}
            className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm"
            placeholder="每行一条，例如：不降智、升级明确、感情线慢热"
          />
        </div>

        <div>
          <label htmlFor="source-type" className="mb-1 block text-sm font-medium">
            来源类型
          </label>
          <select
            id="source-type"
            value={form.sourceType}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                sourceType: e.target.value as InspirationSeedDocument['sourceType'],
              }))
            }
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          >
            <option value="manual">手动输入</option>
            <option value="shuffle">灵感洗牌</option>
            <option value="import">外部导入</option>
          </select>
        </div>

        <div className="flex items-center justify-between gap-3 border-t pt-4">
          <span className="text-xs text-muted-foreground">保存后才能进入规划阶段。</span>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving || !form.sourceText.trim()}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <Save size={16} />
              {saving ? '保存中…' : hasDocument ? '更新灵感输入' : '保存灵感输入'}
            </button>
            <button
              type="button"
              disabled={!hasDocument}
              onClick={() => navigate(`/planning-brief?bookId=${bookId}`)}
              className="rounded-md border px-4 py-2 text-sm hover:bg-accent disabled:opacity-50"
            >
              下一步：规划
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
