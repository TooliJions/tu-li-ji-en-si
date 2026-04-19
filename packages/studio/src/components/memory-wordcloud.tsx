/**
 * Memory wordcloud — displays extracted memories as sized tags.
 * Font size scales with confidence. Fade-in animation.
 */
export default function MemoryWordcloud({
  memories,
}: {
  memories: { text: string; confidence: number }[];
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
        return (
          <span
            key={m.text}
            className="inline-block px-2 py-1 rounded-full bg-secondary text-secondary-foreground transition-opacity"
            style={{ fontSize: `${fontSize}rem`, opacity }}
          >
            {m.text}
          </span>
        );
      })}
    </div>
  );
}
