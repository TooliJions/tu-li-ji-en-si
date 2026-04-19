import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createPipelineRouter, pipelineStore } from './pipeline';
import { createBookRouter, resetBookStoreForTests } from './books';
import { getStudioRuntimeRootDir, resetStudioCoreBridgeForTests } from '../core-bridge';

function createTestApp() {
  const app = new Hono();
  app.route('/api/books', createBookRouter());
  app.route('/api/books/:bookId/pipeline', createPipelineRouter());
  return app;
}

async function createBook(app: ReturnType<typeof createTestApp>) {
  const res = await app.request('/api/books', {
    method: 'POST',
    body: JSON.stringify({ title: '测试小说', genre: 'urban', targetWords: 100000 }),
    headers: { 'Content-Type': 'application/json' },
  });
  const data = (await res.json()) as { data: { id: string } };
  return data.data.id;
}

async function waitForPipelineCompletion(app: ReturnType<typeof createTestApp>, bookId: string, pipelineId: string) {
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
