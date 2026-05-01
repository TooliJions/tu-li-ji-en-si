import { describe, expect, it } from 'vitest';
import { DefaultOutlineService } from './outline-service';

describe('DefaultOutlineService', () => {
  it('creates a story blueprint', () => {
    const service = new DefaultOutlineService({
      idGenerator: () => 'outline_test',
      now: () => '2026-04-30T03:00:00.000Z',
    });

    const blueprint = service.createBlueprint({
      planningBriefId: 'brief_test',
      premise: '少年在宗门考核中暴露上古血脉，从外门一路逆袭。',
      worldRules: ['血脉越强反噬越重'],
      protagonistArc: {
        characterName: '林辰',
        startState: '隐忍自保',
        growthPath: '从隐藏锋芒到主动夺势',
        endState: '敢于改写宗门秩序',
      },
      supportingArcs: [],
      majorConflicts: ['宗门内部排挤', '血脉失控'],
      phaseMilestones: [
        {
          label: '外门突围',
          summary: '完成考核并进入核心竞争视野',
          targetChapters: [1, 2, 3],
        },
      ],
      endingDirection: '主角建立新秩序并重塑宗门格局',
    });

    expect(blueprint.id).toBe('outline_test');
    expect(blueprint.planningBriefId).toBe('brief_test');
    expect(blueprint.phaseMilestones).toHaveLength(1);
    expect(blueprint.updatedAt).toBe('2026-04-30T03:00:00.000Z');
  });

  it('updates a story blueprint and refreshes updatedAt', () => {
    const service = new DefaultOutlineService({
      idGenerator: () => 'outline_test',
      now: () => '2026-04-30T03:00:00.000Z',
    });

    const blueprint = service.createBlueprint({
      planningBriefId: 'brief_test',
      premise: '少年在宗门考核中暴露上古血脉，从外门一路逆袭。',
      worldRules: ['血脉越强反噬越重'],
      protagonistArc: {
        characterName: '林辰',
        startState: '隐忍自保',
        growthPath: '从隐藏锋芒到主动夺势',
        endState: '敢于改写宗门秩序',
      },
      supportingArcs: [],
      majorConflicts: ['宗门内部排挤'],
      phaseMilestones: [],
      endingDirection: '主角建立新秩序并重塑宗门格局',
    });

    const updatedService = new DefaultOutlineService({
      idGenerator: () => 'outline_test',
      now: () => '2026-04-30T04:00:00.000Z',
    });

    const updated = updatedService.updateBlueprint(blueprint, {
      majorConflicts: ['宗门内部排挤', '血脉失控'],
      endingDirection: '主角建立新秩序',
    });

    expect(updated.majorConflicts).toEqual(['宗门内部排挤', '血脉失控']);
    expect(updated.endingDirection).toBe('主角建立新秩序');
    expect(updated.updatedAt).toBe('2026-04-30T04:00:00.000Z');
  });
});
