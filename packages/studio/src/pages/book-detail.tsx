import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { FileText, Pencil, GitMerge, Scissors, RotateCcw, Eye, MoreHorizontal } from 'lucide-react';
import {
  fetchBook,
  fetchChapterSnapshots,
  fetchChapters,
  mergeChapters,
  splitChapter,
  rollbackChapter,
} from '../lib/api';
import PollutionBadge from '../components/pollution-badge';
import TimeDial from '../components/time-dial';

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

interface Chapter {
  number: number;
  title: string | null;
  content: string;
  status: 'draft' | 'published';
  wordCount: number;
  qualityScore: number | null;
  auditStatus: string | null;
  warningCode?: string | null;
  warning?: string | null;
}

interface ChapterSnapshot {
  id: string;
  chapter: number;
  label: string;
  timestamp: string;
}

function getChapterPollutionState(chapter: Chapter) {
  if (chapter.warningCode === 'accept_with_warnings') {
    return {
      isPolluted: true,
      level: 'high' as const,
      contaminationScore: 0.95,
      source: '降级结果',
    };
  }

  if (chapter.qualityScore !== null && chapter.qualityScore < 50) {
    return {
      isPolluted: true,
      level: chapter.qualityScore < 30 ? ('high' as const) : ('medium' as const),
      contaminationScore: 1 - chapter.qualityScore / 100,
      source: 'AI检测',
    };
  }

  return {
    isPolluted: false,
    level: 'low' as const,
    contaminationScore: 0,
    source: 'AI检测',
  };
}

export default function BookDetail() {
  const { bookId } = useParams<{ bookId: string }>();
  const [book, setBook] = useState<Book | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionMenu, setActionMenu] = useState<number | null>(null);
  const [rollbackChapterNumber, setRollbackChapterNumber] = useState<number | null>(null);
  const [snapshots, setSnapshots] = useState<ChapterSnapshot[]>([]);
  const [timeDialOpen, setTimeDialOpen] = useState(false);

  useEffect(() => {
    if (!bookId) return;

    Promise.all([fetchBook(bookId), fetchChapters(bookId)])
      .then(([bookData, chaptersData]) => {
        setBook(bookData);
        setChapters(chaptersData);
      })
      .catch(() => setBook(null))
      .finally(() => setLoading(false));
  }, [bookId]);

  async function handleMerge(fromNumber: number, toNumber: number) {
    if (!bookId) return;
    const ok = await mergeChapters(bookId, fromNumber, toNumber);
    if (ok) {
      setChapters((prev) => prev.filter((ch) => ch.number !== fromNumber));
    }
    setActionMenu(null);
  }

  async function handleSplit(chapterNumber: number) {
    if (!bookId) return;
    const data = await splitChapter(bookId, chapterNumber);
    if (data) {
      setChapters((prev) =>
        prev.map((ch) => (ch.number === chapterNumber ? data[0] : ch)).concat(data.slice(1))
      );
    }
    setActionMenu(null);
  }

  async function openRollbackDial(chapterNumber: number) {
    if (!bookId) return;
    const snapshotList = await fetchChapterSnapshots(bookId, chapterNumber);
    setRollbackChapterNumber(chapterNumber);
    setSnapshots(snapshotList);
    setTimeDialOpen(true);
    setActionMenu(null);
  }

  async function handleRollbackConfirm(snapshotId: string) {
    if (!bookId || rollbackChapterNumber === null) return;
    const ok = await rollbackChapter(bookId, rollbackChapterNumber, snapshotId);
    if (ok) {
      const nextChapters = await fetchChapters(bookId);
      setChapters(nextChapters);
    }
    setTimeDialOpen(false);
    setRollbackChapterNumber(null);
    setSnapshots([]);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">加载中…</div>
    );
  }

  if (!book) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">书籍不存在</p>
        <Link to="/" className="text-primary mt-4 inline-block">
          返回仪表盘
        </Link>
      </div>
    );
  }

  const progress = Math.min((book.currentWords / book.targetWords) * 100, 100);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{book.title}</h1>
        <span
          className={`px-3 py-1 rounded-full text-xs font-medium ${
            book.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
          }`}
        >
          {book.status === 'active' ? '创作中' : '已归档'}
        </span>
      </div>

      {/* Book Info */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <InfoCard label="类型" value={book.genre} />
        <InfoCard label="已写" value={`${book.currentWords.toLocaleString()} 字`} />
        <InfoCard label="目标" value={`${book.targetWords.toLocaleString()} 字`} />
        <InfoCard label="章节" value={`${book.chapterCount}/${book.targetChapterCount}`} />
      </div>

      {/* Progress */}
      <div className="rounded-lg border bg-card p-4">
        <div className="flex justify-between text-sm mb-2">
          <span>写作进度</span>
          <span className="font-medium">{progress.toFixed(1)}%</span>
        </div>
        <div className="h-2 bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Quick Actions */}
      <div className="rounded-lg border bg-card p-4">
        <h2 className="text-lg font-semibold mb-4">快速操作</h2>
        <div className="flex flex-wrap gap-3">
          <Link
            to={`/book/${bookId}/chapter/${Math.max(book.chapterCount, 1)}`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90"
          >
            <Pencil size={14} />
            继续写作
          </Link>
          <Link
            to={`/writing?bookId=${bookId}`}
            className="inline-flex items-center gap-2 px-4 py-2 border rounded-md text-sm hover:bg-accent"
          >
            <FileText size={14} />
            快速试写
          </Link>
          <Link
            to={`/hooks?bookId=${bookId}`}
            className="inline-flex items-center gap-2 px-4 py-2 border rounded-md text-sm hover:bg-accent"
          >
            伏笔管理
          </Link>
        </div>
      </div>

      {/* Chapter List */}
      <div className="rounded-lg border bg-card">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">章节列表 ({chapters.length} 章)</h2>
        </div>
        {chapters.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <FileText size={48} className="mx-auto mb-3 opacity-40" />
            <p>还没有章节，开始创作后章节会出现在这里</p>
          </div>
        ) : (
          <div className="divide-y">
            {chapters.map((ch) => {
              const pollution = getChapterPollutionState(ch);
              return (
                <div
                  key={ch.number}
                  className={`flex items-center justify-between p-4 hover:bg-accent/50 group ${
                    pollution.isPolluted ? 'border-l-4 border-l-orange-500' : ''
                  }`}
                  style={
                    pollution.isPolluted
                      ? {
                          backgroundImage:
                            'repeating-linear-gradient(135deg, rgba(249,115,22,0.08), rgba(249,115,22,0.08) 8px, transparent 8px, transparent 16px)',
                        }
                      : undefined
                  }
                >
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-sm font-medium">
                      {ch.number}
                    </span>
                    <div>
                      <p className="font-medium">{ch.title || `第 ${ch.number} 章`}</p>
                      <p className="text-xs text-muted-foreground">
                        {ch.wordCount.toLocaleString()} 字
                        {ch.status === 'draft' && <span className="ml-2 text-amber-600">草稿</span>}
                        {ch.auditStatus === 'passed' && (
                          <span className="ml-2 text-green-600">已审计</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {pollution.isPolluted && (
                      <PollutionBadge
                        level={pollution.level}
                        contaminationScore={pollution.contaminationScore}
                        source={pollution.source}
                      />
                    )}
                    <Link
                      to={`/book/${bookId}/chapter/${ch.number}`}
                      className="p-1.5 rounded-md hover:bg-accent"
                      title="阅读"
                    >
                      <Eye size={16} />
                    </Link>
                    {/* Action menu */}
                    <div className="relative">
                      <button
                        onClick={() => setActionMenu(actionMenu === ch.number ? null : ch.number)}
                        className="p-1.5 rounded-md hover:bg-accent"
                        title="更多操作"
                      >
                        <MoreHorizontal size={16} />
                      </button>
                      {actionMenu === ch.number && (
                        <div className="absolute right-0 top-8 w-48 rounded-md border bg-popover shadow-lg z-10 py-1">
                          <button
                            onClick={() => {
                              const prev = chapters.find((c) => c.number === ch.number - 1);
                              if (prev) handleMerge(ch.number - 1, ch.number);
                            }}
                            disabled={ch.number <= 1}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent disabled:opacity-40"
                          >
                            <GitMerge size={14} />
                            与上一章合并
                          </button>
                          <button
                            onClick={() => handleSplit(ch.number)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
                          >
                            <Scissors size={14} />
                            拆分为两章
                          </button>
                          <button
                            onClick={() => openRollbackDial(ch.number)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
                          >
                            <RotateCcw size={14} />
                            回滚到快照
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <TimeDial
        open={timeDialOpen}
        snapshots={snapshots}
        currentChapter={rollbackChapterNumber ?? 0}
        onConfirm={handleRollbackConfirm}
        onClose={() => {
          setTimeDialOpen(false);
          setRollbackChapterNumber(null);
          setSnapshots([]);
        }}
      />
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-lg font-bold mt-1">{value}</p>
    </div>
  );
}
