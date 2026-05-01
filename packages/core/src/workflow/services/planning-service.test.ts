import { describe, expect, it } from 'vitest';
import { DefaultPlanningService } from './planning-service';

describe('DefaultPlanningService', () => {
  it('creates a planning brief with default status', () => {
    const service = new DefaultPlanningService({
      idGenerator: () => 'brief_test',
      now: () => '2026-04-30T01:00:00.000Z',
    });

    const brief = service.createBrief({
      seedId: 'seed_test',
      audience: '男频玄幻读者',
      genreStrategy: '高开高走',
      styleTarget: '爽点密集',
      lengthTarget: '300 万字',
      tabooRules: ['不降智', ' 不降智 '],
      marketGoals: ['起点连载'],
      creativeConstraints: ['主角成长线清晰'],
    });

    expect(brief.id).toBe('brief_test');
    expect(brief.status).toBe('draft');
    expect(brief.tabooRules).toEqual(['不降智']);
    expect(brief.createdAt).toBe('2026-04-30T01:00:00.000Z');
    expect(brief.updatedAt).toBe('2026-04-30T01:00:00.000Z');
  });

  it('updates a planning brief and refreshes updatedAt', () => {
    const service = new DefaultPlanningService({
      idGenerator: () => 'brief_test',
      now: () => '2026-04-30T01:00:00.000Z',
    });

    const brief = service.createBrief({
      seedId: 'seed_test',
      audience: '男频玄幻读者',
      genreStrategy: '高开高走',
      styleTarget: '爽点密集',
      lengthTarget: '300 万字',
      tabooRules: [],
      marketGoals: [],
      creativeConstraints: [],
    });

    const updatedService = new DefaultPlanningService({
      idGenerator: () => 'brief_test',
      now: () => '2026-04-30T02:00:00.000Z',
    });

    const updated = updatedService.updateBrief(brief, {
      styleTarget: '压强更高',
      status: 'ready',
    });

    expect(updated.styleTarget).toBe('压强更高');
    expect(updated.status).toBe('ready');
    expect(updated.updatedAt).toBe('2026-04-30T02:00:00.000Z');
  });
});
