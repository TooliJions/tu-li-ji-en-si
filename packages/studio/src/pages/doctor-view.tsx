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
import {
  fetchDoctorStatus,
  fixLocks,
  reorgRecovery,
  fetchStateDiff,
  fetchEnvInfo,
  fixAllIssues,
} from '../lib/api';

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
  sampledBooks?: number;
  sampledChapters?: number;
}

interface ProviderHealth {
  provider: string;
  status: string;
  models: string[];
  bookCount: number;
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
    /** PRD-090: 差异分类 */
    category?: '角色' | '关系' | '物品' | '事实' | '伏笔';
  }[];
  severity: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  warning: 'bg-orange-100 text-orange-700',
  error: 'bg-red-100 text-red-700',
  info: 'bg-blue-100 text-blue-700',
};

const PROVIDER_STATUS_COLORS: Record<string, string> = {
  configured: 'bg-green-100 text-green-700',
  missing: 'bg-red-100 text-red-700',
};

function formatProviderStatus(status: string): string {
  if (status === 'configured') {
    return '已配置';
  }
  if (status === 'missing') {
    return '缺失';
  }
  return status;
}

export default function DoctorView() {
  const [loading, setLoading] = useState(true);
  const [doctor, setDoctor] = useState<DoctorStatus | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [diffData, setDiffData] = useState<StateDiff | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffCategoryFilter, setDiffCategoryFilter] = useState<string>('all');
  const [diffSelected, setDiffSelected] = useState<Set<number>>(new Set());
  const [fixResult, setFixResult] = useState<{ success: boolean; message: string } | null>(null);
  const [envInfo, setEnvInfo] = useState<{
    nodeVersion: string;
    safeMode: boolean;
    diskAvailableGB: number;
    aiReachable: boolean;
  } | null>(null);

  useEffect(() => {
    loadDiagnosis();
  }, []);

  async function loadDiagnosis() {
    setLoading(true);
    setFixResult(null);
    try {
      const [data, env] = await Promise.all([
        fetchDoctorStatus(),
        fetchEnvInfo().catch(() => ({
          nodeVersion: process?.version || 'v20.0.0',
          safeMode: true,
          diskAvailableGB: 10,
          aiReachable: true,
        })),
      ]);
      setDoctor(data);
      setEnvInfo(env);
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

  async function handleFixAll() {
    setFixResult(null);
    try {
      const result = await fixAllIssues();
      setFixResult({ success: true, message: result.message || '已修复所有问题' });
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

      {/* Action Buttons */}
      <div className="flex gap-2">
        <button
          onClick={loadDiagnosis}
          className="px-4 py-2 bg-primary text-primary-foreground rounded text-sm hover:bg-primary/90 flex items-center gap-1"
        >
          <RefreshCw size={14} />
          运行诊断
        </button>
        <button
          onClick={handleFixAll}
          className="px-4 py-2 border rounded text-sm hover:bg-accent flex items-center gap-1"
        >
          <Wrench size={14} />
          修复所有
        </button>
        <button
          onClick={handleFixLocks}
          className="px-4 py-2 border rounded text-sm hover:bg-accent flex items-center gap-1"
        >
          <Database size={14} />
          仅清理僵尸锁
        </button>
      </div>

      {/* Environment Check */}
      {envInfo && (
        <div className="rounded-lg border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">环境检查</h3>
          <div className="space-y-2 text-sm">
            <EnvCheckItem
              pass={
                envInfo.nodeVersion.startsWith('v20') ||
                envInfo.nodeVersion.startsWith('v21') ||
                envInfo.nodeVersion.startsWith('v22')
              }
              label={`Node.js ${envInfo.nodeVersion}`}
            />
            <EnvCheckItem pass={envInfo.safeMode} label="已启用安全模式" />
            <EnvCheckItem
              pass={envInfo.diskAvailableGB > 5}
              label={`${envInfo.diskAvailableGB} GB 可用`}
            />
            <EnvCheckItem pass={envInfo.aiReachable} label="qwen3.6-plus 可达" />
          </div>
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
                <p className="text-xs text-muted-foreground">
                  {p.models.length > 0 ? `模型: ${p.models.join(' / ')}` : '未配置模型'}
                </p>
                <p className="text-xs text-muted-foreground">关联书籍: {p.bookCount} 本</p>
              </div>
              <span
                className={`px-2 py-0.5 rounded text-xs ${PROVIDER_STATUS_COLORS[p.status] ?? 'bg-slate-100 text-slate-700'}`}
              >
                {formatProviderStatus(p.status)}
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
          {typeof doctor.qualityBaseline.sampledBooks === 'number' && (
            <div>
              <span className="text-muted-foreground">采样书籍：</span>
              <span className="font-medium">{doctor.qualityBaseline.sampledBooks}</span>
            </div>
          )}
          {typeof doctor.qualityBaseline.sampledChapters === 'number' && (
            <div>
              <span className="text-muted-foreground">采样章节：</span>
              <span className="font-medium">{doctor.qualityBaseline.sampledChapters}</span>
            </div>
          )}
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

                {/* PRD-090: 分类筛选 — 单选框 */}
                <div className="flex flex-wrap gap-3 mb-3">
                  {['all', '角色', '关系', '物品', '事实', '伏笔'].map((cat) => (
                    <label key={cat} className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input
                        type="radio"
                        name="diff-category"
                        value={cat}
                        checked={diffCategoryFilter === cat}
                        onChange={() => setDiffCategoryFilter(cat)}
                        className="accent-primary"
                      />
                      {cat === 'all' ? '全部' : cat}
                    </label>
                  ))}
                </div>

                <div className="space-y-2">
                  {diffData.changes
                    .filter(
                      (c) => diffCategoryFilter === 'all' || c.category === diffCategoryFilter
                    )
                    .map((c, i) => (
                      <div
                        key={i}
                        className={`rounded border p-3 bg-background text-sm transition-colors ${
                          diffSelected.has(i) ? 'border-primary bg-primary/5' : ''
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          {/* PRD-090: 多选框 */}
                          <input
                            type="checkbox"
                            checked={diffSelected.has(i)}
                            onChange={() => {
                              const next = new Set(diffSelected);
                              if (next.has(i)) next.delete(i);
                              else next.add(i);
                              setDiffSelected(next);
                            }}
                            className="mt-1 accent-primary"
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              {c.category && (
                                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                                  {c.category}
                                </span>
                              )}
                              <p className="text-muted-foreground">{c.naturalLanguage}</p>
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              <span className="line-through text-red-500">{c.oldValue}</span>
                              {' → '}
                              <span className="text-green-600">{c.newValue}</span>
                            </div>
                          </div>
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

function EnvCheckItem({ pass, label }: { pass: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={pass ? 'text-green-600' : 'text-red-600'}>{pass ? '✓' : '✗'}</span>
      <span>{label}</span>
    </div>
  );
}
