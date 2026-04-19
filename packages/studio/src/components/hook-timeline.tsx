interface HookSegment {
  fromChapter: number;
  toChapter: number;
  type: string;
}

interface HookTimelineRow {
  id: string;
  description: string;
  plantedChapter: number;
  status: string;
  recurrenceChapter: number | null;
  segments: HookSegment[];
}

interface PendingWake {
  hookId: string;
  description: string;
  wakeAtChapter: number;
  status: string;
}

const STATUS_SURFACES: Record<string, string> = {
  open: 'bg-cyan-500/85',
  progressing: 'bg-emerald-500/85',
  deferred: 'bg-amber-500/85',
  dormant: 'bg-slate-400/85',
  resolved: 'bg-violet-500/85',
  abandoned: 'bg-rose-500/85',
};

export default function HookTimeline({
  hooks,
  pendingWakes,
  range,
}: {
  hooks: HookTimelineRow[];
  pendingWakes: PendingWake[];
  range: { from: number; to: number };
}) {
  const chapters = Array.from({ length: range.to - range.from + 1 }, (_, index) => range.from + index);
  const wakeGroups = chapters.map((chapter) => ({
    chapter,
    hooks: pendingWakes.filter((wake) => wake.wakeAtChapter === chapter),
  }));

  return (
    <div className="rounded-2xl border border-slate-200 bg-card p-5 shadow-sm">
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <h3 className="text-base font-semibold text-slate-950">生命周期轨</h3>
          <div className="mt-4 overflow-x-auto">
            <div className="min-w-[680px] space-y-4">
              <div className="grid grid-cols-[240px_repeat(var(--chapter-count),minmax(0,1fr))] gap-2 text-[11px] text-slate-500" style={{ ['--chapter-count' as string]: chapters.length }}>
                <span>伏笔</span>
                {chapters.map((chapter) => (
                  <span key={chapter} className="text-center">第{chapter}</span>
                ))}
              </div>
              {hooks.map((hook) => (
                <div key={hook.id} className="grid grid-cols-[240px_1fr] gap-2 items-center">
                  <div className="pr-4">
                    <p className="text-sm font-medium text-slate-900">{hook.description}</p>
                    <p className="mt-1 text-xs text-slate-500">埋设第{hook.plantedChapter}章 · {hook.status}</p>
                  </div>
                  <div className="relative h-11 rounded-xl border border-slate-200 bg-slate-50 px-1">
                    {chapters.map((chapter) => (
                      <div
                        key={`${hook.id}-${chapter}`}
                        className="absolute inset-y-1 border-r border-dashed border-slate-200"
                        style={{ left: `${((chapter - range.from) / chapters.length) * 100}%` }}
                      />
                    ))}
                    {hook.segments.map((segment, index) => {
                      const left = ((segment.fromChapter - range.from) / chapters.length) * 100;
                      const width = ((segment.toChapter - segment.fromChapter + 1) / chapters.length) * 100;
                      return (
                        <div
                          key={`${hook.id}-${index}`}
                          className={`absolute top-1/2 h-5 -translate-y-1/2 rounded-full ${STATUS_SURFACES[segment.type] ?? 'bg-slate-400/85'}`}
                          style={{ left: `${left}%`, width: `${Math.max(width, 4)}%` }}
                        />
                      );
                    })}
                    <div
                      className="absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full border-2 border-white bg-slate-950 shadow"
                      style={{ left: `calc(${((hook.plantedChapter - range.from) / chapters.length) * 100}% + 2px)` }}
                    />
                    {hook.recurrenceChapter && hook.recurrenceChapter >= range.from && hook.recurrenceChapter <= range.to && (
                      <div
                        className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-white bg-amber-400 shadow"
                        style={{ left: `calc(${((hook.recurrenceChapter - range.from) / chapters.length) * 100}% + 1px)` }}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div>
          <h3 className="text-base font-semibold text-slate-950">唤醒排班轨</h3>
          <div className="mt-4 space-y-3">
            {wakeGroups.map((group) => (
              <div key={group.chapter} className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-slate-900">第{group.chapter}章</span>
                  <span className="text-xs text-slate-500">待唤醒 {group.hooks.length}</span>
                </div>
                {group.hooks.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {group.hooks.map((hook) => (
                      <span
                        key={hook.hookId}
                        className="rounded-full border border-cyan-200 bg-white px-2.5 py-1 text-[11px] text-slate-700"
                      >
                        {hook.description}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-slate-500">本章暂无排班</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}