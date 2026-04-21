import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  FileText,
  Pencil,
  GitMerge,
  Scissors,
  RotateCcw,
  MoreHorizontal,
  Play,
  Stethoscope,
  Trash2,
  Palette,
  Sparkles,
  Heart,
  Clock,
} from 'lucide-react';
import {
  fetchBook,
  fetchChapterSnapshots,
  fetchChapters,
  mergeChapters,
  splitChapter,
  rollbackChapter,
  deleteChapter,
} from '../lib/api';
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

  // Merge/Split confirmation dialogs
  const [mergeConfirm, setMergeConfirm] = useState<{
    from: number;
    fromTitle: string;
    to: number;
    toTitle: string;
  } | null>(null);
  const [splitDialog, setSplitDialog] = useState<{
    chapterNumber: number;
    title: string;
    totalParagraphs: number;
  } | null>(null);
  const [splitPosition, setSplitPosition] = useState(1);
  const [newChapterTitle, setNewChapterTitle] = useState('');

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

  useEffect(() => {
    function handleClickOutside() {
      setActionMenu(null);
    }
    if (actionMenu !== null) {
      window.addEventListener('click', handleClickOutside);
    }
    return () => window.removeEventListener('click', handleClickOutside);
  }, [actionMenu]);

  function handleMerge(fromNumber: number, toNumber: number) {
    if (!bookId) return;
    const fromCh = chapters.find((c) => c.number === fromNumber);
    const toCh = chapters.find((c) => c.number === toNumber);
    setMergeConfirm({
      from: fromNumber,
      fromTitle: fromCh?.title ?? `第${fromNumber}章`,
      to: toNumber,
      toTitle: toCh?.title ?? `第${toNumber}章`,
    });
    setActionMenu(null);
  }

  async function confirmMerge() {
    if (!mergeConfirm || !bookId) return;
    const ok = await mergeChapters(bookId, mergeConfirm.from, mergeConfirm.to);
    if (ok) {
      setChapters((prev) => prev.filter((ch) => ch.number !== mergeConfirm.from));
    }
    setMergeConfirm(null);
    setActionMenu(null);
  }

  async function handleDelete(chapterNumber: number) {
    if (!bookId || !window.confirm(`确定要删除第 ${chapterNumber} 章吗？此操作不可撤销。`)) return;
    const ok = await deleteChapter(bookId, chapterNumber);
    if (ok) {
      setChapters((prev) => prev.filter((ch) => ch.number !== chapterNumber));
    }
    setActionMenu(null);
  }

  function handleSplit(chapterNumber: number) {
    if (!bookId) return;
    const ch = chapters.find((c) => c.number === chapterNumber);
    const paragraphs = (ch?.content ?? '').split(/\n\n+/).filter(Boolean).length;
    setSplitDialog({
      chapterNumber,
      title: ch?.title ?? `第${chapterNumber}章`,
      totalParagraphs: Math.max(paragraphs, 1),
    });
    setSplitPosition(Math.ceil(Math.max(paragraphs, 1) / 2));
    setNewChapterTitle('');
    setActionMenu(null);
  }

  async function confirmSplit() {
    if (!splitDialog || !bookId) return;
    const data = await splitChapter(bookId, splitDialog.chapterNumber);
    if (data) {
      setChapters((prev) =>
        prev
          .map((ch) => (ch.number === splitDialog.chapterNumber ? data[0] : ch))
          .concat(data.slice(1))
      );
    }
    setSplitDialog(null);
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

  return (
    <div className="space-y-6">
      {/* Header - single line */}
      <div className="mb-2">
        <h1 className="text-xl font-semibold">
          {book.title}
          <span className="text-gray-400 font-normal text-base ml-2">
            | {book.genre} | {book.chapterCount}/{book.targetChapterCount} 章 |{' '}
            {book.currentWords.toLocaleString()} 字
          </span>
        </h1>
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
          <Link
            to={`/style-manager?bookId=${bookId}`}
            className="inline-flex items-center gap-2 px-4 py-2 border rounded-md text-sm hover:bg-accent"
          >
            <Palette size={14} />
            文风配置
          </Link>
          <Link
            to={`/fanfic-init?bookId=${bookId}`}
            className="inline-flex items-center gap-2 px-4 py-2 border rounded-md text-sm hover:bg-accent"
          >
            <Sparkles size={14} />
            同人模式
          </Link>
          <Link
            to={`/book/${bookId}/emotional-arcs`}
            className="inline-flex items-center gap-2 px-4 py-2 border rounded-md text-sm hover:bg-accent"
          >
            <Heart size={14} />
            情感弧线
          </Link>
          <Link
            to={`/book/${bookId}/prompts`}
            className="inline-flex items-center gap-2 px-4 py-2 border rounded-md text-sm hover:bg-accent"
          >
            <Clock size={14} />
            提示词版本
          </Link>
          <Link
            to={`/daemon?bookId=${bookId}`}
            className="inline-flex items-center gap-2 px-4 py-2 border rounded-md text-sm hover:bg-accent"
          >
            <Play size={14} />
            守护进程
          </Link>
          <Link
            to={`/doctor?bookId=${bookId}`}
            className="inline-flex items-center gap-2 px-4 py-2 border rounded-md text-sm hover:bg-accent"
          >
            <Stethoscope size={14} />
            系统诊断
          </Link>
        </div>
      </div>

      {/* Chapter List - Table format */}
      <div className="rounded-lg border bg-card">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">章节列表</h2>
        </div>
        {chapters.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <FileText size={48} className="mx-auto mb-3 opacity-40" />
            <p>还没有章节，开始创作后章节会出现在这里</p>
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b text-left text-sm text-gray-500">
                <th className="py-2 px-3 text-center">章号</th>
                <th className="py-2 px-3">标题</th>
                <th className="py-2 px-3">状态</th>
                <th className="py-2 px-3">字数</th>
                <th className="py-2 px-3 text-center">质量分</th>
                <th className="py-2 px-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {chapters.map((ch) => {
                const pollution = getChapterPollutionState(ch);
                const statusText =
                  ch.status === 'draft' ? '○ 草稿' : ch.status === 'published' ? '✓ 完成' : '-';
                return (
                  <tr
                    key={ch.number}
                    className={`border-b hover:bg-gray-50 ${
                      pollution.isPolluted ? 'border-2' : ''
                    }`}
                    style={
                      pollution.isPolluted
                        ? {
                            borderColor: '#FF8C00',
                            backgroundImage:
                              'repeating-linear-gradient(135deg, rgba(255,140,0,0.08), rgba(255,140,0,0.08) 8px, transparent 8px, transparent 16px)',
                          }
                        : undefined
                    }
                  >
                    <td className="py-2 px-3 text-center">{ch.number}</td>
                    <td className="py-2 px-3">
                      <Link
                        to={`/book/${bookId}/chapter/${ch.number}`}
                        className="hover:text-blue-600"
                      >
                        {ch.title || '(未创作)'}
                      </Link>
                      {pollution.isPolluted && (
                        <span
                          className="ml-2 text-[10px] font-medium px-1 rounded"
                          style={{ color: '#FF8C00', borderColor: '#FF8C00', border: '1px solid' }}
                        >
                          污染隔离
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-sm">{statusText}</td>
                    <td className="py-2 px-3 text-sm">{ch.wordCount?.toLocaleString() || '-'}</td>
                    <td className="py-2 px-3 text-center text-sm">{ch.qualityScore ?? '-'}</td>
                    <td className="py-2 px-3 text-sm">
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/book/${bookId}/chapter/${ch.number}`}
                          className="hover:text-blue-600"
                        >
                          编辑
                        </Link>
                        {ch.status === 'published' && (
                          <button
                            onClick={() => openRollbackDial(ch.number)}
                            className="hover:text-blue-600"
                          >
                            回滚
                          </button>
                        )}
                        <div className="relative">
                          <button
                            onClick={() =>
                              setActionMenu(actionMenu === ch.number ? null : ch.number)
                            }
                            className="hover:text-gray-600"
                            title="更多操作"
                          >
                            <MoreHorizontal size={14} />
                          </button>
                          {actionMenu === ch.number && (
                            <div
                              className="absolute left-0 top-6 w-48 rounded-md border bg-popover shadow-lg z-10 py-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Link
                                to={`/book/${bookId}/chapter/${ch.number}`}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
                              >
                                <Pencil size={14} />
                                编辑章节
                              </Link>
                              {ch.number > 1 && (
                                <button
                                  onClick={() => {
                                    const prev = chapters.find((c) => c.number === ch.number - 1);
                                    if (prev) handleMerge(ch.number - 1, ch.number);
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
                                >
                                  <GitMerge size={14} />
                                  合并到上一章
                                </button>
                              )}
                              <button
                                onClick={() => handleSplit(ch.number)}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
                              >
                                <Scissors size={14} />
                                从此处拆分
                              </button>
                              <button
                                onClick={() => openRollbackDial(ch.number)}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
                              >
                                <RotateCcw size={14} />
                                回滚到此章
                              </button>
                              <div className="my-1 border-t" />
                              <button
                                onClick={() => handleDelete(ch.number)}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
                              >
                                <Trash2 size={14} />
                                删除章节
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Stats Footer */}
      {(() => {
        const published = chapters.filter((c) => c.status === 'published').length;
        const draft = chapters.filter((c) => c.status === 'draft').length;
        const editing = chapters.filter((c) => c.status === 'published' && c.wordCount > 0).length;
        const unpublished = Math.max(book.targetChapterCount - chapters.length, 0);
        return (
          <div className="mt-4 text-sm text-gray-500">
            统计: 已完成 {published} 章 | 草稿 {draft} 章 | 编辑中 {editing} 章 | 未创作{' '}
            {unpublished} 章
          </div>
        );
      })()}

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

      {/* Merge Confirmation Dialog */}
      {mergeConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg border p-6 w-[480px]">
            <h3 className="text-lg font-semibold mb-4">确认合并</h3>
            <p className="text-sm text-muted-foreground mb-4">
              将「第{mergeConfirm.from}章 {mergeConfirm.fromTitle}」合并到「第{mergeConfirm.to}章{' '}
              {mergeConfirm.toTitle}」
            </p>
            <div className="rounded border bg-muted p-4 mb-4">
              <p className="text-sm font-medium mb-2">合并后效果：</p>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• 两章正文合并为一章，章号保留第{mergeConfirm.to}章</li>
                <li>• 后续章节号自动重编号</li>
                <li>• 伏笔、快照、事实时间线自动重锚定</li>
              </ul>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setMergeConfirm(null)}
                className="px-4 py-1.5 rounded text-sm hover:bg-accent border"
              >
                取消
              </button>
              <button
                onClick={confirmMerge}
                className="px-4 py-1.5 bg-primary text-primary-foreground rounded text-sm hover:bg-primary/90"
              >
                确认合并
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Split Dialog */}
      {splitDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg border p-6 w-[520px]">
            <h3 className="text-lg font-semibold mb-4">
              拆分「第{splitDialog.chapterNumber}章 {splitDialog.title}」
            </h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium block mb-2">选择拆分位置：</label>
                <p className="text-xs text-muted-foreground mb-2">
                  段落: 第{splitPosition}段 / 共{splitDialog.totalParagraphs}段
                </p>
                <input
                  type="range"
                  min={1}
                  max={splitDialog.totalParagraphs}
                  value={splitPosition}
                  onChange={(e) => setSplitPosition(Number(e.target.value))}
                  className="w-full"
                />
                <div className="rounded border bg-muted p-3 mt-3 text-sm">
                  <p className="text-muted-foreground">
                    前{splitPosition}段将保留在第{splitDialog.chapterNumber}章
                  </p>
                  <div className="border-t border-dashed my-2 py-1 text-center text-xs text-muted-foreground">
                    ─── 拆分线 ───
                  </div>
                  <p className="text-muted-foreground">
                    后{splitDialog.totalParagraphs - splitPosition}段将成为新章节
                  </p>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">新章节标题：</label>
                <input
                  value={newChapterTitle}
                  onChange={(e) => setNewChapterTitle(e.target.value)}
                  placeholder="新章节标题"
                  className="w-full px-3 py-2 rounded border bg-background text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button
                onClick={() => setSplitDialog(null)}
                className="px-4 py-1.5 rounded text-sm hover:bg-accent border"
              >
                取消
              </button>
              <button
                onClick={confirmSplit}
                className="px-4 py-1.5 bg-primary text-primary-foreground rounded text-sm hover:bg-primary/90"
              >
                确认拆分
              </button>
            </div>
          </div>
        </div>
      )}
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
