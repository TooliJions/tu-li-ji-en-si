import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Sparkles, ChevronRight } from 'lucide-react';
import {
  fetchBook,
  fetchStoryOutline,
  fetchDetailedOutline,
  generateDetailedOutline,
  type DetailedOutlineDocument,
  type StoryBlueprintDocument,
} from '../lib/api';

interface Book {
  id: string;
  title: string;
}

export default function ChapterPlansPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const bookId = searchParams.get('bookId') ?? '';
  const [book, setBook] = useState<Book | null>(null);
  const [blueprint, setBlueprint] = useState<StoryBlueprintDocument | null>(null);
  const [outline, setOutline] = useState<DetailedOutlineDocument | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!bookId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    Promise.all([fetchBook(bookId), fetchStoryOutline(bookId), fetchDetailedOutline(bookId)])
      .then(([bookData, blueprintData, outlineData]) => {
        setBook(bookData);
        setBlueprint(blueprintData);
        if (outlineData) {
          setOutline(outlineData);
          const firstChapter = outlineData.volumes[0]?.chapters[0]?.chapterNumber;
          if (firstChapter) {
            setSelectedChapter(firstChapter);
          }
        }
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : '加载细纲失败');
      })
      .finally(() => setLoading(false));
  }, [bookId]);

  async function handleGenerate() {
    if (!bookId || !blueprint || outline) return;

    setGenerating(true);
    setError(null);
    setNotice(null);

    try {
      const result = await generateDetailedOutline(bookId);
      setOutline(result);
      const firstChapter = result.volumes[0]?.chapters[0]?.chapterNumber;
      if (firstChapter) {
        setSelectedChapter(firstChapter);
      }
      setNotice('AI 已生成全书细纲');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'AI 生成细纲失败');
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
        请先选择一本书,再进入细纲规划阶段。
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">细纲规划</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            从故事总纲一键生成全书章节地图,每章含 contextForWriter 自给自足上下文。
            {book ? `当前书籍:${book.title}` : ''}
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            to={bookId ? `/story-outline?bookId=${bookId}` : '#'}
            className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm hover:bg-accent"
          >
            返回总纲
          </Link>
          <Link
            to={bookId ? `/writing?bookId=${bookId}` : '#'}
            className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm hover:bg-accent"
          >
            进入正文创作
          </Link>
        </div>
      </div>

      {!blueprint && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          请先完成故事总纲,再进入细纲页。
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

      {!outline && (
        <div className="rounded-xl border bg-card p-8 text-center shadow-sm">
          <Sparkles className="mx-auto h-12 w-12 text-amber-500" />
          <h2 className="mt-4 text-lg font-semibold">尚未生成全书细纲</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            从故事总纲一键生成全书章节地图(卷 → 章节),每章带 contextForWriter
            包含人物状态/世界规则/伏笔状态/前后衔接。
          </p>
          <button
            type="button"
            disabled={!blueprint || generating}
            onClick={handleGenerate}
            className="mt-6 inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Sparkles size={16} />
            {generating ? 'AI 生成中…(可能耗时数分钟)' : 'AI 自动生成全书细纲'}
          </button>
        </div>
      )}

      {outline && (
        <DetailedOutlineViewer
          outline={outline}
          selectedChapter={selectedChapter}
          onSelectChapter={setSelectedChapter}
          onStartWriting={(chapter) => navigate(`/writing?bookId=${bookId}&chapter=${chapter}`)}
        />
      )}
    </div>
  );
}

function DetailedOutlineViewer({
  outline,
  selectedChapter,
  onSelectChapter,
  onStartWriting,
}: {
  outline: DetailedOutlineDocument;
  selectedChapter: number | null;
  onSelectChapter: (chapter: number) => void;
  onStartWriting: (chapter: number) => void;
}) {
  const selectedEntry = selectedChapter
    ? outline.volumes.flatMap((v) => v.chapters).find((c) => c.chapterNumber === selectedChapter)
    : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
      <aside className="rounded-xl border bg-card shadow-sm">
        <div className="border-b px-4 py-3">
          <p className="text-sm font-semibold">
            全书 {outline.totalChapters} 章 · {outline.volumes.length} 卷
          </p>
          {outline.estimatedTotalWords && (
            <p className="mt-1 text-xs text-muted-foreground">
              预计字数:{outline.estimatedTotalWords}
            </p>
          )}
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-2 py-2">
          {outline.volumes.map((volume) => (
            <details key={volume.volumeNumber} className="mb-2 rounded-lg border" open>
              <summary className="cursor-pointer px-3 py-2 text-sm font-medium hover:bg-accent/40">
                第 {volume.volumeNumber} 卷 · {volume.title}
                <span className="ml-2 text-xs text-muted-foreground">
                  第 {volume.startChapter}-{volume.endChapter} 章
                </span>
              </summary>
              <ul className="space-y-0.5 px-1 py-1 text-sm">
                {volume.chapters.map((chapter) => (
                  <li key={chapter.chapterNumber}>
                    <button
                      type="button"
                      onClick={() => onSelectChapter(chapter.chapterNumber)}
                      className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left ${
                        selectedChapter === chapter.chapterNumber
                          ? 'bg-primary/10 text-primary'
                          : 'hover:bg-accent/40'
                      }`}
                    >
                      <span className="text-xs text-muted-foreground">
                        第 {chapter.chapterNumber} 章
                      </span>
                      <span className="flex-1 truncate">{chapter.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </aside>

      <section className="rounded-xl border bg-card p-5 shadow-sm">
        {!selectedEntry && (
          <p className="text-sm text-muted-foreground">从左侧选择一章查看详细规划。</p>
        )}
        {selectedEntry && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 border-b pb-3">
              <div>
                <h2 className="text-lg font-semibold">
                  第 {selectedEntry.chapterNumber} 章 · {selectedEntry.title}
                </h2>
                {selectedEntry.wordCountTarget && (
                  <p className="text-xs text-muted-foreground">
                    字数目标:{selectedEntry.wordCountTarget}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => onStartWriting(selectedEntry.chapterNumber)}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                创作本章
                <ChevronRight size={14} />
              </button>
            </div>

            <KV label="场景设定" value={selectedEntry.sceneSetup} multiline />
            <KV label="出场角色" value={selectedEntry.charactersPresent.join('、') || '—'} />
            <KVList label="核心事件" items={selectedEntry.coreEvents} />
            <KV label="情感弧线" value={selectedEntry.emotionArc} multiline />
            <KV label="结尾钩子" value={selectedEntry.chapterEndHook} multiline />

            {selectedEntry.foreshadowingOps.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground">伏笔操作</p>
                <ul className="mt-1 space-y-1 text-sm">
                  {selectedEntry.foreshadowingOps.map((op, idx) => (
                    <li key={idx}>
                      <span className="font-mono text-xs">{op.foreshadowingId}</span>
                      <span className="ml-2 text-xs text-muted-foreground">[{op.operation}]</span>
                      {op.description && <span className="ml-2">{op.description}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="rounded-lg border bg-muted/20 p-4">
              <p className="text-sm font-semibold">contextForWriter(自给自足上下文)</p>
              <div className="mt-3 space-y-2">
                <KV
                  label="故事进度"
                  value={selectedEntry.contextForWriter.storyProgress}
                  multiline
                />
                <KV label="本章位置" value={selectedEntry.contextForWriter.chapterPositionNote} />
                {selectedEntry.contextForWriter.characterStates.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground">角色当前状态</p>
                    <ul className="mt-1 space-y-1 text-sm">
                      {selectedEntry.contextForWriter.characterStates.map((s, idx) => (
                        <li key={idx}>
                          <span className="font-mono text-xs">{s.characterId}</span>
                          {s.powerLevel && (
                            <span className="ml-2 text-xs">境界:{s.powerLevel}</span>
                          )}
                          {s.emotionalState && (
                            <span className="ml-2 text-xs">情绪:{s.emotionalState}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {selectedEntry.contextForWriter.activeWorldRules.length > 0 && (
                  <KV
                    label="本章相关世界规则"
                    value={selectedEntry.contextForWriter.activeWorldRules.join('、')}
                    multiline
                  />
                )}
                {selectedEntry.contextForWriter.activeForeshadowingStatus.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground">活跃伏笔状态</p>
                    <ul className="mt-1 space-y-1 text-sm">
                      {selectedEntry.contextForWriter.activeForeshadowingStatus.map((s, idx) => (
                        <li key={idx}>
                          <span className="font-mono text-xs">{s.foreshadowingId}</span>
                          <span className="ml-2 text-xs text-muted-foreground">[{s.status}]</span>
                          {s.note && <span className="ml-2">{s.note}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <KV
                  label="承上(悬念)"
                  value={selectedEntry.contextForWriter.precedingChapterBridge.cliffhanger}
                  multiline
                />
                <KV
                  label="启下(种子)"
                  value={selectedEntry.contextForWriter.nextChapterSetup.seedForNext}
                  multiline
                />
              </div>
            </div>

            {selectedEntry.writingNotes && (
              <KV label="执笔提醒" value={selectedEntry.writingNotes} multiline />
            )}
          </div>
        )}
      </section>
    </div>
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

function KVList({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      {items.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">—</p>
      ) : (
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
          {items.map((item, idx) => (
            <li key={idx}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
