import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Save, Sparkles } from 'lucide-react';
import {
  createPlanningBrief,
  fetchBook,
  fetchInspirationSeed,
  fetchPlanningBrief,
  updatePlanningBrief,
  type PlanningBriefDocument,
} from '../lib/api';

interface Book {
  id: string;
  title: string;
}

interface PlanningFormState {
  audience: string;
  genreStrategy: string;
  styleTarget: string;
  lengthTarget: string;
  tabooRules: string;
  marketGoals: string;
  creativeConstraints: string;
  status: PlanningBriefDocument['status'];
}

const emptyForm: PlanningFormState = {
  audience: '',
  genreStrategy: '',
  styleTarget: '',
  lengthTarget: '',
  tabooRules: '',
  marketGoals: '',
  creativeConstraints: '',
  status: 'draft',
};

export default function PlanningBriefPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const bookId = searchParams.get('bookId') ?? '';
  const [book, setBook] = useState<Book | null>(null);
  const [form, setForm] = useState<PlanningFormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [hasDocument, setHasDocument] = useState(false);
  const [hasSeed, setHasSeed] = useState(false);

  useEffect(() => {
    if (!bookId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    Promise.all([fetchBook(bookId), fetchInspirationSeed(bookId), fetchPlanningBrief(bookId)])
      .then(([bookData, seed, brief]) => {
        setBook(bookData);
        setHasSeed(Boolean(seed));
        if (brief) {
          setForm({
            audience: brief.audience,
            genreStrategy: brief.genreStrategy,
            styleTarget: brief.styleTarget,
            lengthTarget: brief.lengthTarget,
            tabooRules: brief.tabooRules.join('\n'),
            marketGoals: brief.marketGoals.join('\n'),
            creativeConstraints: brief.creativeConstraints.join('\n'),
            status: brief.status,
          });
          setHasDocument(true);
        }
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : '加载规划简报失败');
      })
      .finally(() => setLoading(false));
  }, [bookId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!bookId || !hasSeed) return;

    setSaving(true);
    setError(null);
    setNotice(null);

    const payload = {
      audience: form.audience,
      genreStrategy: form.genreStrategy,
      styleTarget: form.styleTarget,
      lengthTarget: form.lengthTarget,
      tabooRules: splitMultiline(form.tabooRules),
      marketGoals: splitMultiline(form.marketGoals),
      creativeConstraints: splitMultiline(form.creativeConstraints),
    };

    try {
      if (hasDocument) {
        await updatePlanningBrief(bookId, { ...payload, status: form.status });
        setNotice('规划简报已更新');
      } else {
        await createPlanningBrief(bookId, payload);
        setHasDocument(true);
        setNotice('规划简报已保存');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '保存规划简报失败');
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
        请先选择一本书，再进入规划阶段。
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">规划简报</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            把灵感收敛成可执行的 Planning Brief。{book ? `当前书籍：${book.title}` : ''}
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            to={bookId ? `/inspiration?bookId=${bookId}` : '#'}
            className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm hover:bg-accent"
          >
            返回灵感输入
          </Link>
          <Link
            to={bookId ? `/story-outline?bookId=${bookId}` : '#'}
            className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm hover:bg-accent"
          >
            <Sparkles size={16} />
            进入总纲
          </Link>
        </div>
      </div>

      {!hasSeed && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          请先完成灵感输入，再进入规划页。
        </div>
      )}
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
        <div>
          <label htmlFor="audience" className="mb-1 block text-sm font-medium">
            目标读者
          </label>
          <input
            id="audience"
            value={form.audience}
            onChange={(e) => setForm((prev) => ({ ...prev, audience: e.target.value }))}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            placeholder="例如：男频玄幻读者"
            required
          />
        </div>
        <div>
          <label htmlFor="genre-strategy" className="mb-1 block text-sm font-medium">
            题材策略
          </label>
          <input
            id="genre-strategy"
            value={form.genreStrategy}
            onChange={(e) => setForm((prev) => ({ ...prev, genreStrategy: e.target.value }))}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            placeholder="例如：高开高走、强冲突"
            required
          />
        </div>
        <div>
          <label htmlFor="style-target" className="mb-1 block text-sm font-medium">
            风格目标
          </label>
          <input
            id="style-target"
            value={form.styleTarget}
            onChange={(e) => setForm((prev) => ({ ...prev, styleTarget: e.target.value }))}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            placeholder="例如：爽点密集、语言利落"
            required
          />
        </div>
        <div>
          <label htmlFor="length-target" className="mb-1 block text-sm font-medium">
            篇幅目标
          </label>
          <input
            id="length-target"
            value={form.lengthTarget}
            onChange={(e) => setForm((prev) => ({ ...prev, lengthTarget: e.target.value }))}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            placeholder="例如：300 万字"
            required
          />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <TextAreaField
            id="taboo-rules"
            label="禁区规则"
            value={form.tabooRules}
            onChange={(value) => setForm((prev) => ({ ...prev, tabooRules: value }))}
            placeholder="每行一条，例如：不降智"
          />
          <TextAreaField
            id="market-goals"
            label="市场目标"
            value={form.marketGoals}
            onChange={(value) => setForm((prev) => ({ ...prev, marketGoals: value }))}
            placeholder="每行一条，例如：起点连载"
          />
          <TextAreaField
            id="creative-constraints"
            label="创作约束"
            value={form.creativeConstraints}
            onChange={(value) => setForm((prev) => ({ ...prev, creativeConstraints: value }))}
            placeholder="每行一条，例如：成长线清晰"
          />
        </div>
        <div>
          <label htmlFor="planning-status" className="mb-1 block text-sm font-medium">
            规划状态
          </label>
          <select
            id="planning-status"
            value={form.status}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                status: e.target.value as PlanningBriefDocument['status'],
              }))
            }
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          >
            <option value="draft">草稿</option>
            <option value="ready">就绪</option>
            <option value="approved">已确认</option>
          </select>
        </div>
        <div className="flex items-center justify-between gap-3 border-t pt-4">
          <span className="text-xs text-muted-foreground">
            先完成灵感输入，再保存规划简报，最后进入总纲。
          </span>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={
                saving ||
                !hasSeed ||
                !form.audience.trim() ||
                !form.genreStrategy.trim() ||
                !form.styleTarget.trim() ||
                !form.lengthTarget.trim()
              }
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <Save size={16} />
              {saving ? '保存中…' : hasDocument ? '更新规划简报' : '保存规划简报'}
            </button>
            <button
              type="button"
              disabled={!hasDocument}
              onClick={() => navigate(`/story-outline?bookId=${bookId}`)}
              className="rounded-md border px-4 py-2 text-sm hover:bg-accent disabled:opacity-50"
            >
              下一步：总纲
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function splitMultiline(value: string): string[] {
  return value
    .split(/\n|，|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function TextAreaField({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-28 w-full rounded-md border bg-background px-3 py-2 text-sm"
        placeholder={placeholder}
      />
    </div>
  );
}
