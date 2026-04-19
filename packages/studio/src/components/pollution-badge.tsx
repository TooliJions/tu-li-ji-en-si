/**
 * Pollution isolation badge — visually marks chapters with AI contamination.
 * Orange border + slanted background pattern for polluted chapters.
 */
export default function PollutionBadge({
  level,
  contaminationScore,
  source,
}: {
  level: 'low' | 'medium' | 'high';
  contaminationScore: number;
  source: string;
}) {
  const pct = Math.round(contaminationScore * 100);
  const isWarningLevel = level === 'medium' || level === 'high';
  const primaryLabel = isWarningLevel ? '污染隔离' : '已隔离';
  const secondaryLabel = level === 'high' ? '强制通过' : level === 'medium' ? '待复核' : null;

  return (
    <div
      className={`inline-flex items-center gap-2 px-2 py-1 rounded text-xs border ${
        isWarningLevel
          ? 'border-orange-500 bg-orange-50 text-orange-900'
          : 'border-gray-200 bg-gray-50'
      }`}
      style={
        isWarningLevel
          ? {
              backgroundImage:
                'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(255,140,0,0.08) 4px, rgba(255,140,0,0.08) 8px)',
            }
          : undefined
      }
    >
      <span className="font-medium">{primaryLabel}</span>
      {secondaryLabel ? <span className="font-medium">{secondaryLabel}</span> : null}
      <span className="text-muted-foreground">{pct}%</span>
      <span className="text-muted-foreground">{source}</span>
    </div>
  );
}
