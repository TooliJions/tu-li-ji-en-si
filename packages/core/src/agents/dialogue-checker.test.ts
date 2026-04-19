import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DialogueChecker,
  type DialogueInput,
  type DialogueOutput,
  type DialogueIssue,
} from './dialogue-checker';
import type { LLMProvider, LLMRequest } from '../llm/provider';

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

const FRICTIONLESS_DIALOGUE = `"你觉得我们应该去东边吗？"林风问道。
"是的，我也觉得东边更好。"苏然回答。
"那我们就这样决定了。"
"好的，我完全同意。"
"太好了，我们出发吧。"
"好，出发。"`;

const DECLARATIVE_DIALOGUE = `"这座山叫做青云山，高达三千丈。"林风说。
"青云山的历史可以追溯到一千年前。"苏然补充道。
"对，当年天剑宗在此建立了第一座修炼场。"
"天剑宗的创始人名叫剑圣李元，修为达到化神境。"
"后来天剑宗经历了七次大战。"`;

const VALID_CONFLICT_DIALOGUE = `"你没有资格进入内门！"长老厉声道。
"凭什么？我的成绩明明达标了！"林风握紧了拳头。
"规矩是我定的，你有异议就滚出青云门。"
"那我倒要看看，这门规究竟护的是什么人！"林风猛地转身。
"你敢！"`;

// ── Tests ──────────────────────────────────────────────────────────

describe('DialogueChecker', () => {
  let mockProvider: ReturnType<typeof createMockProvider>;
  let checker: DialogueChecker;

  beforeEach(() => {
    mockProvider = createMockProvider();
    checker = new DialogueChecker(mockProvider);
  });

  // ── Properties ────────────────────────────────────────────────

  describe('abstract properties', () => {
    it('has correct agent name', () => {
      expect(checker.name).toBe('DialogueChecker');
    });

    it('uses moderate temperature for creative analysis', () => {
      expect(checker.temperature).toBeGreaterThanOrEqual(0.1);
      expect(checker.temperature).toBeLessThanOrEqual(0.5);
    });
  });

  // ── Input validation ──────────────────────────────────────────

  describe('execute() — input validation', () => {
    it('returns error when promptContext is missing', async () => {
      const result = await checker.execute({});
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('returns error when input is missing', async () => {
      const result = await checker.execute({ promptContext: {} });
      expect(result.success).toBe(false);
    });

    it('returns error when chapterContent is empty', async () => {
      const result = await checker.execute({
        promptContext: {
          input: { chapterContent: '', chapterNumber: 1, characters: ['林风', '苏然'] },
        },
      });
      expect(result.success).toBe(false);
    });

    it('returns error when characters array is empty', async () => {
      const result = await checker.execute({
        promptContext: {
          input: { chapterContent: FRICTIONLESS_DIALOGUE, chapterNumber: 1, characters: [] },
        },
      });
      expect(result.success).toBe(false);
    });
  });

  // ── Happy path — no issues ─────────────────────────────────────

  describe('execute() — clean dialogue', () => {
    const validInput: DialogueInput = {
      chapterContent: VALID_CONFLICT_DIALOGUE,
      chapterNumber: 5,
      characters: ['林风', '长老'],
    };

    it('returns success with clean report for high-quality dialogue', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [],
        frictionScore: 85,
        conflictDepth: 'strong',
        overallQuality: 'good',
        summary: '对话交锋激烈，阻力充足',
      } satisfies DialogueOutput);

      const result = await checker.execute({ promptContext: { input: validInput } });

      expect(result.success).toBe(true);
      const data = result.data as DialogueOutput;
      expect(data.issues).toHaveLength(0);
      expect(data.overallQuality).toBe('good');
    });

    it('calls generateJSON with prompt containing chapter content', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [],
        frictionScore: 80,
        conflictDepth: 'strong',
        overallQuality: 'good',
        summary: '对话质量良好',
      });

      await checker.execute({ promptContext: { input: validInput } });

      expect(mockProvider.generateJSON).toHaveBeenCalledTimes(1);
      const [req] = mockProvider.generateJSON.mock.calls[0] as [LLMRequest, ...unknown[]];
      expect(req.prompt).toContain('林风');
      expect(req.prompt).toContain('长老');
    });

    it('prompt includes character list for multi-character analysis', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [],
        frictionScore: 78,
        conflictDepth: 'moderate',
        overallQuality: 'good',
        summary: '对话质量良好',
      });

      const multiCharInput: DialogueInput = {
        chapterContent: VALID_CONFLICT_DIALOGUE,
        chapterNumber: 3,
        characters: ['林风', '长老', '苏然'],
      };

      await checker.execute({ promptContext: { input: multiCharInput } });

      const [req] = mockProvider.generateJSON.mock.calls[0] as [LLMRequest, ...unknown[]];
      expect(req.prompt).toContain('苏然');
    });
  });

  // ── Detecting no-friction dialogue ───────────────────────────

  describe('execute() — no-friction detection', () => {
    const input: DialogueInput = {
      chapterContent: FRICTIONLESS_DIALOGUE,
      chapterNumber: 2,
      characters: ['林风', '苏然'],
    };

    it('detects no-friction dialogue and returns issues', async () => {
      const mockIssues: DialogueIssue[] = [
        {
          type: 'no-friction',
          severity: 'warning',
          description: '对话中角色过度配合，缺乏真实的意见分歧与阻力',
          location: { lineStart: 1, lineEnd: 6 },
          suggestion: '让至少一方角色提出异议或障碍，增加交锋张力',
        },
      ];

      mockProvider.generateJSON.mockResolvedValue({
        issues: mockIssues,
        frictionScore: 20,
        conflictDepth: 'none',
        overallQuality: 'poor',
        summary: '对话缺乏阻力，角色高度配合',
      } satisfies DialogueOutput);

      const result = await checker.execute({ promptContext: { input } });

      expect(result.success).toBe(true);
      const data = result.data as DialogueOutput;
      expect(data.issues.some((i) => i.type === 'no-friction')).toBe(true);
      expect(data.frictionScore).toBeLessThan(50);
      expect(data.overallQuality).toBe('poor');
    });
  });

  // ── Detecting declarative exchange ────────────────────────────

  describe('execute() — declarative-exchange detection', () => {
    const input: DialogueInput = {
      chapterContent: DECLARATIVE_DIALOGUE,
      chapterNumber: 3,
      characters: ['林风', '苏然'],
    };

    it('detects purely declarative exchange', async () => {
      const mockIssues: DialogueIssue[] = [
        {
          type: 'declarative-exchange',
          severity: 'warning',
          description: '角色仅在相互传递世界观信息，无真实交锋',
          location: { lineStart: 1, lineEnd: 5 },
          suggestion: '将信息传递嵌入冲突或情感反应中，避免纯陈述式对话',
        },
      ];

      mockProvider.generateJSON.mockResolvedValue({
        issues: mockIssues,
        frictionScore: 15,
        conflictDepth: 'none',
        overallQuality: 'poor',
        summary: '对话为纯陈述式信息传递',
      } satisfies DialogueOutput);

      const result = await checker.execute({ promptContext: { input } });

      expect(result.success).toBe(true);
      const data = result.data as DialogueOutput;
      expect(data.issues.some((i) => i.type === 'declarative-exchange')).toBe(true);
    });
  });

  // ── Multiple issue types ───────────────────────────────────────

  describe('execute() — multiple issues', () => {
    it('can return multiple issue types simultaneously', async () => {
      const multiIssues: DialogueIssue[] = [
        {
          type: 'no-friction',
          severity: 'warning',
          description: '缺乏阻力',
          location: { lineStart: 1, lineEnd: 3 },
          suggestion: '增加阻力',
        },
        {
          type: 'weak-response',
          severity: 'suggestion',
          description: '角色回应软弱',
          location: { lineStart: 4, lineEnd: 6 },
          suggestion: '加强角色立场',
        },
      ];

      mockProvider.generateJSON.mockResolvedValue({
        issues: multiIssues,
        frictionScore: 25,
        conflictDepth: 'weak',
        overallQuality: 'poor',
        summary: '发现2项对话质量问题',
      } satisfies DialogueOutput);

      const input: DialogueInput = {
        chapterContent: FRICTIONLESS_DIALOGUE,
        chapterNumber: 4,
        characters: ['林风', '苏然'],
      };

      const result = await checker.execute({ promptContext: { input } });

      expect(result.success).toBe(true);
      const data = result.data as DialogueOutput;
      expect(data.issues).toHaveLength(2);
    });
  });

  // ── Output shape ──────────────────────────────────────────────

  describe('execute() — output shape', () => {
    it('output contains all required fields', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [],
        frictionScore: 70,
        conflictDepth: 'moderate',
        overallQuality: 'acceptable',
        summary: '对话质量一般',
      } satisfies DialogueOutput);

      const result = await checker.execute({
        promptContext: {
          input: {
            chapterContent: VALID_CONFLICT_DIALOGUE,
            chapterNumber: 2,
            characters: ['林风', '长老'],
          } satisfies DialogueInput,
        },
      });

      expect(result.success).toBe(true);
      const data = result.data as DialogueOutput;
      expect(typeof data.frictionScore).toBe('number');
      expect(data.frictionScore).toBeGreaterThanOrEqual(0);
      expect(data.frictionScore).toBeLessThanOrEqual(100);
      expect(['none', 'weak', 'moderate', 'strong']).toContain(data.conflictDepth);
      expect(['poor', 'acceptable', 'good', 'excellent']).toContain(data.overallQuality);
      expect(typeof data.summary).toBe('string');
      expect(Array.isArray(data.issues)).toBe(true);
    });

    it('each issue has required fields', async () => {
      const issue: DialogueIssue = {
        type: 'no-friction',
        severity: 'warning',
        description: '缺乏阻力',
        location: { lineStart: 1, lineEnd: 3 },
        suggestion: '增加阻力',
      };

      mockProvider.generateJSON.mockResolvedValue({
        issues: [issue],
        frictionScore: 20,
        conflictDepth: 'none',
        overallQuality: 'poor',
        summary: '问题',
      });

      const result = await checker.execute({
        promptContext: {
          input: {
            chapterContent: FRICTIONLESS_DIALOGUE,
            chapterNumber: 1,
            characters: ['林风', '苏然'],
          },
        },
      });

      const data = result.data as DialogueOutput;
      const i = data.issues[0];
      expect([
        'no-friction',
        'declarative-exchange',
        'monologue-disguised',
        'weak-response',
      ]).toContain(i.type);
      expect(['critical', 'warning', 'suggestion']).toContain(i.severity);
      expect(typeof i.description).toBe('string');
      expect(typeof i.suggestion).toBe('string');
      expect(typeof i.location.lineStart).toBe('number');
      expect(typeof i.location.lineEnd).toBe('number');
    });
  });

  // ── LLM error handling ────────────────────────────────────────

  describe('execute() — error handling', () => {
    it('returns failure when LLM throws', async () => {
      mockProvider.generateJSON.mockRejectedValue(new Error('网络超时'));

      const result = await checker.execute({
        promptContext: {
          input: {
            chapterContent: VALID_CONFLICT_DIALOGUE,
            chapterNumber: 1,
            characters: ['林风', '长老'],
          },
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('网络超时');
    });

    it('returns failure when LLM returns malformed data', async () => {
      mockProvider.generateJSON.mockResolvedValue(null);

      const result = await checker.execute({
        promptContext: {
          input: {
            chapterContent: VALID_CONFLICT_DIALOGUE,
            chapterNumber: 1,
            characters: ['林风', '长老'],
          },
        },
      });

      expect(result.success).toBe(false);
    });
  });

  // ── genre context ─────────────────────────────────────────────

  describe('genre-aware analysis', () => {
    it('includes genre in prompt when provided', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [],
        frictionScore: 80,
        conflictDepth: 'strong',
        overallQuality: 'good',
        summary: '对话质量良好',
      });

      await checker.execute({
        promptContext: {
          input: {
            chapterContent: VALID_CONFLICT_DIALOGUE,
            chapterNumber: 3,
            characters: ['林风', '长老'],
            genre: 'xianxia',
          },
        },
      });

      const [req] = mockProvider.generateJSON.mock.calls[0] as [LLMRequest, ...unknown[]];
      expect(req.prompt).toContain('xianxia');
    });
  });
});
