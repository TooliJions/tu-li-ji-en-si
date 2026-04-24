import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  BarChart3,
  TrendingDown,
  Zap,
  AlertCircle,
  Shuffle,
  CheckCircle,
  Shield,
  Activity,
} from 'lucide-react';
import {
  fetchWordCount,
  fetchAuditRate,
  fetchTokenUsage,
  fetchAiTrace,
  fetchQualityBaseline,
  fetchBaselineAlert,
  fetchEmotionalArcs,
  triggerInspirationShuffle,
  applyInspirationShuffle,
} from '../lib/api';
import TrendDetailChart from '../components/trend-detail-chart';
import SuggestionBubble from '../components/suggestion-bubble';
import InspirationShuffle from '../components/inspiration-shuffle';

interface WordCountData {
  totalWords: number;
  averagePerChapter: number;
  chapters: { number: number; words: number }[];
}

interface AuditRateData {
  totalAudits: number;
  passRate: number;
  perChapter: { number: number; passed: boolean }[];
}

interface TokenUsageData {
  totalTokens: number;
  perChannel: {
    writer: number;
    auditor: number;
    planner: number;
    composer: number;
    reviser: number;
  };
  perChapter: Array<{
    chapter: number;
    totalTokens: number;
    channels: {
      writer: number;
      auditor: number;
      planner: number;
      composer: number;
      reviser: number;
    };
  }>;
}

interface AiTraceData {
  trend: { chapter: number; score: number }[];
  average: number;
  latest: number;
}

interface QualityBaselineData {
  baseline: {
    version: number;
    basedOnChapters: number[];
    createdAt: string;
    metrics: { aiTraceScore: number; sentenceDiversity: number; avgParagraphLength: number };
  };
  current: {
    aiTraceScore: number;
    sentenceDiversity: number;
    avgParagraphLength: number;
    driftPercentage: number;
    alert: boolean;
  };
}

interface BaselineAlertData {
  metric: string;
  baseline: number;
  threshold: number;
  windowSize: number;
  slidingAverage: number;
  chaptersAnalyzed: number[];
  triggered: boolean;
  consecutiveChapters: number;
  severity: string;
  suggestedAction: string | null;
  inspirationShuffle: { available: boolean };
}

interface InspirationShuffleData {
  alternatives: {
    id: string;
    style: string;
    label: string;
    text: string;
    wordCount: number;
    characteristics: string[];
  }[];
  generationTime: number;
}

type EmotionType =
  | 'joy'
  | 'anger'
  | 'sadness'
  | 'fear'
  | 'surprise'
  | 'disgust'
  | 'trust'
  | 'anticipation';

interface EmotionalArcData {
  characters: Array<{
    name: string;
    chapters: Array<{
      chapterNumber: number;
      emotions: Record<EmotionType, number>;
      dominantEmotion: EmotionType;
      summary: string;
    }>;
  }>;
  alerts: Array<{ message: string; severity: string }>;
}

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

export default function Analytics() {
  const [searchParams] = useSearchParams();
  const bookId = searchParams.get('bookId') || '';
  const [loading, setLoading] = useState(true);

  const [wordCount, setWordCount] = useState<WordCountData | null>(null);
  const [auditRate, setAuditRate] = useState<AuditRateData | null>(null);
  const [tokenUsage, setTokenUsage] = useState<TokenUsageData | null>(null);
  const [aiTrace, setAiTrace] = useState<AiTraceData | null>(null);
  const [qualityBaseline, setQualityBaseline] = useState<QualityBaselineData | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [baselineAlert, setBaselineAlert] = useState<BaselineAlertData | null>(null);
  const [emotionalArcs, setEmotionalArcs] = useState<EmotionalArcData | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [inspirationResults, setInspirationResults] = useState<InspirationShuffleData | null>(null);
  const [shuffleLoading, setShuffleLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [shuffleError, setShuffleError] = useState<string | null>(null);
  const [shuffleOptions, setShuffleOptions] = useState<
    { id: string; text: string; score: number; style: string }[]
  >([]);

  useEffect(() => {
    if (!bookId) return;
    setLoadError(null);
    Promise.all([
      fetchWordCount(bookId),
      fetchAuditRate(bookId),
      fetchTokenUsage(bookId),
      fetchAiTrace(bookId),
      fetchQualityBaseline(bookId),
      fetchBaselineAlert(bookId),
      fetchEmotionalArcs(bookId),
    ])
      .then(([wc, ar, tu, at, qb, ba, ea]) => {
        setWordCount(wc);
        setAuditRate(ar);
        setTokenUsage(tu);
        setAiTrace(at);
        setQualityBaseline(qb);
        setBaselineAlert(ba);
        setEmotionalArcs(ea);
      })
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : '数据加载失败');
      })
      .finally(() => setLoading(false));
  }, [bookId]);

  async function handleShuffle() {
    if (!bookId) return;
    setShuffleLoading(true);
    setShuffleError(null);
    try {
      const result = await triggerInspirationShuffle(bookId);
      setInspirationResults(result);
      // Convert to InspirationShuffle component format
      setShuffleOptions(
        result.alternatives.map(
          (alt: { id: string; label: string; text: string; style: string }) => ({
            id: alt.id,
            text: `${alt.label} — ${alt.text}`,
            score: 0.7 + Math.random() * 0.3,
            style: alt.style,
          })
        )
      );
    } catch (err: unknown) {
      setShuffleError(err instanceof Error ? err.message : '灵感生成失败');
    } finally {
      setShuffleLoading(false);
    }
  }

  async function handleShuffleSelect(id: string) {
    if (!bookId) return;
    const selected = shuffleOptions.find((opt) => opt.id === id);
    if (!selected) return;

    try {
      // Extract just the text part (remove the "label — " prefix for the backend)
      const rawText = selected.text.includes(' — ')
        ? selected.text.split(' — ').slice(1).join(' — ')
        : selected.text;

      await applyInspirationShuffle(bookId, {
        id: selected.id,
        style: selected.style,
        text: rawText,
      });
      setShuffleOptions((prev) =>
        prev.map((opt) => (opt.id === id ? { ...opt, score: 1.0 } : opt))
      );
    } catch (err: unknown) {
      setShuffleError(err instanceof Error ? err.message : '应用失败');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">加载中…</div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
        <AlertCircle className="h-10 w-10 text-destructive opacity-60" />
        <p className="text-sm">{loadError}</p>
      </div>
    );
  }

  const maxWords = wordCount?.chapters.length
    ? Math.max(...wordCount.chapters.map((ch) => ch.words))
    : 0;

  const detailedTrendData =
    aiTrace?.trend.map((pt) => ({
      chapter: pt.chapter,
      aiTraceScore: pt.score,
      sentenceDiversity: qualityBaseline?.current.sentenceDiversity ?? 0.5,
      avgParagraphLength: qualityBaseline?.current.avgParagraphLength ?? 200,
      driftPercentage: qualityBaseline?.current.driftPercentage ?? 0,
    })) || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">数据分析</h1>
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← 返回仪表盘
        </Link>
      </div>

      {/* Baseline Alert Banner same */}

      {/* NEW: Quality Trend Detail Chart */}
      <div className="rounded-lg border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-6">
          <Activity size={18} className="text-primary" />
          <h2 className="text-lg font-semibold">质量趋势详情</h2>
        </div>
        <TrendDetailChart data={detailedTrendData} title="多维度演进分析" />
        <div className="mt-4 p-3 bg-muted/30 rounded text-xs text-muted-foreground leading-relaxed">
          <p>
            • <strong>AI 痕迹</strong>: 反映生成内容的机械感，数值越高表示 AI 痕迹越重。
          </p>
          <p>
            • <strong>句式多样性</strong>: 衡量语言表达的丰富度，理想基线通常在 0.6 以上。
          </p>
          <p>
            • <strong>基线漂移</strong>:
            检测当前创作是否偏离了设定的质量基线，漂移过大可能导致风格不统一。
          </p>
        </div>
      </div>

      {/* Word Count Chart same logic but maybe layout optimization */}

      {/* Word Count Chart */}
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 size={18} />
          <h2 className="text-lg font-semibold">字数统计</h2>
        </div>
        <div className="grid grid-cols-2 gap-4 mb-6">
          <InfoCard label="总字数" value={wordCount?.totalWords.toLocaleString() || '0'} />
          <InfoCard label="平均每章" value={wordCount?.averagePerChapter.toLocaleString() || '0'} />
        </div>
        {wordCount?.chapters.length ? (
          <div className="space-y-2">
            {wordCount.chapters.map((ch) => {
              const pct = maxWords > 0 ? (ch.words / maxWords) * 100 : 0;
              return (
                <div key={ch.number} className="flex items-center gap-3">
                  <span className="text-sm w-12 text-right text-muted-foreground">
                    第{ch.number}章
                  </span>
                  <div className="flex-1 h-5 bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-sm w-16 text-muted-foreground">
                    {ch.words.toLocaleString()}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">暂无章节数据</p>
        )}
      </div>

      {/* Audit Rate */}
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle size={18} className="text-green-500" />
          <h2 className="text-lg font-semibold">审计通过率</h2>
        </div>
        <div className="grid grid-cols-2 gap-4 mb-6">
          <InfoCard label="总审计次数" value={auditRate?.totalAudits.toLocaleString() || '0'} />
          <InfoCard
            label="通过率"
            value={auditRate ? `${(auditRate.passRate * 100).toFixed(1)}%` : '0%'}
          />
        </div>
        {auditRate?.perChapter.length ? (
          <div className="flex flex-wrap gap-2">
            {auditRate.perChapter.map((ch) => (
              <span
                key={ch.number}
                className={`px-3 py-1.5 rounded text-xs font-medium ${
                  ch.passed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}
              >
                第{ch.number}章 {ch.passed ? '通过' : '未通过'}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">暂无审计数据</p>
        )}
      </div>

      {/* Token Usage */}
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Zap size={18} className="text-yellow-500" />
          <h2 className="text-lg font-semibold">Token 用量</h2>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <div className="mb-4">
              <InfoCard label="总计" value={tokenUsage?.totalTokens.toLocaleString() || '0'} />
            </div>
            {tokenUsage?.perChannel && (
              <div className="space-y-2">
                {Object.entries(tokenUsage.perChannel).map(([channel, tokens]) => {
                  const maxTokens = Math.max(...Object.values(tokenUsage.perChannel), 1);
                  const pct = (tokens / maxTokens) * 100;
                  return (
                    <div key={channel} className="flex items-center gap-3">
                      <span className="text-sm w-20 text-muted-foreground">{channel}</span>
                      <div className="flex-1 h-4 bg-secondary rounded-full overflow-hidden">
                        <div
                          className="h-full bg-purple-500 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-sm w-16 text-muted-foreground">
                        {tokens.toLocaleString()}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-3">按章节分布</p>
            <div className="space-y-2">
              {tokenUsage?.perChapter?.length ? (
                tokenUsage.perChapter.map((chapter) => (
                  <div key={chapter.chapter} className="rounded border bg-secondary/40 p-3">
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span>第{chapter.chapter}章</span>
                      <span className="text-muted-foreground">
                        {chapter.totalTokens.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(chapter.channels)
                        .filter(([, tokens]) => tokens > 0)
                        .map(([channel, tokens]) => (
                          <span
                            key={channel}
                            className="px-2 py-0.5 rounded-full text-xs bg-background text-muted-foreground"
                          >
                            {channel} {tokens.toLocaleString()}
                          </span>
                        ))}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">暂无章节 Token 数据</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* AI Trace Trend */}
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <TrendingDown
            size={18}
            className={
              aiTrace?.latest !== undefined && aiTrace.latest < 0.2
                ? 'text-green-500'
                : 'text-red-500'
            }
          />
          <h2 className="text-lg font-semibold">AI 痕迹趋势</h2>
        </div>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <InfoCard
            label="平均值"
            value={aiTrace ? `${(aiTrace.average * 100).toFixed(1)}%` : '0%'}
          />
          <InfoCard label="最新" value={aiTrace ? `${(aiTrace.latest * 100).toFixed(1)}%` : '0%'} />
          <InfoCard label="章节数" value={aiTrace?.trend.length.toString() || '0'} />
        </div>
        {aiTrace?.trend.length ? (
          <div className="relative">
            {/* Amber gradient attention zone SVG */}
            <svg width="0" height="0" className="absolute">
              <defs>
                <linearGradient id="amberGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.05" />
                </linearGradient>
              </defs>
            </svg>
            <div className="flex items-end gap-2 h-24 relative">
              {/* Attention zone background - 0.20 threshold */}
              <div
                className="absolute left-0 right-0 bg-amber-400/10 border-t border-dashed border-amber-400"
                data-attention-zone
                style={{ bottom: '20%', height: '80%' }}
              />
              {/* 0.20 threshold line */}
              <div
                className="absolute left-0 right-0 border-t border-dashed border-amber-500 z-10"
                style={{ bottom: '20%' }}
              >
                <span className="absolute right-0 -top-4 text-[10px] text-amber-600 font-medium">
                  关注区 0.20
                </span>
              </div>
              {aiTrace.trend.map((point) => {
                const height = Math.max(point.score * 100, 4);
                return (
                  <div key={point.chapter} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-xs text-muted-foreground">
                      {(point.score * 100).toFixed(0)}%
                    </span>
                    <div
                      className={`w-full rounded-t transition-all ${
                        point.score < 0.2
                          ? 'bg-green-400'
                          : point.score < 0.4
                            ? 'bg-yellow-400'
                            : 'bg-red-400'
                      }`}
                      style={{ height: `${height}%`, maxHeight: '80px' }}
                    />
                    <span className="text-xs text-muted-foreground">Ch{point.chapter}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">暂无AI痕迹数据</p>
        )}

        {/* Suggestion bubble - when recent chapters trend into attention zone */}
        {aiTrace &&
          aiTrace.trend.length >= 3 &&
          (() => {
            const recent = aiTrace.trend.slice(-3);
            const anyInAttention = recent.some((p) => p.score >= 0.2);
            return anyInAttention ? (
              <SuggestionBubble
                type="warning"
                title="建议"
                message="近期的文字似乎有些刻板，可能的原因："
                reasons={[
                  '当前模型的表达风格趋于模式化',
                  '大纲结构可能限制了叙事自由度',
                  '角色情感弧线进入平缓期',
                ]}
                actions={
                  <>
                    <Link
                      to={`/config?bookId=${bookId}`}
                      className="px-3 py-1.5 bg-amber-100 text-amber-800 rounded text-sm hover:bg-amber-200"
                    >
                      切换至更具创造力的模型
                    </Link>
                    <button
                      onClick={handleShuffle}
                      className="px-3 py-1.5 bg-amber-100 text-amber-800 rounded text-sm hover:bg-amber-200"
                    >
                      灵感洗牌：重写当前段落
                    </button>
                  </>
                }
              />
            ) : null;
          })()}
      </div>

      {/* Quality Baseline */}
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Shield size={18} />
          <h2 className="text-lg font-semibold">质量基线</h2>
        </div>
        {qualityBaseline && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              <InfoCard label="版本" value={`v${qualityBaseline.baseline.version}`} />
              <InfoCard
                label="漂移"
                value={`${(qualityBaseline.current.driftPercentage * 100).toFixed(1)}%`}
              />
              <InfoCard label="AI 痕迹" value={qualityBaseline.current.aiTraceScore.toFixed(3)} />
              <InfoCard
                label="句式多样"
                value={qualityBaseline.current.sentenceDiversity.toFixed(2)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              基于第 {qualityBaseline.baseline.basedOnChapters.join(', ')} 章 · 创建于{' '}
              {new Date(qualityBaseline.baseline.createdAt).toLocaleString('zh-CN')}
            </p>
          </>
        )}
      </div>

      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <TrendingDown size={18} className="text-pink-500" />
          <h2 className="text-lg font-semibold">情感弧线概览</h2>
        </div>
        {emotionalArcs?.characters.length ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {emotionalArcs.characters.map((character) => {
                const latest = character.chapters.at(-1);
                return (
                  <div key={character.name} className="rounded border p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-medium">{character.name}</h3>
                      <span className="text-xs text-muted-foreground">
                        {character.chapters.length} 章
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {latest ? latest.summary : '暂无情绪数据'}
                    </p>
                    {latest && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {Object.entries(latest.emotions)
                          .filter(([, value]) => value >= 0.1)
                          .sort((left, right) => right[1] - left[1])
                          .slice(0, 3)
                          .map(([emotion, value]) => (
                            <span
                              key={emotion}
                              className="px-2 py-0.5 rounded-full text-xs bg-secondary text-secondary-foreground"
                            >
                              {EMOTION_LABELS[emotion as EmotionType]} {(value * 100).toFixed(0)}%
                            </span>
                          ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {emotionalArcs.alerts.length > 0 && (
              <div className="rounded border border-orange-300 bg-orange-50 p-4">
                <p className="font-medium text-orange-800 mb-2">情感弧线告警</p>
                <div className="space-y-1 text-sm text-orange-700">
                  {emotionalArcs.alerts.slice(0, 3).map((alert) => (
                    <p key={alert.message}>{alert.message}</p>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">暂无情感弧线数据</p>
        )}
      </div>

      {/* Inspiration Shuffle */}
      {shuffleOptions.length > 0 ? (
        <InspirationShuffle
          options={shuffleOptions}
          onSelect={handleShuffleSelect}
          onShuffle={handleShuffle}
        />
      ) : (
        <div className="rounded-lg border bg-card p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Shuffle size={18} className="text-pink-500" />
              <h2 className="text-lg font-semibold">灵感洗牌</h2>
            </div>
            <button
              onClick={handleShuffle}
              disabled={shuffleLoading}
              className="px-4 py-1.5 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 disabled:opacity-50"
            >
              {shuffleLoading ? '生成中…' : '生成灵感'}
            </button>
          </div>
          {shuffleError && <p className="text-sm text-destructive">{shuffleError}</p>}
          {!shuffleLoading && !shuffleError && (
            <p className="text-sm text-muted-foreground">点击「生成灵感」获取不同风格的写作方案</p>
          )}
        </div>
      )}
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-lg font-bold mt-1">{value}</p>
    </div>
  );
}
