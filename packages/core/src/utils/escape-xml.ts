/**
 * XML / XHTML 特殊字符转义。
 * 用于 EPUB 生成等场景，防止用户内容破坏 XML 结构。
 */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
