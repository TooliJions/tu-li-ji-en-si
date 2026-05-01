import { describe, it, expect } from 'vitest';
import { DefaultWritingService, type WritingServiceOptions } from './writing-service';
import type { CreateWritingSessionInput } from '../contracts/writing';

function createService(opts?: WritingServiceOptions) {
  return new DefaultWritingService(opts);
}

function validInput(): CreateWritingSessionInput {
  return {
    chapterPlanId: 'plan_001',
    contextVersionToken: 'v1-abc123',
    mode: 'compose',
    auditRequirement: true,
  };
}

describe('DefaultWritingService', () => {
  describe('createSession', () => {
    it('从有效输入创建 WritingSession', () => {
      const service = createService();
      const session = service.createSession(validInput());

      expect(session.chapterPlanId).toBe('plan_001');
      expect(session.contextVersionToken).toBe('v1-abc123');
      expect(session.mode).toBe('compose');
      expect(session.generatedDraft).toBe('');
      expect(session.persistedStatus).toBe('none');
      expect(session.auditRequirement).toBe(true);
      expect(session.id).toMatch(/^writing_/);
      expect(session.createdAt).toBe(session.updatedAt);
    });

    it('非法输入抛出 ZodError', () => {
      const service = createService();
      expect(() =>
        service.createSession({
          ...validInput(),
          mode: 'invalid',
        } as unknown as CreateWritingSessionInput),
      ).toThrow();
    });

    it('使用自定义 idGenerator 和 now', () => {
      const service = createService({
        idGenerator: () => 'custom_id',
        now: () => '2026-05-01T00:00:00.000Z',
      });
      const session = service.createSession(validInput());

      expect(session.id).toBe('custom_id');
      expect(session.createdAt).toBe('2026-05-01T00:00:00.000Z');
    });
  });

  describe('updateSession', () => {
    it('更新指定字段并保留其余字段', () => {
      let tick = 0;
      const service = createService({
        now: () => `2026-05-01T00:00:0${++tick}.000Z`,
      });
      const session = service.createSession(validInput());
      const updated = service.updateSession(session, {
        generatedDraft: '新的草稿内容',
      });

      expect(updated.generatedDraft).toBe('新的草稿内容');
      expect(updated.chapterPlanId).toBe(session.chapterPlanId);
      expect(updated.updatedAt).not.toBe(session.updatedAt);
    });

    it('空 patch 只更新 updatedAt', () => {
      let tick = 0;
      const service = createService({
        now: () => `2026-05-01T00:00:0${++tick}.000Z`,
      });
      const session = service.createSession(validInput());
      const updated = service.updateSession(session, {});

      expect(updated.chapterPlanId).toBe(session.chapterPlanId);
      expect(updated.updatedAt).not.toBe(session.updatedAt);
    });
  });

  describe('setDraft', () => {
    it('设置 generatedDraft', () => {
      const service = createService();
      const session = service.createSession(validInput());
      const updated = service.setDraft(session, '这是生成的正文');

      expect(updated.generatedDraft).toBe('这是生成的正文');
    });
  });

  describe('setStatus', () => {
    it('设置 persistedStatus', () => {
      const service = createService();
      const session = service.createSession(validInput());
      const updated = service.setStatus(session, 'draft');

      expect(updated.persistedStatus).toBe('draft');
    });
  });

  describe('validateContextToken', () => {
    it('token 匹配返回 true', () => {
      const service = createService();
      const session = service.createSession(validInput());
      expect(service.validateContextToken(session, 'v1-abc123')).toBe(true);
    });

    it('token 不匹配返回 false', () => {
      const service = createService();
      const session = service.createSession(validInput());
      expect(service.validateContextToken(session, 'v2-different')).toBe(false);
    });
  });

  describe('needsAudit', () => {
    it('compose 模式且 auditRequirement=true 且未审计时返回 true', () => {
      const service = createService();
      const session = service.createSession(validInput());
      expect(service.needsAudit(session)).toBe(true);
    });

    it('quick_draft 模式返回 false', () => {
      const service = createService();
      const session = service.createSession({
        ...validInput(),
        mode: 'quick_draft',
      });
      expect(service.needsAudit(session)).toBe(false);
    });

    it('auditRequirement=false 返回 false', () => {
      const service = createService();
      const session = service.createSession({
        ...validInput(),
        auditRequirement: false,
      });
      expect(service.needsAudit(session)).toBe(false);
    });

    it('已审计状态返回 false', () => {
      const service = createService();
      let session = service.createSession(validInput());
      session = service.setStatus(session, 'audited');
      expect(service.needsAudit(session)).toBe(false);
    });

    it('已发布状态返回 false', () => {
      const service = createService();
      let session = service.createSession(validInput());
      session = service.setStatus(session, 'published');
      expect(service.needsAudit(session)).toBe(false);
    });

    it('草稿状态返回 true', () => {
      const service = createService();
      let session = service.createSession(validInput());
      session = service.setStatus(session, 'draft');
      expect(service.needsAudit(session)).toBe(true);
    });
  });
});
