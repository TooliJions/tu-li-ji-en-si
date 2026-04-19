import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Zap, BookOpen, FileEdit, Brain, BarChart3 } from 'lucide-react';
import {
  fetchBook,
  fetchChapters,
  startFastDraft,
  startWriteNext,
  startWriteDraft,
  getPipelineStatus,
} from '../lib/api';

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
}

interface PipelineStatus {
  pipelineId: string;
  status: string;
  stages: string[];
  currentStage: string;
  progress: Record<string, { status: string; elapsedMs: number }>;
  startedAt: string;
}

interface FastDraftResult {
  content: string;
  wordCount: number;
  elapsedMs: number;
  llmCalls: number;
  draftId: string;
}

const STAGE_LABELS: Record<string, string> = {
  planning: '规划中',
  composing: '构图中',
  writing: '写作中',
  auditing: '审计中',
  revising: '修订中',
  persisting: '持久化中',
};

export default function Writing() {
  const [searchParams] = useSearchParams();
  const bookId = searchParams.get('bookId') || '';
  const [book, setBook] = useState<Book | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);

  // Fast draft state
  const [draftWordCount, setDraftWordCount] = useState(800);
  const [draftIntent, setDraftIntent] = useState('');
  const [draftResult, setDraftResult] = useState<FastDraftResult | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);

  // Pipeline state
  const [pipeline, setPipeline] = useState<PipelineStatus | null>(null);
  const [pipelineLoading, setPipelineLoading] = useState(false);
  const [writeIntent, setWriteIntent] = useState('');

  // Draft mode state
  const [draftModeResult, setDraftModeResult] = useState<{
    content: string;
    number: number;
  } | null>(null);
  const [draftModeLoading, setDraftModeLoading] = useState(false);

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

  async function handleFastDraft() {
    if (!bookId) return;
    setDraftLoading(true);
    try {
      const result = await startFastDraft(bookId, draftIntent || undefined, draftWordCount);
      setDraftResult(result);
    } catch {
      // failed
    } finally {
      setDraftLoading(false);
    }
  }

  async function handleWriteNext() {
    if (!bookId) return;
    setPipelineLoading(true);
    setDraftModeResult(null);
    setDraftResult(null);
    try {
      const nextChapter = Math.max(...chapters.map((ch) => ch.number), 0) + 1;
      const result = await startWriteNext(bookId, nextChapter, writeIntent || undefined);
      // Poll for pipeline status
      const poll = async () => {
        const status = await getPipelineStatus(bookId, result.pipelineId);
        setPipeline(status);
        if (status.status === 'running') {
          setTimeout(poll, 1000);
        }
      };
      poll();
    } catch {
      setPipelineLoading(false);
    }
  }

  async function handleWriteDraft() {
    if (!bookId) return;
    setDraftModeLoading(true);
    try {
      const nextChapter = Math.max(...chapters.map((ch) => ch.number), 0) + 1;
      const result = await startWriteDraft(bookId, nextChapter);
      setDraftModeResult({ content: result.content, number: result.number });
    } catch {
      // failed
    } finally {
      setDraftModeLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">加载中…</div>
    );
  }

  if (!book) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">请选择一本书</p>
        <Link to="/" className="text-primary mt-4 inline-block">
          返回仪表盘
        </Link>
      </div>
    );
  }

  const avgQuality =
    chapters.length > 0
      ? Math.round(
          chapters
            .filter((ch) => ch.qualityScore !== null)
            .reduce((sum, ch) => sum + (ch.qualityScore || 0), 0) /
            chapters.filter((ch) => ch.qualityScore !== null).length
        )
      : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{book.title} — 写作工作台</h1>
        <Link
          to={`/book/${bookId}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← 返回书籍详情
        </Link>
      </div>

      {/* Quality Metrics */}
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 size={18} />
          <h2 className="text-lg font-semibold">质量仪表盘</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <InfoCard label="章节数" value={`${chapters.length}`} />
          <InfoCard label="总字数" value={`${book.currentWords.toLocaleString()}`} />
          <InfoCard label="平均质量" value={avgQuality !== null ? `${avgQuality}分` : '暂无'} />
          <InfoCard
            label="草稿数"
            value={`${chapters.filter((ch) => ch.status === 'draft').length}`}
          />
        </div>
      </div>

      {/* Memory Section */}
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Brain size={18} />
          <h2 className="text-lg font-semibold">记忆提取</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {['林晨', '苏小雨', '教室', '竞赛试卷', '旧档案室'].map((keyword) => (
            <span
              key={keyword}
              className="px-3 py-1 rounded-full text-xs bg-secondary text-secondary-foreground hover:bg-accent cursor-pointer transition-colors"
            >
              {keyword}
            </span>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2">点击关键词查看上下文关联</p>
      </div>

      {/* Fast Draft */}
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2 mb-4">
          <Zap size={18} className="text-yellow-500" />
          <h2 className="text-lg font-semibold">快速试写</h2>
        </div>
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">目标字数</label>
            <input
              type="number"
              value={draftWordCount}
              onChange={(e) => setDraftWordCount(parseInt(e.target.value, 10) || 800)}
              className="w-24 px-3 py-1.5 border rounded-md text-sm bg-transparent"
              min={100}
              max={5000}
              step={100}
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="text-sm text-muted-foreground mb-1 block">创作意图（可选）</label>
            <input
              type="text"
              value={draftIntent}
              onChange={(e) => setDraftIntent(e.target.value)}
              placeholder="输入简要意图…"
              className="w-full px-3 py-1.5 border rounded-md text-sm bg-transparent"
            />
          </div>
          <button
            onClick={handleFastDraft}
            disabled={draftLoading}
            className="px-4 py-1.5 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 disabled:opacity-50"
          >
            {draftLoading ? '试写中…' : '开始快速试写'}
          </button>
        </div>
        {draftResult && (
          <div className="mt-4 p-4 rounded bg-secondary">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
              <span>{draftResult.wordCount} 字</span>
              <span>耗时 {(draftResult.elapsedMs / 1000).toFixed(1)}s</span>
              <span>LLM 调用 {draftResult.llmCalls} 次</span>
            </div>
            <div className="prose prose-sm max-w-none">
              {draftResult.content.split('\n').map((line, i) => (
                <p key={i} className="text-sm text-foreground">
                  {line || '\u00A0'}
                </p>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Full Creation */}
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2 mb-4">
          <BookOpen size={18} />
          <h2 className="text-lg font-semibold">完整创作</h2>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">创作意图（可选）</label>
            <textarea
              value={writeIntent}
              onChange={(e) => setWriteIntent(e.target.value)}
              placeholder="输入创作意图…"
              rows={2}
              className="w-full px-3 py-1.5 border rounded-md text-sm bg-transparent resize-none"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleWriteNext}
              disabled={pipelineLoading}
              className="px-4 py-1.5 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 disabled:opacity-50"
            >
              {pipelineLoading ? '创作中…' : '开始完整创作'}
            </button>
            <button
              onClick={handleWriteDraft}
              disabled={draftModeLoading}
              className="px-4 py-1.5 border rounded-md text-sm hover:bg-accent disabled:opacity-50"
            >
              {draftModeLoading ? '草稿生成中…' : '草稿模式'}
            </button>
          </div>
        </div>

        {/* Pipeline Progress */}
        {pipeline && (
          <div className="mt-4 p-4 rounded bg-secondary">
            <div className="flex items-center gap-2 mb-3">
              <span
                className={`w-2 h-2 rounded-full ${
                  pipeline.status === 'running' ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
                }`}
              />
              <span className="text-sm font-medium">流水线 {pipeline.pipelineId}</span>
              <span className="text-sm text-muted-foreground">
                {STAGE_LABELS[pipeline.currentStage] || pipeline.currentStage}
              </span>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {pipeline.stages.map((stage) => {
                const info = pipeline.progress[stage];
                const isActive = stage === pipeline.currentStage;
                const isDone = info?.status === 'done';
                return (
                  <div
                    key={stage}
                    className={`px-3 py-2 rounded text-xs text-center transition-colors ${
                      isDone
                        ? 'bg-green-100 text-green-700'
                        : isActive
                          ? 'bg-yellow-100 text-yellow-700 font-medium'
                          : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {STAGE_LABELS[stage] || stage}
                    {isActive && <span className="ml-1 animate-pulse">…</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Draft Mode Result */}
        {draftModeResult && (
          <div className="mt-4 p-4 rounded bg-secondary">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
              <FileEdit size={14} />
              <span>第 {draftModeResult.number} 章 · 草稿</span>
            </div>
            <div className="prose prose-sm max-w-none">
              {draftModeResult.content.split('\n').map((line, i) => (
                <p key={i} className="text-sm text-foreground">
                  {line || '\u00A0'}
                </p>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-lg font-bold mt-1">{value}</p>
    </div>
  );
}
