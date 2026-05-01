import { describe, it, expect, vi } from 'vitest';
import { UsageTracker } from './telemetry';
import type { TelemetryLogger } from '../telemetry/logger';

describe('UsageTracker', () => {
  const mockLogger: TelemetryLogger = {
    record: vi.fn(),
    read: vi.fn(),
    listBookTelemetry: vi.fn(),
  };

  it('空状态 build 返回零值', () => {
    const tracker = new UsageTracker(mockLogger);
    const result = tracker.build();
    expect(result).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    });
  });

  it('track 记录并累加同 channel 用量', () => {
    const tracker = new UsageTracker(mockLogger);
    tracker.track('book-1', 1, 'writer', {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    });
    tracker.track('book-1', 1, 'writer', {
      promptTokens: 200,
      completionTokens: 100,
      totalTokens: 300,
    });

    const result = tracker.build();
    expect(result.promptTokens).toBe(300);
    expect(result.completionTokens).toBe(150);
    expect(result.totalTokens).toBe(450);
    expect(result.breakdown?.writer).toEqual({
      promptTokens: 300,
      completionTokens: 150,
      totalTokens: 450,
    });
  });

  it('track 不同 channel 独立累加', () => {
    const tracker = new UsageTracker(mockLogger);
    tracker.track('book-1', 1, 'writer', {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    });
    tracker.track('book-1', 1, 'auditor', {
      promptTokens: 30,
      completionTokens: 20,
      totalTokens: 50,
    });

    const result = tracker.build();
    expect(result.totalTokens).toBe(200);
    expect(Object.keys(result.breakdown ?? {})).toHaveLength(2);
  });

  it('track 忽略 undefined usage', () => {
    const tracker = new UsageTracker(mockLogger);
    tracker.track('book-1', 1, 'writer', undefined);
    expect(tracker.build().totalTokens).toBe(0);
  });

  it('clear 重置内部状态', () => {
    const tracker = new UsageTracker(mockLogger);
    tracker.track('book-1', 1, 'writer', {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    });
    tracker.clear();
    expect(tracker.build().totalTokens).toBe(0);
  });

  it('merge 合并外部 breakdown', () => {
    const tracker = new UsageTracker(mockLogger);
    tracker.track('book-1', 1, 'writer', {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    });

    const merged = tracker.merge({
      reviser: { promptTokens: 20, completionTokens: 10, totalTokens: 30 },
    });

    expect(merged.totalTokens).toBe(30);
    expect(merged.breakdown?.reviser).toBeDefined();
  });

  it('merge 空 breakdown 退化为 build', () => {
    const tracker = new UsageTracker(mockLogger);
    tracker.track('book-1', 1, 'writer', {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    });

    const merged = tracker.merge({});
    expect(merged.totalTokens).toBe(150);
  });

  it('调用 telemetryLogger.record 进行持久化', () => {
    const tracker = new UsageTracker(mockLogger);
    const usage = { promptTokens: 10, completionTokens: 5, totalTokens: 15 };
    tracker.track('book-1', 2, 'composer', usage);
    expect(mockLogger.record).toHaveBeenCalledWith('book-1', 2, 'composer', usage);
  });
});
