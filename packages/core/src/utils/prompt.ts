/**
 * Prompt 解析工具
 *
 * 从 LLM prompt 文本中提取结构化片段，供 Agent 和测试替身复用。
 */

/**
 * 从 prompt 中提取指定 Markdown 标题下的内容块。
 * 匹配到标题后，截取到下一个 `\n## ` 标题或文本结束为止。
 */
export function extractSection(prompt: string, heading: string): string {
  const start = prompt.indexOf(heading);
  if (start === -1) {
    return '';
  }

  const body = prompt.slice(start + heading.length).trimStart();
  const nextHeadingIndex = body.indexOf('\n## ');
  return (nextHeadingIndex === -1 ? body : body.slice(0, nextHeadingIndex)).trim();
}

/**
 * 从 prompt 中提取章节号（匹配「第 X 章」模式）。
 * 未匹配到则返回 1（默认第一章）。
 */
export function extractChapterNumber(prompt: string): number {
  const match = /第\s*(\d+)\s*章/.exec(prompt);
  return match ? Number.parseInt(match[1], 10) : 1;
}
