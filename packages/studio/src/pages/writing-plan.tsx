import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  Check,
  ChevronRight,
  Lightbulb,
  ListOrdered,
  PenTool,
  Save,
  Server,
  Sparkles,
  Users,
  Wand2,
} from 'lucide-react';
import { bootstrapStory, fetchBook, fetchChapters, fetchTruthFile, planChapter } from '../lib/api';

interface Book {
  id: string;
  title: string;
  genre: string;
  chapterCount: number;
  targetChapterCount: number;
  brief?: string;
}

interface Chapter {
  number: number;
  title: string | null;
  status: 'draft' | 'published';
  wordCount: number;
}

interface ChapterPlan {
  chapterNumber: number;
  title: string;
  goal: string;
  characters: string;
  keyEvents: string;
  hooks: string;
}

interface PlanChapterResponse {
  chapterNumber: number;
  title?: string;
  summary?: string;
  keyEvents?: string[];
  hooks?: string[];
  characters?: string[];
}

interface BootstrapStoryResponse {
  success: boolean;
  currentFocus: string;
  centralConflict: string;
  growthArc: string;
  worldRules: string[];
  characters: Array<{ name: string; role: string; arc?: string }>;
  hooks: string[];
  chapterPlan: PlanChapterResponse;
}

interface PlanningManifest {
  currentFocus?: string;
  worldRules?: Array<{ rule?: string }>;
  characters?: Array<{ name?: string }>;
  hooks?: Array<{ description?: string; status?: string }>;
}

interface PlanningSources {
  brief: string;
  currentFocus: string;
  worldRules: string[];
  characters: string[];
  hooks: string[];
}

const STEPS = [
  { index: 1, label: '灵感与设定', icon: Lightbulb },
  { index: 2, label: '世界观构建', icon: Wand2 },
  { index: 3, label: '角色设计', icon: Users },
  { index: 4, label: '分章规划', icon: ListOrdered },
  { index: 5, label: '正文创作', icon: PenTool },
  { index: 6, label: '守护进程', icon: Server },
] as const;

const VOLUME_TITLES = ['启程立势', '锋芒初露', '大学风云', '局势升级', '终局回收'];

function stepLinkFor(index: number, bookId: string): string {
  if (index === 1) return `/book/${bookId}`;
  if (index === 2) return `/truth-files?bookId=${bookId}&tab=overview`;
  if (index === 3) return `/truth-files?bookId=${bookId}&tab=characters`;
  if (index === 4) return `/writing-plan?bookId=${bookId}`;
  if (index === 5) return `/writing?bookId=${bookId}`;
  return `/daemon?bookId=${bookId}`;
}

function emptyPlan(chapterNumber: number): ChapterPlan {
  return { chapterNumber, title: '', goal: '', characters: '', keyEvents: '', hooks: '' };
}

function isPlanEmpty(plan: ChapterPlan): boolean {
  return (
    !plan.title.trim() &&
    !plan.goal.trim() &&
    !plan.characters.trim() &&
    !plan.keyEvents.trim() &&
    !plan.hooks.trim()
  );
}

function getPlanStorageKey(bookId: string): string {
  return `writing_plan_${bookId}`;
}

function loadStoredPlans(bookId: string): Record<number, ChapterPlan> {
  if (typeof window === 'undefined' || !bookId) {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(getPlanStorageKey(bookId));
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as Record<string, ChapterPlan>;
    return Object.fromEntries(
      Object.entries(parsed)
        .map(([chapterNumber, plan]) => [Number(chapterNumber), plan])
        .filter(([chapterNumber, plan]) => Number.isFinite(chapterNumber) && plan),
    );
  } catch {
    return {};
  }
}

function persistPlans(bookId: string, plans: Record<number, ChapterPlan>): void {
  if (typeof window === 'undefined' || !bookId) {
    return;
  }

  window.localStorage.setItem(getPlanStorageKey(bookId), JSON.stringify(plans));
}

function buildChapterWindow(selectedChapter: number, totalSlots: number): number[] {
  let start = Math.max(1, selectedChapter - 2);
  const end = Math.min(totalSlots, start + 4);
  start = Math.max(1, end - 4);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function getVolumeMeta(chapterNumber: number): { number: number; title: string } {
  const volumeNumber = Math.max(1, Math.ceil(chapterNumber / 20));
  return {
    number: volumeNumber,
    title: VOLUME_TITLES[volumeNumber - 1] ?? '主线推进',
  };
}

function stripLeadingLabel(value: string, label: string): string {
  return value.replace(new RegExp(`^${label}[：:]?\\s*`), '').trim();
}

function truncateSummary(value: string, maxLength = 32): string {
  if (!value) {
    return '';
  }

  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
}

function normalizePlanningSources(
  book: Book | null,
  manifest: PlanningManifest | null,
): PlanningSources {
  return {
    brief: (book?.brief ?? '').trim(),
    currentFocus: stripLeadingLabel((manifest?.currentFocus ?? '').trim(), '当前重点'),
    worldRules: (manifest?.worldRules ?? [])
      .map((rule) => (rule?.rule ?? '').trim())
      .filter(Boolean),
    characters: (manifest?.characters ?? [])
      .map((character) => (character?.name ?? '').trim())
      .filter(Boolean),
    hooks: (manifest?.hooks ?? [])
      .filter(
        (hook) =>
          !hook?.status || ['open', 'progressing', 'deferred', 'dormant'].includes(hook.status),
      )
      .map((hook) => (hook?.description ?? '').trim())
      .filter(Boolean),
  };
}

function buildPlanContext(plan: ChapterPlan, sources: PlanningSources): string {
  return [
    sources.brief ? `创作简报: ${sources.brief}` : '',
    sources.currentFocus ? `当前重点: ${sources.currentFocus}` : '',
    sources.worldRules.length > 0 ? `世界设定: ${sources.worldRules.join('；')}` : '',
    sources.characters.length > 0 ? `角色设定: ${sources.characters.join('、')}` : '',
    sources.hooks.length > 0 ? `现有伏笔: ${sources.hooks.join('；')}` : '',
    plan.title.trim() ? `章节标题: ${plan.title.trim()}` : '',
    plan.goal.trim() ? `章节目标: ${plan.goal.trim()}` : '',
    plan.characters.trim() ? `出场人物: ${plan.characters.trim()}` : '',
    plan.keyEvents.trim() ? `关键事件: ${plan.keyEvents.trim()}` : '',
    plan.hooks.trim() ? `本章伏笔: ${plan.hooks.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildWritingParams(bookId: string, plan: ChapterPlan): URLSearchParams {
  const intent = [
    plan.title.trim() ? `章节标题: ${plan.title.trim()}` : '',
    plan.goal.trim() ? `章节目标: ${plan.goal.trim()}` : '',
    plan.characters.trim() ? `出场人物: ${plan.characters.trim()}` : '',
    plan.keyEvents.trim() ? `关键事件: ${plan.keyEvents.trim()}` : '',
    plan.hooks.trim() ? `伏笔埋设: ${plan.hooks.trim()}` : '',
  ]
    .filter(Boolean)
    .join('；');

  const nextParams = new URLSearchParams({
    bookId,
    chapter: String(plan.chapterNumber),
  });

  if (intent) {
    nextParams.set('intent', intent);
  }
  if (plan.title.trim()) {
    nextParams.set('title', plan.title.trim());
  }
  if (plan.characters.trim()) {
    nextParams.set('characters', plan.characters.trim());
  }
  if (plan.hooks.trim()) {
    nextParams.set('hooks', plan.hooks.trim());
  }

  return nextParams;
}

export default function WritingPlan() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const bookId = searchParams.get('bookId') ?? '';
  const autoBootstrapRaw = searchParams.get('autoBootstrap') === '1';
  const autoWrite = searchParams.get('autoWrite') === '1';
  // 用 sessionStorage 记住本 session 已经自动触发过 bootstrap 的书，避免刷新反复 400
  const autoBootstrapKey = `autoBootstrap:${bookId}`;
  const autoBootstrap = autoBootstrapRaw && !sessionStorage.getItem(autoBootstrapKey);

  const [book, setBook] = useState<Book | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [plans, setPlans] = useState<Record<number, ChapterPlan>>({});
  const [planningSources, setPlanningSources] = useState<PlanningSources>({
    brief: '',
    currentFocus: '',
    worldRules: [],
    characters: [],
    hooks: [],
  });
  const [selectedChapter, setSelectedChapter] = useState<number>(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const goalRef = useRef<HTMLTextAreaElement | null>(null);
  const autoBootstrapTriggeredRef = useRef(false);

  useEffect(() => {
    if (!bookId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(null);

    Promise.all([
      fetchBook(bookId),
      fetchChapters(bookId),
      fetchTruthFile(bookId, 'manifest').catch(() => null),
    ])
      .then(([bookData, chaptersData, manifestData]) => {
        const lastPublishedChapter = [...chaptersData]
          .filter((chapter: Chapter) => chapter.status === 'published')
          .sort((left: Chapter, right: Chapter) => right.number - left.number)[0];

        setBook(bookData);
        setChapters(chaptersData);
        setPlans(loadStoredPlans(bookId));
        setPlanningSources(
          normalizePlanningSources(
            bookData,
            (manifestData as { content?: PlanningManifest } | null)?.content ?? null,
          ),
        );
        setSelectedChapter(lastPublishedChapter ? lastPublishedChapter.number + 1 : 1);
      })
      .catch((error: unknown) => {
        setLoadError(error instanceof Error ? error.message : '加载规划页面失败');
      })
      .finally(() => setLoading(false));
  }, [bookId]);

  const currentPlan = { ...emptyPlan(selectedChapter), ...(plans[selectedChapter] ?? {}) };
  const completedChapters = chapters.filter((chapter) => chapter.status === 'published').length;
  const plannedCount = Object.values(plans).filter((plan) => !isPlanEmpty(plan)).length;
  const totalSlots = Math.max(
    book?.targetChapterCount ?? 0,
    selectedChapter + 2,
    chapters.length + 3,
  );
  const chapterWindow = useMemo(
    () => buildChapterWindow(selectedChapter, totalSlots),
    [selectedChapter, totalSlots],
  );
  const chapterMap = useMemo(
    () => new Map(chapters.map((chapter) => [chapter.number, chapter])),
    [chapters],
  );
  const volumeMeta = getVolumeMeta(selectedChapter);
  const stepSummaries = useMemo(
    () => ({
      1: planningSources.brief ? truncateSummary(planningSources.brief) : '未填写创作简报',
      2: planningSources.currentFocus
        ? truncateSummary(planningSources.currentFocus)
        : planningSources.worldRules[0]
          ? truncateSummary(planningSources.worldRules[0])
          : '未补充世界设定',
      3:
        planningSources.characters.length > 0
          ? truncateSummary(planningSources.characters.join('、'))
          : '未录入关键角色',
      4:
        currentPlan.goal.trim() || currentPlan.title.trim()
          ? truncateSummary(currentPlan.goal.trim() || currentPlan.title.trim())
          : '待完善本章规划',
      5: '基于以上设定进入正文创作',
      6: '规划完成后可交给守护进程续写',
    }),
    [currentPlan.goal, currentPlan.title, planningSources],
  );
  const completedSteps = useMemo(
    () => ({
      1: Boolean(planningSources.brief),
      2: Boolean(planningSources.currentFocus || planningSources.worldRules.length > 0),
      3: planningSources.characters.length > 0,
      4: !isPlanEmpty(currentPlan),
    }),
    [currentPlan, planningSources],
  );

  useEffect(() => {
    if (
      !autoBootstrap ||
      autoBootstrapTriggeredRef.current ||
      loading ||
      !bookId ||
      !book?.brief?.trim()
    ) {
      return;
    }

    autoBootstrapTriggeredRef.current = true;
    sessionStorage.setItem(autoBootstrapKey, '1');
    setAiLoading(true);
    setAiError(null);

    void bootstrapStory(bookId, selectedChapter)
      .then((result) => {
        const bootstrap = result as BootstrapStoryResponse & { _fallback?: boolean };
        const plannedChapter = bootstrap.chapterPlan.chapterNumber || selectedChapter;
        const nextPlan: ChapterPlan = {
          chapterNumber: plannedChapter,
          title: bootstrap.chapterPlan.title ?? '',
          goal: bootstrap.chapterPlan.summary ?? '',
          characters: Array.isArray(bootstrap.chapterPlan.characters)
            ? bootstrap.chapterPlan.characters.join(' ')
            : '',
          keyEvents: Array.isArray(bootstrap.chapterPlan.keyEvents)
            ? bootstrap.chapterPlan.keyEvents.join('\n')
            : '',
          hooks: Array.isArray(bootstrap.chapterPlan.hooks)
            ? bootstrap.chapterPlan.hooks.join('、')
            : '',
        };

        setPlanningSources({
          brief: book.brief?.trim() ?? '',
          currentFocus: bootstrap.currentFocus,
          worldRules: bootstrap.worldRules ?? [],
          characters: bootstrap.characters.map((character) => character.name).filter(Boolean),
          hooks: bootstrap.hooks ?? [],
        });
        setSelectedChapter(plannedChapter);
        setPlans((previous) => {
          const nextPlans = {
            ...previous,
            [plannedChapter]: nextPlan,
          };
          persistPlans(bookId, nextPlans);
          return nextPlans;
        });

        if (bootstrap._fallback) {
          setSaveNotice(
            '⚠ 当前使用演示模式生成规划（LLM 未配置或配置有误）。如需真实创作，请先前往「设置」配置 API Key。',
          );
        }

        if (autoWrite) {
          const nextParams = buildWritingParams(bookId, nextPlan);
          nextParams.set('autoStart', '1');
          navigate(`/writing?${nextParams.toString()}`);
        }
      })
      .catch((error: unknown) => {
        setAiError(error instanceof Error ? error.message : '自动规划链启动失败');
        // 失败时把 autoBootstrap 从 URL 移除，避免刷新再次触发
        const nextSearch = new URLSearchParams(searchParams);
        nextSearch.delete('autoBootstrap');
        navigate({ search: nextSearch.toString() }, { replace: true });
      })
      .finally(() => {
        setAiLoading(false);
      });
  }, [autoBootstrap, autoWrite, book, bookId, loading, navigate, selectedChapter]);

  function updatePlan(field: keyof Omit<ChapterPlan, 'chapterNumber'>, value: string): void {
    setSaveNotice(null);
    setPlans((previous) => ({
      ...previous,
      [selectedChapter]: {
        ...currentPlan,
        [field]: value,
      },
    }));
  }

  function handleSavePlan(): void {
    if (!bookId) {
      return;
    }

    const nextPlans = { ...plans };
    if (isPlanEmpty(currentPlan)) {
      delete nextPlans[selectedChapter];
    } else {
      nextPlans[selectedChapter] = currentPlan;
    }

    persistPlans(bookId, nextPlans);
    setPlans(nextPlans);
    setSaveNotice('规划已保存');
  }

  async function handleAiPlan(): Promise<void> {
    if (!bookId) {
      return;
    }

    setAiLoading(true);
    setAiError(null);

    const outlineContext = buildPlanContext(currentPlan, planningSources);

    try {
      const result = (await planChapter(
        bookId,
        selectedChapter,
        outlineContext,
      )) as PlanChapterResponse;
      setPlans((previous) => ({
        ...previous,
        [selectedChapter]: {
          chapterNumber: selectedChapter,
          title: result.title ?? currentPlan.title,
          goal: result.summary ?? currentPlan.goal,
          characters:
            Array.isArray(result.characters) && result.characters.length > 0
              ? result.characters.join(' ')
              : currentPlan.characters,
          keyEvents:
            Array.isArray(result.keyEvents) && result.keyEvents.length > 0
              ? result.keyEvents.join('\n')
              : currentPlan.keyEvents,
          hooks:
            Array.isArray(result.hooks) && result.hooks.length > 0
              ? result.hooks.join('、')
              : currentPlan.hooks,
        },
      }));
    } catch (error: unknown) {
      setAiError(error instanceof Error ? error.message : 'AI 规划失败');
    } finally {
      setAiLoading(false);
    }
  }

  function handleStartWriting(): void {
    if (!bookId) {
      return;
    }

    handleSavePlan();
    const nextParams = buildWritingParams(bookId, currentPlan);
    navigate(`/writing?${nextParams.toString()}`);
  }

  if (!bookId) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        <ListOrdered size={32} className="opacity-40" />
        <p>请先选择一本书籍，再进入创作规划。</p>
        <Link to="/" className="text-primary underline underline-offset-4">
          返回仪表盘
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        加载中…
      </div>
    );
  }

  if (loadError) {
    return (
      <div
        role="alert"
        className="flex h-64 flex-col items-center justify-center gap-2 text-sm text-rose-500"
      >
        <AlertCircle size={20} />
        <span>{loadError}</span>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 bg-background">
      <aside className="w-60 shrink-0 border-r bg-muted/20 px-5 py-6">
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            步骤导航
          </p>
        </div>

        <div className="space-y-2">
          {STEPS.map(({ index, label, icon: Icon }) => {
            const isDone = Boolean(completedSteps[index as keyof typeof completedSteps]);
            const isActive = index === 4;
            const canNavigate = index !== 4;
            const canAutoPlanFromSummary = index < 4;
            const stepSummary = stepSummaries[index as keyof typeof stepSummaries];

            return (
              <div
                key={label}
                className={`flex items-start gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : isDone
                      ? 'text-emerald-600 hover:bg-emerald-50'
                      : 'text-muted-foreground hover:bg-accent'
                }`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold ${
                    isActive
                      ? 'border-primary bg-primary text-primary-foreground'
                      : isDone
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-600'
                        : 'border-border text-muted-foreground'
                  }`}
                >
                  {isDone ? <Check size={12} /> : index}
                </span>
                <span className="min-w-0 flex-1">
                  {canNavigate ? (
                    <Link to={stepLinkFor(index, bookId)} className="flex items-center gap-2">
                      <Icon size={14} />
                      {label}
                    </Link>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Icon size={14} />
                      {label}
                    </span>
                  )}
                  {canAutoPlanFromSummary ? (
                    <button
                      type="button"
                      onClick={() => {
                        void handleAiPlan();
                      }}
                      className={`mt-1 block text-left text-xs leading-5 hover:underline underline-offset-2 ${
                        isActive
                          ? 'text-primary/80'
                          : isDone
                            ? 'text-emerald-700/80'
                            : 'text-muted-foreground'
                      }`}
                      title="基于当前上游设定自动生成本章规划"
                    >
                      {stepSummary}
                    </button>
                  ) : (
                    <span
                      className={`mt-1 block text-xs leading-5 ${
                        isActive
                          ? 'text-primary/80'
                          : isDone
                            ? 'text-emerald-700/80'
                            : 'text-muted-foreground'
                      }`}
                    >
                      {stepSummary}
                    </span>
                  )}
                </span>
                {isActive ? <ChevronRight size={14} className="ml-auto" /> : null}
              </div>
            );
          })}
        </div>

        <div className="mt-8 border-t pt-4 text-sm text-muted-foreground">
          <p className="mb-1">已规划: {book?.targetChapterCount ?? 0} 章</p>
          <p className="mb-1">已完成: {completedChapters} 章</p>
          <p className="mb-1">本地规划: {plannedCount} 章</p>
          <p>当前题材: {book?.genre ?? '未设置'}</p>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto px-6 py-6 lg:px-8">
        <div className="mb-6 flex items-start justify-between gap-4 border-b pb-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">
              创作规划
              <span className="ml-3 text-base font-normal text-muted-foreground">
                {book?.title}
              </span>
            </h1>
          </div>
          <div className="rounded-full border bg-background px-4 py-1.5 text-sm text-muted-foreground">
            当前：第 {selectedChapter} 章规划
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
          <section className="rounded-xl border bg-card p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">大纲规划</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  当前卷: 第{volumeMeta.number}卷 · {volumeMeta.title}
                </p>
              </div>
              <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                {chapterWindow[0]} - {chapterWindow[chapterWindow.length - 1]}
              </span>
            </div>

            <div className="rounded-xl border bg-muted/20 p-2">
              {chapterWindow.map((chapterNumber) => {
                const chapter = chapterMap.get(chapterNumber);
                const isCurrent = chapterNumber === selectedChapter;
                const isPublished = chapter?.status === 'published';
                const isDraft = chapter?.status === 'draft';
                const localPlan = plans[chapterNumber];
                const title =
                  chapter?.title ??
                  (localPlan?.title
                    ? localPlan.title
                    : chapterNumber === selectedChapter
                      ? '编辑中'
                      : localPlan?.goal
                        ? localPlan.goal.slice(0, 14)
                        : '待规划');
                const statusText = isPublished ? '✓' : isDraft ? '草稿' : isCurrent ? '◀' : '';

                return (
                  <button
                    key={chapterNumber}
                    type="button"
                    onClick={() => {
                      setSelectedChapter(chapterNumber);
                      setSaveNotice(null);
                      setAiError(null);
                    }}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                      isCurrent ? 'bg-primary/10 text-primary' : 'hover:bg-background'
                    }`}
                  >
                    <span className="w-12 shrink-0 text-muted-foreground">第{chapterNumber}章</span>
                    <span className="min-w-0 flex-1 truncate">{title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{statusText}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-xl border bg-card p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">第{selectedChapter}章 详细规划</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  先锁定章目标、关键事件和伏笔，再进入正文创作。
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleAiPlan}
                  disabled={aiLoading}
                  className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
                >
                  <Sparkles size={14} className={aiLoading ? 'animate-spin' : ''} />
                  {aiLoading ? 'AI 规划中…' : 'AI 辅助生成规划'}
                </button>
                <button
                  type="button"
                  onClick={() => goalRef.current?.focus()}
                  className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent"
                >
                  <PenTool size={14} />
                  手动编辑
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label htmlFor="chapter-title" className="mb-2 block text-sm font-medium">
                  章节标题
                </label>
                <input
                  id="chapter-title"
                  value={currentPlan.title}
                  onChange={(event) => updatePlan('title', event.target.value)}
                  placeholder="例如：竞赛邀约"
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary"
                  aria-label="章节标题"
                />
              </div>

              <div>
                <label htmlFor="chapter-goal" className="mb-2 block text-sm font-medium">
                  章目标
                </label>
                <div className="rounded-xl border bg-muted/20 p-3">
                  <textarea
                    id="chapter-goal"
                    ref={goalRef}
                    rows={4}
                    value={currentPlan.goal}
                    onChange={(event) => updatePlan('goal', event.target.value)}
                    placeholder="展示主角在首次测验中的惊艳表现，引出竞赛老师的注意，埋下后续竞赛伏笔。"
                    className="w-full resize-none bg-transparent text-sm leading-6 outline-none"
                    aria-label="章目标"
                  />
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <label htmlFor="chapter-characters" className="mb-2 block text-sm font-medium">
                    出场人物
                  </label>
                  <input
                    id="chapter-characters"
                    value={currentPlan.characters}
                    onChange={(event) => updatePlan('characters', event.target.value)}
                    placeholder="林晨(主) 王老师 苏小雨"
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary"
                    aria-label="出场人物"
                  />
                </div>

                <div>
                  <label htmlFor="chapter-hooks" className="mb-2 block text-sm font-medium">
                    伏笔埋设
                  </label>
                  <input
                    id="chapter-hooks"
                    value={currentPlan.hooks}
                    onChange={(event) => updatePlan('hooks', event.target.value)}
                    placeholder="全国竞赛通知"
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary"
                    aria-label="伏笔埋设"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="chapter-key-events" className="mb-2 block text-sm font-medium">
                  关键事件
                </label>
                <textarea
                  id="chapter-key-events"
                  rows={5}
                  value={currentPlan.keyEvents}
                  onChange={(event) => updatePlan('keyEvents', event.target.value)}
                  placeholder={'测验满分\n老师约谈\n竞赛意图露出'}
                  className="w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm leading-6 outline-none transition focus:border-primary"
                  aria-label="关键事件"
                />
              </div>

              {aiError ? (
                <div
                  role="alert"
                  className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600"
                >
                  <AlertCircle size={14} />
                  {aiError}
                </div>
              ) : null}

              {saveNotice ? (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                  <Check size={14} />
                  {saveNotice}
                </div>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                <button
                  type="button"
                  onClick={() => {
                    const nextPlans = { ...plans };
                    delete nextPlans[selectedChapter];
                    setPlans(nextPlans);
                    persistPlans(bookId, nextPlans);
                    setSaveNotice('已清空本章规划');
                  }}
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  清空本章
                </button>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleSavePlan}
                    className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm hover:bg-accent"
                  >
                    <Save size={14} />
                    保存规划
                  </button>
                  <button
                    type="button"
                    onClick={handleStartWriting}
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    开始创作
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
