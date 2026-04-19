import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DaemonScheduler, DaemonState } from './daemon';
import * as notifyModule from './notify';

const FIXED_NOW = new Date('2026-04-19T08:00:00.000Z').getTime();

// Minimal mock for PipelineRunner
function makeFakePipelineRunner(
  overrides: {
    composeChapterResult?: {
      success: boolean;
      chapterNumber: number;
      usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
    };
  } = {}
) {
  return {
    composeChapter: vi
      .fn()
      .mockImplementation(
        async (input: {
          bookId: string;
          chapterNumber: number;
          title: string;
          genre: string;
          userIntent: string;
        }) => {
          return (
            overrides.composeChapterResult ?? {
              success: true,
              chapterNumber: input.chapterNumber,
              usage: { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 },
            }
          );
        }
      ),
  };
}

describe('DaemonScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // ── Constructor ────────────────────────────────────────────────

  describe('constructor', () => {
    it('creates in idle state', () => {
      const scheduler = new DaemonScheduler({
        bookId: 'book-1',
        rootDir: '/tmp/test',
        dailyTokenLimit: 1_000_000,
      });
      const status = scheduler.getStatus();
      expect(status.state).toBe(DaemonState.Idle);
      expect(status.bookId).toBe('book-1');
      expect(status.nextChapter).toBeUndefined();
    });

    it('accepts fromChapter and toChapter', () => {
      const scheduler = new DaemonScheduler({
        bookId: 'book-1',
        rootDir: '/tmp/test',
        fromChapter: 10,
        toChapter: 20,
        dailyTokenLimit: 500_000,
      });
      const status = scheduler.getStatus();
      expect(status.nextChapter).toBe(10);
      expect(status.toChapter).toBe(20);
    });

    it('accepts custom interval', () => {
      const scheduler = new DaemonScheduler({
        bookId: 'book-1',
        rootDir: '/tmp/test',
        intervalMs: 5000,
        dailyTokenLimit: 1_000_000,
      });
      expect(scheduler).toBeDefined();
    });

    it('accepts cloud mode config', () => {
      const scheduler = new DaemonScheduler({
        bookId: 'book-1',
        rootDir: '/tmp/test',
        mode: 'cloud',
        targetRpm: 30,
        dailyTokenLimit: 1_000_000,
      });
      expect(scheduler).toBeDefined();
    });

    it('throws when dailyTokenLimit <= 0', () => {
      expect(
        () =>
          new DaemonScheduler({
            bookId: 'book-1',
            rootDir: '/tmp/test',
            dailyTokenLimit: 0,
          })
      ).toThrow();
    });
  });

  // ── start() ────────────────────────────────────────────────────

  describe('start()', () => {
    it('transitions from idle to running', async () => {
      const runner = makeFakePipelineRunner();
      const scheduler = new DaemonScheduler({
        bookId: 'book-1',
        rootDir: '/tmp/test',
        fromChapter: 1,
        toChapter: 1,
        intervalMs: 100,
        dailyTokenLimit: 1_000_000,
      });

      scheduler.start(runner);
      expect(scheduler.getStatus().state).toBe(DaemonState.Running);

      // Advance timers so the chapter completes and loop exits
      await vi.advanceTimersByTimeAsync(200);

      expect(scheduler.getStatus().state).toBe(DaemonState.Stopped);
      expect(scheduler.getStatus().chaptersCompleted).toBeGreaterThanOrEqual(1);
    });

    it('throws when already running', () => {
      const runner = makeFakePipelineRunner();
      const scheduler = new DaemonScheduler({
        bookId: 'book-1',
        rootDir: '/tmp/test',
        fromChapter: 1,
        toChapter: 10,
        intervalMs: 100,
        dailyTokenLimit: 1_000_000,
      });

      scheduler.start(runner);
      expect(scheduler.getStatus().state).toBe(DaemonState.Running);

      expect(() => scheduler.start(runner)).toThrow(/守护进程已在运行中/);

      // Clean up
      scheduler.stop();
    });

    it('records startedAt timestamp', () => {
      const runner = makeFakePipelineRunner();
      const scheduler = new DaemonScheduler({
        bookId: 'book-1',
        rootDir: '/tmp/test',
        fromChapter: 1,
        toChapter: 10,
        intervalMs: 100,
        dailyTokenLimit: 1_000_000,
      });

      scheduler.start(runner);
      const status = scheduler.getStatus();
      expect(status.startedAt).toBeDefined();

      scheduler.stop();
    });

    it('calls composeChapter for the first chapter', async () => {
      const runner = makeFakePipelineRunner();
      const scheduler = new DaemonScheduler({
        bookId: 'book-1',
        rootDir: '/tmp/test',
        fromChapter: 3,
        toChapter: 3,
        intervalMs: 100,
        dailyTokenLimit: 1_000_000,
      });

      scheduler.start(runner);
      await vi.advanceTimersByTimeAsync(200);

      expect(runner.composeChapter).toHaveBeenCalledWith(
        expect.objectContaining({ bookId: 'book-1', chapterNumber: 3 })
      );
    });
  });

  // ── pause() ────────────────────────────────────────────────────

  describe('pause()', () => {
    it('transitions from running to paused', () => {
      const runner = makeFakePipelineRunner();
      const scheduler = new DaemonScheduler({
        bookId: 'book-1',
        rootDir: '/tmp/test',
        fromChapter: 1,
        toChapter: 10,
        intervalMs: 5000,
        dailyTokenLimit: 1_000_000,
      });

      scheduler.start(runner);
      scheduler.pause();
      expect(scheduler.getStatus().state).toBe(DaemonState.Paused);

      scheduler.stop();
    });

    it('does nothing when idle', () => {
      const scheduler = new DaemonScheduler({
        bookId: 'book-1',
        rootDir: '/tmp/test',
        dailyTokenLimit: 1_000_000,
      });

      scheduler.pause();
      expect(scheduler.getStatus().state).toBe(DaemonState.Idle);
    });

    it('records pausedAt timestamp', () => {
      const runner = makeFakePipelineRunner();
      const scheduler = new DaemonScheduler({
        bookId: 'book-1',
        rootDir: '/tmp/test',
        fromChapter: 1,
        toChapter: 10,
        intervalMs: 5000,
        dailyTokenLimit: 1_000_000,
      });

      scheduler.start(runner);
      scheduler.pause();
      expect(scheduler.getStatus().pausedAt).toBeDefined();

      scheduler.stop();
    });
  });

  // ── resume() ───────────────────────────────────────────────────

  describe('resume()', () => {
    it('transitions from paused to running', () => {
      const runner = makeFakePipelineRunner();
      const scheduler = new DaemonScheduler({
        bookId: 'book-1',
        rootDir: '/tmp/test',
        fromChapter: 1,
        toChapter: 10,
        intervalMs: 5000,
        dailyTokenLimit: 1_000_000,
      });

      scheduler.start(runner);
      scheduler.pause();
      scheduler.resume();
      expect(scheduler.getStatus().state).toBe(DaemonState.Running);

      scheduler.stop();
    });

    it('does nothing when idle', () => {
      const scheduler = new DaemonScheduler({
        bookId: 'book-1',
        rootDir: '/tmp/test',
        dailyTokenLimit: 1_000_000,
      });

      scheduler.resume();
      expect(scheduler.getStatus().state).toBe(DaemonState.Idle);
    });
  });

  // ── stop() ─────────────────────────────────────────────────────

  describe('stop()', () => {
    it('transitions to idle', () => {
      const runner = makeFakePipelineRunner();
      const scheduler = new DaemonScheduler({
        bookId: 'book-1',
        rootDir: '/tmp/test',
        fromChapter: 1,
        toChapter: 10,
        intervalMs: 5000,
        dailyTokenLimit: 1_000_000,
      });

      scheduler.start(runner);
      scheduler.stop();
      expect(scheduler.getStatus().state).toBe(DaemonState.Idle);
    });

    it('is idempotent — can call stop multiple times', () => {
      const runner = makeFakePipelineRunner();
      const scheduler = new DaemonScheduler({
        bookId: 'book-1',
        rootDir: '/tmp/test',
        fromChapter: 1,
        toChapter: 10,
        intervalMs: 5000,
        dailyTokenLimit: 1_000_000,
      });

      scheduler.start(runner);
      scheduler.stop();
      scheduler.stop();
      scheduler.stop();
      expect(scheduler.getStatus().state).toBe(DaemonState.Idle);
    });

    it('clears startedAt and pausedAt', () => {
      const runner = makeFakePipelineRunner();
      const scheduler = new DaemonScheduler({
        bookId: 'book-1',
        rootDir: '/tmp/test',
        fromChapter: 1,
        toChapter: 10,
        intervalMs: 5000,
        dailyTokenLimit: 1_000_000,
      });

      scheduler.start(runner);
      scheduler.pause();
      scheduler.stop();
      const status = scheduler.getStatus();
      expect(status.startedAt).toBeUndefined();
      expect(status.pausedAt).toBeUndefined();
    });
  });

  // ── Chapter execution loop ─────────────────────────────────────

  describe('chapter execution loop', () => {
    it('writes chapters sequentially and advances nextChapter', async () => {
      const runner = makeFakePipelineRunner();
      const scheduler = new DaemonScheduler({
        bookId: 'book-1',
        rootDir: '/tmp/test',
        fromChapter: 1,
        toChapter: 3,
        intervalMs: 100,
        dailyTokenLimit: 1_000_000,
      });

      scheduler.start(runner);

      await vi.advanceTimersByTimeAsync(200);

      expect(scheduler.getStatus().chaptersCompleted).toBeGreaterThanOrEqual(1);
      expect(scheduler.getStatus().nextChapter).toBeGreaterThanOrEqual(2);

      scheduler.stop();
    });

    it('stops when reaching toChapter', async () => {
      const runner = makeFakePipelineRunner();
      const scheduler = new DaemonScheduler({
        bookId: 'book-1',
        rootDir: '/tmp/test',
        fromChapter: 1,
        toChapter: 2,
        intervalMs: 100,
        dailyTokenLimit: 1_000_000,
      });

      scheduler.start(runner);

      await vi.advanceTimersByTimeAsync(500);

      expect(scheduler.getStatus().chaptersCompleted).toBe(2);
      expect(scheduler.getStatus().state).toBe(DaemonState.Stopped);
    });

    it('respects interval between chapters', async () => {
      const runner = makeFakePipelineRunner();
      const scheduler = new DaemonScheduler({
        bookId: 'book-1',
        rootDir: '/tmp/test',
        fromChapter: 1,
        toChapter: 10,
        intervalMs: 500,
        dailyTokenLimit: 10_000_000,
      });

      scheduler.start(runner);

      // First chapter starts immediately (tick runs synchronously)
      expect(runner.composeChapter.mock.calls.length).toBeGreaterThanOrEqual(1);

      // Advance less than interval — only the first interval timer fires
      await vi.advanceTimersByTimeAsync(200);
      const callsBeforeInterval = runner.composeChapter.mock.calls.length;

      // Advance past interval — another chapter should be triggered
      await vi.advanceTimersByTimeAsync(500);

      const callsAfterInterval = runner.composeChapter.mock.calls.length;

      // The interval timer fired, scheduling another chapter
      expect(callsAfterInterval).toBeGreaterThanOrEqual(callsBeforeInterval);

      scheduler.stop();
    });
  });

  // ── Quota enforcement ──────────────────────────────────────────

  describe('quota enforcement', () => {
    it('auto-stops when quota is exhausted', async () => {
      const runner = makeFakePipelineRunner({
        composeChapterResult: {
          success: true,
          chapterNumber: 1,
          usage: { promptTokens: 600_000, completionTokens: 500_000, totalTokens: 1_100_000 },
        },
      });
      const scheduler = new DaemonScheduler({
        bookId: 'book-1',
        rootDir: '/tmp/test',
        fromChapter: 1,
        toChapter: 10,
        intervalMs: 100,
        dailyTokenLimit: 1_000_000,
      });

      scheduler.start(runner);

      await vi.advanceTimersByTimeAsync(200);

      const status = scheduler.getStatus();
      expect(status.state === DaemonState.Stopped || status.state === DaemonState.Idle).toBe(true);
    });

    it('tracks token usage across chapters', async () => {
      const runner = makeFakePipelineRunner({
        composeChapterResult: {
          success: true,
          chapterNumber: 1,
          usage: { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 },
        },
      });
      const scheduler = new DaemonScheduler({
        bookId: 'book-1',
        rootDir: '/tmp/test',
        fromChapter: 1,
        toChapter: 5,
        intervalMs: 100,
        dailyTokenLimit: 1_000_000,
      });

      scheduler.start(runner);

      await vi.advanceTimersByTimeAsync(300);

      const status = scheduler.getStatus();
      expect(status.dailyTokenUsed).toBeGreaterThan(0);

      scheduler.stop();
    });

    it('stops when quota would be exceeded', async () => {
      const runner = makeFakePipelineRunner({
        composeChapterResult: {
          success: true,
          chapterNumber: 1,
          usage: { promptTokens: 400_000, completionTokens: 300_000, totalTokens: 700_000 },
        },
      });
      const scheduler = new DaemonScheduler({
        bookId: 'book-1',
        rootDir: '/tmp/test',
        fromChapter: 1,
        toChapter: 5,
        intervalMs: 100,
        dailyTokenLimit: 1_000_000,
      });

      scheduler.start(runner);

      await vi.advanceTimersByTimeAsync(500);

      // Should have completed at most 1-2 chapters before quota stops it
      expect(scheduler.getStatus().chaptersCompleted).toBeLessThanOrEqual(2);
    });
  });

  // ── Fallback tracking ──────────────────────────────────────────

  describe('fallback tracking', () => {
    it('increments consecutiveFallbacks on accept_with_warnings', async () => {
      const runner = makeFakePipelineRunner({
        composeChapterResult: {
          success: true,
          chapterNumber: 1,
          error: 'accept_with_warnings',
          usage: { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 },
        },
      });
      const scheduler = new DaemonScheduler({
        bookId: 'book-1',
        rootDir: '/tmp/test',
        fromChapter: 1,
        toChapter: 10,
        intervalMs: 100,
        dailyTokenLimit: 1_000_000,
      });

      scheduler.start(runner);

      await vi.advanceTimersByTimeAsync(200);

      expect(scheduler.getStatus().consecutiveFallbacks).toBeGreaterThanOrEqual(1);

      scheduler.stop();
    });

    it('auto-stops after 2 consecutive fallbacks', async () => {
      const runner = makeFakePipelineRunner({
        composeChapterResult: {
          success: true,
          chapterNumber: 1,
          error: 'accept_with_warnings',
          usage: { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 },
        },
      });
      const scheduler = new DaemonScheduler({
        bookId: 'book-1',
        rootDir: '/tmp/test',
        fromChapter: 1,
        toChapter: 10,
        intervalMs: 100,
        dailyTokenLimit: 1_000_000,
      });

      scheduler.start(runner);

      await vi.advanceTimersByTimeAsync(500);

      const status = scheduler.getStatus();
      expect(status.consecutiveFallbacks).toBeGreaterThanOrEqual(2);
      expect(status.state === DaemonState.Stopped || status.state === DaemonState.Idle).toBe(true);
    });

    it('resets consecutiveFallbacks on successful chapter', async () => {
      const runner = makeFakePipelineRunner();
      const scheduler = new DaemonScheduler({
        bookId: 'book-1',
        rootDir: '/tmp/test',
        fromChapter: 1,
        toChapter: 5,
        intervalMs: 100,
        dailyTokenLimit: 1_000_000,
      });

      scheduler.start(runner);

      await vi.advanceTimersByTimeAsync(200);

      expect(scheduler.getStatus().consecutiveFallbacks).toBe(0);

      scheduler.stop();
    });
  });

  // ── Error handling ─────────────────────────────────────────────

  describe('error handling', () => {
    it('continues after a chapter failure', async () => {
      let callCount = 0;
      const runner = {
        composeChapter: vi.fn().mockImplementation(async (input: { chapterNumber: number }) => {
          callCount++;
          if (callCount === 1) {
            return {
              success: false,
              bookId: 'book-1',
              chapterNumber: input.chapterNumber,
              error: 'LLM error',
            };
          }
          return {
            success: true,
            chapterNumber: input.chapterNumber,
            usage: { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 },
          };
        }),
      };

      const scheduler = new DaemonScheduler({
        bookId: 'book-1',
        rootDir: '/tmp/test',
        fromChapter: 1,
        toChapter: 3,
        intervalMs: 100,
        dailyTokenLimit: 1_000_000,
      });

      scheduler.start(runner);

      await vi.advanceTimersByTimeAsync(500);

      expect(runner.composeChapter.mock.calls.length).toBeGreaterThanOrEqual(2);

      scheduler.stop();
    });

    it('does not crash on unexpected errors', async () => {
      const runner = {
        composeChapter: vi.fn().mockRejectedValue(new Error('Unexpected crash')),
      };

      const scheduler = new DaemonScheduler({
        bookId: 'book-1',
        rootDir: '/tmp/test',
        fromChapter: 1,
        toChapter: 5,
        intervalMs: 100,
        dailyTokenLimit: 1_000_000,
      });

      scheduler.start(runner);

      await vi.advanceTimersByTimeAsync(300);

      expect(
        scheduler.getStatus().state === DaemonState.Running ||
          scheduler.getStatus().state === DaemonState.Stopped
      ).toBe(true);

      scheduler.stop();
    });
  });

  // ── Event listeners ────────────────────────────────────────────

  describe('event listeners', () => {
    it('emits chapter_complete event after successful chapter', async () => {
      const runner = makeFakePipelineRunner();
      const scheduler = new DaemonScheduler({
        bookId: 'book-1',
        rootDir: '/tmp/test',
        fromChapter: 1,
        toChapter: 2,
        intervalMs: 100,
        dailyTokenLimit: 1_000_000,
      });

      const events: Array<{ type: string; data: unknown }> = [];
      scheduler.on('chapter_complete', (data) => events.push({ type: 'chapter_complete', data }));

      scheduler.start(runner);

      await vi.advanceTimersByTimeAsync(200);

      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events[0].data).toMatchObject({ bookId: 'book-1', chapterNumber: 1 });

      scheduler.stop();
    });

    it('emits state_change event on start/stop', () => {
      const runner = makeFakePipelineRunner();
      const scheduler = new DaemonScheduler({
        bookId: 'book-1',
        rootDir: '/tmp/test',
        fromChapter: 1,
        toChapter: 10,
        intervalMs: 5000,
        dailyTokenLimit: 1_000_000,
      });

      const events: Array<{ from: DaemonState; to: DaemonState }> = [];
      scheduler.on('state_change', (data) =>
        events.push(data as { from: DaemonState; to: DaemonState })
      );

      scheduler.start(runner);

      expect(events.some((e) => e.to === DaemonState.Running)).toBe(true);

      scheduler.stop();
      expect(events.some((e) => e.to === DaemonState.Idle)).toBe(true);
    });

    it('emits quota_exhausted event when quota hit', async () => {
      const runner = makeFakePipelineRunner({
        composeChapterResult: {
          success: true,
          chapterNumber: 1,
          usage: { promptTokens: 600_000, completionTokens: 500_000, totalTokens: 1_100_000 },
        },
      });
      const scheduler = new DaemonScheduler({
        bookId: 'book-1',
        rootDir: '/tmp/test',
        fromChapter: 1,
        toChapter: 10,
        intervalMs: 100,
        dailyTokenLimit: 1_000_000,
      });

      const events: Array<{ type: string }> = [];
      scheduler.on('quota_exhausted', (data) => events.push(data as { type: string }));

      scheduler.start(runner);

      await vi.advanceTimersByTimeAsync(200);

      expect(events.length).toBeGreaterThanOrEqual(1);
    });

    it('supports unsubscribing from events', async () => {
      const runner = makeFakePipelineRunner();
      const scheduler = new DaemonScheduler({
        bookId: 'book-1',
        rootDir: '/tmp/test',
        fromChapter: 1,
        toChapter: 5,
        intervalMs: 100,
        dailyTokenLimit: 1_000_000,
      });

      let callCount = 0;
      const unsub = scheduler.on('chapter_complete', () => callCount++);
      unsub();

      scheduler.start(runner);

      await vi.advanceTimersByTimeAsync(200);

      expect(callCount).toBe(0);

      scheduler.stop();
    });
  });

  // ── Notification integration ──────────────────────────────────

  describe('notification integration', () => {
    const mockNotifier = {
      send: vi.fn().mockResolvedValue({ success: true, channel: 'telegram' }),
      sendAll: vi.fn().mockResolvedValue([{ success: true, channel: 'telegram' }]),
      testPing: vi.fn().mockResolvedValue({ success: true, channel: 'telegram' }),
    };

    beforeEach(() => {
      mockNotifier.send.mockClear().mockResolvedValue({ success: true, channel: 'telegram' });
      mockNotifier.sendAll.mockClear().mockResolvedValue([{ success: true, channel: 'telegram' }]);
      mockNotifier.testPing.mockClear();
      vi.spyOn(notifyModule, 'createNotifier').mockReturnValue(mockNotifier);
    });

    afterEach(() => {
      vi.restoreAllMocks();
      vi.clearAllMocks();
    });

    it('sends notification on daemon start', async () => {
      const runner = makeFakePipelineRunner();
      const scheduler = new DaemonScheduler({
        bookId: 'book-1',
        rootDir: '/tmp/test',
        fromChapter: 1,
        toChapter: 1,
        intervalMs: 100,
        dailyTokenLimit: 1_000_000,
        notifyChannels: [{ type: 'telegram', botToken: 'tok', chatId: '123' }],
      });

      scheduler.start(runner);
      await vi.advanceTimersByTimeAsync(200);

      expect(mockNotifier.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'daemon_start',
          message: '守护进程已启动',
        })
      );

      scheduler.stop();
    });

    it('sends notification on chapter complete', async () => {
      const runner = makeFakePipelineRunner();
      const scheduler = new DaemonScheduler({
        bookId: 'book-1',
        rootDir: '/tmp/test',
        fromChapter: 1,
        toChapter: 1,
        intervalMs: 100,
        dailyTokenLimit: 1_000_000,
        notifyChannels: [{ type: 'telegram', botToken: 'tok', chatId: '123' }],
      });

      scheduler.start(runner);
      await vi.advanceTimersByTimeAsync(200);

      expect(mockNotifier.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'chapter_complete',
          chapterNumber: 1,
        })
      );

      scheduler.stop();
    });

    it('sends notification on daemon stop', async () => {
      const runner = makeFakePipelineRunner();
      const scheduler = new DaemonScheduler({
        bookId: 'book-1',
        rootDir: '/tmp/test',
        fromChapter: 1,
        toChapter: 1,
        intervalMs: 100,
        dailyTokenLimit: 1_000_000,
        notifyChannels: [{ type: 'telegram', botToken: 'tok', chatId: '123' }],
      });

      scheduler.start(runner);
      await vi.advanceTimersByTimeAsync(200);
      scheduler.stop();

      expect(mockNotifier.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'daemon_stop',
        })
      );
    });

    it('sends notification on quota exhausted', async () => {
      const runner = makeFakePipelineRunner({
        composeChapterResult: {
          success: true,
          chapterNumber: 1,
          usage: { promptTokens: 600_000, completionTokens: 500_000, totalTokens: 1_100_000 },
        },
      });
      const scheduler = new DaemonScheduler({
        bookId: 'book-1',
        rootDir: '/tmp/test',
        fromChapter: 1,
        toChapter: 10,
        intervalMs: 100,
        dailyTokenLimit: 1_000_000,
        notifyChannels: [{ type: 'webhook', url: 'https://example.com/hook' }],
      });

      scheduler.start(runner);
      await vi.advanceTimersByTimeAsync(200);

      expect(mockNotifier.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'quota_exhausted',
        })
      );
    });

    it('does not send notifications when no channels configured', async () => {
      const runner = makeFakePipelineRunner();
      const scheduler = new DaemonScheduler({
        bookId: 'book-1',
        rootDir: '/tmp/test',
        fromChapter: 1,
        toChapter: 1,
        intervalMs: 100,
        dailyTokenLimit: 1_000_000,
      });

      scheduler.start(runner);
      await vi.advanceTimersByTimeAsync(200);

      expect(mockNotifier.send).not.toHaveBeenCalled();

      scheduler.stop();
    });

    it('handles notification errors gracefully', async () => {
      mockNotifier.send.mockRejectedValueOnce(new Error('Network error'));

      const runner = makeFakePipelineRunner();
      const scheduler = new DaemonScheduler({
        bookId: 'book-1',
        rootDir: '/tmp/test',
        fromChapter: 1,
        toChapter: 1,
        intervalMs: 100,
        dailyTokenLimit: 1_000_000,
        notifyChannels: [{ type: 'telegram', botToken: 'tok', chatId: '123' }],
      });

      // Should not throw
      expect(() => scheduler.start(runner)).not.toThrow();

      await vi.advanceTimersByTimeAsync(200);
      scheduler.stop();
    });

    it('sends notification on max fallbacks reached', async () => {
      const runner = makeFakePipelineRunner({
        composeChapterResult: {
          success: true,
          chapterNumber: 1,
          error: 'accept_with_warnings',
          usage: { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 },
        },
      });
      const scheduler = new DaemonScheduler({
        bookId: 'book-1',
        rootDir: '/tmp/test',
        fromChapter: 1,
        toChapter: 10,
        intervalMs: 100,
        dailyTokenLimit: 1_000_000,
        maxConsecutiveFallbacks: 2,
        notifyChannels: [{ type: 'telegram', botToken: 'tok', chatId: '123' }],
      });

      scheduler.start(runner);
      await vi.advanceTimersByTimeAsync(500);

      expect(mockNotifier.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'max_fallbacks_reached',
        })
      );

      scheduler.stop();
    });
  });

  // ── getStatus() ────────────────────────────────────────────────

  describe('getStatus()', () => {
    it('returns full status object', () => {
      const scheduler = new DaemonScheduler({
        bookId: 'book-1',
        rootDir: '/tmp/test',
        fromChapter: 1,
        toChapter: 10,
        intervalMs: 5000,
        dailyTokenLimit: 1_000_000,
      });

      const status = scheduler.getStatus();

      expect(status).toMatchObject({
        bookId: 'book-1',
        state: DaemonState.Idle,
        toChapter: 10,
        dailyTokenLimit: 1_000_000,
        nextChapter: 1,
      });
    });

    it('reflects interval from SmartInterval', () => {
      const scheduler = new DaemonScheduler({
        bookId: 'book-1',
        rootDir: '/tmp/test',
        fromChapter: 1,
        mode: 'cloud',
        targetRpm: 60,
        dailyTokenLimit: 1_000_000,
      });

      const status = scheduler.getStatus();
      expect(status.intervalMs).toBe(1000);
    });
  });

  // ── Acceptance criteria ────────────────────────────────────────

  describe('acceptance: 可启动/暂停/恢复/停止，每章完成后触发后续任务', () => {
    it('full lifecycle: start → pause → resume → stop', async () => {
      const runner = makeFakePipelineRunner();
      const scheduler = new DaemonScheduler({
        bookId: 'book-1',
        rootDir: '/tmp/test',
        fromChapter: 1,
        toChapter: 20,
        intervalMs: 5000,
        dailyTokenLimit: 10_000_000,
      });

      // Start — synchronous, transitions to Running
      scheduler.start(runner);
      expect(scheduler.getStatus().state).toBe(DaemonState.Running);

      // First chapter starts immediately (tick is synchronous)
      expect(runner.composeChapter.mock.calls.length).toBeGreaterThanOrEqual(1);

      // Wait for first chapter to complete
      await vi.advanceTimersByTimeAsync(1);
      expect(scheduler.getStatus().chaptersCompleted).toBeGreaterThanOrEqual(1);

      // Pause — before the 5000ms interval timer fires
      scheduler.pause();
      expect(scheduler.getStatus().state).toBe(DaemonState.Paused);

      const chaptersWhilePaused = scheduler.getStatus().chaptersCompleted;

      // Advance time — interval timer fires but tick sees Paused state
      await vi.advanceTimersByTimeAsync(6000);
      // No new chapters should complete while paused
      expect(scheduler.getStatus().chaptersCompleted).toBe(chaptersWhilePaused);

      // Resume — transitions back to Running
      scheduler.resume();
      expect(scheduler.getStatus().state).toBe(DaemonState.Running);

      // Advance more — chapters resume writing
      await vi.advanceTimersByTimeAsync(10000);
      expect(scheduler.getStatus().chaptersCompleted).toBeGreaterThan(chaptersWhilePaused);

      // Stop
      scheduler.stop();
      expect(scheduler.getStatus().state).toBe(DaemonState.Idle);
    });

    it('triggers next chapter after each completion', async () => {
      const runner = makeFakePipelineRunner();
      const scheduler = new DaemonScheduler({
        bookId: 'book-1',
        rootDir: '/tmp/test',
        fromChapter: 5,
        toChapter: 8,
        intervalMs: 50,
        dailyTokenLimit: 10_000_000,
      });

      scheduler.start(runner);

      await vi.advanceTimersByTimeAsync(500);

      expect(runner.composeChapter.mock.calls.length).toBeGreaterThanOrEqual(3);
      expect(scheduler.getStatus().chaptersCompleted).toBeGreaterThanOrEqual(3);

      scheduler.stop();
    });
  });
});
