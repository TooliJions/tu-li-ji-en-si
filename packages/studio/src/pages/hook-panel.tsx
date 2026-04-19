import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  GitBranch,
  AlertTriangle,
  Activity,
  Clock,
  Plus,
  Target,
  Zap,
  BarChart3,
} from 'lucide-react';
import {
  fetchHooks,
  fetchHookHealth,
  fetchHookTimeline,
  fetchHookWakeSchedule,
  createHook,
  updateHook,
  declareHookIntent,
  wakeHook,
} from '../lib/api';
import HookTimelineWorkspace, {
  type HookTimelineData,
  type HookWakeScheduleData,
} from '../components/hook-timeline-workspace';

interface HookRecord {
  id: string;
  description: string;
  plantedChapter: number;
  status: string;
  priority: string;
  lastAdvancedChapter: number;
  expectedResolutionWindow: { min: number; max: number } | null;
  healthScore: number;
}

interface HookHealth {
  total: number;
  active: number;
  dormant: number;
  resolved: number;
  overdue: number;
  recoveryRate: number;
  overdueList: {
    hookId: string;
    description: string;
    expectedBy: number;
    currentChapter: number;
  }[];
}

const STATUS_LABELS: Record<string, string> = {
  open: '开放',
  progressing: '推进中',
  deferred: '已延期',
  dormant: '休眠',
  resolved: '已回收',
  abandoned: '已废弃',
};

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-blue-100 text-blue-700',
  progressing: 'bg-green-100 text-green-700',
  deferred: 'bg-orange-100 text-orange-700',
  dormant: 'bg-gray-100 text-gray-600',
  resolved: 'bg-purple-100 text-purple-700',
  abandoned: 'bg-red-100 text-red-700',
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  major: 'bg-orange-100 text-orange-700',
  minor: 'bg-blue-100 text-blue-700',
};

export default function HookPanel() {
  const [searchParams] = useSearchParams();
  const bookId = searchParams.get('bookId') || '';
  const [loading, setLoading] = useState(true);
  const [hooks, setHooks] = useState<HookRecord[]>([]);
  const [health, setHealth] = useState<HookHealth | null>(null);
  const [timeline, setTimeline] = useState<HookTimelineData | null>(null);
  const [wakeSchedule, setWakeSchedule] = useState<HookWakeScheduleData | null>(null);
  const [activeTab, setActiveTab] = useState<'list' | 'timeline'>('list');
  const [statusFilter, setStatusFilter] = useState('all');

  // Create form
  const [newDesc, setNewDesc] = useState('');
  const [newChapter, setNewChapter] = useState(1);
  const [newPriority, setNewPriority] = useState('major');

  // Intent modal
  const [intentHook, setIntentHook] = useState<HookRecord | null>(null);
  const [intentMin, setIntentMin] = useState('');
  const [intentMax, setIntentMax] = useState('');

  // Wake confirm
  const [wakingHook, setWakingHook] = useState<HookRecord | null>(null);

  async function reloadHookWorkspace(targetBookId: string) {
    const [hookList, hookHealth, hookTimeline, hookWakeSchedule] = await Promise.all([
      fetchHooks(targetBookId),
      fetchHookHealth(targetBookId),
      fetchHookTimeline(targetBookId),
      fetchHookWakeSchedule(targetBookId),
    ]);
    setHooks(hookList);
    setHealth(hookHealth);
    setTimeline(hookTimeline);
    setWakeSchedule(hookWakeSchedule);
  }

  useEffect(() => {
    if (!bookId) {
      setHooks([]);
      setHealth(null);
      setTimeline(null);
      setWakeSchedule(null);
      setStatusOpenId(null);
      setLoading(false);
      return;
    }

    void reloadHookWorkspace(bookId)
      .catch(() => {
        // load failed
      })
      .finally(() => setLoading(false));
  }, [bookId]);

  async function handleCreate() {
    try {
      await createHook(bookId, {
        description: newDesc,
        chapter: newChapter,
        priority: newPriority,
      });
      await reloadHookWorkspace(bookId);
      setNewDesc('');
      setNewChapter(1);
    } catch {
      // create failed
    }
  }

  async function handleStatusChange(hook: HookRecord, newStatus: string) {
    try {
      await updateHook(bookId, hook.id, { status: newStatus });
      await reloadHookWorkspace(bookId);
    } catch {
      // update failed
    }
  }

  async function handleIntent() {
    if (!intentHook) return;
    try {
      await declareHookIntent(bookId, intentHook.id, {
        min: intentMin ? Number(intentMin) : undefined,
        max: intentMax ? Number(intentMax) : undefined,
      });
      await reloadHookWorkspace(bookId);
      setIntentHook(null);
    } catch {
      // intent failed
    }
  }

  // Status change dropdown state
  const [statusOpenId, setStatusOpenId] = useState<string | null>(null);

  async function handleWake() {
    if (!wakingHook) return;
    try {
      await wakeHook(bookId, wakingHook.id, 'open');
      await reloadHookWorkspace(bookId);
      setWakingHook(null);
    } catch {
      // wake failed
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">加载中…</div>
    );
  }

  const filteredHooks =
    statusFilter === 'all' ? hooks : hooks.filter((h) => h.status === statusFilter);

  function healthScoreColor(score: number): string {
    if (score >= 80) return 'bg-green-500';
    if (score >= 50) return 'bg-orange-500';
    return 'bg-red-500';
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">伏笔管理</h1>
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← 返回仪表盘
        </Link>
      </div>

      {/* Health Summary */}
      {health && (
        <div className="rounded-lg border bg-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Activity size={18} />
            <h2 className="text-lg font-semibold">健康概览</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            <InfoCard label="总数" value={health.total.toString()} />
            <InfoCard label="活跃" value={health.active.toString()} />
            <InfoCard label="休眠" value={health.dormant.toString()} />
            <InfoCard label="已回收" value={health.resolved.toString()} />
            <InfoCard label="回收率" value={`${(health.recoveryRate * 100).toFixed(0)}%`} />
          </div>
          {health.overdue > 0 && (
            <div className="flex items-center gap-2 text-sm text-orange-600 bg-orange-50 rounded px-3 py-2 mt-4">
              <AlertTriangle size={16} />
              <span>逾期伏笔 {health.overdue} 个</span>
              {health.overdueList.map((o) => (
                <span key={o.hookId} className="ml-2 text-xs">
                  「{o.description}」
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-4 border-b">
        <button
          onClick={() => setActiveTab('list')}
          className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'list'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <GitBranch size={14} className="inline mr-1" />
          列表
        </button>
        <button
          onClick={() => setActiveTab('timeline')}
          className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'timeline'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <BarChart3 size={14} className="inline mr-1" />
          时间轴
        </button>
      </div>

      {/* List Tab */}
      {activeTab === 'list' && (
        <div className="space-y-6">
          {/* Create Form */}
          <div className="rounded-lg border bg-card p-6">
            <div className="flex items-center gap-2 mb-4">
              <Plus size={18} className="text-green-500" />
              <h2 className="text-lg font-semibold">创建伏笔</h2>
            </div>
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">描述</label>
                <input
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="伏笔描述"
                  className="px-3 py-2 rounded border bg-background text-sm w-48"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">章节</label>
                <input
                  type="number"
                  value={newChapter}
                  onChange={(e) => setNewChapter(Number(e.target.value))}
                  placeholder="章节"
                  className="w-20 px-3 py-2 rounded border bg-background text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">优先级</label>
                <select
                  value={newPriority}
                  onChange={(e) => setNewPriority(e.target.value)}
                  className="px-3 py-2 rounded border bg-background text-sm"
                >
                  <option value="critical">critical</option>
                  <option value="major">major</option>
                  <option value="minor">minor</option>
                </select>
              </div>
              <button
                onClick={handleCreate}
                disabled={!newDesc}
                className="px-4 py-2 bg-primary text-primary-foreground rounded text-sm hover:bg-primary/90 disabled:opacity-50"
              >
                创建
              </button>
            </div>
          </div>

          {/* Filter */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">筛选：</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="状态筛选"
              className="px-3 py-1.5 rounded border bg-background text-sm"
            >
              <option value="all">全部</option>
              <option value="open">open</option>
              <option value="progressing">progressing</option>
              <option value="dormant">dormant</option>
              <option value="resolved">resolved</option>
              <option value="abandoned">abandoned</option>
            </select>
          </div>

          {/* Hook List */}
          <div className="space-y-3">
            {filteredHooks.map((hook) => (
              <div
                key={hook.id}
                className="rounded-lg border bg-card p-4 hover:border-accent/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium">{hook.description}</h3>
                      <span
                        className={`px-2 py-0.5 rounded text-xs ${PRIORITY_COLORS[hook.priority]}`}
                      >
                        {hook.priority}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[hook.status]}`}>
                        {hook.status}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground flex gap-4">
                      <span>埋设：第{hook.plantedChapter}章</span>
                      <span>推进：第{hook.lastAdvancedChapter}章</span>
                      {hook.expectedResolutionWindow && (
                        <span>
                          预期回收：{hook.expectedResolutionWindow.min}-
                          {hook.expectedResolutionWindow.max}章
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Health Score */}
                    <div className="text-right">
                      <div className="text-sm font-bold">{hook.healthScore}</div>
                      <div className="w-16 h-1.5 bg-secondary rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${healthScoreColor(hook.healthScore)}`}
                          style={{ width: `${hook.healthScore}%` }}
                        />
                      </div>
                    </div>
                    {/* Actions */}
                    <div className="flex gap-1">
                      {/* Status change */}
                      <div className="relative">
                        <button
                          title="修改状态"
                          onClick={() => setStatusOpenId(statusOpenId === hook.id ? null : hook.id)}
                          className="p-1.5 rounded hover:bg-accent"
                        >
                          <Clock size={14} />
                        </button>
                        {statusOpenId === hook.id && (
                          <div className="absolute right-0 top-full mt-1 bg-popover border rounded shadow-lg z-10 py-1 min-w-[120px]">
                            {Object.keys(STATUS_LABELS).map((s) => (
                              <button
                                key={s}
                                className={`w-full text-left px-3 py-1 text-sm hover:bg-accent ${
                                  hook.status === s ? 'bg-accent' : ''
                                }`}
                                onClick={() => {
                                  handleStatusChange(hook, s);
                                  setStatusOpenId(null);
                                }}
                              >
                                {s}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      {/* Intent */}
                      {hook.status !== 'resolved' && hook.status !== 'abandoned' && (
                        <button
                          title="设置意图"
                          onClick={() => setIntentHook(hook)}
                          className="p-1.5 rounded hover:bg-accent"
                        >
                          <Target size={14} />
                        </button>
                      )}
                      {/* Wake dormant */}
                      {hook.status === 'dormant' && (
                        <button
                          title="唤醒"
                          onClick={() => setWakingHook(hook)}
                          className="p-1.5 rounded hover:bg-accent"
                        >
                          <Zap size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {filteredHooks.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">暂无伏笔</p>
            )}
          </div>
        </div>
      )}

      {/* Timeline Tab */}
      {activeTab === 'timeline' && timeline && wakeSchedule && (
        <div className="rounded-lg border bg-card p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">伏笔时间轴</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                时间轴 tab 现在复用独立双轨视图组件，保证与导航页展示一致。
              </p>
            </div>
            <Link
              to={`/hooks/timeline?bookId=${bookId}`}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              打开完整视图 →
            </Link>
          </div>
          <HookTimelineWorkspace timeline={timeline} wakeSchedule={wakeSchedule} />
        </div>
      )}

      {/* Intent Modal */}
      {intentHook && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg border p-6 w-80">
            <h3 className="text-lg font-semibold mb-4">设置预期回收窗口</h3>
            <p className="text-sm text-muted-foreground mb-4">「{intentHook.description}」</p>
            <div className="flex gap-3 mb-4">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">最小章节</label>
                <input
                  type="number"
                  value={intentMin}
                  onChange={(e) => setIntentMin(e.target.value)}
                  placeholder="最小章节"
                  className="w-24 px-3 py-2 rounded border bg-background text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">最大章节</label>
                <input
                  type="number"
                  value={intentMax}
                  onChange={(e) => setIntentMax(e.target.value)}
                  placeholder="最大章节"
                  className="w-24 px-3 py-2 rounded border bg-background text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setIntentHook(null)}
                className="px-4 py-1.5 rounded text-sm hover:bg-accent"
              >
                取消
              </button>
              <button
                onClick={handleIntent}
                className="px-4 py-1.5 bg-primary text-primary-foreground rounded text-sm hover:bg-primary/90"
              >
                确认
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Wake Confirm */}
      {wakingHook && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg border p-6 w-80">
            <h3 className="text-lg font-semibold mb-2">唤醒休眠伏笔</h3>
            <p className="text-sm text-muted-foreground mb-4">
              确认唤醒「{wakingHook.description}」？
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setWakingHook(null)}
                className="px-4 py-1.5 rounded text-sm hover:bg-accent"
              >
                取消
              </button>
              <button
                onClick={handleWake}
                className="px-4 py-1.5 bg-yellow-500 text-white rounded text-sm hover:bg-yellow-600"
              >
                确认唤醒
              </button>
            </div>
          </div>
        </div>
      )}
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
