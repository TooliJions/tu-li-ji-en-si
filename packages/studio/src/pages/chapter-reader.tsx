import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Pencil,
  Check,
  X,
  FileSearch,
  Zap,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import {
  fetchAuditReport,
  fetchChapter,
  fetchChapterSnapshots,
  fetchEntityContext,
  rollbackChapter,
  runAudit,
  updateChapter,
} from '../lib/api';
import ContextPopup from '../components/context-popup';
import EntityHighlight from '../components/entity-highlight';
import PollutionBadge from '../components/pollution-badge';
import TimeDial from '../components/time-dial';
import RadarChart from '../components/radar-chart';
import { extractFlowEntities } from '../lib/entity-context';

interface Chapter {
  number: number;
  title: string | null;
  content: string;
  status: 'draft' | 'published';
  wordCount: number;
  qualityScore: number | null;
  aiTraceScore?: number | null;
  auditStatus: string | null;
  auditReport?: AuditReport | null;
  warningCode?: string | null;
  warning?: string | null;
  isPolluted?: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ChapterSnapshot {
  id: string;
  chapter: number;
  label: string;
  timestamp: string;
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

function getChapterPollutionState(chapter: Chapter) {
  if (chapter.warningCode === 'accept_with_warnings') {
    return {
      isPolluted: true,
      level: 'high' as const,
      contaminationScore: 0.95,
      source: '降级结果',
      message: chapter.warning ?? '修订次数用尽，系统已按 accept_with_warnings 降级接受结果。',
    };
  }

  if (chapter.qualityScore !== null && chapter.qualityScore < 50) {
    return {
      isPolluted: true,
      level: chapter.qualityScore < 30 ? ('high' as const) : ('medium' as const),
      contaminationScore: 1 - chapter.qualityScore / 100,
      source: 'AI检测',
      message: `本章节 AI 痕迹评分较低（${chapter.qualityScore}分），建议人工审校。`,
    };
  }

  return {
    isPolluted: false,
    level: 'low' as const,
    contaminationScore: 0,
    source: 'AI检测',
    message: '',
  };
}

interface AuditReport {
  chapterNumber: number;
  overallStatus: string;
  tiers: {
    blocker: {
      total: number;
      passed: number;
      failed: number;
      items: { rule: string; severity: string; message: string }[];
    };
    warning: {
      total: number;
      passed: number;
      failed: number;
      items: { rule: string; severity: string; message: string }[];
    };
    suggestion: {
      total: number;
      passed: number;
      failed: number;
      items: { rule: string; severity: string; message: string }[];
    };
  };
  radarScores: { dimension: string; label: string; score: number }[];
}

function getAuditIssueCount(report: AuditReport | null | undefined): number {
  if (!report || !report.tiers) {
    return 0;
  }

  return (
    (report.tiers.blocker?.failed || 0) +
    (report.tiers.warning?.failed || 0) +
    (report.tiers.suggestion?.failed || 0)
  );
}

function getAuditIssueItems(report: AuditReport | null | undefined) {
  if (!report || !report.tiers) {
    return [];
  }

  return [
    ...(report.tiers.blocker?.items || []),
    ...(report.tiers.warning?.items || []),
    ...(report.tiers.suggestion?.items || []),
  ];
}

function getAiTraceDisplay(chapter: Chapter, report: AuditReport | null | undefined): string {
  if (typeof chapter.aiTraceScore === 'number') {
    return `${(chapter.aiTraceScore * 100).toFixed(1)}%`;
  }

  const radarAiTrace = report?.radarScores.find((item) => item.dimension === 'ai_trace');
  if (radarAiTrace) {
    return `${(radarAiTrace.score * 100).toFixed(1)}%`;
  }

  return '待审计';
}

function getChapterStatusLabel(chapter: Chapter): string {
  if (chapter.warningCode === 'accept_with_warnings') {
    return '强制通过';
  }

  if (chapter.status === 'draft') {
    return '草稿';
  }

  if (chapter.auditStatus === 'passed') {
    return '审计通过';
  }

  if (chapter.auditStatus === 'needs_revision') {
    return '待修订';
  }

  return '已完成';
}

function getAuditStatusSummary(chapter: Chapter, report: AuditReport | null | undefined): string {
  const issueCount = getAuditIssueCount(report);
  if (issueCount > 0) {
    return `${issueCount} 个问题`;
  }

  if (chapter.auditStatus === 'passed') {
    return '通过';
  }

  if (report) {
    return report.overallStatus === 'passed' ? '通过' : '需改进';
  }

  return '未审计';
}

function SidebarMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  );
}

export default function ChapterReader() {
  const { bookId, chapterNumber } = useParams<{ bookId: string; chapterNumber: string }>();
  const navigate = useNavigate();
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [flowMode, setFlowMode] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [auditReport, setAuditReport] = useState<AuditReport | null>(null);
  const [snapshots, setSnapshots] = useState<ChapterSnapshot[]>([]);
  const [timeDialOpen, setTimeDialOpen] = useState(false);
  const [popupVisible, setPopupVisible] = useState(false);
  const [popupContext, setPopupContext] = useState<EntityContext | null>(null);
  const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 });
  const [contextCache, setContextCache] = useState<Record<string, EntityContext>>({});
  const [saveError, setSaveError] = useState<string | null>(null);

  const chNum = chapterNumber ? parseInt(chapterNumber, 10) : 0;

  useEffect(() => {
    if (!bookId || !chapterNumber) return;
    fetchChapter(bookId, chNum)
      .then((data) => {
        setChapter(data);
        setEditContent(data.content);
        setAuditReport(data.auditReport ?? null);
      })
      .catch(() => setChapter(null))
      .finally(() => setLoading(false));
  }, [bookId, chapterNumber, chNum]);

  const flowEntities = chapter ? extractFlowEntities(chapter.content, [chapter.title ?? '']) : [];

  async function handleSave() {
    if (!bookId) return;
    try {
      const updated = await updateChapter(bookId, chNum, editContent);
      setChapter(updated);
      setAuditReport(updated.auditReport ?? null);
      setEditMode(false);
      setSaveError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '保存失败，请重试';
      console.error('[chapter-reader] save failed:', msg);
      setSaveError(msg);
    }
  }

  async function handleLoadAudit() {
    if (!bookId) return;
    try {
      const report = await fetchAuditReport(bookId, chNum);
      setAuditReport(report);
      setChapter((current) => (current ? { ...current, auditReport: report } : current));
      setSaveError(null);
    } catch (err) {
      console.error(
        '[chapter-reader] load audit failed:',
        err instanceof Error ? err.message : 'unknown',
      );
    }
  }

  async function handleRunAudit() {
    if (!bookId) return;
    try {
      const report = await runAudit(bookId, chNum);
      setAuditReport(report);
      setChapter((current) =>
        current
          ? {
              ...current,
              auditStatus: report.overallStatus,
              auditReport: report,
            }
          : current,
      );
      setSaveError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '审计失败，请重试';
      console.error('[chapter-reader] run audit failed:', msg);
      setSaveError(msg);
    }
  }

  async function openRollbackDial() {
    if (!bookId) return;
    const snapshotList = await fetchChapterSnapshots(bookId, chNum);
    setSnapshots(snapshotList);
    setTimeDialOpen(true);
  }

  async function handleRollbackConfirm(snapshotId: string) {
    if (!bookId) return;
    const ok = await rollbackChapter(bookId, chNum, snapshotId);
    if (ok) {
      const refreshed = await fetchChapter(bookId, chNum);
      setChapter(refreshed);
      setEditContent(refreshed.content);
      setAuditReport(refreshed.auditReport ?? null);
    }
    setTimeDialOpen(false);
    setSnapshots([]);
  }

  async function handleEntityEnter(entity: string, event: React.MouseEvent<HTMLElement>) {
    if (!bookId) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    setPopupPosition({ x: rect.left, y: rect.bottom + 8 });
    setPopupVisible(true);

    if (contextCache[entity]) {
      setPopupContext(contextCache[entity]);
      return;
    }

    try {
      const context = await fetchEntityContext(bookId, entity, chNum);
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

  // Flow mode keyboard handler — must be before early returns
  useEffect(() => {
    if (!flowMode) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFlowMode(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [flowMode]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">加载中…</div>
    );
  }

  if (!chapter) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">章节不存在</p>
        <Link to={`/book/${bookId}`} className="text-primary mt-4 inline-block">
          返回书籍详情
        </Link>
      </div>
    );
  }

  // Flow mode: full-screen dark overlay
  if (flowMode) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: '#1a1a2e' }}>
        <div className="max-w-3xl mx-auto px-6 py-8 relative">
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={() => setFlowMode(false)}
              className="text-sm text-slate-400 hover:text-slate-200 transition-colors"
              title="退出心流模式 (Esc)"
            >
              ← 退出心流模式
            </button>
            <div className="flex items-center gap-3">
              <Link
                to={`/book/${bookId}/chapter/${Math.max(1, chNum - 1)}`}
                className="text-sm text-slate-400 hover:text-slate-200"
                title="上一章"
              >
                ◀ 上一章
              </Link>
              <Link
                to={`/book/${bookId}/chapter/${chNum + 1}`}
                className="text-sm text-slate-400 hover:text-slate-200"
                title="下一章"
              >
                下一章 ▶
              </Link>
              <span className="text-xs text-slate-600">Esc 退出</span>
            </div>
          </div>
          <div className="prose prose-sm max-w-none">
            {editContent.split('\n').map((line, i) => (
              <p key={i} className="text-base leading-relaxed mb-2" style={{ color: '#e2e8f0' }}>
                {line ? (
                  <EntityHighlight
                    text={line}
                    entities={flowEntities}
                    highlightClass="border-b border-dashed border-amber-400/60 bg-transparent px-0 py-0"
                    onEntityEnter={handleEntityEnter}
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

  const pollution = getChapterPollutionState(chapter);
  const prevChapter = chNum > 1 ? { number: chNum - 1 } : null;
  const nextChapter = chapter.number < 1000 ? { number: chNum + 1 } : null;
  const effectiveAuditReport = auditReport ?? chapter.auditReport ?? null;
  const auditIssueCount = getAuditIssueCount(effectiveAuditReport);
  const auditIssueItems = getAuditIssueItems(effectiveAuditReport);
  const aiTraceDisplay = getAiTraceDisplay(chapter, effectiveAuditReport);
  const chapterStatusLabel = getChapterStatusLabel(chapter);
  const auditStatusSummary = getAuditStatusSummary(chapter, effectiveAuditReport);

  return (
    <div className="space-y-4">
      {/* Top navigation */}
      <div className="flex items-center justify-between mb-4">
        <button
          disabled={!prevChapter}
          onClick={() => prevChapter && navigate(`/book/${bookId}/chapter/${prevChapter.number}`)}
          className={`inline-flex items-center gap-1 text-sm ${prevChapter ? 'text-muted-foreground hover:text-foreground' : 'text-gray-300 cursor-not-allowed'}`}
        >
          ◀ 上一章
        </button>
        <h1 className="text-lg font-semibold">
          <span className="text-muted-foreground font-normal">第{chapter.number}章 · </span>
          {chapter.title}
        </h1>
        <button
          disabled={!nextChapter}
          onClick={() => nextChapter && navigate(`/book/${bookId}/chapter/${nextChapter.number}`)}
          className={`inline-flex items-center gap-1 text-sm ${nextChapter ? 'text-muted-foreground hover:text-foreground' : 'text-gray-300 cursor-not-allowed'}`}
        >
          下一章 ▶
        </button>
      </div>

      {/* Two-column layout */}
      <div className="flex gap-4">
        {/* Left sidebar */}
        <aside className="w-64 border-r pr-4 space-y-4 flex-shrink-0">
          <h2 className="font-semibold">第{chapter.number}章</h2>
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <SidebarMetric label="字数" value={`${chapter.wordCount.toLocaleString()} 字`} />
            <SidebarMetric label="状态" value={chapterStatusLabel} />
            <SidebarMetric label="审计" value={auditStatusSummary} />
            <SidebarMetric label="AI痕迹" value={aiTraceDisplay} />
            {chapter.qualityScore !== null && (
              <SidebarMetric label="质量分" value={String(chapter.qualityScore)} />
            )}
            <SidebarMetric
              label="更新于"
              value={new Date(chapter.updatedAt).toLocaleString('zh-CN')}
            />
          </div>

          {effectiveAuditReport && (
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-medium">审计摘要</h3>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    effectiveAuditReport.overallStatus === 'passed'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {effectiveAuditReport.overallStatus === 'passed' ? '通过' : '需改进'}
                </span>
              </div>
              <SidebarMetric
                label="阻断/警告"
                value={`${effectiveAuditReport?.tiers?.blocker?.failed || 0}/${effectiveAuditReport?.tiers?.warning?.failed || 0}`}
              />
              <SidebarMetric
                label="建议"
                value={`${effectiveAuditReport?.tiers?.suggestion?.failed || 0}`}
              />
            </div>
          )}
        </aside>

        {/* Right content */}
        <div className="flex-1 min-w-0">
          {/* Action toolbar */}
          {!editMode && (
            <div className="flex flex-wrap gap-2 mb-3">
              <Link
                to={`/book/${bookId}`}
                className="inline-flex items-center gap-1 px-3 py-1.5 border rounded-md text-sm hover:bg-accent"
                title="返回书籍详情"
              >
                <ArrowLeft size={14} />
                返回书籍详情
              </Link>
              <button
                onClick={() => setEditMode(true)}
                className="inline-flex items-center gap-1 px-3 py-1.5 border rounded-md text-sm hover:bg-accent"
                title="编辑"
              >
                <Pencil size={14} />
                编辑本章
              </button>
              <button
                onClick={() => {
                  setShowAudit(!showAudit);
                  if (!showAudit && !auditReport) handleLoadAudit();
                }}
                className="inline-flex items-center gap-1 px-3 py-1.5 border rounded-md text-sm hover:bg-accent"
                title="审计报告"
              >
                <FileSearch size={14} />
                审计报告
              </button>
              <button
                onClick={() => {
                  setShowAudit(true);
                  void handleRunAudit();
                }}
                className="inline-flex items-center gap-1 px-3 py-1.5 border rounded-md text-sm hover:bg-accent"
                title="重新审计"
              >
                <FileSearch size={14} />
                重新审计
              </button>
              <button
                onClick={() => {
                  void openRollbackDial();
                }}
                className="inline-flex items-center gap-1 px-3 py-1.5 border rounded-md text-sm hover:bg-accent"
                title="回滚到此"
              >
                <RotateCcw size={14} />
                回滚到此
              </button>
              <button
                onClick={() => setFlowMode(true)}
                className="inline-flex items-center gap-1 px-3 py-1.5 border rounded-md text-sm hover:bg-accent"
                title="心流模式"
              >
                <Zap size={14} />
                心流模式
              </button>
            </div>
          )}

          {/* Error banner */}
          {saveError && (
            <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm flex items-center justify-between">
              <span>{saveError}</span>
              <button
                onClick={() => setSaveError(null)}
                className="ml-2 text-red-400 hover:text-red-600"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {(effectiveAuditReport || pollution.isPolluted) && !editMode && (
            <section className="mb-3 rounded-lg border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold">章节状态概览</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {pollution.isPolluted
                      ? '当前章节已进入污染隔离或降级接受状态。'
                      : '当前章节已生成审计摘要，可直接复核关键问题。'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-secondary px-2.5 py-1 text-xs text-foreground">
                    状态: {chapterStatusLabel}
                  </span>
                  <span className="rounded-full bg-secondary px-2.5 py-1 text-xs text-foreground">
                    审计: {auditStatusSummary}
                  </span>
                  <span className="rounded-full bg-secondary px-2.5 py-1 text-xs text-foreground">
                    AI痕迹: {aiTraceDisplay}
                  </span>
                </div>
              </div>

              {auditIssueItems.length > 0 && (
                <div className="mt-4 space-y-2">
                  {auditIssueItems.slice(0, 3).map((item, index) => (
                    <div
                      key={`${item.rule}-${index}`}
                      className="rounded-md border bg-muted/30 p-3"
                    >
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs ${
                            item.severity === 'blocker'
                              ? 'bg-red-100 text-red-700'
                              : item.severity === 'warning'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-green-100 text-green-700'
                          }`}
                        >
                          {item.severity === 'blocker'
                            ? '阻断'
                            : item.severity === 'warning'
                              ? '警告'
                              : '建议'}
                        </span>
                        <span>{item.rule}</span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{item.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Edit controls */}
          {editMode && (
            <div className="flex gap-2 mb-3">
              <button
                onClick={handleSave}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90"
                title="保存"
              >
                <Check size={14} />
                保存
              </button>
              <button
                onClick={() => {
                  setEditMode(false);
                  setEditContent(chapter.content);
                }}
                className="inline-flex items-center gap-1 px-3 py-1.5 border rounded-md text-sm hover:bg-accent"
                title="取消"
              >
                <X size={14} />
                取消
              </button>
            </div>
          )}

          {/* Pollution warning banner */}
          {pollution.isPolluted && (
            <div
              className="rounded-lg border p-4"
              style={{
                borderColor: '#FF8C00',
                backgroundColor: 'rgba(255,140,0,0.05)',
                backgroundImage:
                  'repeating-linear-gradient(135deg, rgba(255,140,0,0.08), rgba(255,140,0,0.08) 8px, transparent 8px, transparent 16px)',
              }}
            >
              <div className="flex items-start gap-3">
                <AlertTriangle size={20} style={{ color: '#FF8C00' }} className="mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <PollutionBadge
                      level={pollution.level}
                      contaminationScore={pollution.contaminationScore}
                      source={pollution.source}
                    />
                    {chapter.warningCode === 'accept_with_warnings' && (
                      <span className="text-xs text-amber-700 font-medium">⚠ 强制通过</span>
                    )}
                  </div>
                  <p className="text-sm font-medium" style={{ color: '#FF8C00' }}>
                    污染隔离已启用
                  </p>
                  <p className="text-sm mt-1" style={{ color: '#CC7000' }}>
                    {pollution.message}
                  </p>
                  <div className="mt-3">
                    <button
                      onClick={openRollbackDial}
                      className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-white"
                      style={{
                        borderColor: '#FF8C00',
                        backgroundColor: 'rgba(255,255,255,0.8)',
                        color: '#FF8C00',
                      }}
                    >
                      <RotateCcw size={14} />
                      回滚到此
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Content */}
          <div className="rounded-lg border bg-card p-6">
            {editMode ? (
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full min-h-[400px] p-4 font-mono text-sm leading-relaxed bg-transparent border-0 focus:outline-none resize-y"
              />
            ) : (
              <div className="prose prose-sm max-w-none">
                {chapter.content.split('\n').map((line, i) => (
                  <p key={i} className="text-base leading-relaxed mb-2 text-foreground">
                    {line || '\u00A0'}
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* Audit Report Panel */}
          {showAudit && (
            <div className="rounded-lg border bg-card p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">审计报告</h2>
                <button onClick={handleRunAudit} className="text-sm text-primary hover:underline">
                  运行审计
                </button>
              </div>
              {auditReport?.tiers ? (
                <div className="space-y-4">
                  {/* Overall status */}
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs ${
                        auditReport.overallStatus === 'passed'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {auditReport.overallStatus === 'passed' ? '通过' : '需改进'}
                    </span>
                  </div>

                  {/* Tier summaries */}
                  <div className="grid grid-cols-3 gap-4">
                    <TierSummary label="阻断级" data={auditReport.tiers.blocker} color="red" />
                    <TierSummary label="警告级" data={auditReport.tiers.warning} color="amber" />
                    <TierSummary label="建议级" data={auditReport.tiers.suggestion} color="green" />
                  </div>

                  {/* Failed items */}
                  {auditReport?.tiers?.warning?.failed > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium text-amber-700">警告项</h3>
                      {auditReport.tiers.warning.items.map((item, i) => (
                        <div
                          key={i}
                          className="text-sm p-3 rounded bg-amber-50 border border-amber-200"
                        >
                          <span className="font-medium">{item.rule}</span>
                          <p className="text-muted-foreground mt-1">{item.message}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Radar scores */}
                  {auditReport?.radarScores?.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center border-t pt-6 mt-6">
                      <div>
                        <h3 className="text-sm font-medium mb-4">质量雷达图</h3>
                        <RadarChart data={auditReport.radarScores} size={240} className="mx-auto" />
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-sm font-medium mb-4">详细维度评分</h3>
                        {auditReport.radarScores.map((radar) => (
                          <div key={radar.dimension} className="flex items-center gap-3">
                            <span className="text-sm w-20 truncate" title={radar.label}>
                              {radar.label}
                            </span>
                            <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                              <div
                                className="h-full bg-primary rounded-full transition-all"
                                style={{ width: `${radar.score * 100}%` }}
                              />
                            </div>
                            <span className="text-sm text-muted-foreground w-12 text-right">
                              {(radar.score * 100).toFixed(0)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">暂无审计报告</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Chapter Navigation */}
      <div className="flex items-center justify-between">
        <Link
          to={`/book/${bookId}/chapter/${Math.max(1, chNum - 1)}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          title="上一章"
        >
          <ArrowLeft size={14} />
          上一章
        </Link>
        <Link
          to={`/book/${bookId}/chapter/${chNum + 1}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          title="下一章"
        >
          下一章
          <ArrowRight size={14} />
        </Link>
      </div>

      <TimeDial
        open={timeDialOpen}
        snapshots={snapshots}
        currentChapter={chNum}
        onConfirm={handleRollbackConfirm}
        onClose={() => {
          setTimeDialOpen(false);
          setSnapshots([]);
        }}
      />
    </div>
  );
}

function TierSummary({
  label,
  data,
  color,
}: {
  label: string;
  data?: { total: number; passed: number; failed: number } | null;
  color: string;
}) {
  const bgClass =
    color === 'red'
      ? 'bg-red-50 border-red-200'
      : color === 'amber'
        ? 'bg-amber-50 border-amber-200'
        : 'bg-green-50 border-green-200';
  const textClass =
    color === 'red' ? 'text-red-700' : color === 'amber' ? 'text-amber-700' : 'text-green-700';

  if (!data) {
    return (
      <div className={`rounded border p-3 ${bgClass}`}>
        <p className={`text-sm font-medium ${textClass}`}>{label}</p>
        <p className="text-2xl font-bold mt-1">0/0</p>
      </div>
    );
  }

  return (
    <div className={`rounded border p-3 ${bgClass}`}>
      <p className={`text-sm font-medium ${textClass}`}>{label}</p>
      <p className="text-2xl font-bold mt-1">
        {data.passed}/{data.total}
      </p>
      {data.failed > 0 && <p className={`text-xs ${textClass} mt-1`}>{data.failed} 项未通过</p>}
    </div>
  );
}
