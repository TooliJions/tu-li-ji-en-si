/**
 * Entity highlight component — wraps entity words in text with dashed underline styling.
 * Used in flow-mode reading to passively perceive entities.
 */
export default function EntityHighlight({
  text,
  entities,
  highlightClass,
  onEntityEnter,
  onEntityLeave,
}: {
  text: string;
  entities: string[];
  highlightClass?: string;
  onEntityEnter?: (entity: string, event: React.MouseEvent<HTMLElement>) => void;
  onEntityLeave?: () => void;
}) {
  if (!text || entities.length === 0) {
    return <>{text}</>;
  }

  // Sort by length descending — longer entities first to avoid partial matches
  const sorted = [...entities].sort((a, b) => b.length - a.length);
  const parts = splitText(text, sorted);

  return (
    <>
      {parts.map((part, i) =>
        part.isEntity ? (
          <mark
            key={i}
            className={
              highlightClass || 'border-b-2 border-dashed border-amber-500 bg-transparent px-0 py-0'
            }
            onMouseEnter={(event) => onEntityEnter?.(part.text, event)}
            onMouseLeave={() => onEntityLeave?.()}
          >
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </>
  );
}

function splitText(text: string, entities: string[]): { text: string; isEntity: boolean }[] {
  if (entities.length === 0) return [{ text, isEntity: false }];

  const escaped = entities.map((e) => e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`(${escaped.join('|')})`, 'gi');
  const parts: { text: string; isEntity: boolean }[] = [];
  const lowerEntities = new Set(entities.map((e) => e.toLowerCase()));

  const matches = text.split(pattern);
  for (const segment of matches) {
    if (!segment) continue;
    parts.push({
      text: segment,
      isEntity: lowerEntities.has(segment.toLowerCase()),
    });
  }

  return parts;
}
