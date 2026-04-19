import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  Play,
  Pause,
  Square,
  AlertTriangle,
  Terminal,
  ChevronRight,
  Bell,
  Webhook,
  Settings2,
  CheckCircle2,
} from 'lucide-react';
import { fetchDaemonStatus, startDaemon, pauseDaemon, stopDaemon } from '../lib/api';
import DaemonLogStream from '../components/daemon-log-stream';

interface DaemonStatus {
  status: 'idle' | 'running' | 'paused' | 'stopped';
  nextChapter: number;
  chaptersCompleted: number;
  intervalSeconds: number;
  dailyTokenUsed: number;
  dailyTokenLimit: number;
  consecutiveFallbacks: number;
  startedAt: string | null;
}

interface NotifyConfig {
  enabled: boolean;
  webhookUrl: string;
  notifyOnComplete: boolean;
  notifyOnError: boolean;
  notifyOnTokenLimit: boolean;
}

const DEFAULT_NOTIFY_CONFIG: NotifyConfig = {
  enabled: false,
  webhookUrl: '',
  notifyOnComplete: true,
  notifyOnError: true,
  notifyOnTokenLimit: true,
};

const STATUS_LABELS: Record<string, string> = {
  idle: '空闲',
  running: '运行中',
  paused: '已暂停',
  stopped: '已停止',
};

const STATUS_COLORS: Record<string, string> = {
  idle: 'text-muted-foreground',
  running: 'text-green-500',
  paused: 'text-orange-500',
  stopped: 'text-red-500',
};

export default function DaemonControl() {
  const [searchParams] = useSearchParams();
  const bookId = searchParams.get('bookId') || '';
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<DaemonStatus | null>(null);
  const [logFilter, setLogFilter] = useState<string>('all');

  // Start config
  const [fromChapter, setFromChapter] = useState(1);
  const [toChapter, setToChapter] = useState(10);
  const [interval, setInterval] = useState(30);
  const [actionLoading, setActionLoading] = useState(false);

  // Notification Config
  const [notifyConfig, setNotifyConfig] = useState<NotifyConfig>(DEFAULT_NOTIFY_CONFIG);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (!bookId) {
      setStatus(null);
      setLoading(false);
      return;
    }

    // Load status
    fetchDaemonStatus(bookId)
      .then((data) => {
        setStatus(data);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });

    // Load notify config from local storage (simulated)
    const savedConfig = localStorage.getItem(`daemon_notify_${bookId}`);
    if (savedConfig) {
      try {
        setNotifyConfig(JSON.parse(savedConfig));
      } catch (e) {
        setNotifyConfig(DEFAULT_NOTIFY_CONFIG);
      }
    }
  }, [bookId]);

  const handleSaveNotify = () => {
    localStorage.setItem(`daemon_notify_${bookId}`, JSON.stringify(notifyConfig));
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  const handleStart = async () => {
    if (!bookId) return;
    setActionLoading(true);
    try {
      const data = await startDaemon(bookId, { fromChapter, toChapter, interval });
      setStatus(data);
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(false);
    }
  };

  const handlePause = async () => {
    if (!bookId) return;
    try {
      const data = await pauseDaemon(bookId);
      setStatus(data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleStop = async () => {
    if (!bookId) return;
    try {
      const data = await stopDaemon(bookId);
      setStatus(data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleResume = async () => {
    if (!bookId || !status) return;
    setActionLoading(true);
    try {
      const data = await startDaemon(bookId, {
        fromChapter: status.nextChapter,
        toChapter,
        interval,
      });
      setStatus(data);
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">加载中…</div>
    );
  }

  if (!bookId) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        请先选择一本书籍。
      </div>
    );
  }

  const tokenPct = status
    ? Math.min(100, Math.round((status.dailyTokenUsed / status.dailyTokenLimit) * 100))
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">守护进程</h1>
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← 返回仪表盘
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Status and Controls */}
        <div className="lg:col-span-2 space-y-6">
          {/* Status Overview same */}
          <div className="rounded-lg border bg-card p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <ChevronRight
                size={18}
                className={status ? STATUS_COLORS[status.status] : 'text-muted-foreground'}
              />
              <h2 className="text-lg font-semibold">状态总览</h2>
            </div>
            {status && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                  <InfoCard label="状态" value={STATUS_LABELS[status.status] || status.status} />
                  <InfoCard label="下一章" value={`第 ${status.nextChapter} 章`} />
                  <InfoCard label="间隔" value={`${status.intervalSeconds}s`} />
                  <InfoCard label="Token 日限额" value={status.dailyTokenLimit.toLocaleString()} />
                </div>
                {/* Token Usage Bar same */}
                <div className="mb-4">
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-muted-foreground">Token 用量</span>
                    <span>{tokenPct}%</span>
                  </div>
                  <div className="h-2 bg-secondary rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${
                        tokenPct > 80
                          ? 'bg-red-500'
                          : tokenPct > 50
                            ? 'bg-orange-500'
                            : 'bg-primary'
                      }`}
                      style={{ width: `${tokenPct}%` }}
                    />
                  </div>
                </div>
                {/* Consecutive Fallbacks same */}
                {status.consecutiveFallbacks > 0 && (
                  <div className="flex items-center gap-2 text-xs text-orange-600 bg-orange-50 border border-orange-100 rounded px-3 py-2">
                    <AlertTriangle size={14} />
                    <span>
                      连续生成失败回退 {status.consecutiveFallbacks} 次，请检查提示词或网络。
                    </span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Controls same */}
          <div className="rounded-lg border bg-card p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Play size={18} className="text-green-500" />
              <h2 className="text-lg font-semibold">控制面板</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">起始章节</label>
                <input
                  type="number"
                  value={fromChapter}
                  onChange={(e) => setFromChapter(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded border bg-background text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">目标章节</label>
                <input
                  type="number"
                  value={toChapter}
                  onChange={(e) => setToChapter(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded border bg-background text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">间隔时间 (秒)</label>
                <input
                  type="number"
                  value={interval}
                  onChange={(e) => setInterval(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded border bg-background text-sm"
                />
              </div>
            </div>
            <div className="flex gap-3">
              {/* Action Buttons same logic */}
              {(status?.status === 'idle' || status?.status === 'stopped') && (
                <button
                  onClick={handleStart}
                  disabled={actionLoading}
                  className="px-6 py-2 bg-primary text-primary-foreground rounded-md text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
                >
                  <Play size={16} /> {actionLoading ? '正在启动...' : '启动生产'}
                </button>
              )}
              {status?.status === 'running' && (
                <>
                  <button
                    onClick={handlePause}
                    className="px-6 py-2 bg-amber-500 text-white rounded-md text-sm font-semibold hover:bg-amber-600 flex items-center gap-2"
                  >
                    <Pause size={16} /> 暂停
                  </button>
                  <button
                    onClick={handleStop}
                    className="px-6 py-2 bg-destructive text-destructive-foreground rounded-md text-sm font-semibold hover:bg-destructive/90 flex items-center gap-2"
                  >
                    <Square size={16} /> 停止
                  </button>
                </>
              )}
              {status?.status === 'paused' && (
                <>
                  <button
                    onClick={handleResume}
                    className="px-6 py-2 bg-primary text-primary-foreground rounded-md text-sm font-semibold hover:bg-primary/90 flex items-center gap-2"
                  >
                    <Play size={16} /> 继续
                  </button>
                  <button
                    onClick={handleStop}
                    className="px-6 py-2 bg-destructive text-destructive-foreground rounded-md text-sm font-semibold hover:bg-destructive/90 flex items-center gap-2"
                  >
                    <Square size={16} /> 停止
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Logs - SSE Real-time */}
          <div className="rounded-lg border bg-card shadow-sm">
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-2">
                <Terminal size={18} className="text-muted-foreground" />
                <h2 className="text-sm font-semibold uppercase tracking-wider">运行日志</h2>
              </div>
              <select
                value={logFilter}
                onChange={(e) => setLogFilter(e.target.value)}
                className="px-2 py-1 rounded border bg-background text-xs"
              >
                <option value="all">全部级别</option>
                <option value="info">INFO</option>
                <option value="warn">WARN</option>
                <option value="error">ERROR</option>
              </select>
            </div>
            <DaemonLogStream
              bookId={bookId}
              levelFilter={logFilter as 'all' | 'info' | 'warn' | 'error'}
            />
          </div>
        </div>

        {/* Right Column - Configs */}
        <div className="space-y-6">
          {/* Notification Config - NEW */}
          <section className="rounded-lg border bg-card p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-6">
              <Bell className="text-primary" size={20} />
              <h2 className="text-lg font-semibold">通知推送配置</h2>
            </div>

            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <label className="text-sm font-medium">启用通知</label>
                  <p className="text-xs text-muted-foreground">在重要事件发生时推送消息</p>
                </div>
                <input
                  type="checkbox"
                  checked={notifyConfig.enabled}
                  onChange={(e) => setNotifyConfig({ ...notifyConfig, enabled: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                />
              </div>

              <div className={!notifyConfig.enabled ? 'opacity-50 pointer-events-none' : ''}>
                <label className="text-xs text-muted-foreground mb-1.5 block flex items-center gap-1">
                  <Webhook size={12} /> Webhook URL (企业微信/钉钉/飞书)
                </label>
                <input
                  type="text"
                  value={notifyConfig.webhookUrl}
                  onChange={(e) => setNotifyConfig({ ...notifyConfig, webhookUrl: e.target.value })}
                  placeholder="https://qyapi.weixin.qq.com/..."
                  className="w-full px-3 py-2 rounded-md border bg-background text-xs font-mono"
                />
              </div>

              <div
                className={`space-y-3 pt-2 border-t ${!notifyConfig.enabled ? 'opacity-50 pointer-events-none' : ''}`}
              >
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-tight">
                  触发事件
                </p>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notifyConfig.notifyOnComplete}
                      onChange={(e) =>
                        setNotifyConfig({ ...notifyConfig, notifyOnComplete: e.target.checked })
                      }
                      className="h-3.5 w-3.5 rounded border-gray-300"
                    />
                    <span>章节生成完成</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notifyConfig.notifyOnError}
                      onChange={(e) =>
                        setNotifyConfig({ ...notifyConfig, notifyOnError: e.target.checked })
                      }
                      className="h-3.5 w-3.5 rounded border-gray-300"
                    />
                    <span>生产遇到错误/失败</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notifyConfig.notifyOnTokenLimit}
                      onChange={(e) =>
                        setNotifyConfig({ ...notifyConfig, notifyOnTokenLimit: e.target.checked })
                      }
                      className="h-3.5 w-3.5 rounded border-gray-300"
                    />
                    <span>Token 消耗达到阈值</span>
                  </label>
                </div>
              </div>

              <button
                onClick={handleSaveNotify}
                className="w-full py-2 bg-secondary text-secondary-foreground rounded-md text-sm font-medium hover:bg-secondary/80 flex items-center justify-center gap-2 transition-all"
              >
                {saveSuccess ? (
                  <>
                    <CheckCircle2 size={16} className="text-green-600" />
                    <span>已保存配置</span>
                  </>
                ) : (
                  <>
                    <Settings2 size={16} />
                    <span>保存通知配置</span>
                  </>
                )}
              </button>
            </div>
          </section>

          {/* PRODUCTION STATS BOX */}
          <section className="rounded-lg border bg-muted/20 p-6">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <AlertTriangle size={16} className="text-amber-500" />
              生产提示
            </h3>
            <ul className="text-xs space-y-2 text-muted-foreground list-disc pl-4">
              <li>建议间隔时间不低于 30 秒以避开速率限制。</li>
              <li>连续失败 3 次以上时建议手动检查生成内容。</li>
              <li>Webhook 通知支持飞书、钉钉等标准 Markdown 格式推送。</li>
            </ul>
          </section>
        </div>
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
