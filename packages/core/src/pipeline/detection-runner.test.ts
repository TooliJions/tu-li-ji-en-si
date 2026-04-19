import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LLMProvider } from '../llm/provider';
import {
  DetectionRunner,
  type DetectionConfig,
  type DetectionInput,
  type Detector,
} from './detection-runner';

function createMockProvider(): LLMProvider & {
  generate: ReturnType<typeof vi.fn>;
  generateJSON: ReturnType<typeof vi.fn>;
} {
  return {
    generate: vi.fn(),
    generateJSON: vi.fn(),
  } as unknown as LLMProvider & {
    generate: ReturnType<typeof vi.fn>;
    generateJSON: ReturnType<typeof vi.fn>;
  };
}

function createMockDetector(overrides: Partial<Detector> = {}): Detector {
  return {
    name: overrides.name ?? 'MockDetector',
    runMode: overrides.runMode ?? 'serial',
    execute:
      overrides.execute ??
      vi.fn().mockResolvedValue({
        success: true,
        data: { issues: [], overallStatus: 'pass', summary: '通过' },
      }),
    ...overrides,
  };
}

describe('DetectionRunner', () => {
  let mockProvider: ReturnType<typeof createMockProvider>;
  let runner: DetectionRunner;
  let config: DetectionConfig;

  beforeEach(() => {
    mockProvider = createMockProvider();
    config = {
      provider: mockProvider,
      detectors: [],
      defaultRunMode: 'serial',
    };
    runner = new DetectionRunner(config);
  });

  // ── Constructor ─────────────────────────────────────────────

  describe('constructor', () => {
    it('initializes with empty detectors', () => {
      expect(runner).toBeDefined();
    });

    it('uses defaultRunMode from config', () => {
      const parallelRunner = new DetectionRunner({
        provider: mockProvider,
        detectors: [],
        defaultRunMode: 'parallel',
      });
      expect(parallelRunner).toBeDefined();
    });
  });

  // ── register() ─────────────────────────────────────────────

  describe('register()', () => {
    it('registers a new detector', () => {
      const detector = createMockDetector({ name: 'AIDetector' });
      runner.register(detector);

      const result = runner.listDetectors();
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('AIDetector');
    });

    it('rejects duplicate detector name', () => {
      const d1 = createMockDetector({ name: 'Detector' });
      const d2 = createMockDetector({ name: 'Detector' });

      runner.register(d1);
      expect(() => runner.register(d2)).toThrow('Detector');
    });
  });

  // ── execute() — serial mode ─────────────────────────────────

  describe('execute() — serial', () => {
    it('runs detectors sequentially and aggregates results', async () => {
      const detector1 = createMockDetector({
        name: 'AIDetector',
        execute: vi.fn().mockResolvedValue({
          success: true,
          data: {
            issues: [
              { category: 'ai-generated', severity: 'warning', description: '疑似 AI 生成' },
            ],
            overallStatus: 'warning',
            summary: '有疑点',
          },
        }),
      });
      const detector2 = createMockDetector({
        name: 'StyleDetector',
        execute: vi.fn().mockResolvedValue({
          success: true,
          data: { issues: [], overallStatus: 'pass', summary: '风格正常' },
        }),
      });

      runner.register(detector1);
      runner.register(detector2);

      const input: DetectionInput = {
        content: '林风走进大厅，只见人头攒动。',
        genre: 'xianxia',
        chapterNumber: 1,
        bookId: 'test-book',
      };

      const result = await runner.execute(input);

      expect(result.success).toBe(true);
      expect(result.detectors).toHaveLength(2);
      expect(result.issues).toHaveLength(1);
      expect(result.overallStatus).toBe('warning');
    });

    it('stops on failure when failFast is true', async () => {
      const detector1 = createMockDetector({
        name: 'FailDetector',
        execute: vi.fn().mockResolvedValue({
          success: true,
          data: { issues: [], overallStatus: 'fail', summary: '失败' },
        }),
      });
      const detector2 = createMockDetector({
        name: 'NeverRunDetector',
        execute: vi.fn().mockResolvedValue({
          success: true,
          data: { issues: [], overallStatus: 'pass', summary: '' },
        }),
      });

      runner.register(detector1);
      runner.register(detector2);

      const input: DetectionInput = {
        content: '内容',
        genre: 'xianxia',
        chapterNumber: 1,
        bookId: 'test-book',
      };

      const result = await runner.execute(input, { failFast: true });

      expect(result.detectors).toHaveLength(1);
      expect(detector2.execute).not.toHaveBeenCalled();
    });

    it('continues all detectors when failFast is false', async () => {
      const detector1 = createMockDetector({
        name: 'FailDetector',
        execute: vi.fn().mockResolvedValue({
          success: true,
          data: { issues: [], overallStatus: 'fail', summary: '失败' },
        }),
      });
      const detector2 = createMockDetector({
        name: 'ContinueDetector',
        execute: vi.fn().mockResolvedValue({
          success: true,
          data: { issues: [], overallStatus: 'pass', summary: '通过' },
        }),
      });

      runner.register(detector1);
      runner.register(detector2);

      const input: DetectionInput = {
        content: '内容',
        genre: 'xianxia',
        chapterNumber: 1,
        bookId: 'test-book',
      };

      const result = await runner.execute(input, { failFast: false });

      expect(result.detectors).toHaveLength(2);
    });

    it('handles detector errors gracefully', async () => {
      const detector = createMockDetector({
        name: 'ErrorDetector',
        execute: vi.fn().mockRejectedValue(new Error('Detector crashed')),
      });

      runner.register(detector);

      const input: DetectionInput = {
        content: '内容',
        genre: 'xianxia',
        chapterNumber: 1,
        bookId: 'test-book',
      };

      const result = await runner.execute(input);

      expect(result.detectors).toHaveLength(1);
      expect(result.detectors[0].success).toBe(false);
      expect(result.detectors[0].error).toContain('crashed');
    });

    it('returns overallStatus pass when all detectors pass', async () => {
      const detector = createMockDetector({
        name: 'PassDetector',
        execute: vi.fn().mockResolvedValue({
          success: true,
          data: { issues: [], overallStatus: 'pass', summary: '全部通过' },
        }),
      });

      runner.register(detector);

      const input: DetectionInput = {
        content: '林风走进大厅。',
        genre: 'xianxia',
        chapterNumber: 1,
        bookId: 'test-book',
      };

      const result = await runner.execute(input);

      expect(result.overallStatus).toBe('pass');
    });

    it('returns overallStatus fail when any detector fails', async () => {
      const d1 = createMockDetector({
        name: 'PassDetector',
        execute: vi.fn().mockResolvedValue({
          success: true,
          data: { issues: [], overallStatus: 'pass', summary: '通过' },
        }),
      });
      const d2 = createMockDetector({
        name: 'FailDetector',
        execute: vi.fn().mockResolvedValue({
          success: true,
          data: {
            issues: [{ category: 'plagiarism', severity: 'critical', description: '抄袭检测' }],
            overallStatus: 'fail',
            summary: '失败',
          },
        }),
      });

      runner.register(d1);
      runner.register(d2);

      const input: DetectionInput = {
        content: '内容',
        genre: 'xianxia',
        chapterNumber: 1,
        bookId: 'test-book',
      };

      const result = await runner.execute(input);

      expect(result.overallStatus).toBe('fail');
    });
  });

  // ── execute() — parallel mode ───────────────────────────────

  describe('execute() — parallel', () => {
    it('runs parallel detectors concurrently', async () => {
      const delay1 = vi.fn().mockResolvedValue({
        success: true,
        data: { issues: [], overallStatus: 'pass', summary: '通过' },
      });
      const delay2 = vi.fn().mockResolvedValue({
        success: true,
        data: { issues: [], overallStatus: 'pass', summary: '通过' },
      });

      const detector1 = createMockDetector({
        name: 'Parallel1',
        runMode: 'parallel',
        execute: delay1,
      });
      const detector2 = createMockDetector({
        name: 'Parallel2',
        runMode: 'parallel',
        execute: delay2,
      });

      runner.register(detector1);
      runner.register(detector2);

      const input: DetectionInput = {
        content: '内容',
        genre: 'xianxia',
        chapterNumber: 1,
        bookId: 'test-book',
      };

      const result = await runner.execute(input);

      expect(result.detectors).toHaveLength(2);
      expect(result.success).toBe(true);
    });

    it('respects individual detector runMode over default', async () => {
      const serialDetector = createMockDetector({
        name: 'SerialDetector',
        runMode: 'serial',
        execute: vi.fn().mockResolvedValue({
          success: true,
          data: { issues: [], overallStatus: 'pass', summary: '通过' },
        }),
      });

      const parallelRunner = new DetectionRunner({
        provider: mockProvider,
        detectors: [serialDetector],
        defaultRunMode: 'parallel',
      });

      const input: DetectionInput = {
        content: '内容',
        genre: 'xianxia',
        chapterNumber: 1,
        bookId: 'test-book',
      };

      await parallelRunner.execute(input);

      // serial detector should still run (not in parallel with others)
      expect(serialDetector.execute).toHaveBeenCalled();
    });
  });

  // ── listDetectors() ─────────────────────────────────────────

  describe('listDetectors()', () => {
    it('returns registered detectors', () => {
      const d1 = createMockDetector({ name: 'A' });
      const d2 = createMockDetector({ name: 'B' });

      runner.register(d1);
      runner.register(d2);

      const list = runner.listDetectors();
      expect(list).toHaveLength(2);
      expect(list.map((d) => d.name)).toContain('A');
      expect(list.map((d) => d.name)).toContain('B');
    });

    it('returns empty array when no detectors registered', () => {
      expect(runner.listDetectors()).toEqual([]);
    });
  });

  // ── Validation ──────────────────────────────────────────────

  describe('execute() — validation', () => {
    it('returns error when no detectors are registered', async () => {
      const input: DetectionInput = {
        content: '内容',
        genre: 'xianxia',
        chapterNumber: 1,
        bookId: 'test-book',
      };

      const result = await runner.execute(input);

      expect(result.success).toBe(false);
      expect(result.error).toContain('检测器');
    });

    it('returns error when content is empty', async () => {
      const detector = createMockDetector({ name: 'TestDetector' });
      runner.register(detector);

      const input: DetectionInput = {
        content: '',
        genre: 'xianxia',
        chapterNumber: 1,
        bookId: 'test-book',
      };

      const result = await runner.execute(input);

      expect(result.success).toBe(false);
      expect(result.error).toContain('内容');
    });
  });
});
