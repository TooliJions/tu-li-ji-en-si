import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  ChevronRight,
  FileText,
  Info,
  LoaderCircle,
  RefreshCw,
  Shield,
  XCircle,
} from 'lucide-react';
import { fetchAuditReport, fetchBooks, fetchChapters, runAudit } from '../lib/api';

interface Book {
  id: string;
  title: string;
  genre: string;
  chapterCount: number;
}

interface Chapter {
  number: number;
  title: string | null;
  status: string;
  wordCount: number;
}

interface AuditIssue {
  id: string;
  description: string;
  tier: 'blocker' | 'warning' | 'suggestion';
  category: string;
  suggestion: string;
  location?: string;
}

interface AuditReport {
  draftId: string;
  scoreSummary?: { overall?: number; dimensions?: Record<string, number> };
  blockerIssues?: AuditIssue[];
  warningIssues?: AuditIssue[];
  suggestionIssues?: AuditIssue[];
  repairActions?: Array<{
    type: string;
    targetIssueIds: string[];
    description: string;
  }>;
  finalDecision?: 'pass' | 'warning' | 'fail' | 'pending';
}

const TIER_ICONS = {
  blocker: <XCircle className="h-5 w-5 text-red-500" />,
  warning: <AlertTriangle className="h-5 w-5 text-amber-500" />,
  suggestion: <Info className="h-5 w-5 text-blue-500" />,
};

const TIER_LABELS = {
  blocker: '阻断',
  warning: '警告',
  suggestion: '建议',
};

const DECISION_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pass: {
    label: '通过',
    color: 'text-green-600 bg-green-50 border-green-200',
    icon: <CheckCircle className="h-5 w-5" />,
  },
  warning: {
    label: '警告通过',
    color: 'text-amber-600 bg-amber-50 border-amber-200',
    icon: <AlertTriangle className="h-5 w-5" />,
  },
  fail: {
    label: '未通过',
    color: 'text-red-600 bg-red-50 border-red-200',
    icon: <XCircle className="h-5 w-5" />,
  },
  pending: {
    label: '待审计',
    color: 'text-gray-600 bg-gray-50 border-gray-200',
    icon: <LoaderCircle className="h-5 w-5" />,
  },
};

export default function QualityGate() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedBookId = searchParams.get('bookId') || '';
  const requestedChapter = Number(searchParams.get('chapter') || '1');

  const [books, setBooks] = useState<Book[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedBookId, setSelectedBookId] = useState(requestedBookId);
  const [selectedChapter, setSelectedChapter] = useState(requestedChapter);
  const [auditReport, setAuditReport] = useState<AuditReport | null>(null);
  const [auditing, setAuditing] = useState(false);

  useEffect(() => {
    fetchBooks()
      .then((data) => {
        setBooks(data);
        const defaultBookId = requestedBookId || data[0]?.id || '';
        setSelectedBookId(defaultBookId);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : '加载书籍失败');
      })
      .finally(() => setLoading(false));
  }, [requestedBookId]);

  useEffect(() => {
    if (!selectedBookId) {
      setChapters([]);
      return;
    }
    fetchChapters(selectedBookId)
      .then((data) => {
        setChapters(data);
        const exists = data.some((c: Chapter) => c.number === selectedChapter);
        if (!exists && data.length > 0) {
          setSelectedChapter(data[0].number);
        }
      })
      .catch(() => setChapters([]));
  }, [selectedBookId, selectedChapter]);

  useEffect(() => {
    if (!selectedBookId || !selectedChapter) {
      setAuditReport(null);
      return;
    }
    loadAuditReport(selectedBookId, selectedChapter);
  }, [selectedBookId, selectedChapter]);

  async function loadAuditReport(bookId: string, chapterNumber: number) {
    setError(null);
    try {
      const report = await fetchAuditReport(bookId, chapterNumber);
      setAuditReport(report);
    } catch {
      setAuditReport(null);
    }
  }

  async function handleRunAudit() {
    if (!selectedBookId || !selectedChapter) return;
    setAuditing(true);
    setError(null);
    try {
      const report = await runAudit(selectedBookId, selectedChapter);
      setAuditReport(report);
    } catch (err) {
      setError(err instanceof Error ? err.message : '审计失败');
    } finally {
      setAuditing(false);
    }
  }

  const decision = auditReport?.finalDecision ?? 'pending';
  const decisionConfig = DECISION_CONFIG[decision] ?? DECISION_CONFIG.pending;

  const allIssues: Array<AuditIssue & { originalTier: string }> = useMemo(() => {
    if (!auditReport) return [];
    return [
      ...(auditReport.blockerIssues ?? []).map((i) => ({ ...i, originalTier: 'blocker' as const })),
      ...(auditReport.warningIssues ?? []).map((i) => ({ ...i, originalTier: 'warning' as const })),
      ...(auditReport.suggestionIssues ?? []).map((i) => ({
        ...i,
        originalTier: 'suggestion' as const,
      })),
    ];
  }, [auditReport]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoaderCircle className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6" />
            质量检查
          </h1>
          <p className="mt-1 text-sm text-gray-500">审计章节质量，阻断不合格内容进入导出阶段</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Link to="/" className="hover:text-gray-700">
            首页
          </Link>
          <ChevronRight className="h-4 w-4" />
          <span>质量检查</span>
        </div>
      </div>

      {/* Book / Chapter Selector */}
      <div className="flex flex-wrap gap-4 rounded-lg border bg-white p-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500">书籍</label>
          <select
            className="rounded border px-3 py-2 text-sm"
            value={selectedBookId}
            onChange={(e) => {
              setSelectedBookId(e.target.value);
              setSearchParams({ bookId: e.target.value, chapter: String(selectedChapter) });
            }}
          >
            {books.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500">章节</label>
          <select
            className="rounded border px-3 py-2 text-sm"
            value={selectedChapter}
            onChange={(e) => {
              const num = Number(e.target.value);
              setSelectedChapter(num);
              setSearchParams({ bookId: selectedBookId, chapter: String(num) });
            }}
          >
            {chapters.map((c) => (
              <option key={c.number} value={c.number}>
                第 {c.number} 章 {c.title ? `· ${c.title}` : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="ml-auto flex items-end">
          <button
            onClick={handleRunAudit}
            disabled={auditing || !selectedBookId || !selectedChapter}
            className="flex items-center gap-2 rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {auditing ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {auditing ? '审计中…' : '重新审计'}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        </div>
      )}

      {/* Audit Report */}
      {auditReport ? (
        <div className="space-y-4">
          {/* Decision Banner */}
          <div className={`flex items-center gap-3 rounded-lg border p-4 ${decisionConfig.color}`}>
            {decisionConfig.icon}
            <div>
              <div className="font-semibold">{decisionConfig.label}</div>
              <div className="text-sm opacity-80">
                {allIssues.length > 0
                  ? `共发现 ${allIssues.length} 个问题（阻断 ${auditReport.blockerIssues?.length ?? 0} / 警告 ${auditReport.warningIssues?.length ?? 0} / 建议 ${auditReport.suggestionIssues?.length ?? 0}）`
                  : '未发现质量问题'}
              </div>
            </div>
            <div className="ml-auto text-right">
              <div className="text-2xl font-bold">
                {Math.round((auditReport.scoreSummary?.overall ?? 0) * 100)}分
              </div>
              <div className="text-xs opacity-70">综合得分</div>
            </div>
          </div>

          {/* Issues List */}
          {allIssues.length > 0 && (
            <div className="rounded-lg border bg-white">
              <div className="border-b px-4 py-3 font-medium">审计详情</div>
              <div className="divide-y">
                {allIssues.map((issue) => (
                  <div key={issue.id} className="px-4 py-3">
                    <div className="flex items-start gap-3">
                      {TIER_ICONS[issue.originalTier as keyof typeof TIER_ICONS]}
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{issue.description}</span>
                          <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600">
                            {issue.category}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              issue.originalTier === 'blocker'
                                ? 'bg-red-100 text-red-600'
                                : issue.originalTier === 'warning'
                                  ? 'bg-amber-100 text-amber-600'
                                  : 'bg-blue-100 text-blue-600'
                            }`}
                          >
                            {TIER_LABELS[issue.originalTier as keyof typeof TIER_LABELS]}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-gray-500">{issue.suggestion}</p>
                        {issue.location && (
                          <p className="mt-0.5 text-xs text-gray-400">位置：{issue.location}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Repair Actions */}
          {(auditReport.repairActions?.length ?? 0) > 0 && (
            <div className="rounded-lg border bg-white">
              <div className="border-b px-4 py-3 font-medium">修复建议</div>
              <div className="divide-y">
                {auditReport.repairActions!.map((action, idx) => (
                  <div key={idx} className="flex items-start gap-3 px-4 py-3">
                    <FileText className="mt-0.5 h-4 w-4 text-gray-400" />
                    <div>
                      <div className="text-sm font-medium">{action.description}</div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        策略：{action.type} · 关联问题：{action.targetIssueIds.join(', ') || '无'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Dimension Scores */}
          {auditReport.scoreSummary?.dimensions &&
            Object.keys(auditReport.scoreSummary.dimensions).length > 0 && (
              <div className="rounded-lg border bg-white">
                <div className="border-b px-4 py-3 font-medium">维度得分</div>
                <div className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-3 md:grid-cols-4">
                  {Object.entries(auditReport.scoreSummary.dimensions).map(([dim, score]) => (
                    <div key={dim} className="text-center">
                      <div className="text-lg font-semibold">
                        {Math.round((score as number) * 100)}
                      </div>
                      <div className="text-xs text-gray-500">{dim}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3">
            <Link
              to={`/chapter-plans?bookId=${selectedBookId}`}
              className="rounded border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              退回细纲
            </Link>
            {decision !== 'fail' && decision !== 'pending' && (
              <Link
                to={`/export?bookId=${selectedBookId}`}
                className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
              >
                前往导出
              </Link>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-lg border bg-white py-16 text-gray-500">
          <Shield className="mb-3 h-10 w-10 text-gray-300" />
          <p className="text-sm">
            {selectedBookId ? '暂无审计报告，请点击「重新审计」' : '请先选择书籍'}
          </p>
        </div>
      )}
    </div>
  );
}
