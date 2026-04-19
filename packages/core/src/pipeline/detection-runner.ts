import { LLMProvider } from '../llm/provider';

// ─── Config ──────────────────────────────────────────────────────

export interface DetectionInput {
  content: string;
  genre: string;
  chapterNumber: number;
  bookId: string;
}

export interface DetectionIssue {
  category: string;
  severity: 'critical' | 'blocking' | 'warning' | 'suggestion';
  description: string;
}

export interface DetectorResult {
  success: boolean;
  name: string;
  data?: {
    issues: DetectionIssue[];
    overallStatus: 'pass' | 'warning' | 'fail';
    summary: string;
  };
  error?: string;
}

export interface DetectionReport {
  success: boolean;
  bookId: string;
  chapterNumber: number;
  detectors: DetectorResult[];
  issues: DetectionIssue[];
  overallStatus: 'pass' | 'warning' | 'fail';
  error?: string;
}

export type RunMode = 'serial' | 'parallel';

export interface Detector {
  name: string;
  runMode?: RunMode;
  execute(input: DetectionInput): Promise<DetectorResult>;
}

export interface DetectionConfig {
  provider: LLMProvider;
  detectors?: Detector[];
  defaultRunMode?: RunMode;
}

// ─── DetectionRunner ────────────────────────────────────────────

export class DetectionRunner {
  private detectors: Map<string, Detector> = new Map();
  private defaultRunMode: RunMode;

  constructor(config: DetectionConfig) {
    this.defaultRunMode = config.defaultRunMode ?? 'serial';
    for (const detector of config.detectors ?? []) {
      this.detectors.set(detector.name, detector);
    }
  }

  /**
   * 注册检测器。
   */
  register(detector: Detector): void {
    if (this.detectors.has(detector.name)) {
      throw new Error(`检测器「${detector.name}」已注册`);
    }
    this.detectors.set(detector.name, detector);
  }

  /**
   * 列出已注册检测器。
   */
  listDetectors(): Detector[] {
    return [...this.detectors.values()];
  }

  /**
   * 执行检测流程。
   */
  async execute(input: DetectionInput, options?: { failFast?: boolean }): Promise<DetectionReport> {
    if (!input.content || input.content.trim().length === 0) {
      return {
        success: false,
        bookId: input.bookId,
        chapterNumber: input.chapterNumber,
        detectors: [],
        issues: [],
        overallStatus: 'fail',
        error: '章节内容不能为空',
      };
    }

    if (this.detectors.size === 0) {
      return {
        success: false,
        bookId: input.bookId,
        chapterNumber: input.chapterNumber,
        detectors: [],
        issues: [],
        overallStatus: 'fail',
        error: '未注册任何检测器',
      };
    }

    const failFast = options?.failFast ?? false;
    const serialDetectors: Detector[] = [];
    const parallelDetectors: Detector[] = [];

    for (const detector of this.detectors.values()) {
      const mode = detector.runMode ?? this.defaultRunMode;
      if (mode === 'serial') {
        serialDetectors.push(detector);
      } else {
        parallelDetectors.push(detector);
      }
    }

    const results: DetectorResult[] = [];

    // Run serial detectors first (in order)
    for (const detector of serialDetectors) {
      const result = await this.#runDetector(detector, input);
      results.push(result);

      if (failFast && result.data?.overallStatus === 'fail') {
        break;
      }
    }

    // Run parallel detectors concurrently
    if (parallelDetectors.length > 0) {
      const parallelResults = await Promise.all(
        parallelDetectors.map((d) => this.#runDetector(d, input))
      );
      results.push(...parallelResults);
    }

    const issues = results.filter((r) => r.data).flatMap((r) => r.data!.issues);

    const overallStatus = this.#computeOverallStatus(results);

    return {
      success: results.every((r) => r.success),
      bookId: input.bookId,
      chapterNumber: input.chapterNumber,
      detectors: results,
      issues,
      overallStatus,
    };
  }

  // ── Private helpers ───────────────────────────────────────────

  async #runDetector(detector: Detector, input: DetectionInput): Promise<DetectorResult> {
    try {
      return await detector.execute(input);
    } catch (error) {
      return {
        success: false,
        name: detector.name,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  #computeOverallStatus(results: DetectorResult[]): 'pass' | 'warning' | 'fail' {
    let hasWarning = false;
    for (const result of results) {
      if (result.data?.overallStatus === 'fail') return 'fail';
      if (result.data?.overallStatus === 'warning') hasWarning = true;
    }
    return hasWarning ? 'warning' : 'pass';
  }
}
