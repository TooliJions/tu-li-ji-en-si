import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Save } from 'lucide-react';
import {
  createStoryOutline,
  fetchBook,
  fetchPlanningBrief,
  fetchStoryOutline,
  updateStoryOutline,
} from '../lib/api';

interface Book {
  id: string;
  title: string;
}

interface OutlineFormState {
  premise: string;
  worldRules: string;
  protagonistName: string;
  protagonistStartState: string;
  protagonistGrowthPath: string;
  protagonistEndState: string;
  majorConflicts: string;
  phaseMilestoneLabel: string;
  phaseMilestoneSummary: string;
  endingDirection: string;
}

const emptyForm: OutlineFormState = {
  premise: '',
  worldRules: '',
  protagonistName: '',
  protagonistStartState: '',
  protagonistGrowthPath: '',
  protagonistEndState: '',
  majorConflicts: '',
  phaseMilestoneLabel: '',
  phaseMilestoneSummary: '',
  endingDirection: '',
};

export default function StoryOutlinePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const bookId = searchParams.get('bookId') ?? '';
  const [book, setBook] = useState<Book | null>(null);
  const [form, setForm] = useState<OutlineFormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [hasDocument, setHasDocument] = useState(false);
  const [hasPlanningBrief, setHasPlanningBrief] = useState(false);

  useEffect(() => {
    if (!bookId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    Promise.all([fetchBook(bookId), fetchPlanningBrief(bookId), fetchStoryOutline(bookId)])
      .then(([bookData, brief, outline]) => {
        setBook(bookData);
        setHasPlanningBrief(Boolean(brief));
        if (outline) {
          setForm({
            premise: outline.premise,
            worldRules: outline.worldRules.join('\n'),
            protagonistName: outline.protagonistArc.characterName,
            protagonistStartState: outline.protagonistArc.startState,
            protagonistGrowthPath: outline.protagonistArc.growthPath,
            protagonistEndState: outline.protagonistArc.endState,
            majorConflicts: outline.majorConflicts.join('\n'),
            phaseMilestoneLabel: outline.phaseMilestones[0]?.label ?? '',
            phaseMilestoneSummary: outline.phaseMilestones[0]?.summary ?? '',
            endingDirection: outline.endingDirection,
          });
          setHasDocument(true);
        }
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : '加载故事总纲失败');
      })
      .finally(() => setLoading(false));
  }, [bookId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!bookId || !hasPlanningBrief) return;

    setSaving(true);
    setError(null);
    setNotice(null);

    const payload = {
      premise: form.premise,
      worldRules: splitMultiline(form.worldRules),
      protagonistArc: {
        characterName: form.protagonistName,
        startState: form.protagonistStartState,
        growthPath: form.protagonistGrowthPath,
        endState: form.protagonistEndState,
      },
      supportingArcs: [],
      majorConflicts: splitMultiline(form.majorConflicts),
      phaseMilestones:
        form.phaseMilestoneLabel.trim() && form.phaseMilestoneSummary.trim()
          ? [
              {
                label: form.phaseMilestoneLabel,
                summary: form.phaseMilestoneSummary,
                targetChapters: [],
              },
            ]
          : [],
      endingDirection: form.endingDirection,
    };

    try {
      if (hasDocument) {
        await updateStoryOutline(bookId, payload);
        setNotice('故事总纲已更新');
      } else {
        await createStoryOutline(bookId, payload);
        setHasDocument(true);
        setNotice('故事总纲已保存');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '保存故事总纲失败');
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
        请先选择一本书，再进入故事总纲阶段。
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">故事总纲</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            把规划简报收敛成 Story Blueprint。{book ? `当前书籍：${book.title}` : ''}
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            to={bookId ? `/planning-brief?bookId=${bookId}` : '#'}
            className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm hover:bg-accent"
          >
            返回规划页
          </Link>
          <Link
            to={bookId ? `/chapter-plans?bookId=${bookId}` : '#'}
            className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm hover:bg-accent"
          >
            进入细纲
          </Link>
        </div>
      </div>

      {!hasPlanningBrief && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          请先完成规划简报，再进入总纲页。
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
          <label htmlFor="premise" className="mb-1 block text-sm font-medium">
            故事前提
          </label>
          <textarea
            id="premise"
            value={form.premise}
            onChange={(e) => setForm((prev) => ({ ...prev, premise: e.target.value }))}
            className="min-h-28 w-full rounded-md border bg-background px-3 py-2 text-sm"
            placeholder="整本书最核心的故事前提。"
            required
          />
        </div>
        <div>
          <label htmlFor="world-rules" className="mb-1 block text-sm font-medium">
            世界规则
          </label>
          <textarea
            id="world-rules"
            value={form.worldRules}
            onChange={(e) => setForm((prev) => ({ ...prev, worldRules: e.target.value }))}
            className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm"
            placeholder="每行一条世界规则。"
          />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="protagonist-name" className="mb-1 block text-sm font-medium">
              主角名
            </label>
            <input
              id="protagonist-name"
              value={form.protagonistName}
              onChange={(e) => setForm((prev) => ({ ...prev, protagonistName: e.target.value }))}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <label htmlFor="ending-direction" className="mb-1 block text-sm font-medium">
              结局方向
            </label>
            <input
              id="ending-direction"
              value={form.endingDirection}
              onChange={(e) => setForm((prev) => ({ ...prev, endingDirection: e.target.value }))}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <label htmlFor="protagonist-start" className="mb-1 block text-sm font-medium">
              起点状态
            </label>
            <input
              id="protagonist-start"
              value={form.protagonistStartState}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, protagonistStartState: e.target.value }))
              }
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <label htmlFor="protagonist-growth" className="mb-1 block text-sm font-medium">
              成长路径
            </label>
            <input
              id="protagonist-growth"
              value={form.protagonistGrowthPath}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, protagonistGrowthPath: e.target.value }))
              }
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              required
            />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="protagonist-end" className="mb-1 block text-sm font-medium">
              终点状态
            </label>
            <input
              id="protagonist-end"
              value={form.protagonistEndState}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, protagonistEndState: e.target.value }))
              }
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              required
            />
          </div>
        </div>
        <div>
          <label htmlFor="major-conflicts" className="mb-1 block text-sm font-medium">
            主冲突
          </label>
          <textarea
            id="major-conflicts"
            value={form.majorConflicts}
            onChange={(e) => setForm((prev) => ({ ...prev, majorConflicts: e.target.value }))}
            className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm"
            placeholder="每行一条主冲突。"
          />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="milestone-label" className="mb-1 block text-sm font-medium">
              阶段节点标题
            </label>
            <input
              id="milestone-label"
              value={form.phaseMilestoneLabel}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, phaseMilestoneLabel: e.target.value }))
              }
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="例如：外门突围"
            />
          </div>
          <div>
            <label htmlFor="milestone-summary" className="mb-1 block text-sm font-medium">
              阶段节点摘要
            </label>
            <input
              id="milestone-summary"
              value={form.phaseMilestoneSummary}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, phaseMilestoneSummary: e.target.value }))
              }
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="例如：完成考核并进入核心竞争视野"
            />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 border-t pt-4">
          <span className="text-xs text-muted-foreground">完成总纲后，再进入细纲阶段。</span>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={
                saving ||
                !hasPlanningBrief ||
                !form.premise.trim() ||
                !form.protagonistName.trim() ||
                !form.protagonistStartState.trim() ||
                !form.protagonistGrowthPath.trim() ||
                !form.protagonistEndState.trim() ||
                !form.endingDirection.trim()
              }
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <Save size={16} />
              {saving ? '保存中…' : hasDocument ? '更新故事总纲' : '保存故事总纲'}
            </button>
            <button
              type="button"
              disabled={!hasDocument}
              onClick={() => navigate(`/chapter-plans?bookId=${bookId}`)}
              className="rounded-md border px-4 py-2 text-sm hover:bg-accent disabled:opacity-50"
            >
              下一步：细纲
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
