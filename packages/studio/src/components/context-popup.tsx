/**
 * Context popup card — hovers above text to show extracted context.
 * Flow-mode exclusive: triggered on hover, shows entity context.
 */
export default function ContextPopup({
  title,
  content,
  visible,
  tags,
  confidence,
  flowMode,
}: {
  title: string;
  content: string;
  visible: boolean;
  tags?: string[];
  confidence?: number;
  flowMode?: boolean;
}) {
  if (!visible) return null;

  return (
    <div
      className={`absolute z-50 bg-popover border rounded-lg shadow-lg p-4 w-64 max-w-sm ${
        flowMode ? 'animate-in fade-in-0 duration-300' : ''
      }`}
    >
      <h4 className="text-sm font-semibold mb-2">{title}</h4>
      <p className="text-xs text-muted-foreground mb-3 leading-relaxed">{content}</p>
      <div className="flex items-center gap-2">
        {tags?.map((t) => (
          <span
            key={t}
            className="px-2 py-0.5 rounded text-xs bg-secondary text-secondary-foreground"
          >
            {t}
          </span>
        ))}
        {confidence !== undefined && (
          <span className="ml-auto text-xs text-muted-foreground">
            {Math.round(confidence * 100)}%
          </span>
        )}
      </div>
    </div>
  );
}
