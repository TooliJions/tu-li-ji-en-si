import { describe, expect, it } from 'vitest';
import { DefaultInspirationService } from './inspiration-service';

describe('DefaultInspirationService', () => {
  it('creates a normalized inspiration seed', () => {
    const service = new DefaultInspirationService({
      idGenerator: () => 'seed_test',
      now: () => '2026-04-30T00:00:00.000Z',
    });

    const seed = service.createSeed({
      sourceText: '  宗门天才在外门考核暴露秘密血脉  ',
      genre: '  玄幻 ',
      theme: '逆袭',
      conflict: '身份暴露',
      tone: '热血',
      constraints: ['多线并行', ' 多线并行 ', '升级明确'],
      sourceType: 'manual',
    });

    expect(seed.id).toBe('seed_test');
    expect(seed.sourceText).toBe('宗门天才在外门考核暴露秘密血脉');
    expect(seed.genre).toBe('玄幻');
    expect(seed.constraints).toEqual(['多线并行', '升级明确']);
    expect(seed.createdAt).toBe('2026-04-30T00:00:00.000Z');
  });
});
