/**
 * 文本处理工具
 */

/**
 * 中文友好的字数统计：中文字符按 1 字计，英文单词按 1 字计
 */
export function countChineseWords(text: string): number {
  const cjk = text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g)?.length ?? 0;
  const words = text.match(/[a-zA-Z0-9]+/g)?.length ?? 0;
  return cjk + words;
}

/**
 * 从 frontmatter 格式的 Markdown 中提取正文内容
 */
export function stripFrontmatter(rawContent: string): string {
  const match = rawContent.match(/^---\n[\s\S]*?\n---\n?/);
  return match ? rawContent.slice(match[0].length).trim() : rawContent.trim();
}
