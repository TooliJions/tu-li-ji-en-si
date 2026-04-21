interface RadarData {
  label: string;
  score: number;
}

interface RadarChartProps {
  data: RadarData[];
  size?: number;
  className?: string;
}

export default function RadarChart({ data, size = 300, className = '' }: RadarChartProps) {
  if (data.length < 3) return null;

  const center = size / 2;
  const radius = (size / 2) * 0.8;
  const angleStep = (Math.PI * 2) / data.length;

  // Calculate points for the polygon
  const points = data.map((d, i) => {
    const angle = i * angleStep - Math.PI / 2;
    const r = radius * Math.max(0.1, d.score); // minimum 10% for visibility
    return {
      x: center + r * Math.cos(angle),
      y: center + r * Math.sin(angle),
      labelX: center + (radius + 20) * Math.cos(angle),
      labelY: center + (radius + 20) * Math.sin(angle),
    };
  });

  const polygonPoints = points.map((p) => `${p.x},${p.y}`).join(' ');

  // Background circles (grid)
  const gridCircles = [0.2, 0.4, 0.6, 0.8, 1.0].map((r) => (
    <circle
      key={r}
      cx={center}
      cy={center}
      r={radius * r}
      fill="none"
      stroke="currentColor"
      className="text-muted/30"
      strokeWidth="1"
    />
  ));

  // Axis lines
  const axisLines = points.map((p, i) => {
    const angle = i * angleStep - Math.PI / 2;
    return (
      <line
        key={i}
        x1={center}
        y1={center}
        x2={center + radius * Math.cos(angle)}
        y2={center + radius * Math.sin(angle)}
        stroke="currentColor"
        className="text-muted/20"
        strokeWidth="1"
      />
    );
  });

  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Grid */}
        {gridCircles}
        {axisLines}

        {/* Data Area */}
        <polygon
          points={polygonPoints}
          fill="currentColor"
          className="text-primary/20"
          stroke="currentColor"
          strokeWidth="2"
        />

        {/* Data Points */}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="3" className="fill-primary" />
        ))}

        {/* Labels */}
        {data.map((d, i) => {
          const p = points[i];
          const textAnchor = p.labelX > center ? 'start' : p.labelX < center ? 'end' : 'middle';
          return (
            <text
              key={i}
              x={p.labelX}
              y={p.labelY}
              fontSize="10"
              textAnchor={textAnchor}
              dominantBaseline="middle"
              className="fill-muted-foreground font-medium"
            >
              {d.label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
