import { useMemo, useState } from 'react';
import { Map as MapIcon, Radar } from 'lucide-react';
import HookMinimap from './hook-minimap';
import HookMagnifier from './hook-magnifier';
import HookTimeline from './hook-timeline';
import ThunderAnim from './thunder-anim';

export interface HookTimelineData {
  chapterRange: { from: number; to: number };
  densityHeatmap: { chapter: number; count: number }[];
  hooks: {
    id: string;
    description: string;
    plantedChapter: number;
    status: string;
    recurrenceChapter: number | null;
    segments: { fromChapter: number; toChapter: number; type: string }[];
  }[];
  thunderingHerdAnimations: { chapter: number; intensity: number }[];
  thunderingHerdAlerts: { chapter: number; count: number; message: string }[];
}

export interface HookWakeScheduleData {
  currentChapter: number;
  maxWakePerChapter: number;
  pendingWakes: Array<{
    hookId: string;
    description: string;
    wakeAtChapter: number;
    status: string;
  }>;
}

function buildChapterRange(from: number, to: number): number[] {
  return Array.from({ length: Math.max(to - from + 1, 0) }, (_, index) => from + index);
}

  export function getEffectiveToChapter(
    timeline: HookTimelineData,
    wakeSchedule: HookWakeScheduleData,
  ): number {
    const densityMax = Math.max(
      1,
      ...timeline.densityHeatmap.filter((entry) => entry.count > 0).map((entry) => entry.chapter),
    );
    const hookMax = Math.max(
      1,
      ...timeline.hooks.flatMap((hook) => [
        hook.plantedChapter,
        hook.recurrenceChapter ?? 0,
        ...hook.segments.map((segment) => segment.toChapter),
      ]),
    );
    const wakeMax = Math.max(1, ...wakeSchedule.pendingWakes.map((wake) => wake.wakeAtChapter));
    return Math.max(wakeSchedule.currentChapter, densityMax, hookMax, wakeMax);
  }

export default function HookTimelineWorkspace({
  timeline,
  wakeSchedule,
  initialFocusChapter,
}: {
  timeline: HookTimelineData;
  wakeSchedule: HookWakeScheduleData;
  initialFocusChapter?: number;
}) {
  const [focusChapter, setFocusChapter] = useState(
    initialFocusChapter ??
      timeline.thunderingHerdAlerts[0]?.chapter ??
      wakeSchedule.pendingWakes[0]?.wakeAtChapter ??
      wakeSchedule.currentChapter ??
      timeline.chapterRange.from,
  );

  const effectiveToChapter = useMemo(() => {
    return getEffectiveToChapter(timeline, wakeSchedule);
  }, [timeline, wakeSchedule]);

  const visibleRange = useMemo(() => {
    const from = Math.max(1, focusChapter - 2);
    const to = Math.max(from, Math.min(effectiveToChapter, focusChapter + 2));
    return { from, to };
  }, [effectiveToChapter, focusChapter]);

  const minimapChapters = useMemo(() => {
    const densityMap = new globalThis.Map(
      timeline.densityHeatmap.map((entry) => [entry.chapter, entry.count] as const),
    );
    const wakeMap = new globalThis.Map<number, number>();
    for (const wake of wakeSchedule.pendingWakes) {
      wakeMap.set(wake.wakeAtChapter, (wakeMap.get(wake.wakeAtChapter) ?? 0) + 1);
    }
    const thunderSet = new Set(timeline.thunderingHerdAlerts.map((alert) => alert.chapter));

    return buildChapterRange(1, effectiveToChapter).map((chapter) => ({
      chapter,
      count: densityMap.get(chapter) ?? 0,
      pendingWakes: wakeMap.get(chapter) ?? 0,
      isFocused: chapter === focusChapter,
      hasThunder: thunderSet.has(chapter),
    }));
  }, [effectiveToChapter, focusChapter, timeline, wakeSchedule]);

  const magnifierChapters = useMemo(() => {
    const thunderSet = new Set(timeline.thunderingHerdAlerts.map((alert) => alert.chapter));
    return buildChapterRange(visibleRange.from, visibleRange.to).map((chapter) => ({
      chapter,
      count: timeline.densityHeatmap.find((entry) => entry.chapter === chapter)?.count ?? 0,
      plantedHooks: timeline.hooks
        .filter((hook) => hook.plantedChapter === chapter)
        .map((hook) => hook.description),
      wakingHooks: wakeSchedule.pendingWakes
        .filter((wake) => wake.wakeAtChapter === chapter)
        .map((wake) => wake.description),
      hasThunder: thunderSet.has(chapter),
    }));
  }, [timeline, visibleRange, wakeSchedule]);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="space-y-4">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <MapIcon size={16} className="text-cyan-600" />
              <h2 className="text-lg font-semibold text-slate-950">全局热力小地图</h2>
            </div>
            <HookMinimap chapters={minimapChapters} onSelectChapter={setFocusChapter} />
          </div>
          <HookMagnifier focusChapter={focusChapter} chapters={magnifierChapters} />
        </section>

        <section className="space-y-4">
          <ThunderAnim
            alerts={timeline.thunderingHerdAlerts}
            active={timeline.thunderingHerdAlerts.length > 0}
          />
          <div className="rounded-2xl border border-slate-200 bg-card p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Radar size={16} className="text-slate-700" />
              <h2 className="text-lg font-semibold text-slate-950">局部章节摘要</h2>
            </div>
            <p className="text-sm text-slate-600">
              当前窗口覆盖第 {visibleRange.from} 到第 {visibleRange.to} 章，围绕第 {focusChapter} 章展开，重点观察唤醒拥堵和伏笔回收窗口。
            </p>
            <div className="mt-4 space-y-2 text-sm text-slate-700">
              {timeline.thunderingHerdAlerts.length > 0 ? (
                timeline.thunderingHerdAlerts.map((alert) => (
                  <p key={alert.chapter} className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800">
                    {alert.message}
                  </p>
                ))
              ) : (
                <p className="rounded-lg bg-slate-50 px-3 py-2 text-slate-600">
                  当前没有检测到惊群分流事件。
                </p>
              )}
            </div>
          </div>
        </section>
      </div>

      <HookTimeline
        hooks={timeline.hooks}
        pendingWakes={wakeSchedule.pendingWakes}
        range={visibleRange}
      />
    </div>
  );
}