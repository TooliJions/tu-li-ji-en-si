export interface MarkdownChapter {
  number: number;
  title: string;
  content: string;
}

export interface MarkdownInput {
  title: string;
  author: string;
  language: string;
  chapters: MarkdownChapter[];
}

function slugify(text: string): string {
  return text
    .replace(/\s+/g, '-')
    .replace(/[^\w\u4e00-\u9fff-]/g, '')
    .toLowerCase();
}

/**
 * Markdown exporter — generates a .md file with YAML frontmatter, TOC, and chapters.
 */
export class MarkdownExporter {
  async generate(input: MarkdownInput): Promise<string> {
    const lines: string[] = [];

    // Frontmatter
    lines.push('---');
    lines.push(`title: ${input.title}`);
    lines.push(`author: ${input.author}`);
    lines.push(`language: ${input.language}`);
    lines.push(`chapters: ${input.chapters.length}`);
    lines.push('---');
    lines.push('');

    // Table of contents
    if (input.chapters.length > 0) {
      lines.push('## 目录');
      lines.push('');
      for (const ch of input.chapters) {
        const slug = slugify(ch.title);
        lines.push(`- [${ch.title}](#${slug})`);
      }
      lines.push('');
      lines.push('---');
      lines.push('');

      // Chapters
      for (const ch of input.chapters) {
        lines.push(`# ${ch.title}`);
        lines.push('');
        lines.push(ch.content);
        lines.push('');
      }
    }

    return lines.join('\n');
  }
}
