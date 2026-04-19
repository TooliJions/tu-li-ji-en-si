import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LLMProvider } from '../llm/provider';
import {
  RevisionLoop,
  type RevisionLoopConfig,
  type RevisionInput,
  type RevisionResult,
} from './revision-loop';

// ── Helpers ────────────────────────────────────────────────────────

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

const PASS_AUDIT = {
  issues: [],
  overallScore: 85,
  overallStatus: 'pass' as const,
  summary: '质量良好',
};

const WARN_AUDIT = {
  issues: [{ severity: 'warning', description: '段落节奏稍显平淡' }],
  overallScore: 55,
  overallStatus: 'warning' as const,
  summary: '存在警告',
};

const FAIL_AUDIT = {
  issues: [{ severity: 'blocking', description: '逻辑严重不连贯' }],
  overallScore: 30,
  overallStatus: 'fail' as const,
  summary: '质量不合格',
};

const CONTENT =
  '林风走进大厅，只见人头攒动，觥筹交错。他微微一怔，心中暗道此地不宜久留。于是他转身离开，不再回头。大厅外月光如水，洒在青石板上。';
const REVISED_CONTENT =
  '林风踏入宴厅，四周喧嚣不已。他扫视一圈，感到一股无形的压迫。他悄然退步，消失在人群之外。门外的月色如银，倒映在湿润的石板上。';
const DEGRADED_CONTENT = '这段内容质量更差了，充满了各种错误和不连贯之处，完全无法阅读。';

function makeInput(overrides?: Partial<RevisionInput>): RevisionInput {
  return {
    content: CONTENT,
    bookId: 'book-001',
    chapterNumber: 5,
    genre: 'xianxia',
    ...overrides,
  };
}

function makeConfig(overrides?: Partial<RevisionLoopConfig>): RevisionLoopConfig {
  return {
    provider: {} as LLMProvider, // replaced in beforeEach
    maxRevisionRetries: 2,
    fallbackAction: 'accept_with_warnings',
    minPassScore: 60,
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('RevisionLoop', () => {
  let mockProvider: ReturnType<typeof createMockProvider>;
  let loop: RevisionLoop;

  beforeEach(() => {
    mockProvider = createMockProvider();
    loop = new RevisionLoop({ ...makeConfig(), provider: mockProvider });
  });

  // ── Constructor defaults ───────────────────────────────────────

  describe('constructor', () => {
    it('accepts minimal config with defaults', () => {
      const minimal = new RevisionLoop({ provider: mockProvider });
      expect(minimal).toBeDefined();
    });

    it('accepts full config', () => {
      const full = new RevisionLoop({
        provider: mockProvider,
        maxRevisionRetries: 3,
        fallbackAction: 'pause',
        minPassScore: 75,
      });
      expect(full).toBeDefined();
    });
  });

  // ── Passes first audit ─────────────────────────────────────────

  describe('run() — passes on first audit', () => {
    it('returns action=accepted when first audit passes', async () => {
      mockProvider.generateJSON.mockResolvedValue(PASS_AUDIT);

      const result = await loop.run(makeInput());

      expect(result.action).toBe('accepted');
      expect(result.revisionAttempts).toBe(0);
      expect(result.isContaminated).toBe(false);
    });

    it('preserves original content on clean pass', async () => {
      mockProvider.generateJSON.mockResolvedValue(PASS_AUDIT);

      const result = await loop.run(makeInput());

      expect(result.content).toBe(CONTENT);
      expect(result.originalContent).toBe(CONTENT);
    });

    it('returns empty warnings on clean pass', async () => {
      mockProvider.generateJSON.mockResolvedValue(PASS_AUDIT);

      const result = await loop.run(makeInput());

      expect(result.warnings).toHaveLength(0);
    });
  });

  // ── Revises and then passes ────────────────────────────────────

  describe('run() — revision succeeds', () => {
    it('returns action=accepted after successful revision', async () => {
      mockProvider.generateJSON
        .mockResolvedValueOnce(FAIL_AUDIT) // first audit: fail
        .mockResolvedValueOnce(PASS_AUDIT); // second audit: pass
      mockProvider.generate.mockResolvedValue({ text: REVISED_CONTENT });

      const result = await loop.run(makeInput());

      expect(result.action).toBe('accepted');
      expect(result.revisionAttempts).toBe(1);
    });

    it('uses revised content after successful revision', async () => {
      mockProvider.generateJSON.mockResolvedValueOnce(FAIL_AUDIT).mockResolvedValueOnce(PASS_AUDIT);
      mockProvider.generate.mockResolvedValue({ text: REVISED_CONTENT });

      const result = await loop.run(makeInput());

      expect(result.content).toBe(REVISED_CONTENT);
    });

    it('increments revisionAttempts correctly over multiple rounds', async () => {
      mockProvider.generateJSON
        .mockResolvedValueOnce(FAIL_AUDIT)
        .mockResolvedValueOnce(FAIL_AUDIT)
        .mockResolvedValueOnce(PASS_AUDIT);
      mockProvider.generate.mockResolvedValue({ text: REVISED_CONTENT });

      const loopWith3 = new RevisionLoop({
        ...makeConfig({ maxRevisionRetries: 3 }),
        provider: mockProvider,
      });

      const result = await loopWith3.run(makeInput());

      expect(result.revisionAttempts).toBe(2);
      expect(result.action).toBe('accepted');
    });
  });

  // ── fallbackAction: accept_with_warnings ──────────────────────

  describe('run() — fallbackAction=accept_with_warnings', () => {
    beforeEach(() => {
      loop = new RevisionLoop({
        ...makeConfig({ fallbackAction: 'accept_with_warnings', maxRevisionRetries: 2 }),
        provider: mockProvider,
      });
    });

    it('triggers accept_with_warnings after exhausting retries', async () => {
      mockProvider.generateJSON.mockResolvedValue(FAIL_AUDIT);
      mockProvider.generate.mockResolvedValue({ text: REVISED_CONTENT });

      const result = await loop.run(makeInput());

      expect(result.action).toBe('accepted_with_warnings');
      expect(result.revisionAttempts).toBe(2);
    });

    it('includes audit issue descriptions in warnings', async () => {
      mockProvider.generateJSON.mockResolvedValue(FAIL_AUDIT);
      mockProvider.generate.mockResolvedValue({ text: REVISED_CONTENT });

      const result = await loop.run(makeInput());

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some((w) => w.includes('逻辑严重不连贯'))).toBe(true);
    });

    it('keeps content from last revision attempt', async () => {
      mockProvider.generateJSON.mockResolvedValue(FAIL_AUDIT);
      mockProvider.generate.mockResolvedValue({ text: REVISED_CONTENT });

      const result = await loop.run(makeInput());

      // Content should be the last revised version (not contaminated scenario)
      expect(result.content).toBe(REVISED_CONTENT);
    });
  });

  // ── fallbackAction: pause ──────────────────────────────────────

  describe('run() — fallbackAction=pause', () => {
    beforeEach(() => {
      loop = new RevisionLoop({
        ...makeConfig({ fallbackAction: 'pause', maxRevisionRetries: 2 }),
        provider: mockProvider,
      });
    });

    it('triggers paused after exhausting retries', async () => {
      mockProvider.generateJSON.mockResolvedValue(FAIL_AUDIT);
      mockProvider.generate.mockResolvedValue({ text: REVISED_CONTENT });

      const result = await loop.run(makeInput());

      expect(result.action).toBe('paused');
      expect(result.revisionAttempts).toBe(2);
    });

    it('paused result still carries warnings', async () => {
      mockProvider.generateJSON.mockResolvedValue(FAIL_AUDIT);
      mockProvider.generate.mockResolvedValue({ text: REVISED_CONTENT });

      const result = await loop.run(makeInput());

      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  // ── 污染隔离 ──────────────────────────────────────────────────

  describe('run() — 污染隔离 (contamination isolation)', () => {
    it('rolls back to pre-revision content when revision degrades score', async () => {
      // Audit 1: fail → triggers revision
      // Audit 2 (after revision): score lower than audit 1 → contaminated
      const DEGRADED_AUDIT = { ...FAIL_AUDIT, overallScore: 10, summary: '修订后更差' };

      mockProvider.generateJSON
        .mockResolvedValueOnce(FAIL_AUDIT) // score: 30
        .mockResolvedValueOnce(DEGRADED_AUDIT); // score: 10 — contaminated
      mockProvider.generate.mockResolvedValue({ text: DEGRADED_CONTENT });

      const result = await loop.run(makeInput());

      expect(result.isContaminated).toBe(true);
      // Must roll back to original content, not the degraded revision
      expect(result.content).toBe(CONTENT);
      expect(result.originalContent).toBe(CONTENT);
    });

    it('marks isContaminated=false on clean revision', async () => {
      mockProvider.generateJSON.mockResolvedValueOnce(FAIL_AUDIT).mockResolvedValueOnce(PASS_AUDIT);
      mockProvider.generate.mockResolvedValue({ text: REVISED_CONTENT });

      const result = await loop.run(makeInput());

      expect(result.isContaminated).toBe(false);
    });

    it('uses last clean version when second revision contaminates', async () => {
      // Round 1: fail (score 30) → revise → round 2: better (score 50) but still fail
      // Round 2: revise → round 3: degraded (score 20) → contaminated → roll back to round 2 content
      const PARTIAL_AUDIT = { ...WARN_AUDIT, overallScore: 50, overallStatus: 'fail' as const };
      const CONTAMINATED_AUDIT = { ...FAIL_AUDIT, overallScore: 20 };
      const SECOND_REVISION = '第二次修订的内容比第一次更好了一些，至少部分改善了逻辑连贯性。';

      mockProvider.generateJSON
        .mockResolvedValueOnce(FAIL_AUDIT) // score: 30 → fail
        .mockResolvedValueOnce(PARTIAL_AUDIT) // score: 50 → still fail
        .mockResolvedValueOnce(CONTAMINATED_AUDIT); // score: 20 → contaminated
      mockProvider.generate
        .mockResolvedValueOnce({ text: REVISED_CONTENT }) // 1st revision
        .mockResolvedValueOnce({ text: SECOND_REVISION }); // 2nd revision (will be contaminated)

      const loopWith3 = new RevisionLoop({
        ...makeConfig({ maxRevisionRetries: 3 }),
        provider: mockProvider,
      });

      const result = await loopWith3.run(makeInput());

      expect(result.isContaminated).toBe(true);
      // Should roll back to REVISED_CONTENT (last clean version before contamination)
      expect(result.content).toBe(REVISED_CONTENT);
    });
  });

  // ── Output shape ──────────────────────────────────────────────

  describe('run() — output shape', () => {
    it('result contains all required fields', async () => {
      mockProvider.generateJSON.mockResolvedValue(PASS_AUDIT);

      const result = await loop.run(makeInput());

      expect(['accepted', 'accepted_with_warnings', 'paused']).toContain(result.action);
      expect(typeof result.content).toBe('string');
      expect(typeof result.originalContent).toBe('string');
      expect(typeof result.revisionAttempts).toBe('number');
      expect(Array.isArray(result.warnings)).toBe(true);
      expect(typeof result.isContaminated).toBe('boolean');
      expect(typeof result.finalScore).toBe('number');
    });

    it('originalContent is always the initial input content', async () => {
      mockProvider.generateJSON.mockResolvedValue(FAIL_AUDIT);
      mockProvider.generate.mockResolvedValue({ text: REVISED_CONTENT });

      const result = await loop.run(makeInput());

      expect(result.originalContent).toBe(CONTENT);
    });
  });

  // ── warn-level audit ──────────────────────────────────────────

  describe('run() — warning-level audit', () => {
    it('accepts with no revision when score meets threshold despite warnings', async () => {
      const WARN_PASS = { ...WARN_AUDIT, overallScore: 65 };
      mockProvider.generateJSON.mockResolvedValue(WARN_PASS);

      const result = await loop.run(makeInput());

      expect(result.action).toBe('accepted');
      expect(result.revisionAttempts).toBe(0);
    });

    it('triggers revision when warning-level audit is below minPassScore', async () => {
      // score=55 < minPassScore=60 → revise
      mockProvider.generateJSON
        .mockResolvedValueOnce(WARN_AUDIT) // score 55 < 60
        .mockResolvedValueOnce(PASS_AUDIT);
      mockProvider.generate.mockResolvedValue({ text: REVISED_CONTENT });

      const result = await loop.run(makeInput());

      expect(result.revisionAttempts).toBe(1);
      expect(result.action).toBe('accepted');
    });
  });

  // ── LLM error handling ────────────────────────────────────────

  describe('run() — LLM errors', () => {
    it('returns paused action when audit throws', async () => {
      mockProvider.generateJSON.mockRejectedValue(new Error('LLM 超时'));

      const result = await loop.run(makeInput());

      expect(result.action).toBe('paused');
      expect(result.warnings.some((w) => w.includes('LLM 超时'))).toBe(true);
    });

    it('returns paused action when revision LLM throws', async () => {
      mockProvider.generateJSON.mockResolvedValue(FAIL_AUDIT);
      mockProvider.generate.mockRejectedValue(new Error('修订服务不可用'));

      const result = await loop.run(makeInput());

      expect(result.action).toBe('paused');
      expect(result.warnings.some((w) => w.includes('修订服务不可用'))).toBe(true);
    });

    it('preserves original content when LLM error occurs', async () => {
      mockProvider.generateJSON.mockRejectedValue(new Error('网络错误'));

      const result = await loop.run(makeInput());

      expect(result.content).toBe(CONTENT);
      expect(result.originalContent).toBe(CONTENT);
    });
  });

  // ── maxRevisionRetries=0 ──────────────────────────────────────

  describe('run() — zero retries', () => {
    it('immediately triggers fallback when maxRevisionRetries=0 and audit fails', async () => {
      const zeroRetry = new RevisionLoop({
        provider: mockProvider,
        maxRevisionRetries: 0,
        fallbackAction: 'accept_with_warnings',
        minPassScore: 60,
      });

      mockProvider.generateJSON.mockResolvedValue(FAIL_AUDIT);

      const result = await zeroRetry.run(makeInput());

      expect(result.action).toBe('accepted_with_warnings');
      expect(result.revisionAttempts).toBe(0);
      expect(mockProvider.generate).not.toHaveBeenCalled();
    });
  });
});
