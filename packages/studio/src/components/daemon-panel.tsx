import { AlertTriangle, ChevronRight, Pause, Play, Square, Zap, Clock } from 'lucide-react';

export interface DaemonPanelStatus {
  status: 'idle' | 'running' | 'paused' | 'stopped';
  nextChapter: number;
  chaptersCompleted: number;
  intervalSeconds: number;
  dailyTokenUsed: number;
  dailyTokenLimit: number;
  consecutiveFallbacks: number;
  startedAt: string | null;
}

export type IntervalMode = 'cloud' | 'local';

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

function getQuotaPresentation(status: DaemonPanelStatus | null) {
  if (!status || status.dailyTokenLimit <= 0) {
    return {
      tokenPct: 0,
      statusText: '配额充足',
      detailText: '到达上限后自动暂停并推送通知',
      exhausted: false,
      toneClass: 'text-emerald-600',
      panelClass: 'border-emerald-100 bg-emerald-50/60',
    };
  }

  const tokenPct = Math.min(
    100,
    Math.round((status.dailyTokenUsed / status.dailyTokenLimit) * 100)
  );
  if (tokenPct >= 100) {
    return {
      tokenPct,
      statusText: '配额已耗尽',
      detailText: '今日配额已耗尽，需等待额度重置后再启动。',
      exhausted: true,
      toneClass: 'text-red-700',
      panelClass: 'border-red-200 bg-red-50',
    };
  }
  if (tokenPct >= 95) {
    return {
      tokenPct,
      statusText: '即将耗尽',
      detailText: '已逼近当日上限，下一次写作可能触发自动暂停。',
      exhausted: false,
      toneClass: 'text-red-700',
      panelClass: 'border-red-200 bg-red-50',
    };
  }
  if (tokenPct >= 80) {
    return {
      tokenPct,
      statusText: '配额紧张',
      detailText: '到达上限后自动暂停并推送通知',
      exhausted: false,
      toneClass: 'text-amber-700',
      panelClass: 'border-amber-200 bg-amber-50',
    };
  }

  return {
    tokenPct,
    statusText: '配额充足',
    detailText: '到达上限后自动暂停并推送通知',
    exhausted: false,
    toneClass: 'text-emerald-600',
    panelClass: 'border-emerald-100 bg-emerald-50/60',
  };
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-lg font-bold mt-1">{value}</p>
    </div>
  );
}

export default function DaemonPanel({
  status,
  actionLoading,
  fromChapter,
  toChapter,
  interval,
  intervalMode,
  dailyTokenLimit,
  onFromChapterChange,
  onToChapterChange,
  onIntervalChange,
  onIntervalModeChange,
  onDailyTokenLimitChange,
  onStart,
  onPause,
  onStop,
  onResume,
}: {
  status: DaemonPanelStatus | null;
  actionLoading: boolean;
  fromChapter: number;
  toChapter: number;
  interval: number;
  intervalMode: IntervalMode;
  dailyTokenLimit: number;
  onFromChapterChange: (value: number) => void;
  onToChapterChange: (value: number) => void;
  onIntervalChange: (value: number) => void;
  onIntervalModeChange: (value: IntervalMode) => void;
  onDailyTokenLimitChange: (value: number) => void;
  onStart: () => void;
  onPause: () => void;
  onStop: () => void;
  onResume: () => void;
}) {
  const quota = getQuotaPresentation(status);
  const actionBlockedByQuota = quota.exhausted;

  return (
    <>
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
            <div className="mb-4">
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-muted-foreground">Token 用量</span>
                <span>{quota.tokenPct}%</span>
              </div>
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${
                    quota.tokenPct > 80
                      ? 'bg-red-500'
                      : quota.tokenPct > 50
                        ? 'bg-orange-500'
                        : 'bg-primary'
                  }`}
                  style={{ width: `${quota.tokenPct}%` }}
                />
              </div>
            </div>
            <div className={`mb-4 rounded-md border px-3 py-3 text-sm ${quota.panelClass}`}>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">
                  今日已用 {status.dailyTokenUsed.toLocaleString()} /{' '}
                  {status.dailyTokenLimit.toLocaleString()}
                </span>
                <span className={`font-medium ${quota.toneClass}`}>状态: {quota.statusText}</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{quota.detailText}</p>
            </div>
            {status.consecutiveFallbacks > 0 && (
              <div className="flex items-center gap-2 text-xs text-orange-600 bg-orange-50 border border-orange-100 rounded px-3 py-2">
                <AlertTriangle size={14} />
                <span>连续生成失败回退 {status.consecutiveFallbacks} 次，请检查提示词或网络。</span>
              </div>
            )}
          </>
        )}
      </div>

      <div className="rounded-lg border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-5">
          <Play size={18} className="text-green-500" />
          <h2 className="text-lg font-semibold">控制面板</h2>
        </div>

        {/* 章节范围 */}
        <div className="grid grid-cols-2 gap-4 mb-5">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">起始章节</label>
            <input
              type="number"
              value={fromChapter}
              onChange={(e) => onFromChapterChange(Number(e.target.value))}
              className="w-full px-3 py-2 rounded border bg-background text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">目标章节</label>
            <input
              type="number"
              value={toChapter}
              onChange={(e) => onToChapterChange(Number(e.target.value))}
              className="w-full px-3 py-2 rounded border bg-background text-sm"
            />
          </div>
        </div>

        {/* 间隔模式 */}
        <div className="mb-4">
          <p className="text-xs text-muted-foreground mb-2">间隔模式</p>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="radio"
                name="intervalMode"
                value="cloud"
                checked={intervalMode === 'cloud'}
                onChange={() => onIntervalModeChange('cloud')}
                className="accent-primary"
              />
              <Zap size={14} className="text-primary" />
              云端智能
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="radio"
                name="intervalMode"
                value="local"
                checked={intervalMode === 'local'}
                onChange={() => onIntervalModeChange('local')}
                className="accent-primary"
              />
              <Clock size={14} className="text-muted-foreground" />
              本地即时
            </label>
          </div>
        </div>

        {/* 智能间隔配置 */}
        <div className="mb-5 rounded-md border border-dashed border-primary/30 bg-primary/5 px-4 py-4">
          <p className="text-xs font-semibold text-primary mb-3">
            {intervalMode === 'cloud' ? '智能间隔配置' : '固定间隔配置'}
          </p>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              {intervalMode === 'cloud' ? '基础间隔 (秒)' : '固定间隔 (秒)'}
            </label>
            <input
              type="number"
              value={interval}
              onChange={(e) => onIntervalChange(Number(e.target.value))}
              className="w-full px-3 py-2 rounded border bg-background text-sm"
            />
            {intervalMode === 'cloud' && (
              <p className="mt-1.5 text-xs text-muted-foreground">
                云端模式下守护进程会根据 RPM 余量自动延长间隔，避免触发速率限制。
              </p>
            )}
          </div>
        </div>

        {/* 每日配额保护 */}
        <div className="mb-6 rounded-md border border-dashed border-amber-300 bg-amber-50/60 px-4 py-4">
          <p className="text-xs font-semibold text-amber-700 mb-3">每日配额保护</p>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">日 Token 上限</label>
            <input
              type="number"
              value={dailyTokenLimit}
              onChange={(e) => onDailyTokenLimitChange(Number(e.target.value))}
              className="w-full px-3 py-2 rounded border bg-background text-sm"
            />
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">⚠ 到达上限后自动暂停并推送通知</p>
        </div>

        <div className="flex gap-3">
          {(status?.status === 'idle' || status?.status === 'stopped') && (
            <button
              onClick={onStart}
              disabled={actionLoading || actionBlockedByQuota}
              className="px-6 py-2 bg-primary text-primary-foreground rounded-md text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
            >
              <Play size={16} /> {actionLoading ? '正在启动...' : '启动生产'}
            </button>
          )}
          {status?.status === 'running' && (
            <>
              <button
                onClick={onPause}
                className="px-6 py-2 bg-amber-500 text-white rounded-md text-sm font-semibold hover:bg-amber-600 flex items-center gap-2"
              >
                <Pause size={16} /> 暂停
              </button>
              <button
                onClick={onStop}
                className="px-6 py-2 bg-destructive text-destructive-foreground rounded-md text-sm font-semibold hover:bg-destructive/90 flex items-center gap-2"
              >
                <Square size={16} /> 停止
              </button>
            </>
          )}
          {status?.status === 'paused' && (
            <>
              <button
                onClick={onResume}
                disabled={actionBlockedByQuota}
                className="px-6 py-2 bg-primary text-primary-foreground rounded-md text-sm font-semibold hover:bg-primary/90 flex items-center gap-2"
              >
                <Play size={16} /> 继续
              </button>
              <button
                onClick={onStop}
                className="px-6 py-2 bg-destructive text-destructive-foreground rounded-md text-sm font-semibold hover:bg-destructive/90 flex items-center gap-2"
              >
                <Square size={16} /> 停止
              </button>
            </>
          )}
        </div>
        {actionBlockedByQuota && (
          <p className="mt-3 text-sm text-red-700">
            已阻止新的启动或继续操作，请等待额度重置后再尝试。
          </p>
        )}
      </div>
    </>
  );
}
