import { useState, useEffect, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  Zap,
  BookOpen,
  FileEdit,
  Brain,
  BarChart3,
  Activity,
  Clock,
  ShieldCheck,
  Cpu,
  Terminal,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';
import {
  fetchBook,
  fetchChapters,
  fetchEntityContext,
  fetchMemoryPreview,
  fetchTruthFiles,
  startFastDraft,
  startWriteNext,
  startWriteDraft,
  startUpgradeDraft,
  fetchTokenUsage,
  fetchAiTrace,
  fetchAuditRate,
} from '../lib/api';
import ContextPopup from '../components/context-popup';
import EntityHighlight from '../components/entity-highlight';
import MemoryWordcloud from '../components/memory-wordcloud';
import LogPanel, { type LogEntry } from '../components/log-panel';
import { extractFlowEntities } from '../lib/entity-context';

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
  result?: {
    success: boolean;
    chapterNumber: number;
    status?: string;
    warning?: string;
    warningCode?: 'accept_with_warnings' | 'context_drift';
    error?: string;
  };
}

interface AnalyticsData {
  tokens: { prompt: number; completion: number; total: number };
  aiTrace: { score: number; labels: string[] };
  auditRate: { passed: number; failed: number; total: number };
}

interface FastDraftResult {
  content: string;
  wordCount: number;
  elapsedMs: number;
  llmCalls: number;
  draftId: string;
}

interface EntityContext {
  name: string;
  type: string;
  currentLocation: string;
  emotion: string;
  inventory: string[];
  relationships: Array<{ with: string; type: string; affinity?: string }>;
  activeHooks: Array<{ id: string; description: string; status: string }>;
}

interface MemoryPreview {
  summary: {
    facts: number;
    hooks: number;
    characters: number;
  };
  memories: Array<{
    text: string;
    confidence: number;
    sourceType?: string;
    entityType?: string | null;
  }>;
}

interface TruthFilesSummary {
  versionToken: number;
  files: Array<{ name: string; updatedAt: string; size: number }>;
}

interface DraftModeResult {
  content: string;
  number: number;
  contextVersionToken: number;
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
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);

  // Fast draft state
  const [draftWordCount, setDraftWordCount] = useState(800);
  const [draftIntent, setDraftIntent] = useState('');
  const [draftResult, setDraftResult] = useState<FastDraftResult | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);

  // Pipeline state
  const [pipeline, setPipeline] = useState<PipelineStatus | null>(null);
  const [pipelineLoading, setPipelineLoading] = useState(false);
  const [writeIntent, setWriteIntent] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([]);

  // Draft mode state
  const [draftModeResult, setDraftModeResult] = useState<DraftModeResult | null>(null);
  const [draftModeLoading, setDraftModeLoading] = useState(false);
  const [flowMode, setFlowMode] = useState(false);
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [upgradePrompt, setUpgradePrompt] = useState<{ nextVersionToken: number } | null>(null);
  const [upgradeNotice, setUpgradeNotice] = useState<string | null>(null);
  const [memoryPreview, setMemoryPreview] = useState<MemoryPreview | null>(null);
  const [popupVisible, setPopupVisible] = useState(false);
  const [popupContext, setPopupContext] = useState<EntityContext | null>(null);
  const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 });
  const [contextCache, setContextCache] = useState<Record<string, EntityContext>>({});

  // Quality dimensions
  const [qualityMetrics, setQualityMetrics] = useState({
    aiTrace: 0,
    coherence: 0,
    pacing: 0,
    dialogue: 0,
    description: 0,
    emotion: 0,
    creativity: 0,
    completeness: 0,
  });
  const [qualityPhase, setQualityPhase] = useState<'waiting' | 'computing' | 'done'>('waiting');

  const sseRef = useRef<EventSource | null>(null);

  async function loadWorkspaceData(targetBookId: string) {
    const [bookData, chaptersData, memoryData, truthFiles, tokenData, aiTrace, auditData] =
      await Promise.all([
        fetchBook(targetBookId),
        fetchChapters(targetBookId),
        fetchMemoryPreview(targetBookId),
        fetchTruthFiles(targetBookId) as Promise<TruthFilesSummary>,
        fetchTokenUsage(targetBookId).catch(() => ({ prompt: 0, completion: 0, total: 0 })),
        fetchAiTrace(targetBookId).catch(() => ({ score: 0, labels: [] })),
        fetchAuditRate(targetBookId).catch(() => ({ passed: 0, failed: 0, total: 0 })),
      ]);
    setBook(bookData);
    setChapters(chaptersData);
    setMemoryPreview(memoryData);
    setAnalytics({
      tokens: tokenData,
      aiTrace: aiTrace,
      auditRate: auditData,
    });
    return {
      versionToken: truthFiles.versionToken || 0,
    };
  }

  const addLog = (message: string, level: LogEntry['level'] = 'info', module = 'PIPELINE') => {
    const newLog: LogEntry = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      level,
      message,
      module,
    };
    setLogs((prev) => [...prev, newLog].slice(-100));
  };

  useEffect(() => {
    if (!bookId) {
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
      setBook(null);
      setChapters([]);
      setMemoryPreview(null);
      setPipeline(null);
      setDraftResult(null);
      setDraftModeResult(null);
      setUpgradePrompt(null);
      setUpgradeNotice(null);
      setContextCache({});
      setPopupContext(null);
      setPopupVisible(false);
      setLoading(false);
      setPipelineLoading(false);
      setDraftLoading(false);
      setDraftModeLoading(false);
      setUpgradeLoading(false);
      return;
    }

    setLoading(true);
    void loadWorkspaceData(bookId)
      .catch(() => setBook(null))
      .finally(() => setLoading(false));

    // Setup SSE for real-time updates
    const sse = new EventSource(`/api/books/${bookId}/sse`);
    sseRef.current = sse;

    sse.addEventListener('pipeline_progress', (event) => {
      const data = JSON.parse(event.data);
      setPipeline(data);
      addLog(`流水线状态: ${STAGE_LABELS[data.currentStage] || data.currentStage}`, 'info');

      if (data.status === 'completed') {
        addLog('流水线执行成功', 'success');
        setPipelineLoading(false);
        void loadWorkspaceData(bookId);
      } else if (data.status === 'failed') {
        addLog(`流水线执行失败: ${data.result?.error || '未知错误'}`, 'error');
        setPipelineLoading(false);
      }
    });

    sse.addEventListener('chapter_complete', (event) => {
      const data = JSON.parse(event.data);
      addLog(`章节完成: 第 ${data.chapterNumber} 章落盘成功`, 'success');
      // Update quality metrics from chapter audit results
      if (data.qualityMetrics) {
        const q = data.qualityMetrics;
        setQualityMetrics({
          aiTrace: q.aiTrace ?? qualityMetrics.aiTrace,
          coherence: q.coherence ?? qualityMetrics.coherence,
          pacing: q.pacing ?? qualityMetrics.pacing,
          dialogue: q.dialogue ?? qualityMetrics.dialogue,
          description: q.description ?? qualityMetrics.description,
          emotion: q.emotion ?? qualityMetrics.emotion,
          creativity: q.creativity ?? qualityMetrics.creativity,
          completeness: q.completeness ?? qualityMetrics.completeness,
        });
        setQualityPhase('done');
      }
    });

    sse.addEventListener('memory_extracted', () => {
      addLog('检测到记忆已更新，同步最新真相投影...', 'info', 'MEMORY');
      void fetchMemoryPreview(bookId).then(setMemoryPreview);
    });

    sse.onerror = () => {
      addLog('实时连接中断，正在自动重连…', 'warn', 'SSE');
    };

    return () => {
      sse.close();
      if (sseRef.current === sse) sseRef.current = null;
    };
  }, [bookId]);

  const knownEntityNames =
    memoryPreview?.memories.filter((memory) => memory.entityType).map((memory) => memory.text) ??
    [];
  const fastDraftEntities = draftResult
    ? extractFlowEntities(draftResult.content, knownEntityNames)
    : [];
  const draftModeEntities = draftModeResult
    ? extractFlowEntities(draftModeResult.content, knownEntityNames)
    : [];

  async function handleEntityEnter(
    entity: string,
    event: React.MouseEvent<HTMLElement>,
    chapterNumber?: number
  ) {
    if (!bookId) return;

    const rect = event.currentTarget.getBoundingClientRect();
    setPopupPosition({ x: rect.left, y: rect.bottom + 8 });
    setPopupVisible(true);

    if (contextCache[entity]) {
      setPopupContext(contextCache[entity]);
      return;
    }

    try {
      const context =
        chapterNumber === undefined
          ? await fetchEntityContext(bookId, entity)
          : await fetchEntityContext(bookId, entity, chapterNumber);
      setContextCache((prev) => ({ ...prev, [entity]: context }));
      setPopupContext(context);
    } catch {
      setPopupContext(null);
      setPopupVisible(false);
    }
  }

  function handleEntityLeave() {
    setPopupVisible(false);
  }

  async function handleFastDraft() {
    if (!bookId) return;
    setDraftLoading(true);
    addLog('开始执行快速试写...', 'info');
    try {
      const result = await startFastDraft(bookId, draftIntent || undefined, draftWordCount);
      setDraftResult(result);
      addLog(`快速试写完成: ${result.wordCount} 字`, 'success');
    } catch (err: unknown) {
      addLog(`试写失败: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setDraftLoading(false);
    }
  }

  async function handleWriteNext() {
    if (!bookId) return;
    setPipelineLoading(true);
    setDraftModeResult(null);
    setDraftResult(null);
    setLogs([]);
    addLog('启动完整创作流水线...', 'info');
    try {
      const nextChapter = Math.max(...chapters.map((ch) => ch.number), 0) + 1;
      await startWriteNext(bookId, nextChapter, writeIntent || undefined);
    } catch (err: unknown) {
      addLog(`启动流水线失败: ${err instanceof Error ? err.message : String(err)}`, 'error');
      setPipelineLoading(false);
    }
  }

  async function handleWriteDraft() {
    if (!bookId) return;
    setDraftModeLoading(true);
    setUpgradeNotice(null);
    addLog('启动草稿模式生成...', 'info');
    try {
      const nextChapter = Math.max(...chapters.map((ch) => ch.number), 0) + 1;
      const result = await startWriteDraft(bookId, nextChapter);
      const workspace = await loadWorkspaceData(bookId);
      setDraftModeResult({
        content: result.content,
        number: result.number,
        contextVersionToken: workspace.versionToken,
      });
      addLog(`草稿生成完毕: 第 ${result.number} 章`, 'success');
    } catch (err: unknown) {
      addLog(`草稿模式失败: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setDraftModeLoading(false);
    }
  }

  async function runDraftUpgrade() {
    if (!bookId || !draftModeResult) return;
    setUpgradeLoading(true);
    setUpgradePrompt(null);
    setUpgradeNotice(null);
    addLog('开始草稿转正与审计过程...', 'info');
    try {
      await startUpgradeDraft(bookId, draftModeResult.number, writeIntent || undefined);
    } catch (err: unknown) {
      addLog(`转正失败: ${err instanceof Error ? err.message : String(err)}`, 'error');
      setUpgradeLoading(false);
    }
  }

  async function handleUpgradeDraft() {
    if (!bookId || !draftModeResult || upgradeLoading) return;
    try {
      const truthFiles = (await fetchTruthFiles(bookId)) as TruthFilesSummary;
      if ((truthFiles.versionToken || 0) > draftModeResult.contextVersionToken) {
        setUpgradePrompt({ nextVersionToken: truthFiles.versionToken || 0 });
        return;
      }
    } catch {
      // preflight failed, proceed with caution
    }
    await runDraftUpgrade();
  }

  useEffect(() => {
    if (!flowMode) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFlowMode(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [flowMode]);

  const flowContent = draftResult?.content ?? draftModeResult?.content ?? null;
  const flowEntities = flowContent ? extractFlowEntities(flowContent, knownEntityNames) : [];

  if (flowMode && flowContent) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: '#1a1a2e' }}>
        <div className="max-w-3xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={() => setFlowMode(false)}
              className="text-sm text-slate-400 hover:text-slate-200 transition-colors"
            >
              ← 退出心流模式
            </button>
            <span className="text-xs text-slate-600">按 Esc 退出</span>
          </div>
          <div className="prose prose-sm max-w-none">
            {flowContent.split('\n').map((line, i) => (
              <p key={i} className="text-base leading-relaxed mb-2" style={{ color: '#e2e8f0' }}>
                {line ? (
                  <EntityHighlight
                    text={line}
                    entities={flowEntities}
                    highlightClass="border-b border-dashed border-amber-400/60 bg-transparent px-0 py-0"
                    onEntityEnter={(entity, event) => handleEntityEnter(entity, event)}
                    onEntityLeave={handleEntityLeave}
                  />
                ) : (
                  '\u00A0'
                )}
              </p>
            ))}
          </div>
          <ContextPopup
            title={popupContext?.name ?? ''}
            content={
              popupContext
                ? `当前位置：${popupContext.currentLocation}；情绪：${popupContext.emotion}。${
                    popupContext.inventory.length > 0
                      ? `持有：${popupContext.inventory.join('、')}。`
                      : ''
                  }`
                : ''
            }
            visible={popupVisible && popupContext !== null}
            tags={
              popupContext
                ? [popupContext.type, ...popupContext.activeHooks.map((hook) => hook.description)]
                : []
            }
            flowMode
            position={popupPosition}
          />
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Activity className="mr-2 h-4 w-4 animate-spin" />
        加载中…
      </div>
    );
  }

  if (!book) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="mx-auto h-12 w-12 text-destructive opacity-50 mb-4" />
        <h3 className="text-lg font-medium">请选择一本书</h3>
        <Link to="/" className="text-primary mt-4 inline-block hover:underline">
          返回仪表盘
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6 max-w-7xl pb-20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link to="/" className="hover:text-foreground">
            首页
          </Link>
          <ChevronRight size={14} />
          <Link to={`/book/${bookId}`} className="hover:text-foreground">
            {book.title}
          </Link>
          <ChevronRight size={14} />
          <span className="text-foreground font-medium">写作工作台</span>
        </div>
        <div className="flex items-center gap-2">
          {flowContent && (
            <button
              onClick={() => setFlowMode(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm border hover:bg-accent"
              title="进入心流模式"
            >
              <Zap size={14} />
              心流模式
            </button>
          )}
          <Link
            to={`/book/${bookId}`}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← 返回书籍详情
          </Link>
        </div>
      </div>

      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">写作工作台</h1>
        <p className="text-muted-foreground">
          在这里您可以快速试写、管理草稿并启动完整的创作流水线。
        </p>
      </header>

      {/* Enhanced Quality Dashboard */}
      <section className="rounded-lg border bg-card p-6 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <BarChart3 className="text-primary" size={20} />
            <h2 className="text-lg font-semibold">质量仪表盘</h2>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <DashboardCard
            label="生产进度"
            value={`${book.currentWords.toLocaleString()} 字`}
            icon={<Clock size={16} />}
            subtext={`${Math.round((book.currentWords / book.targetWords) * 100)}% 目标达成`}
          />
          <DashboardCard
            label="审计通过率"
            value={
              analytics?.auditRate.total
                ? `${Math.round((analytics.auditRate.passed / analytics.auditRate.total) * 100)}%`
                : '0%'
            }
            icon={<ShieldCheck size={16} />}
            subtext={`${analytics?.auditRate.passed ?? 0} 通过 / ${analytics?.auditRate.failed ?? 0} 拦截`}
          />
          <DashboardCard
            label="Token 消耗"
            value={`${((analytics?.tokens.total ?? 0) / 1000).toFixed(1)}k`}
            icon={<Cpu size={16} />}
            subtext={`${Math.round(((analytics?.tokens.completion ?? 0) / (analytics?.tokens.total ?? 1)) * 100)}% 为生成输出`}
          />
          <DashboardCard
            label="AI 痕迹评分"
            value={
              analytics?.aiTrace.score !== undefined
                ? `${Math.round(analytics.aiTrace.score * 100)}%`
                : '0%'
            }
            icon={<Zap size={16} />}
            subtext={analytics?.aiTrace.labels?.[0] || '表现自然'}
            valueClassName={
              analytics?.aiTrace.score && analytics.aiTrace.score > 0.7
                ? 'text-rose-500'
                : 'text-emerald-500'
            }
          />
        </div>
      </section>

      {/* Main Content Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-8 space-y-6">
          {/* Fast Draft Section */}
          <section className="rounded-lg border bg-card p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-6">
              <Zap className="text-yellow-500" size={20} />
              <h2 className="text-lg font-semibold">快速试写</h2>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 items-end mb-6">
              <div className="w-full sm:w-24">
                <label className="text-xs text-muted-foreground mb-1 block">目标字数</label>
                <input
                  type="number"
                  value={draftWordCount}
                  onChange={(e) => setDraftWordCount(parseInt(e.target.value, 10) || 800)}
                  className="w-full px-3 py-1.5 border rounded-md text-sm bg-transparent"
                  min={100}
                  max={5000}
                />
              </div>
              <div className="flex-1 w-full">
                <label className="text-xs text-muted-foreground mb-1 block">创作意图（可选）</label>
                <input
                  type="text"
                  value={draftIntent}
                  onChange={(e) => setDraftIntent(e.target.value)}
                  placeholder="输入简要意图，如「林晨在雨中告别」"
                  className="w-full px-3 py-1.5 border rounded-md text-sm bg-transparent"
                />
              </div>
              <button
                onClick={handleFastDraft}
                disabled={draftLoading}
                className="w-full sm:w-auto px-4 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                {draftLoading ? '试写中…' : '开始快速试写'}
              </button>
            </div>
            {draftResult && (
              <div className="rounded-md border bg-muted/30 p-4">
                <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4 pb-2 border-b">
                  <span>{draftResult.wordCount} 字</span>
                  <span>耗时 {(draftResult.elapsedMs / 1000).toFixed(1)}s</span>
                  <span>LLM 调用 {draftResult.llmCalls} 次</span>
                </div>
                <div className="prose prose-sm max-w-none text-foreground leading-relaxed">
                  {draftResult.content.split('\n').map((line, i) => (
                    <p key={i} className="mb-2">
                      {line ? (
                        <EntityHighlight
                          text={line}
                          entities={fastDraftEntities}
                          highlightClass="border-b border-dashed border-amber-400/60 bg-transparent px-0 py-0"
                          onEntityEnter={(entity, event) => handleEntityEnter(entity, event)}
                          onEntityLeave={handleEntityLeave}
                        />
                      ) : (
                        '\u00A0'
                      )}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Full Creation Section */}
          <section className="rounded-lg border bg-card p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-6">
              <BookOpen className="text-primary" size={20} />
              <h2 className="text-lg font-semibold">完整创作</h2>
            </div>
            <div className="space-y-4">
              {upgradeNotice && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 flex items-center gap-2">
                  <AlertCircle size={14} />
                  {upgradeNotice}
                </div>
              )}
              <div className="w-full">
                <label className="text-xs text-muted-foreground mb-1 block">创作意图（可选）</label>
                <textarea
                  value={writeIntent}
                  onChange={(e) => setWriteIntent(e.target.value)}
                  placeholder="输入更详细的创作指令，系统将整合所有真相文件生成正式章节。"
                  rows={3}
                  className="w-full px-3 py-2 border rounded-md text-sm bg-transparent resize-none focus:ring-1 focus:ring-primary outline-none"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleWriteNext}
                  disabled={pipelineLoading}
                  className="px-6 py-2 bg-primary text-primary-foreground rounded-md text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-all flex items-center gap-2"
                >
                  <Activity size={16} className={pipelineLoading ? 'animate-spin' : ''} />
                  {pipelineLoading ? '正在执行流水线…' : '开始完整创作'}
                </button>
                <button
                  onClick={handleWriteDraft}
                  disabled={draftModeLoading}
                  className="px-6 py-2 border rounded-md text-sm font-semibold hover:bg-accent disabled:opacity-50 transition-all flex items-center gap-2"
                >
                  <FileEdit size={16} />
                  {draftModeLoading ? '草稿生成中…' : '草稿模式'}
                </button>
              </div>

              {/* Real-time Pipeline Progress */}
              {pipeline && (
                <div className="mt-8 space-y-6 border rounded-lg p-5 bg-muted/10 animate-in fade-in duration-500">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 font-semibold">
                      <Terminal
                        size={14}
                        className={
                          pipeline.status === 'running' ? 'text-primary animate-pulse' : ''
                        }
                      />
                      <span className="uppercase tracking-wider">
                        流水线 {pipeline.pipelineId.split('-').pop()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                        {STAGE_LABELS[pipeline.currentStage] || pipeline.currentStage}
                      </span>
                      <span className="text-muted-foreground font-mono">
                        {Math.round(
                          ((pipeline.stages.indexOf(pipeline.currentStage) +
                            (pipeline.status === 'completed' ? 1 : 0)) /
                            pipeline.stages.length) *
                            100
                        )}
                        %
                      </span>
                    </div>
                  </div>

                  {/* Visual Progress Bar */}
                  <div className="relative h-2 bg-secondary/50 rounded-full overflow-hidden">
                    <div
                      className={`absolute h-full transition-all duration-700 ease-out ${pipeline.status === 'failed' ? 'bg-rose-500' : 'bg-primary'}`}
                      style={{
                        width: `${((pipeline.stages.indexOf(pipeline.currentStage) + (pipeline.status === 'completed' ? 1 : 0)) / pipeline.stages.length) * 100}%`,
                      }}
                    />
                  </div>

                  {/* Detailed Stage Steps */}
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                    {pipeline.stages.map((stage) => {
                      const info = pipeline.progress[stage];
                      const isActive = stage === pipeline.currentStage;
                      const isDone = info?.status === 'completed' || info?.status === 'done';
                      const isFailed = info?.status === 'failed';
                      return (
                        <div
                          key={stage}
                          className={`px-2 py-2 rounded text-[10px] text-center transition-all border flex flex-col items-center justify-center gap-1 ${
                            isDone
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                              : isFailed
                                ? 'bg-rose-50 text-rose-700 border-rose-100'
                                : isActive
                                  ? 'bg-amber-50 text-amber-700 border-amber-200 font-bold'
                                  : 'bg-muted/50 text-muted-foreground border-transparent'
                          }`}
                        >
                          {STAGE_LABELS[stage] || stage}
                          {isActive && pipeline.status === 'running' && (
                            <span className="w-1 h-1 bg-amber-500 rounded-full animate-ping" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Draft Mode Result Display */}
              {draftModeResult && (
                <div className="mt-8 rounded-lg border-2 border-amber-100 bg-amber-50/20 p-6 animate-in zoom-in-95 duration-300">
                  <div className="flex items-center justify-between mb-4 pb-2 border-b border-amber-100">
                    <div className="flex items-center gap-2 font-medium text-amber-900">
                      <FileEdit size={16} />
                      <span>第 {draftModeResult.number} 章 · 草稿预览</span>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">
                      未持久化
                    </span>
                  </div>
                  <div className="prose prose-sm max-w-none text-foreground leading-relaxed max-h-96 overflow-y-auto pr-4">
                    {draftModeResult.content.split('\n').map((line, i) => (
                      <p key={i} className="mb-2">
                        {line ? (
                          <EntityHighlight
                            text={line}
                            entities={draftModeEntities}
                            highlightClass="border-b border-dashed border-amber-400/60 bg-transparent px-0 py-0"
                            onEntityEnter={(entity, event) =>
                              handleEntityEnter(entity, event, draftModeResult.number)
                            }
                            onEntityLeave={handleEntityLeave}
                          />
                        ) : (
                          '\u00A0'
                        )}
                      </p>
                    ))}
                  </div>
                  <div className="mt-6 p-4 rounded-md bg-amber-100/30 border border-amber-200/50">
                    <div className="flex flex-col sm:flex-row items-center gap-4">
                      <button
                        onClick={handleUpgradeDraft}
                        disabled={upgradeLoading}
                        className="w-full sm:w-auto px-6 py-2 bg-primary text-primary-foreground rounded-md text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-all shadow-sm"
                      >
                        {upgradeLoading ? '转正执行中…' : '转为正式章节（启动审计）'}
                      </button>
                      <div className="text-xs text-amber-800/70 italic">
                        将刷新上下文事实，自动执行 33 维质量审计，修订后完成持久化。
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Sidebar Sections */}
        <div className="xl:col-span-4 space-y-6">
          {/* Quality Dashboard - 8 Dimension Progress Bars */}
          <section className="rounded-lg border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="text-primary" size={16} />
              <h3 className="text-sm font-semibold">质量仪表盘</h3>
            </div>
            <div className="space-y-2">
              {[
                { key: 'aiTrace' as const, label: 'AI痕迹', invert: true },
                { key: 'coherence' as const, label: '连贯性' },
                { key: 'pacing' as const, label: '节奏' },
                { key: 'dialogue' as const, label: '对话' },
                { key: 'description' as const, label: '描写' },
                { key: 'emotion' as const, label: '情感' },
                { key: 'creativity' as const, label: '创新' },
                { key: 'completeness' as const, label: '完整性' },
              ].map((d) => {
                const val = qualityMetrics[d.key];
                const displayVal = qualityPhase === 'done' ? `${Math.round(val * 100)}%` : '等待中';
                const pct = qualityPhase === 'done' ? val * 100 : 0;
                return (
                  <div key={d.key} className="flex items-center gap-2 text-xs">
                    <span className="w-14 shrink-0 text-muted-foreground">{d.label}</span>
                    <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          d.invert ? (pct > 30 ? 'bg-red-400' : 'bg-green-400') : 'bg-primary'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-10 shrink-0 text-right text-muted-foreground">
                      {displayVal}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Logs Panel */}
          <LogPanel logs={logs} onClear={() => setLogs([])} className="h-[500px]" />

          {/* Memory/Truth Files Preview */}
          <section className="rounded-lg border bg-card p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Brain className="text-primary" size={20} />
              <h2 className="text-lg font-semibold">记忆透视</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              {memoryPreview
                ? `从最新真相文件中抓取到 ${memoryPreview.summary.facts} 条事实, ${memoryPreview.summary.hooks} 个伏笔。`
                : '正在构建记忆词云…'}
            </p>
            <div className="bg-muted/30 rounded-lg p-4 border border-dashed h-64 flex items-center justify-center overflow-hidden">
              <MemoryWordcloud
                memories={memoryPreview?.memories ?? []}
                onMemoryEnter={(memory, event) => {
                  if (!memory.entityType) return;
                  handleEntityEnter(memory.text, event);
                }}
                onMemoryLeave={handleEntityLeave}
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="text-[10px] px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full border border-blue-100 flex items-center gap-1">
                角色 {memoryPreview?.summary.characters ?? 0}
              </span>
              <span className="text-[10px] px-2 py-0.5 bg-slate-50 text-slate-700 rounded-full border border-slate-100 flex items-center gap-1">
                事实 {memoryPreview?.summary.facts ?? 0}
              </span>
              <span className="text-[10px] px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full border border-amber-100 flex items-center gap-1">
                伏笔 {memoryPreview?.summary.hooks ?? 0}
              </span>
            </div>
          </section>
        </div>
      </div>

      {/* Upgrade Confirmation Modal */}
      {upgradePrompt && draftModeResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="w-full max-w-lg rounded-xl border bg-card p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-amber-600 mb-4">
              <AlertCircle size={24} />
              <h2 className="text-xl font-bold">世界状态已更新</h2>
            </div>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                该草稿生成后，真相文件已被修改（v{draftModeResult.contextVersionToken} → v
                {upgradePrompt.nextVersionToken}）。
              </p>
              <p>为了保持逻辑严密性，建议基于最新状态重新润色后再转正。</p>
            </div>
            <div className="mt-8 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setUpgradePrompt(null)}
                className="px-4 py-2 border rounded-md text-sm font-medium hover:bg-accent"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void runDraftUpgrade()}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 shadow-sm"
              >
                重新润色并继续
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Context Hover Popup */}
      <ContextPopup
        title={popupContext?.name ?? ''}
        content={
          popupContext
            ? `当前位置：${popupContext.currentLocation}；情绪：${popupContext.emotion}。${
                popupContext.inventory.length > 0
                  ? `持有：${popupContext.inventory.join('、')}。`
                  : ''
              }`
            : ''
        }
        visible={popupVisible && popupContext !== null}
        tags={
          popupContext
            ? [popupContext.type, ...popupContext.activeHooks.map((hook) => hook.description)]
            : []
        }
        position={popupPosition}
      />
    </div>
  );
}

function DashboardCard({
  label,
  value,
  icon,
  subtext,
  valueClassName = '',
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  subtext: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-lg border bg-background p-4 transition-all hover:border-primary/20 hover:shadow-sm">
      <div className="flex items-center gap-2 text-muted-foreground mb-1">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className={`text-2xl font-bold tracking-tight ${valueClassName}`}>{value}</p>
      <p className="text-[10px] text-muted-foreground mt-2 font-medium">{subtext}</p>
    </div>
  );
}
