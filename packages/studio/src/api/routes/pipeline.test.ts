import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createPipelineRouter, pipelineStore } from './pipeline';

function createTestApp() {
  const app = new Hono();
  app.route('/api/books/:bookId/pipeline', createPipelineRouter());
  return app;
}

describe('Pipeline Route', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    app = createTestApp();
    pipelineStore.clear();
  });

  describe('POST /api/books/:bookId/pipeline/write-next', () => {
    it('starts a writing pipeline with 202 status', async () => {
      const res = await app.request('/api/books/book-001/pipeline/write-next', {
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
    });

    it('accepts customIntent and skipAudit fields', async () => {
      const res = await app.request('/api/books/book-001/pipeline/write-next', {
        method: 'POST',
        body: JSON.stringify({ chapterNumber: 2, customIntent: 'Test intent', skipAudit: true }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(202);
    });

    it('returns 400 for missing chapterNumber', async () => {
      const res = await app.request('/api/books/book-001/pipeline/write-next', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid chapterNumber', async () => {
      const res = await app.request('/api/books/book-001/pipeline/write-next', {
        method: 'POST',
        body: JSON.stringify({ chapterNumber: -1 }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/books/:bookId/pipeline/fast-draft', () => {
    it('returns a fast draft with content and draftId', async () => {
      const res = await app.request('/api/books/book-001/pipeline/fast-draft', {
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
      const res = await app.request('/api/books/book-001/pipeline/fast-draft', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as { data: { wordCount: number } };
      expect(data.data.wordCount).toBe(800);
    });

    it('returns 400 for negative wordCount', async () => {
      const res = await app.request('/api/books/book-001/pipeline/fast-draft', {
        method: 'POST',
        body: JSON.stringify({ wordCount: -1 }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/books/:bookId/pipeline/upgrade-draft', () => {
    it('returns pipelineId for draft upgrade', async () => {
      const res = await app.request('/api/books/book-001/pipeline/upgrade-draft', {
        method: 'POST',
        body: JSON.stringify({ draftId: 'draft-temp-001', content: 'draft content' }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(202);
      const data = (await res.json()) as { data: { pipelineId: string; status: string } };
      expect(data.data.pipelineId).toBeDefined();
      expect(data.data.status).toBe('running');
    });

    it('returns 400 for missing draftId', async () => {
      const res = await app.request('/api/books/book-001/pipeline/upgrade-draft', {
        method: 'POST',
        body: JSON.stringify({ content: 'draft' }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 for missing content', async () => {
      const res = await app.request('/api/books/book-001/pipeline/upgrade-draft', {
        method: 'POST',
        body: JSON.stringify({ draftId: 'draft-001' }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/books/:bookId/pipeline/write-draft', () => {
    it('writes a draft chapter', async () => {
      const res = await app.request('/api/books/book-001/pipeline/write-draft', {
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
    });

    it('returns 400 for missing chapterNumber', async () => {
      const res = await app.request('/api/books/book-001/pipeline/write-draft', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/books/:bookId/pipeline/:pipelineId', () => {
    it('returns pipeline progress for existing pipeline', async () => {
      // Create a pipeline first
      await app.request('/api/books/book-001/pipeline/write-next', {
        method: 'POST',
        body: JSON.stringify({ chapterNumber: 1 }),
        headers: { 'Content-Type': 'application/json' },
      });

      // Get the latest pipeline entry
      const latestId = Array.from(pipelineStore.keys()).pop()!;
      const res = await app.request(`/api/books/book-001/pipeline/${latestId}`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        data: { pipelineId: string; status: string; currentStage: string };
      };
      expect(data.data.pipelineId).toBe(latestId);
      expect(data.data.status).toBe('running');
      expect(data.data.currentStage).toBe('planning');
    });

    it('returns 404 for non-existent pipeline', async () => {
      const res = await app.request('/api/books/book-001/pipeline/nonexistent-pipeline');
      expect(res.status).toBe(404);
      const data = (await res.json()) as { error: { code: string } };
      expect(data.error.code).toBe('PIPELINE_NOT_FOUND');
    });
  });
});
