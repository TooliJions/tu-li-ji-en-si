import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  FactChecker,
  type FactCheckInput,
  type FactCheckOutput,
  type FactConflict,
} from './fact-checker';
import type { LLMProvider } from '../llm/provider';

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

describe('FactChecker', () => {
  let mockProvider: ReturnType<typeof createMockProvider>;
  let checker: FactChecker;

  beforeEach(() => {
    mockProvider = createMockProvider();
    checker = new FactChecker(mockProvider);
  });

  // ── Properties ────────────────────────────────────────────

  describe('abstract properties', () => {
    it('has correct agent name', () => {
      expect(checker.name).toBe('FactChecker');
    });

    it('uses analytical temperature (0.1 for strict fact checking)', () => {
      expect(checker.temperature).toBe(0.1);
    });
  });

  // ── execute() — happy path ────────────────────────────────

  describe('execute()', () => {
    const validInput: FactCheckInput = {
      chapterContent:
        '林风是青云门外门弟子，他的师父是李长老。修炼体系分为炼气、筑基、金丹三个阶段。',
      chapterNumber: 3,
      genre: 'xianxia',
    };

    it('returns fact check results with no conflicts when content matches facts', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        conflicts: [],
        verifiedFacts: ['修炼体系正确', '师门关系正确'],
        overallStatus: 'pass',
        summary: '未发现事实冲突',
      });

      const result = await checker.execute({
        promptContext: { input: validInput },
      });

      expect(result.success).toBe(true);
      const data = result.data as FactCheckOutput;
      expect(data.conflicts).toHaveLength(0);
      expect(data.overallStatus).toBe('pass');
    });

    it('returns conflicts when content contradicts established facts', async () => {
      const mockConflicts: FactConflict[] = [
        {
          fact: '青云门是正道第一大宗',
          contradiction: '文中称青云门为魔道宗门',
          severity: 'critical',
          suggestion: '青云门应为正道宗门',
        },
      ];

      mockProvider.generateJSON.mockResolvedValue({
        conflicts: mockConflicts,
        verifiedFacts: [],
        overallStatus: 'fail',
        summary: '发现1处事实冲突',
      });

      const result = await checker.execute({
        promptContext: { input: validInput },
      });

      expect(result.success).toBe(true);
      const data = result.data as FactCheckOutput;
      expect(data.conflicts).toHaveLength(1);
      expect(data.overallStatus).toBe('fail');
    });

    it('includes verified facts in output', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        conflicts: [],
        verifiedFacts: ['林风是外门弟子', '李长老是师父'],
        overallStatus: 'pass',
        summary: '事实一致',
      });

      const result = await checker.execute({
        promptContext: { input: validInput },
      });

      const data = result.data as FactCheckOutput;
      expect(data.verifiedFacts).toHaveLength(2);
    });
  });

  // ── execute() — with existing facts ───────────────────────

  describe('execute() — with existing facts', () => {
    it('checks against established facts', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        conflicts: [],
        verifiedFacts: ['事实1'],
        overallStatus: 'pass',
        summary: '一致',
      });

      await checker.execute({
        promptContext: {
          input: {
            ...validInput(),
            establishedFacts: [
              '青云门是正道第一大宗',
              '修炼分为炼气、筑基、金丹三个阶段',
              '林风是外门弟子',
            ],
          },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('青云门是正道第一大宗');
    });

    it('checks against character profiles', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        conflicts: [],
        verifiedFacts: [],
        overallStatus: 'pass',
        summary: '一致',
      });

      await checker.execute({
        promptContext: {
          input: {
            ...validInput(),
            characterProfiles: [
              { name: '林风', role: 'protagonist', traits: ['冷静', '坚韧'] },
              { name: '李长老', role: 'mentor', traits: ['严厉', '神秘'] },
            ],
          },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('林风');
      expect(callArgs.prompt).toContain('冷静');
    });

    it('checks against world rules', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        conflicts: [],
        verifiedFacts: [],
        overallStatus: 'pass',
        summary: '一致',
      });

      await checker.execute({
        promptContext: {
          input: {
            ...validInput(),
            worldRules: ['修炼分为炼气、筑基、金丹三个阶段', '筑基期寿元可达两百年'],
          },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('炼气、筑基、金丹');
    });

    it('checks against open hooks for consistency', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        conflicts: [],
        verifiedFacts: [],
        overallStatus: 'pass',
        summary: '一致',
      });

      await checker.execute({
        promptContext: {
          input: {
            ...validInput(),
            openHooks: ['神秘玉佩的来历尚未揭示'],
          },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('神秘玉佩');
    });
  });

  // ── execute() — conflict severity ─────────────────────────

  describe('execute() — conflict severity', () => {
    it('identifies critical conflicts for world rule violations', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        conflicts: [
          {
            fact: '修炼分三个阶段',
            contradiction: '文中出现元婴期',
            severity: 'critical',
            suggestion: '删除或修改元婴期提及',
          },
        ],
        verifiedFacts: [],
        overallStatus: 'fail',
        summary: '发现世界设定冲突',
      });

      const result = await checker.execute({
        promptContext: { input: validInput() },
      });

      const data = result.data as FactCheckOutput;
      expect(data.conflicts.some((c) => c.severity === 'critical')).toBe(true);
    });

    it('identifies warning-level conflicts for minor inconsistencies', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        conflicts: [
          {
            fact: '林风性格冷静',
            contradiction: '文中林风表现出急躁',
            severity: 'warning',
            suggestion: '调整行为描写',
          },
        ],
        verifiedFacts: [],
        overallStatus: 'warning',
        summary: '发现角色行为不一致',
      });

      const result = await checker.execute({
        promptContext: { input: validInput() },
      });

      const data = result.data as FactCheckOutput;
      expect(data.overallStatus).toBe('warning');
    });
  });

  // ── execute() — validation ────────────────────────────────

  describe('execute() — validation', () => {
    it('returns error when input is missing', async () => {
      const result = await checker.execute({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('输入');
    });

    it('returns error when chapter content is missing', async () => {
      const result = await checker.execute({
        promptContext: {
          input: { chapterNumber: 1, genre: 'xianxia' } as FactCheckInput,
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('内容');
    });

    it('returns error when chapter content is empty', async () => {
      const result = await checker.execute({
        promptContext: {
          input: { chapterContent: '', chapterNumber: 1, genre: 'xianxia' },
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('内容');
    });

    it('returns error when genre is missing', async () => {
      const result = await checker.execute({
        promptContext: {
          input: { chapterContent: 'some content', chapterNumber: 1 } as FactCheckInput,
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('题材');
    });
  });

  // ── execute() — genre context ─────────────────────────────

  describe('execute() — genre context', () => {
    it('includes genre-specific fact checking for xianxia', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        conflicts: [],
        verifiedFacts: [],
        overallStatus: 'pass',
        summary: '一致',
      });

      await checker.execute({
        promptContext: {
          input: { chapterContent: '内容', chapterNumber: 1, genre: 'xianxia' },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('仙侠');
    });

    it('includes genre-specific fact checking for sci-fi', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        conflicts: [],
        verifiedFacts: [],
        overallStatus: 'pass',
        summary: '一致',
      });

      await checker.execute({
        promptContext: {
          input: { chapterContent: '内容', chapterNumber: 1, genre: 'sci-fi' },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('科幻');
    });

    it('handles unknown genre gracefully', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        conflicts: [],
        verifiedFacts: [],
        overallStatus: 'pass',
        summary: '一致',
      });

      const result = await checker.execute({
        promptContext: {
          input: { chapterContent: '内容', chapterNumber: 1, genre: 'litrpg' },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('litrpg');
      expect(result.success).toBe(true);
    });
  });

  // ── execute() — LLM errors ────────────────────────────────

  describe('execute() — LLM errors', () => {
    it('returns error when LLM call fails', async () => {
      mockProvider.generateJSON.mockRejectedValue(new Error('API timeout'));

      const result = await checker.execute({
        promptContext: {
          input: validInput(),
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('API timeout');
    });
  });
});

function validInput(): FactCheckInput {
  return {
    chapterContent:
      '林风是青云门外门弟子，他的师父是李长老。修炼体系分为炼气、筑基、金丹三个阶段。',
    chapterNumber: 3,
    genre: 'xianxia',
  };
}
