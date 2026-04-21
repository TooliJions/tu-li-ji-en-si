import { Zap } from 'lucide-react';

/**
 * Thunder herd animation — visualizes hook分流 events with parabolic motion.
 * PRD-056b: Cards fly in with parabolic arc and land in subsequent chapter columns.
 */
export default function ThunderAnim({
  alerts,
  active,
}: {
  alerts: { chapter: number; count: number; message: string }[];
  active: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <Zap
          size={16}
          className={active ? 'text-yellow-500 animate-pulse' : 'text-muted-foreground'}
        />
        <h3 className="text-sm font-semibold">惊群检测</h3>
      </div>
      {!active || alerts.length === 0 ? (
        <p className="text-xs text-muted-foreground">无惊群事件</p>
      ) : (
        <div className="space-y-2">
          {alerts.map((a, i) => (
            <div
              key={`${a.chapter}-${a.message}`}
              className="thunder-card flex items-center justify-between gap-3 rounded-md border border-yellow-200 bg-yellow-50/80 px-3 py-2"
              style={
                {
                  animationDelay: `${i * 200}ms`,
                  '--parab-mid-x': `${(i + 1) * 30}px`,
                  '--parab-mid-y': `-${40 + i * 20}px`,
                  '--parab-end-x': `${(i + 1) * 12}px`,
                  '--parab-end-y': `${i * 4}px`,
                } as React.CSSProperties
              }
            >
              <span className="text-xs font-medium text-yellow-900">{a.message}</span>
              <span className="text-[11px] text-yellow-700">强度 {a.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
