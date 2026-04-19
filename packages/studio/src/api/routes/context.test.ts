import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createContextRouter } from './context';

function createTestApp() {
  const app = new Hono();
  app.route('/api/books/:bookId/context', createContextRouter());
  return app;
}

describe('Context Route', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    app = createTestApp();
  });

  describe('GET /api/books/:bookId/context/:entityName', () => {
    it('returns character context for known entity', async () => {
      const res = await app.request('/api/books/book-001/context/林晨');
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        data: { name: string; type: string; currentLocation: string; emotion: string };
      };
      expect(data.data.name).toBe('林晨');
      expect(data.data.type).toBe('character');
      expect(data.data.currentLocation).toBe('教室');
      expect(data.data.emotion).toBe('专注');
    });

    it('returns character with relationships', async () => {
      const res = await app.request('/api/books/book-001/context/林晨');
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        data: { relationships: Array<{ with: string; type: string }> };
      };
      expect(data.data.relationships.length).toBeGreaterThan(0);
      expect(data.data.relationships[0].with).toBe('苏小雨');
    });

    it('returns character with active hooks', async () => {
      const res = await app.request('/api/books/book-001/context/林晨');
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        data: { activeHooks: Array<{ id: string; description: string }> };
      };
      expect(data.data.activeHooks.length).toBeGreaterThan(0);
      expect(data.data.activeHooks[0].id).toBe('hook-001');
    });

    it('returns 404 for unknown entity', async () => {
      const res = await app.request('/api/books/book-001/context/未知角色');
      expect(res.status).toBe(404);
      const data = (await res.json()) as { error: { code: string; message: string } };
      expect(data.error.code).toBe('ENTITY_NOT_FOUND');
      expect(data.error.message).toBe('实体不存在');
    });

    it('handles URL-encoded entity names', async () => {
      const res = await app.request('/api/books/book-001/context/%E6%9E%97%E6%99%A8');
      expect(res.status).toBe(200);
      const data = (await res.json()) as { data: { name: string } };
      expect(data.data.name).toBe('林晨');
    });

    it('returns all known entities successfully', async () => {
      const entities = ['林晨', '苏小雨', '教室', '竞赛试卷'];
      for (const entity of entities) {
        const res = await app.request(`/api/books/book-001/context/${entity}`);
        expect(res.status).toBe(200);
        const data = (await res.json()) as { data: { name: string } };
        expect(data.data.name).toBe(entity);
      }
    });
  });
});
