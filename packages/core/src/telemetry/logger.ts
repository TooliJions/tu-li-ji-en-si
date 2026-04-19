import * as fs from 'node:fs';
import * as path from 'node:path';

export type TelemetryChannel = 'writer' | 'auditor' | 'planner' | 'composer' | 'reviser';

export interface ChannelUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  calls: number;
}

export interface ChapterTelemetry {
  bookId: string;
  chapterNumber: number;
  channels: Record<TelemetryChannel, ChannelUsage>;
  totalTokens: number;
  createdAt: string;
  updatedAt: string;
}

const CHANNELS: TelemetryChannel[] = ['writer', 'auditor', 'planner', 'composer', 'reviser'];

export class TelemetryLogger {
  private rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
  }

  record(
    bookId: string,
    chapterNumber: number,
    channel: TelemetryChannel,
    usage: { promptTokens: number; completionTokens: number; totalTokens: number },
  ): ChapterTelemetry {
    const existing = this.read(bookId, chapterNumber);
    const now = new Date().toISOString();

    const telemetry: ChapterTelemetry = existing ?? {
      bookId,
      chapterNumber,
      channels: this.emptyChannels(),
      totalTokens: 0,
      createdAt: now,
      updatedAt: now,
    };

    const entry = telemetry.channels[channel];
    entry.promptTokens += usage.promptTokens;
    entry.completionTokens += usage.completionTokens;
    entry.totalTokens += usage.totalTokens;
    entry.calls += 1;

    telemetry.totalTokens = CHANNELS.reduce((sum, ch) => sum + telemetry.channels[ch].totalTokens, 0);
    telemetry.updatedAt = now;

    this.writeFile(bookId, chapterNumber, telemetry);
    return telemetry;
  }

  read(bookId: string, chapterNumber: number): ChapterTelemetry | null {
    const filePath = this.getChapterPath(bookId, chapterNumber);
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as ChapterTelemetry;
  }

  listBookTelemetry(bookId: string): ChapterTelemetry[] {
    const dir = path.join(this.rootDir, bookId, 'story', 'state', 'telemetry');
    if (!fs.existsSync(dir)) return [];

    const files = fs
      .readdirSync(dir)
      .filter((name) => /^chapter-\d+\.json$/.test(name))
      .sort();

    return files
      .map((name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf-8')) as ChapterTelemetry)
      .sort((a, b) => a.chapterNumber - b.chapterNumber);
  }

  private getChapterPath(bookId: string, chapterNumber: number): string {
    const padded = String(chapterNumber).padStart(4, '0');
    return path.join(this.rootDir, bookId, 'story', 'state', 'telemetry', `chapter-${padded}.json`);
  }

  private emptyChannels(): Record<TelemetryChannel, ChannelUsage> {
    const init = {} as Record<TelemetryChannel, ChannelUsage>;
    for (const ch of CHANNELS) {
      init[ch] = { promptTokens: 0, completionTokens: 0, totalTokens: 0, calls: 0 };
    }
    return init;
  }

  private writeFile(bookId: string, chapterNumber: number, telemetry: ChapterTelemetry): void {
    const filePath = this.getChapterPath(bookId, chapterNumber);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(telemetry, null, 2), 'utf-8');
  }
}
