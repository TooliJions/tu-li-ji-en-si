interface HookMinimapChapter {
  chapter: number;
  count: number;
  pendingWakes: number;
  isFocused: boolean;
  hasThunder: boolean;
}

export default function HookMinimap({
  chapters,
  onSelectChapter,
}: {
  chapters: HookMinimapChapter[];
  onSelectChapter: (chapter: number) => void;
}) {
  const maxCount = Math.max(...chapters.map((chapter) => chapter.count), 1);

  return (
    <div className="rounded-2xl border border-slate-200 bg-[linear-gradient(135deg,rgba(248,250,252,0.98),rgba(241,245,249,0.92))] p-4">
      <div className="grid grid-cols-6 gap-2 sm:grid-cols-8 lg:grid-cols-10">
        {chapters.map((chapter) => {
          const intensity = chapter.count === 0 ? 0.08 : Math.max(chapter.count / maxCount, 0.2);
          return (
            <button
              key={chapter.chapter}
              type="button"
              aria-label={`聚焦第${chapter.chapter}章`}
              onClick={() => onSelectChapter(chapter.chapter)}
              className={`relative overflow-hidden rounded-xl border px-2 py-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm ${
                chapter.isFocused
                  ? 'border-cyan-500 ring-2 ring-cyan-200'
                  : chapter.hasThunder
                    ? 'border-amber-300'
                    : 'border-slate-200'
              }`}
              style={{
                background: `linear-gradient(180deg, rgba(15,23,42,${0.08 + intensity * 0.32}) 0%, rgba(34,211,238,${0.06 + intensity * 0.28}) 100%)`,
              }}
            >
              <div className="text-[11px] font-medium text-slate-700">第{chapter.chapter}章</div>
              <div className="mt-2 text-lg font-semibold text-slate-950">{chapter.count}</div>
              <div className="text-[11px] text-slate-600">密度</div>
              {chapter.pendingWakes > 0 && (
                <div className="mt-2 text-[11px] text-cyan-800">待唤醒 {chapter.pendingWakes}</div>
              )}
              {chapter.hasThunder && (
                <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-amber-400 shadow-[0_0_0_4px_rgba(251,191,36,0.18)]" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}