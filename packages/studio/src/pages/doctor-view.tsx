import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  RefreshCw,
  Wrench,
  Database,
  FileText,
  CheckCircle,
  XCircle,
  Zap,
  Shield,
} from 'lucide-react';
import { fetchDoctorStatus, fixLocks, reorgRecovery, fetchStateDiff } from '../lib/api';

interface Issue {
  type: string;
  path: string;
  severity: string;
  description: string;
}

interface ReorgSentinel {
  bookId: string;
  lastChapter: number;
}

interface QualityBaseline {
  status: string;
  version: number;
  aiContamination: string;
}

interface ProviderHealth {
  provider: string;
  status: string;
  latencyMs: number;
}

interface DoctorStatus {
  issues: Issue[];
  reorgSentinels: ReorgSentinel[];
  qualityBaseline: QualityBaseline;
  providerHealth: ProviderHealth[];
}

interface StateDiff {
  file: string;
  summary: string;
  changes: {
    character: string;
    field: string;
    oldValue: string;
    newValue: string;
    naturalLanguage: string;
  }[];
  severity: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  warning: 'bg-orange-100 text-orange-700',
  error: 'bg-red-100 text-red-700',
  info: 'bg-blue-100 text-blue-700',
};

export default function DoctorView() {
  const [loading, setLoading] = useState(true);
  const [doctor, setDoctor] = useState<DoctorStatus | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [diffData, setDiffData] = useState<StateDiff | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [fixResult, setFixResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    loadDiagnosis();
  }, []);

  async function loadDiagnosis() {
    setLoading(true);
    setFixResult(null);
    try {
      const data = await fetchDoctorStatus();
      setDoctor(data);
    } catch {
      // load failed
    } finally {
      setLoading(false);
    }
  }

  async function handleFixLocks() {
    setFixResult(null);
    try {
      const result = await fixLocks();
      setFixResult({ success: true, message: `已修复 ${result.fixed} 个锁` });
      // Refresh
      const data = await fetchDoctorStatus();
      setDoctor(data);
    } catch {
      setFixResult({ success: false, message: '修复失败' });
    }
  }

  async function handleReorgRecovery() {
    const targetBookId = doctor?.reorgSentinels[0]?.bookId;
    if (!targetBookId) {
      setFixResult({ success: false, message: '缺少可恢复的书籍 ID' });
      return;
    }
    setFixResult(null);
    try {
      const result = await reorgRecovery(targetBookId);
      setFixResult({ success: true, message: `恢复了 ${result.restoredChapters} 章` });
    } catch {
      setFixResult({ success: false, message: '恢复失败' });
    }
  }

  async function handleStateDiff() {
    setShowDiff(true);
    setDiffLoading(true);
    try {
      const data = await fetchStateDiff('current_state');
      setDiffData(data);
    } catch {
      setDiffData(null);
    } finally {
      setDiffLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">加载中…</div>
    );
  }

  if (!doctor) {
    return <div className="text-center py-8 text-muted-foreground">加载诊断信息失败</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">系统诊断</h1>
        <div className="flex items-center gap-3">
          <button title="刷新诊断" onClick={loadDiagnosis} className="p-2 rounded hover:bg-accent">
            <RefreshCw size={16} />
          </button>
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
            ← 返回仪表盘
          </Link>
        </div>
      </div>

      {/* Fix Result */}
      {fixResult && (
        <div
          className={`rounded-lg border p-4 flex items-center gap-2 ${
            fixResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
          }`}
        >
          {fixResult.success ? (
            <CheckCircle size={18} className="text-green-600" />
          ) : (
            <XCircle size={18} className="text-red-600" />
          )}
          <span className={fixResult.success ? 'text-green-700' : 'text-red-700'}>
            {fixResult.message}
          </span>
        </div>
      )}

      {/* Issues */}
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle size={18} />
          <h2 className="text-lg font-semibold">问题清单</h2>
          <span className="text-sm text-muted-foreground ml-auto">
            {doctor.issues.length > 0 ? `${doctor.issues.length} 个问题` : '系统健康'}
          </span>
        </div>

        {doctor.issues.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <CheckCircle size={32} className="mx-auto mb-2 text-green-500" />
            <p>无问题 — 系统运行正常</p>
          </div>
        ) : (
          <div className="space-y-3">
            {doctor.issues.map((issue, i) => (
              <div
                key={i}
                className="rounded border p-4 bg-background flex items-start justify-between"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${SEVERITY_COLORS[issue.severity]}`}
                    >
                      {issue.severity}
                    </span>
                    <span className="text-sm font-medium">{issue.description}</span>
                  </div>
                  <p className="text-xs text-muted-foreground font-mono">{issue.path}</p>
                </div>
                {issue.type === 'stale_lock' && (
                  <button
                    title="修复锁"
                    onClick={handleFixLocks}
                    className="p-1.5 rounded hover:bg-accent flex items-center gap-1 text-sm"
                  >
                    <Wrench size={14} />
                    修复
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Provider Health */}
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Activity size={18} />
          <h2 className="text-lg font-semibold">Provider 健康</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {doctor.providerHealth.map((p) => (
            <div
              key={p.provider}
              className="rounded border p-3 bg-background flex items-center justify-between"
            >
              <div>
                <p className="font-medium">{p.provider}</p>
                <p className="text-xs text-muted-foreground">延迟: {p.latencyMs}ms</p>
              </div>
              <span
                className={`px-2 py-0.5 rounded text-xs ${
                  p.status === 'online' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}
              >
                {p.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Quality Baseline */}
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Shield size={18} />
          <h2 className="text-lg font-semibold">质量基线</h2>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">状态：</span>
            <span className="font-medium">{doctor.qualityBaseline.status}</span>
          </div>
          <div>
            <span className="text-muted-foreground">版本：</span>
            <span className="font-medium">{doctor.qualityBaseline.version}</span>
          </div>
          <div>
            <span className="text-muted-foreground">AI 痕迹：</span>
            <span className="font-medium">{doctor.qualityBaseline.aiContamination}</span>
          </div>
        </div>
      </div>

      {/* Reorg Recovery */}
      {doctor.reorgSentinels.length > 0 && (
        <div className="rounded-lg border bg-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Zap size={18} />
            <h2 className="text-lg font-semibold">重组恢复</h2>
          </div>
          <div className="space-y-2">
            {doctor.reorgSentinels.map((s, i) => (
              <div key={i} className="flex items-center justify-between">
                <span className="text-sm">
                  {s.bookId} — 最后章节: {s.lastChapter}
                </span>
                <button
                  title="恢复重组"
                  onClick={handleReorgRecovery}
                  className="px-3 py-1.5 bg-amber-500 text-white rounded text-sm hover:bg-amber-600 flex items-center gap-1"
                >
                  <Database size={14} />
                  恢复
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* State Diff */}
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <FileText size={18} />
          <h2 className="text-lg font-semibold">状态差异对比</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          比较 JSON 真相文件与 Markdown 投影的差异
        </p>
        <button
          title="状态差异"
          onClick={handleStateDiff}
          className="px-4 py-2 bg-primary text-primary-foreground rounded text-sm hover:bg-primary/90"
        >
          运行对比
        </button>

        {showDiff && (
          <div className="mt-4 pt-4 border-t">
            {diffLoading ? (
              <p className="text-sm text-muted-foreground">对比中…</p>
            ) : diffData ? (
              <div>
                <p className="text-sm font-medium mb-3">{diffData.summary}</p>
                <div className="space-y-2">
                  {diffData.changes.map((c, i) => (
                    <div key={i} className="rounded border p-3 bg-background text-sm">
                      <p className="text-muted-foreground">{c.naturalLanguage}</p>
                      <div className="text-xs text-muted-foreground mt-1">
                        <span className="line-through text-red-500">{c.oldValue}</span>
                        {' → '}
                        <span className="text-green-600">{c.newValue}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <span
                  className={`inline-block mt-2 px-2 py-0.5 rounded text-xs ${SEVERITY_COLORS[diffData.severity]}`}
                >
                  {diffData.severity}
                </span>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">无差异</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
