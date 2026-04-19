export interface TxtChapter {
  number: number;
  title: string;
  content: string;
}

export interface TxtInput {
  title: string;
  author: string;
  chapters: TxtChapter[];
}

/**
 * Plain text exporter — generates a simple .txt file with chapters.
 */
export class TxtExporter {
  async generate(input: TxtInput): Promise<string> {
    const lines: string[] = [];

    lines.push(input.title);
    lines.push(`作者：${input.author}`);
    lines.push('');
    lines.push('='.repeat(40));
    lines.push('');

    for (const ch of input.chapters) {
      lines.push(ch.title);
      lines.push('-'.repeat(30));
      lines.push(ch.content);
      lines.push('');
    }

    return lines.join('\n');
  }
}
