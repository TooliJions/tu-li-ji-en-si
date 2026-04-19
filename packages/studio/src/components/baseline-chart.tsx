/**
 * Baseline trend chart — quality score over chapters with dashed baseline.
 * Amber gradient focus area, visual drift detection.
 */
export default function BaselineChart({
  data,
  title,
}: {
  data: { chapter: number; score: number; baseline: number }[];
  title: string;
}) {
  if (data.length === 0) {
    return (
      <div>
        <h3 className="text-lg font-semibold mb-4">{title}</h3>
        <p className="text-center text-muted-foreground py-8">暂无数据</p>
      </div>
    );
  }

  const baseline = data[0]?.baseline ?? 0;
  const maxScore = 1;

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">{title}</h3>
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
        <span>基线: {Math.round(baseline * 100)}%</span>
      </div>
      <div className="space-y-2">
        {data.map((d) => {
          const scorePct = Math.round((d.score / maxScore) * 100);
          const baselinePct = Math.round((d.baseline / maxScore) * 100);
          const isBelow = d.score < d.baseline;
          return (
            <div key={d.chapter} className="flex items-center gap-3">
              <span className="text-sm w-12 text-right text-muted-foreground">第{d.chapter}章</span>
              <div className="flex-1 relative">
                {/* Score bar */}
                <div
                  className={`h-5 rounded transition-all ${
                    isBelow ? 'bg-orange-400' : 'bg-indigo-400'
                  }`}
                  style={{ width: `${scorePct}%` }}
                />
                {/* Baseline dashed line marker */}
                <div
                  className="absolute top-0 h-5 border-l-2 border-dashed border-gray-400"
                  style={{ left: `${baselinePct}%` }}
                />
              </div>
              <span className="text-xs w-10 text-muted-foreground">{scorePct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
