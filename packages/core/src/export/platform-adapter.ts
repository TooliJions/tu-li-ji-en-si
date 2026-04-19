// ─── Types ──────────────────────────────────────────────────────

export interface PlatformChapter {
  number: number;
  title: string;
  content: string;
}

export interface PlatformInput {
  title: string;
  author: string;
  description?: string;
  chapters: PlatformChapter[];
}

export interface PlatformConfig {
  platform: 'qidian' | 'fanqiao' | 'text';
  filename?: string;
}

export interface PlatformFile {
  name: string;
  content: string;
}

export interface PlatformOutput {
  files: PlatformFile[];
}

// ─── Helpers ────────────────────────────────────────────────────

function padNumber(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

// ─── Qidian (起点中文网) ────────────────────────────────────────
// 格式：单文件，顶部元数据，章节间用虚线分隔

function generateQidian(input: PlatformInput, filename: string): PlatformOutput {
  const lines: string[] = [];

  // Metadata header
  lines.push(`书名：${input.title}`);
  lines.push(`作者：${input.author}`);
  if (input.description) {
    lines.push(`简介：${input.description}`);
  }
  lines.push('');
  lines.push('='.repeat(40));
  lines.push('');

  // Chapters
  for (const ch of input.chapters) {
    lines.push(ch.title);
    lines.push('-'.repeat(40));
    lines.push(ch.content);
    lines.push('');
  }

  return {
    files: [{ name: filename, content: lines.join('\n') }],
  };
}

// ─── Fanqiao (番茄小说) ─────────────────────────────────────────
// 格式：每章独立文件 + metadata.json

function generateFanqiao(input: PlatformInput): PlatformOutput {
  const files: PlatformFile[] = [];

  // metadata.json
  const meta = {
    title: input.title,
    author: input.author,
    description: input.description ?? '',
    chapterCount: input.chapters.length,
    chapters: input.chapters.map((ch) => ({
      number: ch.number,
      title: ch.title,
      file: `chapter_${padNumber(ch.number, 3)}.txt`,
    })),
  };
  files.push({ name: 'metadata.json', content: JSON.stringify(meta, null, 2) });

  // Chapter files
  for (const ch of input.chapters) {
    const fname = `chapter_${padNumber(ch.number, 3)}.txt`;
    const content = `${ch.title}\n\n${ch.content}\n`;
    files.push({ name: fname, content });
  }

  return { files };
}

// ─── Generic text ───────────────────────────────────────────────

function generateText(input: PlatformInput, filename: string): PlatformOutput {
  const lines: string[] = [];

  lines.push(input.title);
  lines.push(`作者：${input.author}`);
  if (input.description) {
    lines.push(`简介：${input.description}`);
  }
  lines.push('');
  lines.push('-'.repeat(30));
  lines.push('');

  for (const ch of input.chapters) {
    lines.push(ch.title);
    lines.push(ch.content);
    lines.push('');
  }

  return {
    files: [{ name: filename, content: lines.join('\n') }],
  };
}

// ─── PlatformAdapter ────────────────────────────────────────────

/**
 * Platform-specific export adapter — generates files matching target
 * platform requirements (Qidian, Fanqiao, generic text).
 */
export class PlatformAdapter {
  async generate(input: PlatformInput, config: PlatformConfig): Promise<PlatformOutput> {
    const filename = config.filename ?? `${input.title}.txt`;

    switch (config.platform) {
      case 'qidian':
        return generateQidian(input, filename);
      case 'fanqiao':
        return generateFanqiao(input);
      case 'text':
        return generateText(input, filename);
      default:
        return generateText(input, filename);
    }
  }
}
