import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Pencil,
  Check,
  X,
  FileSearch,
  Zap,
  AlertTriangle,
} from 'lucide-react';
import { fetchChapter, fetchAuditReport, updateChapter, runAudit } from '../lib/api';
import PollutionBadge from '../components/pollution-badge';

interface Chapter {
  number: number;
  title: string | null;
  content: string;
  status: 'draft' | 'published';
  wordCount: number;
  qualityScore: number | null;
  auditStatus: string | null;
  createdAt: string;
  updatedAt: string;
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

export default function ChapterReader() {
  const { bookId, chapterNumber } = useParams<{ bookId: string; chapterNumber: string }>();
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [flowMode, setFlowMode] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [auditReport, setAuditReport] = useState<AuditReport | null>(null);

  const chNum = chapterNumber ? parseInt(chapterNumber, 10) : 0;

  useEffect(() => {
    if (!bookId || !chapterNumber) return;
    fetchChapter(bookId, chNum)
      .then((data) => {
        setChapter(data);
        setEditContent(data.content);
      })
      .catch(() => setChapter(null))
      .finally(() => setLoading(false));
  }, [bookId, chapterNumber, chNum]);

  async function handleSave() {
    if (!bookId) return;
    try {
      const updated = await updateChapter(bookId, chNum, editContent);
      setChapter(updated);
      setEditMode(false);
    } catch {
      // save failed
    }
  }

  async function handleLoadAudit() {
    if (!bookId) return;
    try {
      const report = await fetchAuditReport(bookId, chNum);
      setAuditReport(report);
    } catch {
      // audit load failed
    }
  }

  async function handleRunAudit() {
    if (!bookId) return;
    try {
      const report = await runAudit(bookId, chNum);
      setAuditReport(report);
    } catch {
      // audit run failed
    }
  }

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

  // Flow mode: minimal UI, just content
  if (flowMode) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => setFlowMode(false)}
            className="text-sm text-muted-foreground hover:text-foreground"
            title="退出心流模式"
          >
            ← 退出心流模式
          </button>
        </div>
        <div className="prose prose-sm max-w-none">
          {editContent.split('\n').map((line, i) => (
            <p key={i} className="text-base leading-relaxed mb-2 text-foreground">
              {line || '\u00A0'}
            </p>
          ))}
        </div>
      </div>
    );
  }

  const isPolluted = chapter.qualityScore !== null && chapter.qualityScore < 50;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold">{chapter.title || `第 ${chapter.number} 章`}</h1>
          {chapter.status === 'draft' && (
            <span className="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700">
              草稿
            </span>
          )}
          {isPolluted && (
            <PollutionBadge
              level={chapter.qualityScore < 30 ? 'high' : 'medium'}
              contaminationScore={1 - (chapter.qualityScore ?? 0) / 100}
              source="AI检测"
            />
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditMode(!editMode)}
            className="p-1.5 rounded-md hover:bg-accent"
            title="编辑"
          >
            {editMode ? <X size={16} /> : <Pencil size={16} />}
          </button>
          <button
            onClick={() => {
              setShowAudit(!showAudit);
              if (!showAudit && !auditReport) handleLoadAudit();
            }}
            className="p-1.5 rounded-md hover:bg-accent"
            title="审计报告"
          >
            <FileSearch size={16} />
          </button>
          <button
            onClick={() => setFlowMode(true)}
            className="p-1.5 rounded-md hover:bg-accent"
            title="心流模式"
          >
            <Zap size={16} />
          </button>
        </div>
      </div>

      {/* Metadata */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>{chapter.wordCount.toLocaleString()} 字</span>
        <span>更新于 {new Date(chapter.updatedAt).toLocaleString('zh-CN')}</span>
      </div>

      {/* Edit controls */}
      {editMode && (
        <div className="flex gap-2">
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
      {isPolluted && (
        <div className="rounded-lg border border-orange-300 bg-orange-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="text-orange-600 mt-0.5" />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <PollutionBadge
                  level={chapter.qualityScore < 30 ? 'high' : 'medium'}
                  contaminationScore={1 - (chapter.qualityScore ?? 0) / 100}
                  source="AI检测"
                />
              </div>
              <p className="text-sm text-orange-700">
                本章节 AI 痕迹评分较低（{chapter.qualityScore}
                分），已处于隔离状态。建议进行人工审校或运行质量审计。
              </p>
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
          {auditReport ? (
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
              {auditReport.tiers.warning.failed > 0 && (
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
              {auditReport.radarScores.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium mb-3">维度评分</h3>
                  <div className="space-y-2">
                    {auditReport.radarScores.map((radar) => (
                      <div key={radar.dimension} className="flex items-center gap-3">
                        <span className="text-sm w-20">{radar.label}</span>
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
    </div>
  );
}

function TierSummary({
  label,
  data,
  color,
}: {
  label: string;
  data: { total: number; passed: number; failed: number };
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
