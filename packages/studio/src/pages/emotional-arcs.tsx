import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Heart, AlertTriangle, ArrowLeft, ArrowRight } from 'lucide-react';
import { fetchEmotionalArcs } from '../lib/api';

type EmotionType =
  | 'joy'
  | 'anger'
  | 'sadness'
  | 'fear'
  | 'surprise'
  | 'disgust'
  | 'trust'
  | 'anticipation';

interface ChapterEmotion {
  chapterNumber: number;
  emotions: Record<EmotionType, number>;
  deltas: Record<EmotionType, number> | null;
  dominantEmotion: EmotionType;
  summary: string;
}

interface CharacterArc {
  name: string;
  chapters: ChapterEmotion[];
}

interface EmotionBreakAlert {
  type: string;
  character: string;
  chapterNumber: number;
  emotion: string;
  severity: string;
  message: string;
}

interface EmotionArcData {
  characters: CharacterArc[];
  alerts: EmotionBreakAlert[];
}

const EMOTION_COLORS: Record<EmotionType, string> = {
  joy: 'bg-yellow-400',
  anger: 'bg-red-500',
  sadness: 'bg-blue-400',
  fear: 'bg-purple-500',
  surprise: 'bg-pink-400',
  disgust: 'bg-green-600',
  trust: 'bg-emerald-400',
  anticipation: 'bg-orange-400',
};

const EMOTION_LABELS: Record<EmotionType, string> = {
  joy: '喜悦',
  anger: '愤怒',
  sadness: '悲伤',
  fear: '恐惧',
  surprise: '惊讶',
  disgust: '厌恶',
  trust: '信任',
  anticipation: '期待',
};

const EMOTION_TYPES: EmotionType[] = [
  'joy',
  'anger',
  'sadness',
  'fear',
  'surprise',
  'disgust',
  'trust',
  'anticipation',
];

// PRD-015: SVG line chart for emotional arc visualization
const CHART_EMOTIONS: EmotionType[] = ['joy', 'anger', 'sadness', 'fear', 'anticipation'];
const CHART_COLORS: Record<EmotionType, string> = {
  joy: '#facc15',
  anger: '#ef4444',
  sadness: '#60a5fa',
  fear: '#a855f7',
  anticipation: '#fb923c',
  surprise: '#ec4899',
  disgust: '#16a34a',
  trust: '#34d399',
};

function EmotionLineChart({ chapters }: { chapters: ChapterEmotion[] }) {
  if (chapters.length < 2) return null;

  const width = 600;
  const height = 200;
  const padding = { top: 20, right: 80, bottom: 30, left: 40 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const xStep = chartW / Math.max(chapters.length - 1, 1);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((v) => {
        const y = padding.top + chartH - v * chartH;
        return (
          <g key={v}>
            <line
              x1={padding.left}
              y1={y}
              x2={width - padding.right}
              y2={y}
              stroke="#e2e8f0"
              strokeWidth="1"
            />
            <text x={padding.left - 8} y={y + 4} textAnchor="end" fontSize="10" fill="#94a3b8">
              {Math.round(v * 100)}
            </text>
          </g>
        );
      })}

      {/* Chapter labels */}
      {chapters.map((ch, i) => {
        if (chapters.length <= 12 || i % Math.ceil(chapters.length / 10) === 0) {
          const x = padding.left + i * xStep;
          return (
            <text
              key={ch.chapterNumber}
              x={x}
              y={height - 5}
              textAnchor="middle"
              fontSize="10"
              fill="#94a3b8"
            >
              Ch{ch.chapterNumber}
            </text>
          );
        }
        return null;
      })}

      {/* Lines */}
      {CHART_EMOTIONS.map((emotion) => {
        const points = chapters.map((ch, i) => {
          const x = padding.left + i * xStep;
          const y = padding.top + chartH - ch.emotions[emotion] * chartH;
          return `${x},${y}`;
        });

        return (
          <polyline
            key={emotion}
            points={points.join(' ')}
            fill="none"
            stroke={CHART_COLORS[emotion]}
            strokeWidth="2"
            strokeLinejoin="round"
          />
        );
      })}

      {/* Data points */}
      {CHART_EMOTIONS.map((emotion) =>
        chapters.map((ch, i) => {
          const x = padding.left + i * xStep;
          const y = padding.top + chartH - ch.emotions[emotion] * chartH;
          return (
            <circle
              key={`${ch.chapterNumber}-${emotion}`}
              cx={x}
              cy={y}
              r="2.5"
              fill={CHART_COLORS[emotion]}
              stroke="white"
              strokeWidth="1"
            />
          );
        })
      )}

      {/* Legend */}
      {CHART_EMOTIONS.map((emotion, i) => {
        const lx = width - padding.right + 10;
        const ly = padding.top + i * 18;
        return (
          <g key={emotion}>
            <line
              x1={lx}
              y1={ly}
              x2={lx + 16}
              y2={ly}
              stroke={CHART_COLORS[emotion]}
              strokeWidth="2"
            />
            <text x={lx + 20} y={ly + 4} fontSize="11" fill="#475569">
              {EMOTION_LABELS[emotion]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function EmotionalArcs() {
  const { bookId } = useParams<{ bookId: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<EmotionArcData | null>(null);
  const [selectedCharacter, setSelectedCharacter] = useState<string | null>(null);

  useEffect(() => {
    if (!bookId) return;
    fetchEmotionalArcs(bookId)
      .then((d) => {
        setData(d);
        if (d.characters.length > 0) setSelectedCharacter(d.characters[0].name);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [bookId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">加载中…</div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">{error}</p>
        <Link to={`/book/${bookId}`} className="text-primary mt-4 inline-block">
          返回书籍详情
        </Link>
      </div>
    );
  }

  if (!data || data.characters.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">情感弧线</h1>
          <Link
            to={`/book/${bookId}`}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← 返回书籍详情
          </Link>
        </div>
        <div className="text-center py-12 text-muted-foreground">暂无情感弧线数据</div>
      </div>
    );
  }

  const currentArc = data.characters.find((c) => c.name === selectedCharacter)!;
  const severityColor = (sev: string) =>
    sev === 'critical' ? 'border-red-500 bg-red-50' : 'border-orange-400 bg-orange-50';
  const severityIcon = (sev: string) => (sev === 'critical' ? '🔴' : '🟠');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Heart size={20} className="text-pink-500" />
          <h1 className="text-2xl font-bold">情感弧线</h1>
        </div>
        <Link
          to={`/book/${bookId}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← 返回书籍详情
        </Link>
      </div>

      {/* Alert Banner */}
      {data.alerts.length > 0 && (
        <div className={`rounded-lg border ${severityColor(data.alerts[0].severity)} p-4`}>
          <div className="flex items-start gap-2">
            <AlertTriangle size={18} className="text-orange-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-orange-800">
                情感弧线断裂告警 ({data.alerts.length} 项)
              </p>
              <ul className="text-sm text-orange-700 mt-1 space-y-1">
                {data.alerts.slice(0, 5).map((a, i) => (
                  <li key={i}>
                    {severityIcon(a.severity)} {a.message}
                  </li>
                ))}
              </ul>
              {data.alerts.length > 5 && (
                <p className="text-xs text-orange-600 mt-1">
                  …还有 {data.alerts.length - 5} 项告警
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Character Tabs */}
      <div className="flex gap-2 border-b pb-2">
        {data.characters.map((char) => (
          <button
            key={char.name}
            onClick={() => setSelectedCharacter(char.name)}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
              selectedCharacter === char.name
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent'
            }`}
          >
            {char.name}
            <span className="ml-1 text-xs opacity-70">({char.chapters.length} 章)</span>
          </button>
        ))}
      </div>

      {/* Emotion Bars per Chapter */}
      {currentArc && (
        <>
          {/* PRD-015: SVG Line Chart */}
          <div className="rounded-lg border bg-card p-6">
            <h2 className="text-lg font-semibold mb-4">{currentArc.name} 的情感弧线</h2>
            <EmotionLineChart chapters={currentArc.chapters} />
          </div>

          {/* Detail bars */}
          <div className="rounded-lg border bg-card p-6">
            <h2 className="text-lg font-semibold mb-4">{currentArc.name} 的情感变化</h2>
            <div className="space-y-4">
              {currentArc.chapters.map((ch) => (
                <div key={ch.chapterNumber} className="border-b pb-3 last:border-b-0 last:pb-0">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <span className="w-12 text-sm font-medium text-muted-foreground">
                        第{ch.chapterNumber}章
                      </span>
                      <span className="text-sm px-2 py-0.5 rounded bg-secondary">{ch.summary}</span>
                    </div>
                    {/* Delta indicators */}
                    {ch.deltas && (
                      <div className="flex gap-2 text-xs">
                        {EMOTION_TYPES.filter((t) => Math.abs(ch.deltas![t]) >= 0.15).map((t) => (
                          <span
                            key={t}
                            className={`px-1.5 py-0.5 rounded ${
                              ch.deltas![t] > 0
                                ? 'bg-green-100 text-green-700'
                                : 'bg-red-100 text-red-700'
                            }`}
                          >
                            {EMOTION_LABELS[t]} {ch.deltas![t] > 0 ? '↑' : '↓'}
                            {Math.abs(ch.deltas![t] * 100).toFixed(0)}%
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* Emotion mini-bars */}
                  <div className="flex gap-1 ml-12">
                    {EMOTION_TYPES.map((type) => {
                      const pct = ch.emotions[type] * 100;
                      if (pct < 5) return null;
                      return (
                        <div
                          key={type}
                          className="flex items-center gap-1"
                          title={`${EMOTION_LABELS[type]}: ${pct.toFixed(0)}%`}
                        >
                          <div className="w-16 h-3 bg-secondary rounded-full overflow-hidden">
                            <div
                              className={`h-full ${EMOTION_COLORS[type]} rounded-full`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground w-4">
                            {EMOTION_LABELS[type].charAt(0)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <Link
          to={`/book/${bookId}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={14} /> 上一章
        </Link>
        <Link
          to={`/book/${bookId}/emotional-arcs/next`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          下一章 <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}
