import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  HookAuditor,
  type HookAuditInput,
  type HookAuditOutput,
} from './hook-auditor';
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

describe('HookAuditor', () => {
  let mockProvider: ReturnType<typeof createMockProvider>;
  let auditor: HookAuditor;

  beforeEach(() => {
    mockProvider = createMockProvider();
    auditor = new HookAuditor(mockProvider);
  });

  // ── Properties ────────────────────────────────────────────

  describe('abstract properties', () => {
    it('has correct agent name', () => {
      expect(auditor.name).toBe('HookAuditor');
    });

    it('uses analytical temperature (0.2 for hook auditing)', () => {
      expect(auditor.temperature).toBe(0.2);
    });
  });

  // ── execute() — happy path ────────────────────────────────

  describe('execute()', () => {
    const validInput: HookAuditInput = {
      chapterContent:
        '林风在储物袋中发现了一块神秘的玉佩，上面刻着古老的符文。他不知道这块玉佩的来历。',
      chapterNumber: 3,
      genre: 'xianxia',
    };

    it('returns clean audit when hooks are handled well', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [],
        hookSummary: {
          planted: ['神秘玉佩的来历'],
          progressed: [],
          resolved: [],
          abandoned: [],
        },
        overallStatus: 'pass',
        summary: '伏笔处理良好',
      });

      const result = await auditor.execute({
        promptContext: { input: validInput },
      });

      expect(result.success).toBe(true);
      const data = result.data as HookAuditOutput;
      expect(data.issues).toHaveLength(0);
      expect(data.overallStatus).toBe('pass');
    });

    it('detects forgotten hooks that should be addressed', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [
          {
            hookDescription: '师父的神秘过去',
            severity: 'warning',
            category: 'forgotten',
            description: '该伏笔已超过5章未提及',
            chaptersSinceMentioned: 5,
            suggestion: '考虑在本章或下一章中有所提及',
          },
        ],
        hookSummary: {
          planted: [],
          progressed: [],
          resolved: [],
          abandoned: [],
        },
        overallStatus: 'warning',
        summary: '发现1个被遗忘的伏笔',
      });

      const result = await auditor.execute({
        promptContext: { input: validInput },
      });

      expect(result.success).toBe(true);
      const data = result.data as HookAuditOutput;
      expect(data.issues.some((i) => i.category === 'forgotten')).toBe(true);
    });

    it('detects hook inconsistencies', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [
          {
            hookDescription: '青云门是正道宗门',
            severity: 'critical',
            category: 'inconsistent',
            description: '文中描述与伏笔设定矛盾',
            chaptersSinceMentioned: 0,
            suggestion: '统一设定',
          },
        ],
        hookSummary: {
          planted: [],
          progressed: [],
          resolved: [],
          abandoned: [],
        },
        overallStatus: 'fail',
        summary: '发现伏笔前后矛盾',
      });

      const result = await auditor.execute({
        promptContext: { input: validInput },
      });

      const data = result.data as HookAuditOutput;
      expect(data.issues.some((i) => i.category === 'inconsistent')).toBe(true);
    });

    it('includes hook summary in output', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [],
        hookSummary: {
          planted: ['神秘玉佩'],
          progressed: ['林风身世'],
          resolved: ['入门测试'],
          abandoned: [],
        },
        overallStatus: 'pass',
        summary: '伏笔进展正常',
      });

      const result = await auditor.execute({
        promptContext: { input: validInput },
      });

      const data = result.data as HookAuditOutput;
      expect(data.hookSummary.planted).toContain('神秘玉佩');
      expect(data.hookSummary.progressed).toContain('林风身世');
      expect(data.hookSummary.resolved).toContain('入门测试');
    });
  });

  // ── execute() — with open hooks ───────────────────────────

  describe('execute() — with open hooks', () => {
    it('checks against known open hooks', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [],
        hookSummary: {
          planted: [],
          progressed: ['神秘玉佩'],
          resolved: [],
          abandoned: [],
        },
        overallStatus: 'pass',
        summary: '正常',
      });

      await auditor.execute({
        promptContext: {
          input: {
            ...validInput(),
            openHooks: [
              {
                description: '神秘玉佩的来历',
                type: 'narrative',
                priority: 'critical',
                plantedChapter: 1,
              },
            ],
          },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('神秘玉佩');
    });

    it('detects hooks that are past their expected resolution', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [
          {
            hookDescription: '入门试炼',
            severity: 'warning',
            category: 'overdue',
            description: '伏笔已超过预期回收窗口',
            chaptersSinceMentioned: 10,
            suggestion: '尽快回收或调整预期窗口',
          },
        ],
        hookSummary: {
          planted: [],
          progressed: [],
          resolved: [],
          abandoned: [],
        },
        overallStatus: 'warning',
        summary: '发现超期未回收伏笔',
      });

      const result = await auditor.execute({
        promptContext: {
          input: {
            ...validInput(),
            openHooks: [
              {
                description: '入门试炼',
                type: 'plot',
                priority: 'major',
                plantedChapter: 1,
                expectedResolutionChapter: 5,
              },
            ],
          },
        },
      });

      const data = result.data as HookAuditOutput;
      expect(data.issues.some((i) => i.category === 'overdue')).toBe(true);
    });

    it('includes hook priority and type info in prompt', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [],
        hookSummary: { planted: [], progressed: [], resolved: [], abandoned: [] },
        overallStatus: 'pass',
        summary: '正常',
      });

      await auditor.execute({
        promptContext: {
          input: {
            ...validInput(),
            openHooks: [
              {
                description: '宗门大比的阴谋',
                type: 'plot',
                priority: 'critical',
                plantedChapter: 2,
              },
            ],
          },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('critical');
      expect(callArgs.prompt).toContain('宗门大比');
    });
  });

  // ── execute() — with previous hook status ─────────────────

  describe('execute() — with previous hook status', () => {
    it('includes previously resolved hooks to avoid re-resolving', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [],
        hookSummary: { planted: [], progressed: [], resolved: [], abandoned: [] },
        overallStatus: 'pass',
        summary: '正常',
      });

      await auditor.execute({
        promptContext: {
          input: {
            ...validInput(),
            previouslyResolvedHooks: ['入门试炼已完成', '玉佩来源已揭示'],
          },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('入门试炼已完成');
    });
  });

  // ── execute() — issue categories ──────────────────────────

  describe('execute() — issue categories', () => {
    it('detects premature resolution', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [
          {
            hookDescription: '大boss身份',
            severity: 'warning',
            category: 'premature',
            description: '伏笔回收过早',
            chaptersSinceMentioned: 0,
            suggestion: '延后回收',
          },
        ],
        hookSummary: { planted: [], progressed: [], resolved: ['大boss身份'], abandoned: [] },
        overallStatus: 'warning',
        summary: '伏笔回收过早',
      });

      const result = await auditor.execute({
        promptContext: { input: validInput() },
      });

      const data = result.data as HookAuditOutput;
      expect(data.issues.some((i) => i.category === 'premature')).toBe(true);
    });

    it('detects new hooks planted in chapter', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [],
        hookSummary: {
          planted: ['神秘老人的身份'],
          progressed: [],
          resolved: [],
          abandoned: [],
        },
        overallStatus: 'pass',
        summary: '本章埋设了新伏笔',
      });

      const result = await auditor.execute({
        promptContext: { input: validInput() },
      });

      const data = result.data as HookAuditOutput;
      expect(data.hookSummary.planted).toContain('神秘老人的身份');
    });
  });

  // ── execute() — validation ────────────────────────────────

  describe('execute() — validation', () => {
    it('returns error when input is missing', async () => {
      const result = await auditor.execute({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('输入');
    });

    it('returns error when chapter content is missing', async () => {
      const result = await auditor.execute({
        promptContext: {
          input: { chapterNumber: 1, genre: 'xianxia' } as HookAuditInput,
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('内容');
    });

    it('returns error when chapter content is empty', async () => {
      const result = await auditor.execute({
        promptContext: {
          input: { chapterContent: '', chapterNumber: 1, genre: 'xianxia' },
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('内容');
    });

    it('returns error when genre is missing', async () => {
      const result = await auditor.execute({
        promptContext: {
          input: { chapterContent: 'content', chapterNumber: 1 } as HookAuditInput,
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('题材');
    });
  });

  // ── execute() — genre context ─────────────────────────────

  describe('execute() — genre context', () => {
    it('includes genre-specific hook criteria for xianxia', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [],
        hookSummary: { planted: [], progressed: [], resolved: [], abandoned: [] },
        overallStatus: 'pass',
        summary: '正常',
      });

      await auditor.execute({
        promptContext: {
          input: { chapterContent: '内容', chapterNumber: 1, genre: 'xianxia' },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('仙侠');
    });

    it('includes genre-specific hook criteria for horror', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [],
        hookSummary: { planted: [], progressed: [], resolved: [], abandoned: [] },
        overallStatus: 'pass',
        summary: '正常',
      });

      await auditor.execute({
        promptContext: {
          input: { chapterContent: '内容', chapterNumber: 1, genre: 'horror' },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('悬疑');
    });

    it('handles unknown genre gracefully', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [],
        hookSummary: { planted: [], progressed: [], resolved: [], abandoned: [] },
        overallStatus: 'pass',
        summary: '正常',
      });

      const result = await auditor.execute({
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

      const result = await auditor.execute({
        promptContext: {
          input: validInput(),
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('API timeout');
    });
  });
});

function validInput(): HookAuditInput {
  return {
    chapterContent:
      '林风在储物袋中发现了一块神秘的玉佩，上面刻着古老的符文。他不知道这块玉佩的来历。',
    chapterNumber: 3,
    genre: 'xianxia',
  };
}
