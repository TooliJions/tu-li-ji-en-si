import { Shuffle, Sparkles } from 'lucide-react';

/**
 * Style rewrite panel — presents 3 style-rewrite alternatives for the opening paragraph.
 * Renamed from "灵感洗牌" to reflect actual behavior: paragraph-level style rewriting, not inspiration generation.
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
          <h3 className="text-lg font-semibold">风格改写</h3>
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
      <p className="text-xs text-muted-foreground mb-3">
        以下为最新章节开篇段落的风格改写方案，采用后将替换原开篇段落，章节其余内容保持不变。
      </p>
      <div className="space-y-3">
        {options.map((opt) => (
          <div
            key={opt.id}
            className="rounded border p-4 bg-background flex items-start justify-between gap-3"
          >
            <div className="flex-1">
              <p className="text-sm whitespace-pre-line">{opt.text}</p>
              <div className="text-xs text-muted-foreground mt-1">字数: {opt.text.length}</div>
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
