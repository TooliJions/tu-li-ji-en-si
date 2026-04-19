import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Play, Pause, Square, AlertTriangle, Terminal, ChevronRight } from 'lucide-react';
import { fetchDaemonStatus, startDaemon, pauseDaemon, stopDaemon } from '../lib/api';

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

interface LogEntry {
  time: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

const MOCK_LOGS: LogEntry[] = [
  { time: '2026-04-19T08:00:00.000Z', level: 'info', message: '守护进程启动' },
  { time: '2026-04-19T08:01:00.000Z', level: 'info', message: '第 1 章完成' },
  { time: '2026-04-19T08:02:00.000Z', level: 'warn', message: 'Token 用量超过 50%' },
  { time: '2026-04-19T08:03:00.000Z', level: 'info', message: '第 2 章完成' },
  { time: '2026-04-19T08:04:00.000Z', level: 'error', message: '第 3 章创作失败，回退中' },
];

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
  const [logs] = useState<LogEntry[]>(MOCK_LOGS);
  const [logFilter, setLogFilter] = useState<string>('all');

  // Start config
  const [fromChapter, setFromChapter] = useState(1);
  const [toChapter, setToChapter] = useState(10);
  const [interval, setInterval] = useState(30);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (!bookId) {
      setStatus(null);
      setLoading(false);
      return;
    }

    fetchDaemonStatus(bookId)
      .then((data) => setStatus(data))
      .catch(() => {
        // load failed
      })
      .finally(() => setLoading(false));
  }, [bookId]);

  async function handleStart() {
    if (!bookId) return;
    setActionLoading(true);
    try {
      const result = await startDaemon(bookId, { fromChapter, toChapter, interval });
      setStatus(result);
    } catch {
      // start failed
    } finally {
      setActionLoading(false);
    }
  }

  async function handlePause() {
    if (!bookId) return;
    try {
      const result = await pauseDaemon(bookId);
      setStatus(result);
    } catch {
      // pause failed
    }
  }

  async function handleStop() {
    if (!bookId) return;
    try {
      const result = await stopDaemon(bookId);
      setStatus(result);
    } catch {
      // stop failed
    }
  }

  async function handleResume() {
    if (!bookId) return;
    setActionLoading(true);
    try {
      const result = await startDaemon(bookId, {
        fromChapter: status?.nextChapter || 1,
        toChapter,
        interval: status?.intervalSeconds || interval,
      });
      setStatus(result);
    } catch {
      // resume failed
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">加载中…</div>
    );
  }

  if (!bookId) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">请选择一本书</p>
        <Link to="/" className="text-primary mt-4 inline-block">
          返回仪表盘
        </Link>
      </div>
    );
  }

  const tokenPct =
    status && status.dailyTokenLimit > 0
      ? Math.round((status.dailyTokenUsed / status.dailyTokenLimit) * 100)
      : 0;

  const filteredLogs = logFilter === 'all' ? logs : logs.filter((log) => log.level === logFilter);

  const levelColors: Record<string, string> = {
    info: 'bg-blue-100 text-blue-700',
    warn: 'bg-orange-100 text-orange-700',
    error: 'bg-red-100 text-red-700',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">守护进程</h1>
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← 返回仪表盘
        </Link>
      </div>

      {/* Status Overview */}
      <div className="rounded-lg border bg-card p-6">
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
            {/* Token Usage Bar */}
            <div className="mb-4">
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-muted-foreground">Token 用量</span>
                <span>{tokenPct}%</span>
              </div>
              <div className="h-3 bg-secondary rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    tokenPct > 80 ? 'bg-red-500' : tokenPct > 50 ? 'bg-orange-500' : 'bg-green-500'
                  }`}
                  style={{ width: `${tokenPct}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>
                  {status.dailyTokenUsed.toLocaleString()} /{' '}
                  {status.dailyTokenLimit.toLocaleString()}
                </span>
              </div>
            </div>
            {/* Consecutive Fallbacks Warning */}
            {status.consecutiveFallbacks > 0 && (
              <div className="flex items-center gap-2 text-sm text-orange-600 bg-orange-50 rounded px-3 py-2">
                <AlertTriangle size={16} />
                <span>连续回退 {status.consecutiveFallbacks} 次</span>
              </div>
            )}
            {status.startedAt && (
              <p className="text-xs text-muted-foreground mt-2">
                启动时间 {new Date(status.startedAt).toLocaleString('zh-CN')}
              </p>
            )}
          </>
        )}
      </div>

      {/* Controls */}
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Play size={18} className="text-green-500" />
          <h2 className="text-lg font-semibold">控制</h2>
        </div>
        <div className="flex flex-wrap gap-4 mb-4">
          {/* Start Config */}
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={fromChapter}
              onChange={(e) => setFromChapter(Number(e.target.value))}
              placeholder="起始章节"
              className="w-24 px-3 py-2 rounded border bg-background text-sm"
            />
            <span className="text-sm text-muted-foreground">→</span>
            <input
              type="number"
              value={toChapter}
              onChange={(e) => setToChapter(Number(e.target.value))}
              placeholder="目标章节"
              className="w-24 px-3 py-2 rounded border bg-background text-sm"
            />
            <input
              type="number"
              value={interval}
              onChange={(e) => setInterval(Number(e.target.value))}
              placeholder="间隔秒数"
              className="w-24 px-3 py-2 rounded border bg-background text-sm"
            />
          </div>
        </div>
        <div className="flex gap-2">
          {status?.status === 'idle' || status?.status === 'stopped' ? (
            <button
              onClick={handleStart}
              disabled={actionLoading || !toChapter}
              className="px-4 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:opacity-50 flex items-center gap-1.5"
            >
              <Play size={14} />
              {actionLoading ? '启动中…' : '启动'}
            </button>
          ) : null}
          {status?.status === 'running' ? (
            <>
              <button
                onClick={handlePause}
                className="px-4 py-2 bg-orange-500 text-white rounded text-sm hover:bg-orange-600 flex items-center gap-1.5"
              >
                <Pause size={14} />
                暂停
              </button>
              <button
                onClick={handleStop}
                className="px-4 py-2 bg-red-600 text-white rounded text-sm hover:bg-red-700 flex items-center gap-1.5"
              >
                <Square size={14} />
                停止
              </button>
            </>
          ) : null}
          {status?.status === 'paused' ? (
            <>
              <button
                onClick={handleResume}
                disabled={actionLoading}
                className="px-4 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:opacity-50 flex items-center gap-1.5"
              >
                <Play size={14} />
                继续
              </button>
              <button
                onClick={handleStop}
                className="px-4 py-2 bg-red-600 text-white rounded text-sm hover:bg-red-700 flex items-center gap-1.5"
              >
                <Square size={14} />
                停止
              </button>
            </>
          ) : null}
        </div>
      </div>

      {/* Logs */}
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Terminal size={18} />
            <h2 className="text-lg font-semibold">运行日志</h2>
          </div>
          <select
            value={logFilter}
            onChange={(e) => setLogFilter(e.target.value)}
            className="px-3 py-1.5 rounded border bg-background text-sm"
          >
            <option value="all">全部</option>
            <option value="info">信息</option>
            <option value="warn">警告</option>
            <option value="error">错误</option>
          </select>
        </div>
        <div className="space-y-1 max-h-64 overflow-auto font-mono text-sm">
          {filteredLogs.map((log, i) => (
            <div key={i} className="flex items-start gap-2 px-3 py-1.5 rounded hover:bg-accent/50">
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {new Date(log.time).toLocaleTimeString('zh-CN')}
              </span>
              <span className={`px-1.5 py-0.5 rounded text-xs ${levelColors[log.level]}`}>
                {log.level}
              </span>
              <span>{log.message}</span>
            </div>
          ))}
          {filteredLogs.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">暂无日志</p>
          )}
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
