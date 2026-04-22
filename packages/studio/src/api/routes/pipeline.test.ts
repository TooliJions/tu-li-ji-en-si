import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { RuntimeStateStore, StateManager } from '@cybernovelist/core';
import { createPipelineRouter, pipelineStore } from './pipeline';
import { createBookRouter, resetBookStoreForTests } from './books';
import {
  getStudioRuntimeRootDir,
  readStudioBookRuntime,
  resetStudioCoreBridgeForTests,
} from '../core-bridge';

function createTestApp() {
  const app = new Hono();
  app.route('/api/books', createBookRouter());
  app.route('/api/books/:bookId/pipeline', createPipelineRouter());
  return app;
}

async function createBook(
  app: ReturnType<typeof createTestApp>,
  payload: Record<string, unknown> = { title: '测试小说', genre: 'urban', targetWords: 100000 }
) {
  const res = await app.request('/api/books', {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json' },
  });
  const data = (await res.json()) as { data: { id: string } };
  return data.data.id;
}

async function bootstrapStory(
  app: ReturnType<typeof createTestApp>,
  bookId: string,
  chapterNumber = 1
) {
  const res = await app.request(`/api/books/${bookId}/pipeline/bootstrap-story`, {
    method: 'POST',
    body: JSON.stringify({ chapterNumber }),
    headers: { 'Content-Type': 'application/json' },
  });

  expect(res.status).toBe(200);
  return res;
}

function seedBookFocus(bookId: string, focus: string) {
  const manager = new StateManager(getStudioRuntimeRootDir());
  const store = new RuntimeStateStore(manager);
  const manifest = store.loadManifest(bookId);
  store.saveRuntimeStateSnapshot(bookId, {
    ...manifest,
    currentFocus: focus,
  });
}

function seedBookPlanningContext(bookId: string) {
  const manager = new StateManager(getStudioRuntimeRootDir());
  const store = new RuntimeStateStore(manager);
  const manifest = store.loadManifest(bookId);
  store.saveRuntimeStateSnapshot(bookId, {
    ...manifest,
    currentFocus: '当前重点：写主角在年度设计大赛前夜的压力与抉择',
    worldRules: [
      {
        id: 'rule-001',
        category: 'career',
        rule: '年度设计大赛采用淘汰制，校内只有一个推荐名额。',
        exceptions: [],
      },
    ],
    characters: [
      {
        id: 'char-001',
        name: '林浩',
        role: 'protagonist',
        traits: ['执拗'],
        relationships: {},
      },
    ],
    hooks: [
      {
        id: 'hook-001',
        description: '总监深夜留下一封匿名提醒',
        type: 'plot',
        status: 'open',
        priority: 'major',
        plantedChapter: 1,
        relatedCharacters: ['林浩'],
        relatedChapters: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
  });
}

async function waitForPipelineCompletion(
  app: ReturnType<typeof createTestApp>,
  bookId: string,
  pipelineId: string
) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const res = await app.request(`/api/books/${bookId}/pipeline/${pipelineId}`);
    const data = (await res.json()) as { data: { status: string } };
    if (data.data.status !== 'running') {
      return data.data;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`pipeline ${pipelineId} did not finish in time`);
}

describe('Pipeline Route', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    app = createTestApp();
    pipelineStore.clear();
    resetBookStoreForTests();
    resetStudioCoreBridgeForTests();
  });

  describe('POST /api/books/:bookId/pipeline/write-next', () => {
    it('starts a writing pipeline with 202 status', async () => {
      const bookId = await createBook(app);

      const res = await app.request(`/api/books/${bookId}/pipeline/write-next`, {
        method: 'POST',
        body: JSON.stringify({ chapterNumber: 1 }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(202);
      const data = (await res.json()) as {
        data: { pipelineId: string; status: string; stages: string[] };
      };
      expect(data.data.pipelineId).toBeDefined();
      expect(data.data.status).toBe('running');
      expect(data.data.stages).toEqual([
        'planning',
        'composing',
        'writing',
        'auditing',
        'revising',
        'persisting',
      ]);

      const completed = (await waitForPipelineCompletion(app, bookId, data.data.pipelineId)) as {
        status: string;
        result: { persisted: boolean; status: string };
      };
      expect(completed.status).toBe('completed');
      expect(completed.result.persisted).toBe(true);
    });

    it('accepts customIntent and skipAudit fields', async () => {
      const bookId = await createBook(app);

      const res = await app.request(`/api/books/${bookId}/pipeline/write-next`, {
        method: 'POST',
        body: JSON.stringify({ chapterNumber: 2, customIntent: 'Test intent', skipAudit: true }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(202);
    });

    it('returns 400 for missing chapterNumber', async () => {
      const bookId = await createBook(app);

      const res = await app.request(`/api/books/${bookId}/pipeline/write-next`, {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid chapterNumber', async () => {
      const bookId = await createBook(app);

      const res = await app.request(`/api/books/${bookId}/pipeline/write-next`, {
        method: 'POST',
        body: JSON.stringify({ chapterNumber: -1 }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(400);
    });

    it.skip('derives write-next intent from stored project context when no custom intent is provided', async () => {
      const bookId = await createBook(app, {
        title: '霓虹设计局',
        genre: 'urban',
        targetWords: 100000,
        brief: '主角林浩在顶级设计公司夹缝求生，准备冲击年度设计大赛。',
      });
      seedBookFocus(bookId, '当前重点：写主角在年度设计大赛前夜的压力与抉择');

      const res = await app.request(`/api/books/${bookId}/pipeline/write-next`, {
        method: 'POST',
        body: JSON.stringify({ chapterNumber: 1 }),
        headers: { 'Content-Type': 'application/json' },
      });

      expect(res.status).toBe(202);
      const data = (await res.json()) as { data: { pipelineId: string } };
      await waitForPipelineCompletion(app, bookId, data.data.pipelineId);

      const chapterPath = path.join(
        getStudioRuntimeRootDir(),
        bookId,
        'story',
        'chapters',
        'chapter-0001.md'
      );
      const chapterContent = fs.readFileSync(chapterPath, 'utf-8');
      expect(chapterContent).toContain('年度设计大赛');
      expect(chapterContent).not.toContain('继续上一章');
    });

    it.skip('merges chapter planning intent with stored project context instead of replacing it', async () => {
      const bookId = await createBook(app, {
        title: '霓虹设计局',
        genre: 'urban',
        targetWords: 100000,
        brief: '主角林浩在顶级设计公司夹缝求生，准备冲击年度设计大赛。',
      });
      seedBookPlanningContext(bookId);

      const res = await app.request(`/api/books/${bookId}/pipeline/write-next`, {
        method: 'POST',
        body: JSON.stringify({
          chapterNumber: 1,
          customIntent: '章节规划：老师正式提出推荐林浩参加全国竞赛。',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      expect(res.status).toBe(202);
      const data = (await res.json()) as { data: { pipelineId: string } };
      await waitForPipelineCompletion(app, bookId, data.data.pipelineId);

      const chapterPath = path.join(
        getStudioRuntimeRootDir(),
        bookId,
        'story',
        'chapters',
        'chapter-0001.md'
      );
      const chapterContent = fs.readFileSync(chapterPath, 'utf-8');
      expect(chapterContent).toContain('年度设计大赛');
      expect(chapterContent).toContain('全国竞赛');
      expect(chapterContent).toContain('匿名提醒');
    });
  });

  describe('POST /api/books/:bookId/pipeline/fast-draft', () => {
    it('returns a fast draft with content and draftId', async () => {
      const bookId = await createBook(app);

      const res = await app.request(`/api/books/${bookId}/pipeline/fast-draft`, {
        method: 'POST',
        body: JSON.stringify({ wordCount: 800 }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        data: { content: string; draftId: string; wordCount: number };
      };
      expect(data.data.content).toBeDefined();
      expect(data.data.draftId).toBeDefined();
      expect(data.data.wordCount).toBe(800);
    });

    it('uses default wordCount of 800', async () => {
      const bookId = await createBook(app);

      const res = await app.request(`/api/books/${bookId}/pipeline/fast-draft`, {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as { data: { wordCount: number } };
      expect(data.data.wordCount).toBe(800);
    });

    it('derives fast draft context from the stored brief and current focus when no custom intent is provided', async () => {
      const bookId = await createBook(app, {
        title: '霓虹设计局',
        genre: 'urban',
        targetWords: 100000,
        brief: '主角林浩在顶级设计公司夹缝求生，准备冲击年度设计大赛。',
      });
      seedBookFocus(bookId, '当前重点：写主角在年度设计大赛前夜的压力与抉择');

      const res = await app.request(`/api/books/${bookId}/pipeline/fast-draft`, {
        method: 'POST',
        body: JSON.stringify({ wordCount: 800 }),
        headers: { 'Content-Type': 'application/json' },
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as { data: { content: string } };
      expect(data.data.content.length).toBeGreaterThan(50);
      expect(data.data.content).not.toContain('快速试写当前主线');
    });

    it('returns 400 for negative wordCount', async () => {
      const bookId = await createBook(app);

      const res = await app.request(`/api/books/${bookId}/pipeline/fast-draft`, {
        method: 'POST',
        body: JSON.stringify({ wordCount: -1 }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/books/:bookId/pipeline/upgrade-draft', () => {
    it('returns pipelineId for draft upgrade', async () => {
      const bookId = await createBook(app);
      await app.request(`/api/books/${bookId}/pipeline/write-draft`, {
        method: 'POST',
        body: JSON.stringify({ chapterNumber: 1 }),
        headers: { 'Content-Type': 'application/json' },
      });

      const res = await app.request(`/api/books/${bookId}/pipeline/upgrade-draft`, {
        method: 'POST',
        body: JSON.stringify({ chapterNumber: 1, userIntent: '润色并转正' }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(202);
      const data = (await res.json()) as { data: { pipelineId: string; status: string } };
      expect(data.data.pipelineId).toBeDefined();
      expect(data.data.status).toBe('running');

      const completed = (await waitForPipelineCompletion(app, bookId, data.data.pipelineId)) as {
        status: string;
        result: { status: string };
      };
      expect(completed.status).toBe('completed');
      expect(completed.result.status).toBe('final');
    });

    it('returns 400 for missing chapterNumber', async () => {
      const bookId = await createBook(app);

      const res = await app.request(`/api/books/${bookId}/pipeline/upgrade-draft`, {
        method: 'POST',
        body: JSON.stringify({ userIntent: 'draft' }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid chapterNumber', async () => {
      const bookId = await createBook(app);

      const res = await app.request(`/api/books/${bookId}/pipeline/upgrade-draft`, {
        method: 'POST',
        body: JSON.stringify({ chapterNumber: 0 }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/books/:bookId/pipeline/write-draft', () => {
    it('writes a draft chapter', async () => {
      const bookId = await createBook(app);

      const res = await app.request(`/api/books/${bookId}/pipeline/write-draft`, {
        method: 'POST',
        body: JSON.stringify({ chapterNumber: 1 }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        data: { number: number; status: string; wordCount: number };
      };
      expect(data.data.number).toBe(1);
      expect(data.data.status).toBe('draft');

      const runtimeRoot = getStudioRuntimeRootDir();
      expect(
        fs.existsSync(path.join(runtimeRoot, bookId, 'story', 'chapters', 'chapter-0001.md'))
      ).toBe(true);
    });

    it('uses stored project setting context instead of the hardcoded draft fallback', async () => {
      const bookId = await createBook(app, {
        title: '霓虹设计局',
        genre: 'urban',
        targetWords: 100000,
        brief: '主角林浩在顶级设计公司夹缝求生，准备冲击年度设计大赛。',
      });
      seedBookFocus(bookId, '当前重点：写主角在年度设计大赛前夜的压力与抉择');

      const res = await app.request(`/api/books/${bookId}/pipeline/write-draft`, {
        method: 'POST',
        body: JSON.stringify({ chapterNumber: 1 }),
        headers: { 'Content-Type': 'application/json' },
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as { data: { content: string } };
      expect(data.data.content.length).toBeGreaterThan(50);
      expect(data.data.content).not.toContain('草稿模式推进主线');
    });

    it('returns 400 for missing chapterNumber', async () => {
      const bookId = await createBook(app);

      const res = await app.request(`/api/books/${bookId}/pipeline/write-draft`, {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/books/:bookId/pipeline/plan-chapter', () => {
    it('returns a normalized planning payload with characters and hooks', async () => {
      const bookId = await createBook(app);

      const res = await app.request(`/api/books/${bookId}/pipeline/plan-chapter`, {
        method: 'POST',
        body: JSON.stringify({ chapterNumber: 1, outlineContext: '主角首次出场' }),
        headers: { 'Content-Type': 'application/json' },
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        data: {
          success: boolean;
          chapterNumber: number;
          title: string;
          summary: string;
          keyEvents: string[];
          characters: string[];
          hooks: string[];
        };
      };

      expect(data.data.success).toBe(true);
      expect(data.data.chapterNumber).toBe(1);
      expect(data.data.title).toBeTruthy();
      expect(Array.isArray(data.data.keyEvents)).toBe(true);
      expect(Array.isArray(data.data.characters)).toBe(true);
      expect(Array.isArray(data.data.hooks)).toBe(true);
    });
  });

  describe('POST /api/books/:bookId/pipeline/bootstrap-story', () => {
    it('generates and persists a book-level planning chain from the inspiration brief', async () => {
      const bookId = await createBook(app, {
        title: '重返竞赛场',
        genre: 'urban',
        targetChapterCount: 80,
        targetWordsPerChapter: 3200,
        brief: '主角在高考失利后重回校园竞赛体系，必须在名额争夺、家庭压力与自我怀疑之间完成逆袭。',
      });

      const res = await app.request(`/api/books/${bookId}/pipeline/bootstrap-story`, {
        method: 'POST',
        body: JSON.stringify({ chapterNumber: 1 }),
        headers: { 'Content-Type': 'application/json' },
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        data: {
          success: boolean;
          currentFocus: string;
          centralConflict: string;
          growthArc: string;
          worldRules: string[];
          characters: Array<{ name: string; role: string; arc?: string }>;
          hooks: string[];
          chapterPlan: {
            chapterNumber: number;
            title: string;
            summary: string;
            characters: string[];
            keyEvents: string[];
            hooks: string[];
          };
        };
      };

      expect(data.data.success).toBe(true);
      expect(data.data.currentFocus).toBeTruthy();
      expect(data.data.centralConflict).toBeTruthy();
      expect(data.data.growthArc).toBeTruthy();
      expect(data.data.worldRules.length).toBeGreaterThan(0);
      expect(data.data.characters.length).toBeGreaterThan(0);
      expect(data.data.hooks.length).toBeGreaterThan(0);
      expect(data.data.chapterPlan.chapterNumber).toBe(1);
      expect(data.data.chapterPlan.title).toBeTruthy();
      expect(data.data.chapterPlan.summary).toBeTruthy();
      expect(data.data.chapterPlan.characters.length).toBeGreaterThan(0);

      const manager = new StateManager(getStudioRuntimeRootDir());
      const store = new RuntimeStateStore(manager);
      const manifest = store.loadManifest(bookId);

      expect(manifest.currentFocus).toBeTruthy();
      expect(manifest.worldRules.length).toBeGreaterThan(0);
      expect(manifest.characters.length).toBeGreaterThan(0);
      expect(manifest.characters.some((character) => Boolean(character.arc))).toBe(true);
      expect(manifest.hooks.length).toBeGreaterThan(0);

      const persistedPlan = manifest.chapterPlans['1'];
      expect(persistedPlan).toBeTruthy();
      expect(persistedPlan.worldRules.length).toBeGreaterThan(0);
      expect(persistedPlan.keyEvents.length).toBeGreaterThanOrEqual(3);
      expect(
        persistedPlan.characters.every((name) =>
          manifest.characters.some((character) => character.name === name)
        )
      ).toBe(true);
    });

    it.skip('persists a planning brief so downstream write-next consumes the generated outline and growth arc', async () => {
      const bookId = await createBook(app, {
        title: '重返竞赛场',
        genre: 'urban',
        targetChapterCount: 80,
        targetWordsPerChapter: 3200,
        brief: '主角在高考失利后重回校园竞赛体系，必须在名额争夺、家庭压力与自我怀疑之间完成逆袭。',
      });

      await bootstrapStory(app, bookId, 1);

      const runtimeBook = readStudioBookRuntime(bookId);
      expect(runtimeBook?.planningBrief).toContain('主题大纲');
      expect(runtimeBook?.planningBrief).toContain('核心矛盾');
      expect(runtimeBook?.planningBrief).toContain('成长主线');

      const res = await app.request(`/api/books/${bookId}/pipeline/write-next`, {
        method: 'POST',
        body: JSON.stringify({
          chapterNumber: 1,
          customIntent: '章节规划：老师正式提出推荐林晨参加全国竞赛。',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      expect(res.status).toBe(202);
      const data = (await res.json()) as { data: { pipelineId: string } };
      await waitForPipelineCompletion(app, bookId, data.data.pipelineId);

      const chapterPath = path.join(
        getStudioRuntimeRootDir(),
        bookId,
        'story',
        'chapters',
        'chapter-0001.md'
      );
      const chapterContent = fs.readFileSync(chapterPath, 'utf-8');
      expect(chapterContent.length).toBeGreaterThan(200);
      expect(chapterContent).toContain('全国竞赛');
    });

    it('reuses the generated planning brief in fast draft and draft mode after bootstrap', async () => {
      const bookId = await createBook(app, {
        title: '重返竞赛场',
        genre: 'urban',
        targetChapterCount: 80,
        targetWordsPerChapter: 3200,
        brief: '主角在高考失利后重回校园竞赛体系，必须在名额争夺、家庭压力与自我怀疑之间完成逆袭。',
      });

      await bootstrapStory(app, bookId, 1);

      const fastDraftRes = await app.request(`/api/books/${bookId}/pipeline/fast-draft`, {
        method: 'POST',
        body: JSON.stringify({ wordCount: 800 }),
        headers: { 'Content-Type': 'application/json' },
      });

      expect(fastDraftRes.status).toBe(200);
      const fastDraftData = (await fastDraftRes.json()) as { data: { content: string } };
      expect(fastDraftData.data.content.length).toBeGreaterThan(100);

      const writeDraftRes = await app.request(`/api/books/${bookId}/pipeline/write-draft`, {
        method: 'POST',
        body: JSON.stringify({ chapterNumber: 1 }),
        headers: { 'Content-Type': 'application/json' },
      });

      expect(writeDraftRes.status).toBe(200);
      const writeDraftData = (await writeDraftRes.json()) as { data: { content: string } };
      expect(writeDraftData.data.content.length).toBeGreaterThan(100);
    });

    it('returns 400 when the book has no inspiration brief to bootstrap from', async () => {
      const bookId = await createBook(app, {
        title: '空白开局',
        genre: 'urban',
        targetWords: 100000,
      });

      const res = await app.request(`/api/books/${bookId}/pipeline/bootstrap-story`, {
        method: 'POST',
        body: JSON.stringify({ chapterNumber: 1 }),
        headers: { 'Content-Type': 'application/json' },
      });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/books/:bookId/pipeline/:pipelineId', () => {
    it('returns pipeline progress for existing pipeline', async () => {
      const bookId = await createBook(app);

      // Create a pipeline first
      const createRes = await app.request(`/api/books/${bookId}/pipeline/write-next`, {
        method: 'POST',
        body: JSON.stringify({ chapterNumber: 1 }),
        headers: { 'Content-Type': 'application/json' },
      });
      const created = (await createRes.json()) as { data: { pipelineId: string } };

      const res = await app.request(`/api/books/${bookId}/pipeline/${created.data.pipelineId}`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        data: { pipelineId: string; status: string; currentStage: string };
      };
      expect(data.data.pipelineId).toBe(created.data.pipelineId);
      expect(['running', 'completed']).toContain(data.data.status);
    });

    it('returns 404 for non-existent pipeline', async () => {
      const bookId = await createBook(app);
      const res = await app.request(`/api/books/${bookId}/pipeline/nonexistent-pipeline`);
      expect(res.status).toBe(404);
      const data = (await res.json()) as { error: { code: string } };
      expect(data.error.code).toBe('PIPELINE_NOT_FOUND');
    });
  });
});
