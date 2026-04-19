import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createNaturalAgentRouter } from './natural-agent';

function createTestApp() {
  const app = new Hono();
  app.route('/api/books/:bookId/natural-agent', createNaturalAgentRouter());
  return app;
}

describe('Natural Agent Route', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    app = createTestApp();
  });

  describe('POST /api/books/:bookId/natural-agent/command', () => {
    it('accepts a natural language command and returns action plan', async () => {
      const res = await app.request('/api/books/book-001/natural-agent/command', {
        method: 'POST',
        body: JSON.stringify({ message: '帮我润色第三章结尾' }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        data: { actions: Array<{ type: string; description: string }>; rawMessage: string };
      };
      expect(Array.isArray(data.data.actions)).toBe(true);
      expect(data.data.rawMessage).toBe('帮我润色第三章结尾');
    });

    it('handles character modification commands', async () => {
      const res = await app.request('/api/books/book-001/natural-agent/command', {
        method: 'POST',
        body: JSON.stringify({ message: '增加角色 A 的内心独白' }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as { data: { rawMessage: string } };
      expect(data.data.rawMessage).toBe('增加角色 A 的内心独白');
    });

    it('returns 400 for missing message', async () => {
      const res = await app.request('/api/books/book-001/natural-agent/command', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(400);
      const data = (await res.json()) as { error: { code: string } };
      expect(data.error.code).toBe('INVALID_STATE');
    });

    it('returns 400 for empty message', async () => {
      const res = await app.request('/api/books/book-001/natural-agent/command', {
        method: 'POST',
        body: JSON.stringify({ message: '' }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/books/:bookId/natural-agent/ask', () => {
    it('accepts a question and returns answer', async () => {
      const res = await app.request('/api/books/book-001/natural-agent/ask', {
        method: 'POST',
        body: JSON.stringify({ question: '目前故事的主线是什么？' }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as { data: { answer: string; rawQuestion: string } };
      expect(typeof data.data.answer).toBe('string');
      expect(data.data.rawQuestion).toBe('目前故事的主线是什么？');
    });

    it('returns 400 for missing question', async () => {
      const res = await app.request('/api/books/book-001/natural-agent/ask', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(400);
      const data = (await res.json()) as { error: { code: string } };
      expect(data.error.code).toBe('INVALID_STATE');
    });
  });

  describe('GET /api/books/:bookId/natural-agent/history', () => {
    it('returns empty conversation history', async () => {
      const res = await app.request('/api/books/book-001/natural-agent/history');
      expect(res.status).toBe(200);
      const data = (await res.json()) as { data: { messages: unknown[]; total: number } };
      expect(Array.isArray(data.data.messages)).toBe(true);
      expect(data.data.total).toBe(0);
    });

    it('supports limit query parameter', async () => {
      const res = await app.request('/api/books/book-001/natural-agent/history?limit=10');
      expect(res.status).toBe(200);
      const data = (await res.json()) as { data: { limit: number } };
      expect(data.data.limit).toBe(10);
    });
  });
});
