interface HookMagnifierChapter {
  chapter: number;
  count: number;
  plantedHooks: string[];
  wakingHooks: string[];
  hasThunder: boolean;
}

export default function HookMagnifier({
  focusChapter,
  chapters,
}: {
  focusChapter: number;
  chapters: HookMagnifierChapter[];
}) {
  const focused = chapters.find((chapter) => chapter.chapter === focusChapter);
  const focusedPending = focused?.wakingHooks.length ?? 0;
  const focusedPlanted = focused?.plantedHooks.length ?? 0;

  return (
    <div className="rounded-2xl border border-slate-200 bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-slate-500">局部放大镜</p>
          <h3 className="mt-2 text-xl font-semibold text-slate-950">聚焦章节：第 {focusChapter} 章</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">待唤醒 {focusedPending}</span>
          <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs text-cyan-700">新埋设 {focusedPlanted}</span>
          {focused?.hasThunder && (
            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs text-amber-700">惊群热点</span>
          )}
        </div>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-5">
        {chapters.map((chapter) => (
          <div
            key={chapter.chapter}
            className={`rounded-xl border p-3 ${
              chapter.chapter === focusChapter
                ? 'border-cyan-400 bg-cyan-50/70'
                : chapter.hasThunder
                  ? 'border-amber-300 bg-amber-50/60'
                  : 'border-slate-200 bg-slate-50/70'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-slate-900">第{chapter.chapter}章</span>
              <span className="text-xs text-slate-500">密度 {chapter.count}</span>
            </div>
            <div className="mt-3 space-y-2 text-xs text-slate-600">
              <p>埋设 {chapter.plantedHooks.length}</p>
              <p>待唤醒 {chapter.wakingHooks.length}</p>
            </div>
            {(chapter.plantedHooks.length > 0 || chapter.wakingHooks.length > 0) && (
              <div className="mt-3 space-y-1 text-[11px] text-slate-700">
                {chapter.plantedHooks.slice(0, 2).map((hook) => (
                  <p key={`${chapter.chapter}-planted-${hook}`}>埋设：{hook}</p>
                ))}
                {chapter.wakingHooks.slice(0, 2).map((hook) => (
                  <p key={`${chapter.chapter}-wake-${hook}`}>唤醒：{hook}</p>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}