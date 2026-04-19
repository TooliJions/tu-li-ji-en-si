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
    it('tests provider connection', async () => {
      const res = await app.request('/api/config/test-provider', {
        method: 'POST',
        body: JSON.stringify({ provider: 'DashScope' }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        data: { provider: string; connected: boolean; latencyMs: number };
      };
      expect(data.data.provider).toBe('DashScope');
      expect(data.data.connected).toBe(true);
      expect(typeof data.data.latencyMs).toBe('number');
    });

    it('uses default provider name when not specified', async () => {
      const res = await app.request('/api/config/test-provider', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as { data: { provider: string } };
      expect(data.data.provider).toBe('Unknown');
    });
  });
});
