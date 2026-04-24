import type { TelemetryLogger, TelemetryChannel } from '../telemetry/logger';

export interface UsageEntry {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface UsageBreakdown {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  breakdown?: Record<string, UsageEntry>;
}

export class UsageTracker {
  private currentUsage = new Map<string, UsageEntry>();

  constructor(private telemetryLogger: TelemetryLogger) {}

  clear(): void {
    this.currentUsage.clear();
  }

  track(
    bookId: string,
    chapterNumber: number,
    channel: TelemetryChannel,
    usage: UsageEntry | undefined
  ): void {
    if (!usage) return;
    this.telemetryLogger.record(bookId, chapterNumber, channel, usage);
    const existing = this.currentUsage.get(channel);
    if (existing) {
      this.currentUsage.set(channel, {
        promptTokens: existing.promptTokens + usage.promptTokens,
        completionTokens: existing.completionTokens + usage.completionTokens,
        totalTokens: existing.totalTokens + usage.totalTokens,
      });
    } else {
      this.currentUsage.set(channel, { ...usage });
    }
  }

  build(): UsageBreakdown {
    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;
    const breakdown: Record<string, UsageEntry> = {};
    for (const [channel, usage] of this.currentUsage.entries()) {
      promptTokens += usage.promptTokens;
      completionTokens += usage.completionTokens;
      totalTokens += usage.totalTokens;
      breakdown[channel] = { ...usage };
    }
    if (totalTokens === 0) return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    return { promptTokens, completionTokens, totalTokens, breakdown };
  }

  merge(breakdown?: Record<string, UsageEntry>): UsageBreakdown {
    if (!breakdown || Object.keys(breakdown).length === 0) {
      return this.build();
    }
    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;
    for (const usage of Object.values(breakdown)) {
      promptTokens += usage.promptTokens;
      completionTokens += usage.completionTokens;
      totalTokens += usage.totalTokens;
    }
    return { promptTokens, completionTokens, totalTokens, breakdown: { ...breakdown } };
  }
}
