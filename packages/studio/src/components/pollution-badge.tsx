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
  const isHigh = level === 'high';

  return (
    <div
      className={`inline-flex items-center gap-2 px-2 py-1 rounded text-xs border ${
        isHigh ? 'border-orange-500 bg-orange-50' : 'border-gray-200 bg-gray-50'
      }`}
      style={
        isHigh
          ? {
              backgroundImage:
                'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(255,140,0,0.08) 4px, rgba(255,140,0,0.08) 8px)',
            }
          : undefined
      }
    >
      <span className="font-medium">{isHigh ? '污染隔离' : '已隔离'}</span>
      <span className="text-muted-foreground">{pct}%</span>
      <span className="text-muted-foreground">{source}</span>
    </div>
  );
}
