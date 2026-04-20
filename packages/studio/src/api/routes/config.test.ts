import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createConfigRouter } from './config';

function createTestApp() {
  const app = new Hono();
  app.route('/api/config', createConfigRouter());
  return app;
}

describe('Config Route', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    app = createTestApp();
  });

  describe('GET /api/config', () => {
    it('returns configuration with all fields', async () => {
      const res = await app.request('/api/config');
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        data: {
          defaultProvider: string;
          defaultModel: string;
          agentRouting: unknown[];
          providers: unknown[];
        };
      };
      expect(data.data.defaultProvider).toBeDefined();
      expect(data.data.defaultModel).toBeDefined();
      expect(Array.isArray(data.data.agentRouting)).toBe(true);
      expect(Array.isArray(data.data.providers)).toBe(true);
    });
  });

  describe('PUT /api/config', () => {
    it('updates configuration and returns new state', async () => {
      const res = await app.request('/api/config', {
        method: 'PUT',
        body: JSON.stringify({ defaultProvider: 'TestProvider', defaultModel: 'test-model' }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        data: { defaultProvider: string; defaultModel: string };
      };
      expect(data.data.defaultProvider).toBe('TestProvider');
      expect(data.data.defaultModel).toBe('test-model');
    });

    it('merges partial updates', async () => {
      const res = await app.request('/api/config', {
        method: 'PUT',
        body: JSON.stringify({ defaultModel: 'only-model' }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        data: { defaultProvider: string; defaultModel: string };
      };
      expect(data.data.defaultModel).toBe('only-model');
      expect(data.data.defaultProvider).toBeDefined(); // existing field preserved
    });
  });

  describe('POST /api/config/test-provider', () => {
    it('returns error when apiKey is missing', async () => {
      const res = await app.request('/api/config/test-provider', {
        method: 'POST',
        body: JSON.stringify({ name: 'DashScope', baseUrl: 'https://example.com' }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        data: { success: boolean; error: string; provider: string };
      };
      expect(data.data.success).toBe(false);
      expect(data.data.error).toContain('apiKey');
      expect(data.data.provider).toBe('DashScope');
    });

    it('returns error when baseUrl is missing', async () => {
      const res = await app.request('/api/config/test-provider', {
        method: 'POST',
        body: JSON.stringify({ name: 'DashScope', apiKey: 'sk-test' }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        data: { success: boolean; error: string };
      };
      expect(data.data.success).toBe(false);
      expect(data.data.error).toContain('baseUrl');
    });

    it('returns error for invalid credentials', async () => {
      const res = await app.request('/api/config/test-provider', {
        method: 'POST',
        body: JSON.stringify({
          name: 'BadProvider',
          apiKey: 'invalid',
          baseUrl: 'https://invalid.example.com',
          model: 'qwen3.6-plus',
        }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        data: { success: boolean; latencyMs: number };
      };
      expect(data.data.success).toBe(false);
      expect(typeof data.data.latencyMs).toBe('number');
    });
  });
});
