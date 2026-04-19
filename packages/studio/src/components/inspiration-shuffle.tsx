import { Shuffle, Sparkles } from 'lucide-react';

/**
 * Inspiration shuffle — presents 3 rewrite alternatives for comparison.
 */
export default function InspirationShuffle({
  options,
  onSelect,
  onShuffle,
}: {
  options: { id: string; text: string; score: number }[];
  onSelect: (id: string) => void;
  onShuffle?: () => void;
}) {
  return (
    <div className="rounded-lg border bg-card p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-amber-500" />
          <h3 className="text-lg font-semibold">灵感洗牌</h3>
        </div>
        {onShuffle && (
          <button
            onClick={onShuffle}
            className="px-3 py-1.5 rounded text-sm border hover:bg-accent flex items-center gap-1"
          >
            <Shuffle size={14} />
            换一批
          </button>
        )}
      </div>
      <div className="space-y-3">
        {options.map((opt) => (
          <div
            key={opt.id}
            className="rounded border p-4 bg-background flex items-start justify-between gap-3"
          >
            <div className="flex-1">
              <p className="text-sm">{opt.text}</p>
              <div className="text-xs text-muted-foreground mt-1">
                匹配度: {Math.round(opt.score * 100)}%
              </div>
            </div>
            <button
              onClick={() => onSelect(opt.id)}
              className="px-3 py-1.5 bg-primary text-primary-foreground rounded text-sm hover:bg-primary/90 shrink-0"
            >
              采用
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
