// ─── Types ─────────────────────────────────────────────────────────

export type NormalizerStatus =
  | 'within-range'
  | 'compressed'
  | 'below-soft'
  | 'below-hard'
  | 'over-hard';

export type IssueType = 'over-soft' | 'below-soft' | 'below-hard' | 'over-hard' | 'safety-net';

export interface NormalizerIssue {
  type: IssueType;
  severity: 'warning' | 'alert';
  description: string;
  suggestion: string;
}

export interface NormalizerInput {
  chapterContent: string;
  chapterNumber: number;
  wordCountTarget: number;
  genre: string;
}

export interface NormalizerReport {
  chapterNumber: number;
  timestamp: string;
  targetWords: number;
  softLower: number;
  softUpper: number;
  hardLower: number;
  hardUpper: number;
  originalWords: number;
  normalizedWords: number;
  status: NormalizerStatus;
  normalizedContent: string;
  issues: NormalizerIssue[];
}

// ─── Genre-specific soft ranges (±% of target) ───────────────────

const GENRE_SOFT_PCT: Record<string, { softPct: number; hardPct: number }> = {
  horror: { softPct: 0.15, hardPct: 0.4 },
  romance: { softPct: 0.2, hardPct: 0.4 },
  'sci-fi': { softPct: 0.25, hardPct: 0.45 },
  fantasy: { softPct: 0.2, hardPct: 0.4 },
  xianxia: { softPct: 0.2, hardPct: 0.4 },
  history: { softPct: 0.25, hardPct: 0.45 },
  game: { softPct: 0.2, hardPct: 0.4 },
  urban: { softPct: 0.2, hardPct: 0.4 },
};

const DEFAULT_SOFT_PCT = 0.2;
const DEFAULT_HARD_PCT = 0.4;

// ─── Filler phrases to remove first ──────────────────────────────

const FILLER_PHRASES = [
  '总而言之',
  '综上所述',
  '换句话说',
  '也就是说',
  '换句话说就是',
  '总而言之就是',
  '一言以蔽之',
  '长话短说',
  '简而言之',
  '总的来说',
  '总体来看',
  '从总体上来说',
  '由此可见',
  '显而易见',
  '毫无疑问',
  '不可否认',
  '事实上',
  '实际上',
  '可以说',
  '某种程度上',
  '在一定程度上',
  '在某种意义上',
  '毫无疑问地',
];

// ─── Excessive adjective pattern (3+ adjectives in a row) ────────

const ADJ_CHAIN_RE = /[^\s，。！？]{1,3}的[、，]*[^\s，。！？]{1,3}的[、，]*[^\s，。！？]{1,3}的/g;

// ─── LengthNormalizer ────────────────────────────────────────────
/**
 * 字数归一化器。在审计前和修订后对章节字数进行检查，
 * 超出软区间时自动压缩（算法级，非LLM），确保安全网不毁章。
 */
export class LengthNormalizer {
  normalize(input: NormalizerInput): NormalizerReport {
    const { chapterContent, chapterNumber, wordCountTarget, genre } = input;

    const genreConfig = GENRE_SOFT_PCT[genre] ?? {
      softPct: DEFAULT_SOFT_PCT,
      hardPct: DEFAULT_HARD_PCT,
    };

    // Chapter number scaling: later chapters can be slightly longer
    const chapterScale = 1 + Math.min(chapterNumber - 1, 50) * 0.003; // +0.3% per chapter, max +15%
    const scaledTarget = Math.round(wordCountTarget * chapterScale);

    const softPct = genreConfig.softPct;
    const hardPct = genreConfig.hardPct;

    const softLower = Math.round(scaledTarget * (1 - softPct));
    const softUpper = Math.round(scaledTarget * (1 + softPct));
    const hardLower = Math.round(scaledTarget * (1 - hardPct));
    const hardUpper = Math.round(scaledTarget * (1 + hardPct));

    const originalWords = this.#countVisibleChars(chapterContent);

    if (originalWords === 0) {
      return this.#emptyReport(
        chapterNumber,
        wordCountTarget,
        softLower,
        softUpper,
        hardLower,
        hardUpper
      );
    }

    // Determine status and apply normalization
    const issues: NormalizerIssue[] = [];
    let normalizedContent = chapterContent;
    let status: NormalizerStatus;

    if (originalWords > softUpper) {
      // Over soft upper → compress
      const result = this.#compress(chapterContent, softUpper, hardLower, hardUpper);
      normalizedContent = result.content;
      status = result.safetyNetActivated ? 'over-hard' : 'compressed';

      issues.push({
        type: 'over-soft',
        severity: 'warning',
        description: `字数 ${originalWords} 超出软上限 ${softUpper}，已压缩至 ${this.#countVisibleChars(normalizedContent)}`,
        suggestion: '检查是否包含冗余描写或可精简的过渡段落',
      });

      if (result.safetyNetActivated) {
        issues.push({
          type: 'safety-net',
          severity: 'alert',
          description: `安全网触发：原文过长（${originalWords}字），但为避免破坏内容仅压缩至 ${this.#countVisibleChars(normalizedContent)}字`,
          suggestion: '建议手动拆分章节或精简大纲内容',
        });
      }
    } else if (originalWords < hardLower) {
      status = 'below-hard';
      issues.push({
        type: 'below-hard',
        severity: 'alert',
        description: `字数 ${originalWords} 低于硬下限 ${hardLower}，内容严重不足`,
        suggestion: '建议扩充章节内容，增加细节描写和情节展开',
      });
    } else if (originalWords < softLower) {
      status = 'below-soft';
      issues.push({
        type: 'below-soft',
        severity: 'warning',
        description: `字数 ${originalWords} 低于软下限 ${softLower}`,
        suggestion: '建议适当扩充内容，增加场景细节或角色互动',
      });
    } else {
      status = 'within-range';
    }

    const normalizedWords = this.#countVisibleChars(normalizedContent);

    return {
      chapterNumber,
      timestamp: new Date().toISOString(),
      targetWords: wordCountTarget,
      softLower,
      softUpper,
      hardLower,
      hardUpper,
      originalWords,
      normalizedWords,
      status,
      normalizedContent,
      issues,
    };
  }

  #emptyReport(
    chapterNumber: number,
    targetWords: number,
    softLower: number,
    softUpper: number,
    hardLower: number,
    hardUpper: number
  ): NormalizerReport {
    return {
      chapterNumber,
      timestamp: new Date().toISOString(),
      targetWords,
      softLower,
      softUpper,
      hardLower,
      hardUpper,
      originalWords: 0,
      normalizedWords: 0,
      status: 'below-hard',
      normalizedContent: '',
      issues: [
        {
          type: 'below-hard',
          severity: 'alert',
          description: '章节内容为空',
          suggestion: '请提供有效的章节内容',
        },
      ],
    };
  }

  #countVisibleChars(text: string): number {
    return text.replace(/[\s\n\r\t]/g, '').length;
  }

  // ─── Compression engine ────────────────────────────────────

  #compress(
    content: string,
    softUpper: number,
    hardLower: number,
    hardUpper: number
  ): { content: string; safetyNetActivated: boolean } {
    let safetyNetActivated = false;
    let result = content;

    // Safety net floor: never compress below hardLower
    const minFloor = Math.max(hardLower, Math.round(this.#countVisibleChars(content) * 0.2));

    // Phase 1: Remove filler phrases
    result = this.#removeFillerPhrases(result);
    if (this.#countVisibleChars(result) <= softUpper)
      return { content: result, safetyNetActivated: false };

    // Phase 2: Remove redundant duplicate sentences
    result = this.#removeDuplicateSentences(result);
    if (this.#countVisibleChars(result) <= softUpper)
      return { content: result, safetyNetActivated: false };

    // Phase 3: Trim excessive adjective chains
    result = this.#trimAdjectiveChains(result);
    if (this.#countVisibleChars(result) <= softUpper)
      return { content: result, safetyNetActivated: false };

    // Phase 4: Trim long filler paragraphs (preserve dialogue)
    result = this.#trimFillerParagraphs(result, softUpper);
    if (this.#countVisibleChars(result) <= softUpper)
      return { content: result, safetyNetActivated: false };

    // Phase 5: Emergency — truncate from end, preserving safety floor
    const currentWords = this.#countVisibleChars(result);
    if (currentWords > softUpper) {
      const neededCut = currentWords - softUpper;
      const canCut = currentWords - minFloor;

      if (canCut < neededCut) {
        // Safety net: can't cut enough without going below floor
        safetyNetActivated = true;
        // Cut what we can
        const truncated = this.#truncateFromEnd(result, minFloor);
        return { content: truncated, safetyNetActivated: true };
      }

      return { content: this.#truncateFromEnd(result, softUpper), safetyNetActivated: false };
    }

    return { content: result, safetyNetActivated: false };
  }

  #removeFillerPhrases(text: string): string {
    let result = text;
    for (const phrase of FILLER_PHRASES) {
      result = result.replaceAll(phrase, '');
    }
    return result;
  }

  #removeDuplicateSentences(text: string): string {
    const paragraphs = text.split(/\n+/);
    const result: string[] = [];

    for (const paragraph of paragraphs) {
      // Split into sentences, keeping terminators attached
      const rawSentences = paragraph.split(/([。！？\.]+)/);
      const grouped: string[] = [];
      for (let i = 0; i < rawSentences.length; i += 2) {
        const body = rawSentences[i] || '';
        const term = rawSentences[i + 1] || '';
        if (body.trim()) grouped.push(body.trim() + term);
      }

      if (grouped.length === 0) continue;

      // Only remove CONSECUTIVE duplicates (keep one instance)
      const kept: string[] = [grouped[0]];
      for (let i = 1; i < grouped.length; i++) {
        if (grouped[i] !== grouped[i - 1]) {
          kept.push(grouped[i]);
        }
      }

      const compressed = kept.join('');
      if (compressed.length > 0) result.push(compressed);
    }

    return result.join('\n');
  }

  #trimAdjectiveChains(text: string): string {
    return text.replace(ADJ_CHAIN_RE, (match) => {
      // Keep only the first adjective + 的
      const parts = match.split(/[、，]+/);
      if (parts.length > 1) {
        return parts[0];
      }
      return match;
    });
  }

  #trimFillerParagraphs(text: string, target: number): string {
    const paragraphs = text.split(/\n+/).filter((p) => p.trim().length > 0);
    if (paragraphs.length <= 1) return text;

    // Score each paragraph: higher score = more filler-like
    const scored = paragraphs.map((p, i) => ({
      index: i,
      text: p,
      words: this.#countVisibleChars(p),
      dialogueRatio: this.#getDialogueRatio(p),
      hasAction: /[走跑跳站坐看听说想推拉拿打开关进出]/.test(p),
      score: this.#paragraphFillerScore(p),
    }));

    // Sort by filler score descending (most filler-like first)
    scored.sort((a, b) => b.score - a.score);

    // Start with all paragraphs
    const keepSet = new Set<number>(paragraphs.map((_, i) => i));
    let currentChars = this.#countVisibleChars(text);

    // Remove filler paragraphs until we hit target
    while (currentChars > target && scored.length > 0) {
      const candidate = scored.shift()!;

      // Never remove dialogue-heavy or action paragraphs
      if (candidate.dialogueRatio > 0.3 || candidate.hasAction) continue;

      keepSet.delete(candidate.index);
      currentChars -= candidate.words;
    }

    // Rebuild text from kept paragraphs
    const kept = paragraphs.filter((_, i) => keepSet.has(i));
    return kept.join('\n');
  }

  #paragraphFillerScore(paragraph: string): number {
    // Higher score = more filler-like
    let score = 0;
    const words = this.#countVisibleChars(paragraph);

    // Long paragraphs without dialogue are more likely filler
    if (words > 100) score += 2;
    if (words > 200) score += 3;

    const dialogueRatio = this.#getDialogueRatio(paragraph);
    if (dialogueRatio < 0.05) score += 3;
    if (dialogueRatio === 0) score += 2;

    // No action verbs = likely pure description
    const hasAction = /[走|跑|跳|站|坐|看|听|说|想|推|拉|拿|打|开|关|进|出]/.test(paragraph);
    if (!hasAction) score += 2;

    // Adjective-heavy content
    const adjCount = (paragraph.match(/的/g) || []).length;
    if (adjCount > words * 0.15) score += 2;

    // Filler phrases
    for (const phrase of FILLER_PHRASES) {
      if (paragraph.includes(phrase)) score += 1;
    }

    return score;
  }

  #getDialogueRatio(text: string): number {
    const dialogueMatches = text.match(/"[^"]*"|「[^」]*」|『[^』]*』/g);
    if (!dialogueMatches) return 0;

    const dialogueChars = dialogueMatches.reduce((sum, d) => sum + this.#countVisibleChars(d), 0);
    const totalChars = this.#countVisibleChars(text);
    return totalChars > 0 ? dialogueChars / totalChars : 0;
  }

  #truncateFromEnd(text: string, maxWords: number): string {
    const paragraphs = text.split(/\n+/);
    let totalChars = 0;
    const kept: string[] = [];

    for (const para of paragraphs) {
      const words = this.#countVisibleChars(para);
      if (totalChars + words <= maxWords) {
        kept.push(para);
        totalChars += words;
      } else {
        // Partial paragraph
        const remaining = maxWords - totalChars;
        if (remaining > 0) {
          // Find a natural break point (sentence boundary)
          const trimmed = this.#truncateAtSentence(para, remaining);
          kept.push(trimmed);
        }
        break;
      }
    }

    return kept.join('\n');
  }

  #truncateAtSentence(text: string, maxChars: number): string {
    // Split on sentence terminators only (keep terminators attached)
    const segments = text.split(/([。！？]+)/);
    let total = 0;
    const kept: string[] = [];

    for (let i = 0; i < segments.length; i += 2) {
      const body = segments[i] || '';
      const term = segments[i + 1] || '';
      const segment = body + term;
      const chars = this.#countVisibleChars(segment);

      if (total + chars <= maxChars) {
        kept.push(segment);
        total += chars;
      } else if (total === 0 && body.length > 0) {
        // No sentence fits — truncate at character level as last resort
        const canKeep = Math.min(body.length, maxChars);
        return body.substring(0, canKeep);
      } else {
        break;
      }
    }

    return kept.join('');
  }
}
