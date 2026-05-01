import type { ChapterSummaryRecord } from '../../models/state';

export function renderChapterSummaries(summaries: ChapterSummaryRecord[]): string {
  const lines: string[] = [];

  lines.push('# 章节摘要');
  lines.push('');

  if (summaries.length === 0) {
    lines.push('暂无章节摘要');
    lines.push('');
    return lines.join('\n');
  }

  for (const s of summaries) {
    lines.push(`## 第 ${s.chapter} 章`);
    lines.push('');
    lines.push(s.detailedSummary || s.briefSummary);
    lines.push('');

    if (s.keyEvents && s.keyEvents.length > 0) {
      lines.push('**关键事件**');
      lines.push('');
      for (const event of s.keyEvents) {
        lines.push(`- ${event}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}
