// ─── Types ─────────────────────────────────────────────────────────

export type CadenceQuality = 'poor' | 'uniform' | 'good' | 'excellent';
export type SuggestionType =
  | 'paragraph-uniform'
  | 'paragraph-too-long'
  | 'paragraph-too-short'
  | 'sentence-uniform'
  | 'sentence-too-long'
  | 'dialogue-heavy'
  | 'description-heavy'
  | 'pacing-flat';

export interface CadenceInput {
  chapterContent: string;
  chapterNumber: number;
  genre: string;
}

export interface ParagraphCadence {
  count: number;
  avgLen: number;
  stdDev: number;
  minLen: number;
  maxLen: number;
  quality: CadenceQuality;
  trend: 'increasing' | 'decreasing' | 'stable' | 'mixed';
}

export interface SentenceCadence {
  count: number;
  avgLen: number;
  stdDev: number;
  minLen: number;
  maxLen: number;
  quality: CadenceQuality;
}

export interface CadenceSuggestion {
  type: SuggestionType;
  severity: 'warning' | 'suggestion';
  description: string;
  suggestion: string;
}

export interface CadenceReport {
  chapterNumber: number;
  timestamp: string;
  paragraphCadence: ParagraphCadence;
  sentenceCadence: SentenceCadence;
  dialogueRatio: number;
  suggestions: CadenceSuggestion[];
  overallScore: number;
}

// ─── Genre-specific thresholds ─────────────────────────────────────

const GENRE_PARAGRAPH_TARGETS: Record<string, { shortThreshold: number; longThreshold: number }> = {
  horror: { shortThreshold: 5, longThreshold: 50 },
  romance: { shortThreshold: 10, longThreshold: 80 },
  'sci-fi': { shortThreshold: 10, longThreshold: 100 },
  fantasy: { shortThreshold: 10, longThreshold: 80 },
  xianxia: { shortThreshold: 10, longThreshold: 80 },
  history: { shortThreshold: 12, longThreshold: 100 },
  game: { shortThreshold: 8, longThreshold: 60 },
  urban: { shortThreshold: 8, longThreshold: 70 },
};

const LONG_SENTENCE_THRESHOLD = 50;

// ─── Utility functions ─────────────────────────────────────────────

function computeStats(values: number[]): { avg: number; stdDev: number; min: number; max: number } {
  if (values.length === 0) return { avg: 0, stdDev: 0, min: 0, max: 0 };

  const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length;
  return {
    avg: Math.round(avg * 10) / 10,
    stdDev: Math.round(Math.sqrt(variance) * 10) / 10,
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

function classifyCadenceQuality(
  stdDev: number,
  avg: number,
  count: number,
  values: number[]
): CadenceQuality {
  if (count < 3) return 'uniform';

  const cv = avg > 0 ? stdDev / avg : 0;

  // Too uniform (all values nearly identical)
  if (cv < 0.1) return 'uniform';

  // Extremely high CV with very high ratio = poor (monotonous with one outlier)
  const ratio =
    values.length > 0 && Math.min(...values) > 0 ? Math.max(...values) / Math.min(...values) : 0;
  if (cv > 1.5 && ratio > 20) return 'poor';

  // Good variation range
  if (cv >= 0.15 && cv <= 1.0) return 'good';

  // Slight variation but suboptimal
  if (cv < 0.15) return 'poor';

  // Very high variation (acceptable for creative writing)
  return 'good';
}

function detectTrend(values: number[]): 'increasing' | 'decreasing' | 'stable' | 'mixed' {
  if (values.length < 3) return 'stable';

  // Split into first half and second half
  const mid = Math.floor(values.length / 2);
  const firstHalf = values.slice(0, mid);
  const secondHalf = values.slice(mid);

  const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

  const change = firstAvg > 0 ? (secondAvg - firstAvg) / firstAvg : 0;

  if (change > 0.3) return 'increasing';
  if (change < -0.3) return 'decreasing';

  // Check for alternating pattern
  let alternations = 0;
  for (let i = 1; i < values.length; i++) {
    if (
      (values[i] > values[i - 1] && i > 1 && values[i - 1] < values[i - 2]) ||
      (values[i] < values[i - 1] && i > 1 && values[i - 1] > values[i - 2])
    ) {
      alternations++;
    }
  }

  if (alternations > values.length * 0.4) return 'mixed';
  return 'stable';
}

// ─── CadenceAnalyzer ───────────────────────────────────────────────
/**
 * 节奏分析器。分析章节内容的段落长度变化、句子长度分布、
 * 对话比例等节奏指标，输出评分和改进建议。
 * 纯算法检测，不依赖 LLM。
 */
export class CadenceAnalyzer {
  analyze(input: CadenceInput): CadenceReport {
    const { chapterContent, chapterNumber, genre } = input;

    if (!chapterContent || chapterContent.trim().length === 0) {
      return this.#emptyReport(chapterNumber);
    }

    const paragraphs = chapterContent.split(/\n+/).filter((p) => p.trim().length > 0);
    const paragraphLengths = paragraphs.map((p) => this.#countChars(p));

    // Split into sentences (Chinese + Western terminators)
    const sentences = chapterContent.split(/[。！？.!?]+/).filter((s) => s.trim().length > 0);
    const sentenceLengths = sentences.map((s) => this.#countChars(s.trim()));

    // Dialogue ratio
    const dialogueRatio = this.#computeDialogueRatio(chapterContent);

    // Paragraph cadence
    const paraStats = computeStats(paragraphLengths);
    const paragraphCadence: ParagraphCadence = {
      count: paragraphs.length,
      avgLen: paraStats.avg,
      stdDev: paraStats.stdDev,
      minLen: paraStats.min,
      maxLen: paraStats.max,
      quality: classifyCadenceQuality(
        paraStats.stdDev,
        paraStats.avg,
        paragraphs.length,
        paragraphLengths
      ),
      trend: detectTrend(paragraphLengths),
    };

    // Sentence cadence
    const sentStats = computeStats(sentenceLengths);
    const sentenceCadence: SentenceCadence = {
      count: sentences.length,
      avgLen: sentStats.avg,
      stdDev: sentStats.stdDev,
      minLen: sentStats.min,
      maxLen: sentStats.max,
      quality: classifyCadenceQuality(
        sentStats.stdDev,
        sentStats.avg,
        sentences.length,
        sentenceLengths
      ),
    };

    // Suggestions
    const suggestions = this.#generateSuggestions(
      paragraphs,
      paragraphLengths,
      sentences,
      sentenceLengths,
      dialogueRatio,
      paragraphCadence,
      sentenceCadence,
      genre
    );

    // Overall score
    const overallScore = this.#computeOverallScore(
      paragraphCadence,
      sentenceCadence,
      dialogueRatio
    );

    return {
      chapterNumber,
      timestamp: new Date().toISOString(),
      paragraphCadence,
      sentenceCadence,
      dialogueRatio,
      suggestions,
      overallScore,
    };
  }

  #emptyReport(chapterNumber: number): CadenceReport {
    return {
      chapterNumber,
      timestamp: new Date().toISOString(),
      paragraphCadence: {
        count: 0,
        avgLen: 0,
        stdDev: 0,
        minLen: 0,
        maxLen: 0,
        quality: 'uniform',
        trend: 'stable',
      },
      sentenceCadence: { count: 0, avgLen: 0, stdDev: 0, minLen: 0, maxLen: 0, quality: 'uniform' },
      dialogueRatio: 0,
      suggestions: [],
      overallScore: 0,
    };
  }

  #countChars(text: string): number {
    // Count all visible characters (Chinese + other)
    return text.replace(/[\s\n\r\t]/g, '').length;
  }

  #computeDialogueRatio(text: string): number {
    // Extract dialogue text (content in quotes)
    const dialogueMatches = text.match(/"[^"]*"|「[^」]*」|『[^』]*』/g);
    if (!dialogueMatches) return 0;

    const dialogueChars = dialogueMatches.reduce((sum, d) => sum + this.#countChars(d), 0);
    const totalChars = this.#countChars(text);

    return totalChars > 0 ? Math.round((dialogueChars / totalChars) * 100) / 100 : 0;
  }

  #generateSuggestions(
    paragraphs: string[],
    paragraphLengths: number[],
    sentences: string[],
    sentenceLengths: number[],
    dialogueRatio: number,
    paragraphCadence: ParagraphCadence,
    sentenceCadence: SentenceCadence,
    genre: string
  ): CadenceSuggestion[] {
    const suggestions: CadenceSuggestion[] = [];
    const genreTargets = GENRE_PARAGRAPH_TARGETS[genre] ?? GENRE_PARAGRAPH_TARGETS.urban;

    // Paragraph uniformity
    if (paragraphCadence.quality === 'uniform' && paragraphCadence.count >= 4) {
      suggestions.push({
        type: 'paragraph-uniform',
        severity: 'warning',
        description: `段落长度过于均匀（标准差 ${paragraphCadence.stdDev}），缺乏节奏变化`,
        suggestion: '尝试混合使用短段落（1-2 句）和长段落（5-8 句），创造节奏感',
      });
    }

    if (paragraphCadence.quality === 'poor') {
      suggestions.push({
        type: 'pacing-flat',
        severity: 'warning',
        description: '段落长度变化不足，阅读节奏单调',
        suggestion: '在关键场景使用短段落增强紧张感，在描写性场景使用长段落展开细节',
      });
    }

    // Overly long paragraphs
    for (let i = 0; i < paragraphs.length; i++) {
      if (paragraphLengths[i] > genreTargets.longThreshold) {
        suggestions.push({
          type: 'paragraph-too-long',
          severity: 'warning',
          description: `第 ${i + 1} 段过长（${paragraphLengths[i]} 字），超过 ${genreTargets.longThreshold} 字阈值`,
          suggestion: '考虑将此段落拆分为 2-3 个较短段落，在逻辑转折或场景切换处分段',
        });
        break; // Only report the first one
      }
    }

    // Overly short paragraphs (all of them)
    if (paragraphs.length >= 4 && paragraphCadence.maxLen <= genreTargets.shortThreshold) {
      suggestions.push({
        type: 'paragraph-too-short',
        severity: 'suggestion',
        description: '所有段落都非常短，缺乏深度描写',
        suggestion: '在适当场景增加细节描写，丰富段落长度变化',
      });
    }

    // Sentence uniformity
    if (sentenceCadence.quality === 'uniform' && sentenceCadence.count >= 4) {
      suggestions.push({
        type: 'sentence-uniform',
        severity: 'warning',
        description: `句子长度过于均匀（标准差 ${sentenceCadence.stdDev}），句式单调`,
        suggestion: '混合使用短句和长句，短句增强力度，长句展开细节',
      });
    }

    // Overly long sentences
    for (let i = 0; i < sentences.length; i++) {
      if (sentenceLengths[i] > LONG_SENTENCE_THRESHOLD) {
        suggestions.push({
          type: 'sentence-too-long',
          severity: 'suggestion',
          description: `存在超长句子（${sentenceLengths[i]} 字），超过 ${LONG_SENTENCE_THRESHOLD} 字阈值`,
          suggestion: '将长句拆分为 2-3 个短句，提高可读性',
        });
        break; // Only report the first one
      }
    }

    // Dialogue-heavy
    if (dialogueRatio > 0.7) {
      suggestions.push({
        type: 'dialogue-heavy',
        severity: 'suggestion',
        description: `对话占比过高（${Math.round(dialogueRatio * 100)}%），缺乏动作和环境描写`,
        suggestion: '在对话中穿插动作、神态和环境描写，增强画面感',
      });
    }

    // Description-heavy
    if (dialogueRatio < 0.05 && paragraphCadence.avgLen > 50) {
      suggestions.push({
        type: 'description-heavy',
        severity: 'suggestion',
        description: '纯描写段落为主，缺少对话推动',
        suggestion: '适当加入角色对话，通过对话推进情节和揭示信息',
      });
    }

    return suggestions;
  }

  #computeOverallScore(
    paragraphCadence: ParagraphCadence,
    sentenceCadence: SentenceCadence,
    dialogueRatio: number
  ): number {
    let score = 50; // Base score

    // Paragraph variation (0-25 points)
    const paraCV =
      paragraphCadence.avgLen > 0 ? paragraphCadence.stdDev / paragraphCadence.avgLen : 0;
    if (paraCV >= 0.3 && paraCV <= 0.7) score += 25;
    else if (paraCV >= 0.2 && paraCV <= 0.8) score += 18;
    else if (paraCV >= 0.1) score += 10;
    else score += 3;

    // Sentence variation (0-15 points)
    const sentCV = sentenceCadence.avgLen > 0 ? sentenceCadence.stdDev / sentenceCadence.avgLen : 0;
    if (sentCV >= 0.3 && sentCV <= 0.8) score += 15;
    else if (sentCV >= 0.2 && sentCV <= 1.0) score += 10;
    else if (sentCV >= 0.1) score += 5;
    else score += 2;

    // Dialogue balance (0-10 points)
    // Ideal dialogue ratio is around 20-40% for most genres
    if (dialogueRatio >= 0.15 && dialogueRatio <= 0.5) score += 10;
    else if (dialogueRatio >= 0.05 && dialogueRatio <= 0.6) score += 6;
    else score += 2;

    return Math.min(100, Math.max(0, score));
  }
}
