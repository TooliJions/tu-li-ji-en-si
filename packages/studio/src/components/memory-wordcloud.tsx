/**
 * Memory wordcloud — displays extracted memories as sized tags.
 * Font size scales with confidence. Fade-in animation.
 */
export default function MemoryWordcloud({
  memories,
  onMemoryEnter,
  onMemoryLeave,
}: {
  memories: {
    text: string;
    confidence: number;
    sourceType?: string;
    entityType?: string | null;
  }[];
  onMemoryEnter?: (memory: {
    text: string;
    confidence: number;
    sourceType?: string;
    entityType?: string | null;
  }, event: React.MouseEvent<HTMLElement>) => void;
  onMemoryLeave?: () => void;
}) {
  if (memories.length === 0) {
    return <p className="text-center text-muted-foreground py-8">暂无记忆</p>;
  }

  const display = memories.slice(0, 15);

  return (
    <div className="flex flex-wrap gap-2 animate-in fade-in-0 duration-500">
      {display.map((m) => {
        const fontSize = 0.75 + m.confidence * 0.75;
        const opacity = 0.4 + m.confidence * 0.6;
        const lowConfidence = m.confidence < 0.45;
        const sourceLabel =
          m.sourceType === 'character' ? '角色' : m.sourceType === 'fact' ? '事实' : m.sourceType === 'hook' ? '伏笔' : null;
        const sourceClass =
          m.sourceType === 'character'
            ? 'bg-sky-50 text-sky-700'
            : m.sourceType === 'hook'
              ? 'bg-amber-50 text-amber-700'
              : 'bg-slate-100 text-slate-700';
        return (
          <span
            key={m.text}
            className={`inline-block px-2 py-1 rounded-full transition-colors transition-opacity ${
              lowConfidence
                ? 'bg-red-100 text-red-700 ring-1 ring-red-300/70'
                : 'bg-secondary text-secondary-foreground hover:bg-accent'
            } ${m.entityType ? 'cursor-pointer' : ''}`}
            style={{ fontSize: `${fontSize}rem`, opacity }}
            onMouseEnter={(event) => onMemoryEnter?.(m, event)}
            onMouseLeave={() => onMemoryLeave?.()}
          >
            <span>{m.text}</span>
            {sourceLabel && (
              <span className={`ml-2 inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium ${sourceClass}`}>
                {sourceLabel}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}
