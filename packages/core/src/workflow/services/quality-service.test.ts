import { describe, it, expect } from 'vitest';
import { DefaultQualityService, type QualityServiceOptions } from './quality-service';
import type { CreateQualityGateResultInput } from '../contracts/quality';

function createService(opts?: QualityServiceOptions) {
  return new DefaultQualityService(opts);
}

function validInput(): CreateQualityGateResultInput {
  return {
    draftId: 'draft_001',
    scoreSummary: { overall: 0.85, dimensions: { continuity: 0.9, style: 0.8 } },
    blockerIssues: [],
    warningIssues: [],
    suggestionIssues: [],
    repairActions: [],
  };
}

describe('DefaultQualityService', () => {
  describe('createAudit', () => {
    it('从有效输入创建 AuditResult，无问题时自动判定为 pass', () => {
      const service = createService();
      const audit = service.createAudit(validInput());

      expect(audit.draftId).toBe('draft_001');
      expect(audit.scoreSummary.overall).toBe(0.85);
      expect(audit.finalDecision).toBe('pass');
      expect(audit.id).toMatch(/^audit_/);
      expect(audit.createdAt).toBe(audit.updatedAt);
    });

    it('存在 blocker 时自动判定为 fail', () => {
      const service = createService();
      const audit = service.createAudit({
        ...validInput(),
        blockerIssues: [
          {
            id: 'b1',
            description: '角色已死亡但再次出场',
            tier: 'blocker',
            category: '事实一致性',
            suggestion: '检查角色状态',
          },
        ],
      });

      expect(audit.finalDecision).toBe('fail');
      expect(audit.blockerIssues).toHaveLength(1);
    });

    it('存在 warning 但无 blocker 时判定为 warning', () => {
      const service = createService();
      const audit = service.createAudit({
        ...validInput(),
        warningIssues: [
          {
            id: 'w1',
            description: '节奏偏慢',
            tier: 'warning',
            category: '节奏',
            suggestion: '增加冲突密度',
          },
        ],
      });

      expect(audit.finalDecision).toBe('warning');
    });

    it('使用自定义 idGenerator 和 now', () => {
      const service = createService({
        idGenerator: () => 'custom_id',
        now: () => '2026-05-01T00:00:00.000Z',
      });
      const audit = service.createAudit(validInput());

      expect(audit.id).toBe('custom_id');
      expect(audit.createdAt).toBe('2026-05-01T00:00:00.000Z');
    });
  });

  describe('updateAudit', () => {
    it('更新字段并保留其余', () => {
      let tick = 0;
      const service = createService({
        now: () => `2026-05-01T00:00:0${++tick}.000Z`,
      });
      const audit = service.createAudit(validInput());
      const updated = service.updateAudit(audit, {
        scoreSummary: { overall: 0.9, dimensions: {} },
      });

      expect(updated.scoreSummary.overall).toBe(0.9);
      expect(updated.draftId).toBe(audit.draftId);
      expect(updated.updatedAt).not.toBe(audit.updatedAt);
    });

    it('更新 blockerIssues 时自动重新计算 decision', () => {
      const service = createService();
      const audit = service.createAudit(validInput());
      expect(audit.finalDecision).toBe('pass');

      const updated = service.updateAudit(audit, {
        blockerIssues: [
          {
            id: 'b1',
            description: '矛盾',
            tier: 'blocker',
            category: '一致性',
            suggestion: '修正',
          },
        ],
      });

      expect(updated.finalDecision).toBe('fail');
    });

    it('清空 blocker 后自动恢复为 warning（若仍有 warning）', () => {
      const service = createService();
      const audit = service.createAudit({
        ...validInput(),
        blockerIssues: [
          {
            id: 'b1',
            description: '矛盾',
            tier: 'blocker',
            category: '一致性',
            suggestion: '修正',
          },
        ],
        warningIssues: [
          {
            id: 'w1',
            description: '节奏慢',
            tier: 'warning',
            category: '节奏',
            suggestion: '加快',
          },
        ],
      });
      expect(audit.finalDecision).toBe('fail');

      const updated = service.updateAudit(audit, { blockerIssues: [] });
      expect(updated.finalDecision).toBe('warning');
    });
  });

  describe('setFinalDecision', () => {
    it('显式设置 decision', () => {
      const service = createService();
      const audit = service.createAudit(validInput());
      const updated = service.setFinalDecision(audit, 'fail');

      expect(updated.finalDecision).toBe('fail');
    });
  });

  describe('addRepairAction', () => {
    it('添加修复动作', () => {
      const service = createService();
      const audit = service.createAudit(validInput());
      const updated = service.addRepairAction(audit, {
        type: 'local_replace',
        targetIssueIds: ['i1'],
        description: '替换矛盾段落',
      });

      expect(updated.repairActions).toHaveLength(1);
      expect(updated.repairActions[0].type).toBe('local_replace');
    });
  });

  describe('canPublish', () => {
    it('pass 状态可发布', () => {
      const service = createService();
      const audit = service.createAudit(validInput());
      expect(service.canPublish(audit)).toBe(true);
    });

    it('warning 状态可发布', () => {
      const service = createService();
      const audit = service.createAudit({
        ...validInput(),
        warningIssues: [
          {
            id: 'w1',
            description: '节奏慢',
            tier: 'warning',
            category: '节奏',
            suggestion: '加快',
          },
        ],
      });
      expect(service.canPublish(audit)).toBe(true);
    });

    it('fail 状态不可发布', () => {
      const service = createService();
      const audit = service.createAudit({
        ...validInput(),
        blockerIssues: [
          {
            id: 'b1',
            description: '矛盾',
            tier: 'blocker',
            category: '一致性',
            suggestion: '修正',
          },
        ],
      });
      expect(service.canPublish(audit)).toBe(false);
    });

    it('pending 状态不可发布', () => {
      const service = createService();
      let audit = service.createAudit(validInput());
      audit = service.setFinalDecision(audit, 'pending');
      expect(service.canPublish(audit)).toBe(false);
    });

    it('显式设置 fail 后不可发布', () => {
      const service = createService();
      let audit = service.createAudit(validInput());
      audit = service.setFinalDecision(audit, 'fail');
      expect(service.canPublish(audit)).toBe(false);
    });
  });

  describe('hasBlockers', () => {
    it('有 blocker 返回 true', () => {
      const service = createService();
      const audit = service.createAudit({
        ...validInput(),
        blockerIssues: [
          {
            id: 'b1',
            description: '矛盾',
            tier: 'blocker',
            category: '一致性',
            suggestion: '修正',
          },
        ],
      });
      expect(service.hasBlockers(audit)).toBe(true);
    });

    it('无 blocker 返回 false', () => {
      const service = createService();
      const audit = service.createAudit(validInput());
      expect(service.hasBlockers(audit)).toBe(false);
    });
  });

  describe('parseAudit', () => {
    it('解析合法对象', () => {
      const service = createService();
      const audit = service.createAudit(validInput());
      const parsed = service.parseAudit(audit);

      expect(parsed.id).toBe(audit.id);
    });

    it('非法对象抛出错误', () => {
      const service = createService();
      expect(() => service.parseAudit({})).toThrow();
    });
  });
});
