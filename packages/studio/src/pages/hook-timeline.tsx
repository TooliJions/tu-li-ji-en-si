import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Activity, GitBranch, Map as MapIcon, Zap } from 'lucide-react';
import { fetchHookTimeline, fetchHookWakeSchedule } from '../lib/api';
import HookTimelineWorkspace, {
  getEffectiveToChapter,
  type HookTimelineData,
  type HookWakeScheduleData,
} from '../components/hook-timeline-workspace';

export default function HookTimelinePage() {
  const [searchParams] = useSearchParams();
  const bookId = searchParams.get('bookId') || '';
  const [loading, setLoading] = useState(true);
  const [timeline, setTimeline] = useState<HookTimelineData | null>(null);
  const [wakeSchedule, setWakeSchedule] = useState<HookWakeScheduleData | null>(null);

  useEffect(() => {
    if (!bookId) {
      setLoading(false);
      return;
    }

    Promise.all([fetchHookTimeline(bookId), fetchHookWakeSchedule(bookId)])
      .then(([timelineData, wakeData]) => {
        setTimeline(timelineData);
        setWakeSchedule(wakeData);
      })
      .catch(() => {
        setTimeline(null);
        setWakeSchedule(null);
      })
      .finally(() => setLoading(false));
  }, [bookId]);

  const effectiveToChapter =
    timeline && wakeSchedule ? getEffectiveToChapter(timeline, wakeSchedule) : 1;

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-muted-foreground">加载中…</div>;
  }

  if (!bookId || !timeline || !wakeSchedule) {
    return (
      <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
        缺少书籍上下文，无法加载伏笔时间轴。
      </div>
    );
  }


  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Hook Governance</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">伏笔双轨时间轴</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            把伏笔生命周期、唤醒排班和惊群分流放进同一张时间图里，方便从全局热力到局部章节做连续观察。
          </p>
        </div>
        <div className="flex gap-3">
          <Link to={`/hooks?bookId=${bookId}`} className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
            返回伏笔面板
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={GitBranch} label="活跃排班章节" value={`${effectiveToChapter}`} accent="text-cyan-600" />
        <MetricCard icon={Activity} label="待唤醒伏笔" value={`${wakeSchedule.pendingWakes.length}`} accent="text-slate-700" />
        <MetricCard icon={MapIcon} label="每章唤醒上限" value={`${wakeSchedule.maxWakePerChapter}`} accent="text-amber-600" />
        <MetricCard icon={Zap} label="惊群章节" value={`${timeline.thunderingHerdAlerts.length}`} accent="text-yellow-600" />
      </div>

      <HookTimelineWorkspace timeline={timeline} wakeSchedule={wakeSchedule} />
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-500">
        <Icon size={14} className={accent} />
        {label}
      </div>
      <div className={`mt-3 text-2xl font-semibold ${accent}`}>{value}</div>
    </div>
  );
}