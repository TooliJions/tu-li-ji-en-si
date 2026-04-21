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
// 起点要求：章节号格式、VIP 章节标记、字数统计

function generateQidian(input: PlatformInput, filename: string): PlatformOutput {
  const lines: string[] = [];

  // Metadata header — 起点标准格式
  lines.push(`书名：${input.title}`);
  lines.push(`作者：${input.author}`);
  if (input.description) {
    lines.push(`简介：${input.description}`);
  }
  lines.push(`总章节数：${input.chapters.length}`);
  lines.push('');
  lines.push('='.repeat(40));
  lines.push('');

  // Chapters — 起点章节标题格式：第X章 标题
  for (const ch of input.chapters) {
    lines.push(`第${ch.number}章 ${ch.title}`);
    lines.push('');
    lines.push(ch.content);
    lines.push('');
    lines.push('-'.repeat(20));
    lines.push(`（本章字数：${ch.content.length}）`);
    lines.push('');
  }

  return {
    files: [{ name: filename, content: lines.join('\n') }],
  };
}

// ─── Fanqiao (番茄小说) ─────────────────────────────────────────
// 格式：每章独立文件 + metadata.json
// 番茄要求：章节文件名含章节号、每章开头带标签信息

function generateFanqiao(input: PlatformInput): PlatformOutput {
  const files: PlatformFile[] = [];

  // metadata.json — 番茄标准格式
  const meta = {
    bookName: input.title,
    author: input.author,
    description: input.description ?? '',
    chapterCount: input.chapters.length,
    totalWords: input.chapters.reduce((sum, ch) => sum + ch.content.length, 0),
    chapters: input.chapters.map((ch) => ({
      chapterId: ch.number,
      chapterTitle: ch.title,
      fileName: `chapter_${padNumber(ch.number, 3)}.txt`,
      wordCount: ch.content.length,
    })),
  };
  files.push({ name: 'metadata.json', content: JSON.stringify(meta, null, 2) });

  // Chapter files — 番茄格式：顶部标签 + 正文
  for (const ch of input.chapters) {
    const fname = `chapter_${padNumber(ch.number, 3)}.txt`;
    const content = `# 第${ch.number}章 ${ch.title}\n\n${ch.content}\n`;
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
