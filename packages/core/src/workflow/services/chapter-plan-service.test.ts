import { describe, it, expect } from 'vitest';
import { DefaultChapterPlanService, type ChapterPlanServiceOptions } from './chapter-plan-service';
import type { ChapterPlanRecord, CreateChapterPlanInput } from '../contracts/chapter-plan';

function createService(opts?: ChapterPlanServiceOptions) {
  return new DefaultChapterPlanService(opts);
}

function validInput(): CreateChapterPlanInput {
  return {
    blueprintId: 'bp_001',
    chapterNumber: 3,
    title: '  初入宗门  ',
    goal: '主角正式加入青云宗，结识第一位盟友',
    characters: ['  主角  ', '林师姐'],
    keyEvents: ['通过入门测试', '分配洞府'],
    hooks: ['神秘玉佩闪烁'],
    dependencies: [{ chapterNumber: 2, reason: '需先完成拜师' }],
  };
}

describe('DefaultChapterPlanService', () => {
  describe('createPlan', () => {
    it('从有效输入创建 ChapterPlan', () => {
      const service = createService();
      const plan = service.createPlan(validInput());

      expect(plan.blueprintId).toBe('bp_001');
      expect(plan.chapterNumber).toBe(3);
      expect(plan.title).toBe('初入宗门');
      expect(plan.goal).toBe('主角正式加入青云宗，结识第一位盟友');
      expect(plan.characters).toEqual(['主角', '林师姐']);
      expect(plan.keyEvents).toEqual(['通过入门测试', '分配洞府']);
      expect(plan.hooks).toEqual(['神秘玉佩闪烁']);
      expect(plan.dependencies).toHaveLength(1);
      expect(plan.status).toBe('draft');
      expect(plan.id).toMatch(/^plan_/);
      expect(plan.createdAt).toBe(plan.updatedAt);
    });

    it('移除字符数组中的重复项和空白项', () => {
      const service = createService();
      const plan = service.createPlan({
        ...validInput(),
        characters: ['A', ' A ', 'B', 'A', ''],
        keyEvents: ['E1', 'E1'],
        hooks: [''],
      });

      expect(plan.characters).toEqual(['A', 'B']);
      expect(plan.keyEvents).toEqual(['E1']);
      expect(plan.hooks).toEqual([]);
    });

    it('非法输入抛出 ZodError', () => {
      const service = createService();
      expect(() =>
        service.createPlan({
          ...validInput(),
          chapterNumber: -1,
        } as unknown as CreateChapterPlanInput),
      ).toThrow();
    });

    it('使用自定义 idGenerator 和 now', () => {
      const service = createService({
        idGenerator: () => 'custom_id',
        now: () => '2026-05-01T00:00:00.000Z',
      });
      const plan = service.createPlan(validInput());

      expect(plan.id).toBe('custom_id');
      expect(plan.createdAt).toBe('2026-05-01T00:00:00.000Z');
    });
  });

  describe('updatePlan', () => {
    it('更新指定字段并保留其余字段', () => {
      let tick = 0;
      const service = createService({
        now: () => `2026-05-01T00:00:0${++tick}.000Z`,
      });
      const plan = service.createPlan(validInput());
      const updated = service.updatePlan(plan, { title: '  新标题  ' });

      expect(updated.title).toBe('新标题');
      expect(updated.goal).toBe(plan.goal);
      expect(updated.updatedAt).not.toBe(plan.updatedAt);
    });

    it('更新数组字段时重新规范化', () => {
      let tick = 0;
      const service = createService({
        now: () => `2026-05-01T00:00:0${++tick}.000Z`,
      });
      const plan = service.createPlan(validInput());
      const updated = service.updatePlan(plan, {
        characters: ['  新角色  ', '新角色', ''],
      });

      expect(updated.characters).toEqual(['新角色']);
    });

    it('空 patch 只更新 updatedAt', () => {
      let tick = 0;
      const service = createService({
        now: () => `2026-05-01T00:00:0${++tick}.000Z`,
      });
      const plan = service.createPlan(validInput());
      const updated = service.updatePlan(plan, {});

      expect(updated.title).toBe(plan.title);
      expect(updated.updatedAt).not.toBe(plan.updatedAt);
    });
  });

  describe('setStatus', () => {
    it('将状态设置为 ready', () => {
      const service = createService();
      const plan = service.createPlan(validInput());
      const updated = service.setStatus(plan, 'ready');

      expect(updated.status).toBe('ready');
      expect(updated.title).toBe(plan.title);
    });

    it('将状态设置为 published', () => {
      const service = createService();
      const plan = service.createPlan(validInput());
      const updated = service.setStatus(plan, 'published');

      expect(updated.status).toBe('published');
    });
  });

  describe('parsePlan', () => {
    it('解析合法对象', () => {
      const service = createService();
      const plan = service.createPlan(validInput());
      const parsed = service.parsePlan(plan);

      expect(parsed.id).toBe(plan.id);
    });

    it('非法对象抛出错误', () => {
      const service = createService();
      expect(() => service.parsePlan({})).toThrow();
    });
  });

  describe('canEnterWriting', () => {
    it('ready 状态且所有必填字段非空时返回 true', () => {
      const service = createService();
      const plan = service.setStatus(service.createPlan(validInput()), 'ready');
      expect(service.canEnterWriting(plan)).toBe(true);
    });

    it('draft 状态返回 false', () => {
      const service = createService();
      const plan = service.createPlan(validInput());
      expect(service.canEnterWriting(plan)).toBe(false);
    });

    it('ready 但 title 为空返回 false', () => {
      const service = createService();
      const plan = service.createPlan(validInput());
      const ready = service.setStatus(plan, 'ready');
      // 直接构造边界对象测试防御逻辑
      expect(service.canEnterWriting({ ...ready, title: '' } as ChapterPlanRecord)).toBe(false);
    });

    it('ready 但 characters 为空返回 false', () => {
      const service = createService();
      let plan = service.createPlan(validInput());
      plan = service.setStatus(plan, 'ready');
      plan = service.updatePlan(plan, { characters: [] });
      expect(service.canEnterWriting(plan)).toBe(false);
    });

    it('ready 但 keyEvents 为空返回 false', () => {
      const service = createService();
      let plan = service.createPlan(validInput());
      plan = service.setStatus(plan, 'ready');
      plan = service.updatePlan(plan, { keyEvents: [] });
      expect(service.canEnterWriting(plan)).toBe(false);
    });
  });
});
