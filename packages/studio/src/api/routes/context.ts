import { Hono } from 'hono';

const KNOWN_ENTITIES = ['林晨', '苏小雨', '教室', '竞赛试卷'];

export function createContextRouter(): Hono {
  const router = new Hono();

  // GET /api/books/:bookId/context/:entityName
  router.get('/:entityName', (c) => {
    const entityName = decodeURIComponent(c.req.param('entityName'));
    if (!KNOWN_ENTITIES.includes(entityName)) {
      return c.json({ error: { code: 'ENTITY_NOT_FOUND', message: '实体不存在' } }, 404);
    }

    return c.json({
      data: {
        name: entityName,
        type: 'character',
        currentLocation: '教室',
        emotion: '专注',
        inventory: ['竞赛试卷', '笔'],
        relationships: [{ with: '苏小雨', type: '同桌', affinity: '好感' }],
        activeHooks: [{ id: 'hook-001', description: '父亲失踪', status: 'open' }],
      },
    });
  });

  return router;
}
