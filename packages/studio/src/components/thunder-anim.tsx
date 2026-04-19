import { Zap } from 'lucide-react';

/**
 * Thunder herd animation — visualizes hook分流 events with parabolic motion.
 */
export default function ThunderAnim({
  alerts,
  active,
}: {
  alerts: { hookId: string; description: string; 分流到: number }[];
  active: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Zap size={16} className={active ? 'text-yellow-500' : 'text-muted-foreground'} />
        <h3 className="text-sm font-semibold">惊群检测</h3>
      </div>
      {!active || alerts.length === 0 ? (
        <p className="text-xs text-muted-foreground">无惊群事件</p>
      ) : (
        <div className="space-y-2">
          {alerts.map((a, i) => (
            <div
              key={a.hookId}
              className="flex items-center gap-3 animate-pulse"
              style={{ animationDelay: `${i * 200}ms` }}
            >
              <span className="text-xs font-medium">{a.description}</span>
              <span className="text-xs text-muted-foreground">→ 分流至第{a.分流到}章</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
