import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import * as fs from 'node:fs';
import { RuntimeStateStore, StateManager } from '@cybernovelist/core';
import { createBookRouter, resetBookStoreForTests } from './books';
import { createContextRouter } from './context';
import { getStudioRuntimeRootDir, resetStudioCoreBridgeForTests } from '../core-bridge';

function createTestApp() {
  const app = new Hono();
  app.route('/api/books', createBookRouter());
  app.route('/api/books/:bookId/context', createContextRouter());
  return app;
}

async function createBook(app: ReturnType<typeof createTestApp>) {
  const res = await app.request('/api/books', {
    method: 'POST',
    body: JSON.stringify({ title: '上下文测试书', genre: 'urban', targetWords: 60000 }),
    headers: { 'Content-Type': 'application/json' },
  });
  const data = (await res.json()) as { data: { id: string } };
  return data.data.id;
}

function seedRuntimeContext(bookId: string) {
  const rootDir = getStudioRuntimeRootDir();
  const manager = new StateManager(rootDir);
  const store = new RuntimeStateStore(manager);
  const manifest = store.loadManifest(bookId);
  const now = new Date().toISOString();

  manifest.lastChapterWritten = 3;
  manifest.characters = [
    {
      id: 'char-linchen',
      name: '林晨',
      role: 'protagonist',
      traits: ['冷静', '敏锐'],
      relationships: { 'char-suxiaoyu': '同伴' },
      arc: '从被动到主动追查真相',
      firstAppearance: 1,
      lastAppearance: 3,
    },
    {
      id: 'char-suxiaoyu',
      name: '苏小雨',
      role: 'supporting',
      traits: ['细腻'],
      relationships: { 'char-linchen': '同伴' },
      firstAppearance: 1,
      lastAppearance: 3,
    },
  ];
  manifest.hooks = [
    {
      id: 'hook-001',
      description: '档案室谜团',
      type: 'plot',
      status: 'open',
      priority: 'major',
      plantedChapter: 1,
      relatedCharacters: ['char-linchen', 'char-suxiaoyu'],
      relatedChapters: [1, 2, 3],
      createdAt: now,
      updatedAt: now,
    },
  ];
  manifest.facts = [
    {
      id: 'fact-1',
      content: '林晨在教室里核对竞赛试卷，并将它随身带着。',
      chapterNumber: 3,
      confidence: 'high',
      category: 'plot',
      createdAt: now,
    },
    {
      id: 'fact-2',
      content: '苏小雨把旧档案室里找到的线索交给林晨。',
      chapterNumber: 3,
      confidence: 'high',
      category: 'plot',
      createdAt: now,
    },
  ];

  store.saveRuntimeStateSnapshot(bookId, manifest);

  fs.writeFileSync(
    manager.getChapterFilePath(bookId, 3),
    `---\ntitle: 第三章 暗流涌动\nchapter: 3\nstatus: final\ncreatedAt: ${now}\n---\n\n林晨坐在教室里翻看竞赛试卷。\n\n苏小雨压低声音提醒他，旧档案室里还有遗漏的记录。`,
    'utf-8'
  );
}

describe('Context Route', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    app = createTestApp();
    resetBookStoreForTests();
    resetStudioCoreBridgeForTests();
  });

  describe('GET /api/books/:bookId/context/:entityName', () => {
    it('returns character context derived from runtime state', async () => {
      const bookId = await createBook(app);
      seedRuntimeContext(bookId);

      const res = await app.request(`/api/books/${bookId}/context/林晨?chapterNumber=3`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        data: {
          name: string;
          type: string;
          currentLocation: string;
          inventory: string[];
          relationships: Array<{ with: string; type: string }>;
        };
      };
      expect(data.data.name).toBe('林晨');
      expect(data.data.type).toBe('character');
      expect(data.data.currentLocation).toBe('教室');
      expect(data.data.inventory).toContain('竞赛试卷');
      expect(data.data.relationships[0].with).toBe('苏小雨');
    });

    it('returns item context for entity found in current chapter', async () => {
      const bookId = await createBook(app);
      seedRuntimeContext(bookId);

      const res = await app.request(`/api/books/${bookId}/context/竞赛试卷?chapterNumber=3`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        data: {
          name: string;
          type: string;
          currentLocation: string;
          relationships: Array<{ with: string; type: string }>;
        };
      };
      expect(data.data.name).toBe('竞赛试卷');
      expect(data.data.type).toBe('item');
      expect(data.data.currentLocation).toBe('教室');
      expect(data.data.relationships.length).toBeGreaterThan(0);
      expect(data.data.relationships[0].with).toBe('林晨');
    });

    it('returns character with active hooks', async () => {
      const bookId = await createBook(app);
      seedRuntimeContext(bookId);

      const res = await app.request(`/api/books/${bookId}/context/林晨?chapterNumber=3`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        data: { activeHooks: Array<{ id: string; description: string }> };
      };
      expect(data.data.activeHooks.length).toBeGreaterThan(0);
      expect(data.data.activeHooks[0].id).toBe('hook-001');
      expect(data.data.activeHooks[0].description).toBe('档案室谜团');
    });

    it('returns 404 for unknown entity', async () => {
      const bookId = await createBook(app);
      seedRuntimeContext(bookId);

      const res = await app.request(`/api/books/${bookId}/context/未知角色?chapterNumber=3`);
      expect(res.status).toBe(404);
      const data = (await res.json()) as { error: { code: string; message: string } };
      expect(data.error.code).toBe('ENTITY_NOT_FOUND');
      expect(data.error.message).toBe('实体不存在');
    });

    it('handles URL-encoded entity names', async () => {
      const bookId = await createBook(app);
      seedRuntimeContext(bookId);

      const res = await app.request(`/api/books/${bookId}/context/%E6%9E%97%E6%99%A8?chapterNumber=3`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as { data: { name: string } };
      expect(data.data.name).toBe('林晨');
    });

    it('returns all seeded entities successfully', async () => {
      const bookId = await createBook(app);
      seedRuntimeContext(bookId);

      const entities = ['林晨', '苏小雨', '教室', '竞赛试卷'];
      for (const entity of entities) {
        const res = await app.request(`/api/books/${bookId}/context/${entity}?chapterNumber=3`);
        expect(res.status).toBe(200);
        const data = (await res.json()) as { data: { name: string } };
        expect(data.data.name).toBe(entity);
      }
    });
  });
});
