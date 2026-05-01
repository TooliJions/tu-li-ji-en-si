import { describe, it, expect, vi } from 'vitest';
import { DefaultAuditOrchestrator } from './audit-orchestrator';
import type { LLMProvider } from '../../llm/provider';
import type { RuntimeStateStore } from '../../state/runtime-store';
import { AUDIT_DIMENSIONS } from '../../quality/audit-dimensions';

function buildMockAuditReport(options?: { failDimensions?: number[] }): unknown {
  const failSet = new Set(options?.failDimensions ?? []);
  const failedDimensions = AUDIT_DIMENSIONS.filter((d) => failSet.has(d.id));
  const overallStatus = failedDimensions.some((d) => d.tier === 'blocker')
    ? 'fail'
    : failedDimensions.some((d) => d.tier === 'warning')
      ? 'warning'
      : 'pass';
  return {
    overallStatus,
    dimensions: AUDIT_DIMENSIONS.map((d) => ({
      dimensionId: d.id,
      passed: !failSet.has(d.id),
      score: failSet.has(d.id) ? 0.3 : 0.95,
      feedback: failSet.has(d.id) ? '审计发现问题' : '',
    })),
    summary: failedDimensions.length > 0 ? '存在问题' : '通过',
  };
}

describe('DefaultAuditOrchestrator', () => {
  function createOrchestrator(overrides?: {
    provider?: Partial<LLMProvider>;
    maxRevisionRetries?: number;
  }) {
    const mockProvider: LLMProvider = {
      generate: vi.fn(),
      generateJSON: vi.fn(),
      generateJSONWithMeta: vi.fn(),
      generateStream: vi.fn(),
      config: { model: 'test', apiKey: 'test' },
      ...overrides?.provider,
    } as unknown as LLMProvider;

    const mockStateStore: RuntimeStateStore = {
      loadManifest: vi.fn(() => ({
        bookId: 'test',
        versionToken: 1,
        characters: [{ name: '主角', role: ' protagonist', traits: ['勇敢'], arc: '' }],
        hooks: [{ id: 'h1', status: 'open', priority: 'major', description: '伏笔1' }],
        worldRules: [{ id: 'r1', category: '设定', rule: '规则1' }],
      })),
    } as unknown as RuntimeStateStore;

    return new DefaultAuditOrchestrator({
      provider: mockProvider,
      stateStore: mockStateStore,
      maxRevisionRetries: overrides?.maxRevisionRetries ?? 2,
      fallbackAction: 'accept_with_warnings',
    });
  }

  describe('auditDraft', () => {
    it('happy path: 返回审计结果', async () => {
      const orchestrator = createOrchestrator({
        provider: {
          generateJSON: vi.fn().mockResolvedValue(buildMockAuditReport()),
          generate: vi
            .fn()
            .mockResolvedValue({
              text: '0.1',
              usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
            }),
        },
      });

      const result = await orchestrator.auditDraft({
        bookId: 'test',
        chapterNumber: 1,
        content: '章节内容',
        genre: 'xianxia',
      });

      expect(result.success).toBe(true);
      expect(result.overallScore).toBeGreaterThan(0);
      expect(result.overallStatus).toBeDefined();
    });

    it('审计内部异常降级为默认评分', async () => {
      const orchestrator = createOrchestrator({
        provider: {
          generateJSON: vi.fn().mockRejectedValue(new Error('网络错误')),
          generate: vi.fn().mockRejectedValue(new Error('网络错误')),
        },
      });

      const result = await orchestrator.auditDraft({
        bookId: 'test',
        chapterNumber: 1,
        content: '章节内容',
        genre: 'xianxia',
      });

      // 内部有 try-catch，降级为默认评分而非抛出
      expect(result.success).toBe(true);
      expect(result.overallScore).toBeGreaterThan(0);
    });
  });

  describe('reviseDraft', () => {
    it('修订返回结果结构正确', async () => {
      const orchestrator = createOrchestrator({
        provider: {
          generateJSON: vi.fn().mockResolvedValue({
            fixes: [{ description: '修复1', original: '原文', replacement: '替换' }],
            revisedContent: '修订后内容',
            summary: '修订总结',
          }),
        },
      });

      const result = await orchestrator.reviseDraft({
        bookId: 'test',
        chapterNumber: 1,
        content: '原文',
        genre: 'xianxia',
        auditIssues: [],
      });

      // RevisionLoop 内部逻辑决定 action，这里至少验证返回结构
      expect(result.bookId).toBe('test');
      expect(result.chapterNumber).toBe(1);
      expect(result.status).toBe('final');
    });

    it('修订异常返回错误', async () => {
      const orchestrator = createOrchestrator({
        provider: {
          generateJSON: vi.fn().mockRejectedValue(new Error('模型错误')),
        },
      });

      const result = await orchestrator.reviseDraft({
        bookId: 'test',
        chapterNumber: 1,
        content: '原文',
        genre: 'xianxia',
        auditIssues: [],
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
