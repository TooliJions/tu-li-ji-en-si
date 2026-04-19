import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  EntityAuditor,
  type AuditInput,
  type AuditOutput,
  type EntityIssue,
} from './entity-auditor';
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

describe('EntityAuditor', () => {
  let mockProvider: ReturnType<typeof createMockProvider>;
  let auditor: EntityAuditor;

  beforeEach(() => {
    mockProvider = createMockProvider();
    auditor = new EntityAuditor(mockProvider);
  });

  // ── Properties ────────────────────────────────────────────

  describe('abstract properties', () => {
    it('has correct agent name', () => {
      expect(auditor.name).toBe('EntityAuditor');
    });

    it('uses analytical temperature (0.1 for strict entity auditing)', () => {
      expect(auditor.temperature).toBe(0.1);
    });
  });

  // ── execute() — happy path ────────────────────────────────

  describe('execute()', () => {
    const validInput: AuditInput = {
      chapterContent: '林风走进青云门大殿，见到了李长老和师姐苏瑶。他从储物袋中取出了灵剑。',
      chapterNumber: 3,
      genre: 'xianxia',
    };

    it('returns clean audit when all entities are registered', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [],
        detectedEntities: [
          { name: '林风', type: 'character', status: 'registered' },
          { name: '青云门', type: 'organization', status: 'registered' },
          { name: '李长老', type: 'character', status: 'registered' },
        ],
        overallStatus: 'pass',
        summary: '所有实体均已注册',
      });

      const result = await auditor.execute({
        promptContext: { input: validInput },
      });

      expect(result.success).toBe(true);
      const data = result.data as AuditOutput;
      expect(data.issues).toHaveLength(0);
      expect(data.overallStatus).toBe('pass');
    });

    it('detects unregistered entities', async () => {
      const mockIssues: EntityIssue[] = [
        {
          entity: '神秘玉佩',
          type: 'item',
          severity: 'warning',
          description: '文中出现未注册实体「神秘玉佩」',
          suggestion: '在实体注册表中添加该物品',
        },
      ];

      mockProvider.generateJSON.mockResolvedValue({
        issues: mockIssues,
        detectedEntities: [
          { name: '林风', type: 'character', status: 'registered' },
          { name: '神秘玉佩', type: 'item', status: 'unregistered' },
        ],
        overallStatus: 'warning',
        summary: '发现1个未注册实体',
      });

      const result = await auditor.execute({
        promptContext: { input: validInput },
      });

      expect(result.success).toBe(true);
      const data = result.data as AuditOutput;
      expect(data.issues).toHaveLength(1);
      expect(data.overallStatus).toBe('warning');
    });

    it('detects ghost entities (removed but still referenced)', async () => {
      const mockIssues: EntityIssue[] = [
        {
          entity: '赵师兄',
          type: 'character',
          severity: 'critical',
          description: '文中引用了已删除的角色「赵师兄」',
          suggestion: '确认是否为笔误或角色复活',
        },
      ];

      mockProvider.generateJSON.mockResolvedValue({
        issues: mockIssues,
        detectedEntities: [{ name: '赵师兄', type: 'character', status: 'ghost' }],
        overallStatus: 'fail',
        summary: '发现1个幽灵实体',
      });

      const result = await auditor.execute({
        promptContext: { input: validInput },
      });

      const data = result.data as AuditOutput;
      expect(data.issues.some((i) => i.severity === 'critical')).toBe(true);
    });

    it('returns detected entities list in output', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [],
        detectedEntities: [
          { name: '林风', type: 'character', status: 'registered' },
          { name: '青云门', type: 'organization', status: 'registered' },
        ],
        overallStatus: 'pass',
        summary: '正常',
      });

      const result = await auditor.execute({
        promptContext: { input: validInput },
      });

      const data = result.data as AuditOutput;
      expect(data.detectedEntities).toHaveLength(2);
    });
  });

  // ── execute() — with entity registry ──────────────────────

  describe('execute() — with entity registry', () => {
    it('compares against registered characters', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [],
        detectedEntities: [],
        overallStatus: 'pass',
        summary: '正常',
      });

      await auditor.execute({
        promptContext: {
          input: {
            ...validInput(),
            registeredCharacters: ['林风', '李长老', '苏瑶'],
          },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('林风');
      expect(callArgs.prompt).toContain('李长老');
    });

    it('compares against registered locations', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [],
        detectedEntities: [],
        overallStatus: 'pass',
        summary: '正常',
      });

      await auditor.execute({
        promptContext: {
          input: {
            ...validInput(),
            registeredLocations: ['青云门', '青云大殿', '后山'],
          },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('青云门');
    });

    it('compares against registered items', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [],
        detectedEntities: [],
        overallStatus: 'pass',
        summary: '正常',
      });

      await auditor.execute({
        promptContext: {
          input: {
            ...validInput(),
            registeredItems: ['灵剑', '储物袋', '神秘玉佩'],
          },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('灵剑');
    });

    it('compares against registered organizations', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [],
        detectedEntities: [],
        overallStatus: 'pass',
        summary: '正常',
      });

      await auditor.execute({
        promptContext: {
          input: {
            ...validInput(),
            registeredOrganizations: ['青云门', '天剑宗', '魔道盟'],
          },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('青云门');
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
          input: { chapterNumber: 1, genre: 'xianxia' } as AuditInput,
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
          input: { chapterContent: 'some content', chapterNumber: 1 } as AuditInput,
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('题材');
    });
  });

  // ── execute() — genre context ─────────────────────────────

  describe('execute() — genre context', () => {
    it('includes genre-specific entity types for xianxia', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [],
        detectedEntities: [],
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

    it('includes genre-specific entity types for sci-fi', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [],
        detectedEntities: [],
        overallStatus: 'pass',
        summary: '正常',
      });

      await auditor.execute({
        promptContext: {
          input: { chapterContent: '内容', chapterNumber: 1, genre: 'sci-fi' },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('科幻');
    });

    it('handles unknown genre gracefully', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        issues: [],
        detectedEntities: [],
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

function validInput(): AuditInput {
  return {
    chapterContent: '林风走进青云门大殿，见到了李长老和师姐苏瑶。他从储物袋中取出了灵剑。',
    chapterNumber: 3,
    genre: 'xianxia',
  };
}
