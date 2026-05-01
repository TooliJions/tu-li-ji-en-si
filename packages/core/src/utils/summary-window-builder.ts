import type { StateManager } from '../state/manager';

// ─── SummaryWindowBuilder ───────────────────────────────────────
/**
 * 为长书构建分级摘要上下文窗口。
 *
 * 策略：
 * - 最近 3 章：逐章 brief 摘要（高密度）
 * - 近窗 4-10 章：每 3 章合并为一段梗概（中密度）
 * - 远窗 11+ 章：使用预生成的 arcSummary（低密度）
 */

export interface SummaryWindowConfig {
  /** 最近窗口深度（默认 3） */
  recentDepth?: number;
  /** 近窗深度（默认 10，含最近窗口） */
  middleDepth?: number;
  /** 块级压缩窗口大小（默认 10） */
  blockSize?: number;
}

export class SummaryWindowBuilder {
  static readonly DEFAULT_CONFIG: SummaryWindowConfig = {
    recentDepth: 3,
    middleDepth: 10,
    blockSize: 10,
  };

  /**
   * 构建当前章节之前的分级摘要上下文文本。
   * 如果无可用摘要，返回空字符串。
   */
  static buildContextWindow(
    bookId: string,
    currentChapter: number,
    stateManager: StateManager,
    config?: SummaryWindowConfig,
  ): string {
    if (currentChapter <= 1) return '';

    const cfg = { ...this.DEFAULT_CONFIG, ...config };
    const archive = stateManager.readChapterSummaries(bookId);
    const all = archive.summaries.filter((s) => s.chapter < currentChapter);
    if (all.length === 0) return '';

    const lines: string[] = [];

    // ── 最近窗口 ──
    const recent = all.filter((s) => s.chapter >= currentChapter - cfg.recentDepth!);
    if (recent.length > 0) {
      lines.push('## 最近章节进展');
      for (const s of recent) {
        const hookHint = s.cliffhanger ? ` [钩子：${s.cliffhanger}]` : '';
        lines.push(`- 第${s.chapter}章：${s.briefSummary}${hookHint}`);
      }
      lines.push('');
    }

    // ── 近窗（middle） ──
    const middle = all.filter(
      (s) =>
        s.chapter >= Math.max(1, currentChapter - cfg.middleDepth!) &&
        s.chapter < currentChapter - cfg.recentDepth!,
    );
    if (middle.length > 0) {
      lines.push('## 近期情节线');
      // 每 3 章一组
      for (let i = 0; i < middle.length; i += 3) {
        const group = middle.slice(i, i + 3);
        const startCh = group[0].chapter;
        const endCh = group[group.length - 1].chapter;
        const briefs = group.map((s) => s.briefSummary).join(' → ');
        lines.push(`- 第${startCh}-${endCh}章：${briefs}`);
      }
      lines.push('');
    }

    // ── 远窗（arc summaries） ──
    const farStart = 1;
    const farEnd = currentChapter - cfg.middleDepth! - 1;
    if (farEnd >= farStart) {
      const arcLines: string[] = [];
      for (let blockStart = farStart; blockStart <= farEnd; blockStart += cfg.blockSize!) {
        const blockEnd = Math.min(blockStart + cfg.blockSize! - 1, farEnd);
        const blockKey = `${blockStart}-${blockEnd}`;
        const arc = stateManager.getArcSummary(bookId, blockKey);
        if (arc) {
          arcLines.push(`- 第${blockStart}-${blockEnd}章概要：${arc}`);
        }
      }
      if (arcLines.length > 0) {
        lines.push('## 前期卷轴概要');
        lines.push(...arcLines);
        lines.push('');
      }
    }

    return lines.join('\n').trim();
  }

  /**
   * 估算上下文窗口的 token 占用（粗略中文字数 / 2）。
   */
  static estimateTokenLength(contextText: string): number {
    if (!contextText || contextText.trim().length === 0) return 0;
    // 中文按字计数，英文按词计数，粗略除 2 估算 token
    const chineseChars = (contextText.match(/[\u4e00-\u9fa5]/g) ?? []).length;
    const nonChineseWords = contextText
      .replace(/[\u4e00-\u9fa5]/g, '')
      .trim()
      .split(/\s+/).length;
    return Math.ceil((chineseChars + nonChineseWords) / 2);
  }
}
