import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import {
  fetchBook,
  fetchPlanningBrief,
  fetchStoryOutline,
  generateStoryOutline,
  type StoryBlueprintDocument,
  type OutlineValidationIssue,
} from '../lib/api';

interface Book {
  id: string;
  title: string;
}

export default function StoryOutlinePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const bookId = searchParams.get('bookId') ?? '';
  const [book, setBook] = useState<Book | null>(null);
  const [outline, setOutline] = useState<StoryBlueprintDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [issues, setIssues] = useState<OutlineValidationIssue[]>([]);
  const [hasPlanningBrief, setHasPlanningBrief] = useState(false);

  useEffect(() => {
    if (!bookId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    Promise.all([fetchBook(bookId), fetchPlanningBrief(bookId), fetchStoryOutline(bookId)])
      .then(([bookData, brief, blueprint]) => {
        setBook(bookData);
        setHasPlanningBrief(Boolean(brief));
        if (blueprint) {
          setOutline(blueprint);
        }
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : '加载故事总纲失败');
      })
      .finally(() => setLoading(false));
  }, [bookId]);

  async function handleGenerate() {
    if (!bookId || !hasPlanningBrief || outline) return;

    setGenerating(true);
    setError(null);
    setNotice(null);
    setIssues([]);

    try {
      const result = await generateStoryOutline(bookId);
      setOutline(result);
      setNotice('AI 已生成故事总纲');
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'issues' in err) {
        const validationErr = err as { message: string; issues: OutlineValidationIssue[] };
        setIssues(validationErr.issues);
        setError(validationErr.message);
      } else {
        setError(err instanceof Error ? err.message : '生成故事总纲失败');
      }
    } finally {
      setGenerating(false);
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
        请先选择一本书,再进入故事总纲阶段。
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">故事总纲</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            把灵感与规划简报收敛成三层 StoryBlueprint(meta + base + typeSpecific)。
            {book ? `当前书籍:${book.title}` : ''}
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
          请先完成规划简报,再进入总纲页。
        </div>
      )}
      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {issues.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <div className="mb-2 font-medium">校验问题:</div>
          <ul className="list-disc space-y-1 pl-5">
            {issues.map((issue, idx) => (
              <li key={idx}>
                <span className="font-mono text-xs">[{issue.rule}]</span> ({issue.severity}){' '}
                {issue.description}
              </li>
            ))}
          </ul>
        </div>
      )}
      {notice && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {notice}
        </div>
      )}

      {!outline && (
        <div className="rounded-xl border bg-card p-8 text-center shadow-sm">
          <Sparkles className="mx-auto h-12 w-12 text-amber-500" />
          <h2 className="mt-4 text-lg font-semibold">尚未生成故事总纲</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            从灵感与规划简报一键生成三层结构(meta / base /
            typeSpecific),含卖点、角色、伏笔种子等完整字段。
          </p>
          <button
            type="button"
            disabled={!hasPlanningBrief || generating}
            onClick={handleGenerate}
            className="mt-6 inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Sparkles size={16} />
            {generating ? 'AI 生成中…' : 'AI 自动生成'}
          </button>
        </div>
      )}

      {outline && (
        <BlueprintViewer
          blueprint={outline}
          onNext={() => navigate(`/chapter-plans?bookId=${bookId}`)}
        />
      )}
    </div>
  );
}

function BlueprintViewer({
  blueprint,
  onNext,
}: {
  blueprint: StoryBlueprintDocument;
  onNext: () => void;
}) {
  return (
    <div className="space-y-4">
      <Section title="meta(类型 / 架构 / 标题 / 字数 / 结局)">
        <KV label="小说类型" value={blueprint.meta.novelType} />
        <KV label="子类型" value={blueprint.meta.novelSubgenre || '—'} />
        <KV label="性别向" value={blueprint.meta.genderTarget} />
        <KV label="架构模式" value={blueprint.meta.architectureMode} />
        <KV label="结局类型" value={blueprint.meta.endingType} />
        <KV label="预计字数" value={blueprint.meta.estimatedWordCount} />
        <KV label="一句话简介" value={blueprint.meta.oneLineSynopsis} multiline />
        <KV label="书名建议" value={blueprint.meta.titleSuggestions.join(' / ')} />
      </Section>

      <Section title="base.sellingPoints(卖点)">
        <KV label="核心卖点" value={blueprint.base.sellingPoints.coreSellingPoint} />
        <KV label="钩子句" value={blueprint.base.sellingPoints.hookSentence} multiline />
        <KV
          label="辅助卖点"
          value={blueprint.base.sellingPoints.auxiliarySellingPoints
            .map((p) => `${p.point}(${p.category})`)
            .join('; ')}
        />
      </Section>

      <Section title="base.theme(主题与基调)">
        <KV label="核心主题" value={blueprint.base.theme.coreTheme} />
        <KV
          label="情感弧线"
          value={`${blueprint.base.theme.narrativeArc.opening} → ${blueprint.base.theme.narrativeArc.development} → ${blueprint.base.theme.narrativeArc.climax} → ${blueprint.base.theme.narrativeArc.resolution}`}
          multiline
        />
        <KV label="基调关键词" value={blueprint.base.theme.toneKeywords.join('、')} />
      </Section>

      <Section title="base.goldenOpening(黄金三章)">
        <KV label="开场钩子类型" value={blueprint.base.goldenOpening.openingHookType} />
        <KV label="第 1 章" value={blueprint.base.goldenOpening.chapter1.summary} multiline />
        <KV label="第 2 章" value={blueprint.base.goldenOpening.chapter2.summary} multiline />
        <KV label="第 3 章" value={blueprint.base.goldenOpening.chapter3.summary} multiline />
      </Section>

      <Section title={`base.characters(${blueprint.base.characters.length} 个角色)`}>
        <ul className="space-y-2 text-sm">
          {blueprint.base.characters.map((c) => (
            <li key={c.id}>
              <span className="font-medium">{c.name}</span>
              <span className="ml-2 text-xs text-muted-foreground">[{c.role}]</span>
              {c.motivation && <span className="ml-2 text-muted-foreground">— {c.motivation}</span>}
            </li>
          ))}
        </ul>
      </Section>

      <Section title={`base.outlineArchitecture(${blueprint.base.outlineArchitecture.mode})`}>
        <KV label="模式理由" value={blueprint.base.outlineArchitecture.modeReason} multiline />
        <KV
          label="爽点节奏"
          value={`早期:${blueprint.base.outlineArchitecture.satisfactionPacing.earlyGame.join('、')} | 中期:${blueprint.base.outlineArchitecture.satisfactionPacing.midGame.join('、')} | 后期:${blueprint.base.outlineArchitecture.satisfactionPacing.lateGame.join('、')} | 高潮:${blueprint.base.outlineArchitecture.satisfactionPacing.climax.join('、')}`}
          multiline
        />
      </Section>

      <Section
        title={`base.foreshadowingSeed(${blueprint.base.foreshadowingSeed.entries.length} 条伏笔种子)`}
      >
        <ul className="space-y-1 text-sm">
          {blueprint.base.foreshadowingSeed.entries.map((entry) => (
            <li key={entry.id}>
              <span className="font-mono text-xs">{entry.id}</span>
              <span className="ml-2 text-xs text-muted-foreground">[{entry.importance}]</span>
              <span className="ml-2">{entry.content}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="base.completionDesign(完本设计)">
        <KV label="结局类型" value={blueprint.base.completionDesign.endingType} />
        <KV label="终极对手" value={blueprint.base.completionDesign.finalBoss} />
        <KV label="终极冲突" value={blueprint.base.completionDesign.finalConflict} multiline />
      </Section>

      <Section title={`typeSpecific(${blueprint.typeSpecific.kind})`}>
        <pre className="overflow-auto rounded-md bg-muted p-3 text-xs">
          {JSON.stringify(blueprint.typeSpecific, null, 2)}
        </pre>
      </Section>

      <div className="flex items-center justify-end gap-3 border-t pt-4">
        <button
          type="button"
          onClick={onNext}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          下一步:细纲
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="rounded-xl border bg-card p-4 shadow-sm [&[open]]:bg-card" open>
      <summary className="cursor-pointer text-sm font-semibold">{title}</summary>
      <div className="mt-3 space-y-2">{children}</div>
    </details>
  );
}

function KV({
  label,
  value,
  multiline = false,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <div className={multiline ? '' : 'flex gap-2 text-sm'}>
      <span
        className={multiline ? 'text-xs text-muted-foreground' : 'min-w-32 text-muted-foreground'}
      >
        {label}
      </span>
      <span className={multiline ? 'mt-1 block text-sm' : ''}>{value || '—'}</span>
    </div>
  );
}
