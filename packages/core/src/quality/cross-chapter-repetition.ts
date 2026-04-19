// ── Types ────────────────────────────────────────────────────────────

export interface ChapterRef {
  content: string;
  chapterNumber: number;
}

export interface CrossChapterInput {
  currentChapter: ChapterRef;
  previousChapters: ChapterRef[];
  /** Default: 6 */
  ngramSize?: number;
}

export interface PreviousOccurrence {
  chapterNumber: number;
  positions: number[];
}

export interface RepetitionMatch {
  phrase: string;
  currentPositions: number[];
  previousOccurrences: PreviousOccurrence[];
}

export type RepetitionSeverity = 'none' | 'low' | 'medium' | 'high';

export interface CrossChapterRepetitionReport {
  chapterNumber: number;
  timestamp: string;
  /** Total unique ngrams extracted from current chapter */
  totalNgrams: number;
  repeatedPhrases: RepetitionMatch[];
  /** Percentage (0–100) of current ngrams that appear in previous chapters */
  repetitionRate: number;
  severity: RepetitionSeverity;
}

// ── Helpers ──────────────────────────────────────────────────────────

const PUNCT_RE = /[\s\p{P}\p{S}]/gu;

function normalize(text: string): string {
  return text.replace(PUNCT_RE, '');
}

function extractNgrams(text: string, n: number): Map<string, number[]> {
  const result = new Map<string, number[]>();
  for (let i = 0; i <= text.length - n; i++) {
    const gram = text.slice(i, i + n);
    const positions = result.get(gram) ?? [];
    positions.push(i);
    result.set(gram, positions);
  }
  return result;
}

function severityFor(rate: number): RepetitionSeverity {
  if (rate === 0) return 'none';
  if (rate < 15) return 'low';
  if (rate < 40) return 'medium';
  return 'high';
}

// ── CrossChapterRepetitionDetector ───────────────────────────────────

export class CrossChapterRepetitionDetector {
  detect(input: CrossChapterInput): CrossChapterRepetitionReport {
    const n = input.ngramSize ?? 6;
    const currentNorm = normalize(input.currentChapter.content);
    const currentNgrams = extractNgrams(currentNorm, n);

    if (currentNgrams.size === 0) {
      return {
        chapterNumber: input.currentChapter.chapterNumber,
        timestamp: new Date().toISOString(),
        totalNgrams: 0,
        repeatedPhrases: [],
        repetitionRate: 0,
        severity: 'none',
      };
    }

    // Build per-chapter ngram maps
    const prevMaps: Array<{ chapterNumber: number; ngrams: Map<string, number[]> }> =
      input.previousChapters.map((ch) => ({
        chapterNumber: ch.chapterNumber,
        ngrams: extractNgrams(normalize(ch.content), n),
      }));

    // Find which current ngrams appear in previous chapters
    const matchMap = new Map<string, RepetitionMatch>();

    for (const [gram, currentPositions] of currentNgrams) {
      const occurrences: PreviousOccurrence[] = [];

      for (const prev of prevMaps) {
        const prevPositions = prev.ngrams.get(gram);
        if (prevPositions) {
          occurrences.push({ chapterNumber: prev.chapterNumber, positions: prevPositions });
        }
      }

      if (occurrences.length > 0) {
        matchMap.set(gram, { phrase: gram, currentPositions, previousOccurrences: occurrences });
      }
    }

    const repeatedPhrases = Array.from(matchMap.values());
    const repetitionRate = currentNgrams.size > 0 ? (matchMap.size / currentNgrams.size) * 100 : 0;

    return {
      chapterNumber: input.currentChapter.chapterNumber,
      timestamp: new Date().toISOString(),
      totalNgrams: currentNgrams.size,
      repeatedPhrases,
      repetitionRate,
      severity: severityFor(repetitionRate),
    };
  }
}
