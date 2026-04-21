import { useMemo } from 'react';

interface MetricPoint {
  chapter: number;
  aiTraceScore: number;
  sentenceDiversity: number;
  avgParagraphLength: number;
  driftPercentage: number;
}

interface TrendDetailChartProps {
  data: MetricPoint[];
  title?: string;
  height?: number;
}

export default function TrendDetailChart({ data, title, height = 200 }: TrendDetailChartProps) {
  const chartHeight = height;
  const padding = 30;
  const chartWidth = 600; // Relative coordinates for SVG

  const points = useMemo(() => {
    if (data.length === 0) return [];

    // Normalize paragraph length for display (assuming typical values around 100-500 chars)
    const maxLen = Math.max(...data.map((d) => d.avgParagraphLength), 500);

    return data.map((d, i) => {
      const x = padding + (i * (chartWidth - padding * 2)) / (data.length - 1 || 1);
      return {
        x,
        chapter: d.chapter,
        aiTrace: chartHeight - padding - d.aiTraceScore * (chartHeight - padding * 2),
        diversity: chartHeight - padding - d.sentenceDiversity * (chartHeight - padding * 2),
        drift: chartHeight - padding - d.driftPercentage * (chartHeight - padding * 2),
        paraLen:
          chartHeight - padding - (d.avgParagraphLength / maxLen) * (chartHeight - padding * 2),
      };
    });
  }, [data, chartHeight]);

  if (data.length < 2) {
    return (
      <div className="flex flex-col items-center justify-center h-48 bg-muted/10 rounded-lg border border-dashed">
        <p className="text-sm text-muted-foreground">需要至少 2 个章节的数据来绘制趋势详情</p>
      </div>
    );
  }

  const createPath = (key: keyof (typeof points)[0]) => {
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p[key]}`).join(' ');
  };

  return (
    <div className="space-y-4">
      {title && (
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          {title}
        </h3>
      )}

      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="w-full h-auto overflow-visible"
        >
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((v, i) => (
            <line
              key={i}
              x1={padding}
              y1={padding + v * (chartHeight - padding * 2)}
              x2={chartWidth - padding}
              y2={padding + v * (chartHeight - padding * 2)}
              stroke="currentColor"
              className="text-muted/20"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
          ))}

          {/* Paths */}
          <path
            d={createPath('aiTrace')}
            fill="none"
            stroke="#3b82f6"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d={createPath('diversity')}
            fill="none"
            stroke="#10b981"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d={createPath('drift')}
            fill="none"
            stroke="#f59e0b"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d={createPath('paraLen')}
            fill="none"
            stroke="#8b5cf6"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="2 2"
            opacity="0.6"
          />

          {/* Points */}
          {points.map((p, i) => (
            <g key={i}>
              <circle cx={p.x} cy={p.aiTrace} r="3" fill="#3b82f6" />
              <text
                x={p.x}
                y={chartHeight - 5}
                fontSize="10"
                textAnchor="middle"
                className="fill-muted-foreground"
              >
                Ch{p.chapter}
              </text>
            </g>
          ))}
        </svg>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-6 gap-y-2 pt-2 border-t">
        <LegendItem color="#3b82f6" label="AI 痕迹" />
        <LegendItem color="#10b981" label="句式多样性" />
        <LegendItem color="#f59e0b" label="基线漂移" />
        <LegendItem color="#8b5cf6" label="段落长度" dashed />
      </div>
    </div>
  );
}

function LegendItem({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={`w-3 h-0.5 ${dashed ? 'border-b border-dashed' : ''}`}
        style={{ backgroundColor: dashed ? 'transparent' : color, borderColor: color }}
      />
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
