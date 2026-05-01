import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createGenreRouter } from './genres';

// 使用内存中的 Hono 请求测试
import { Hono } from 'hono';

describe('Genre Router', () => {
  let router: Hono;
  let tmpDir: string;
  let originalConfigDir: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(process.env.TEMP ?? '/tmp', 'genres-test-'));
    originalConfigDir = process.env.CONFIG_DIR;
    process.env.CONFIG_DIR = tmpDir;
    router = createGenreRouter();
  });

  afterEach(() => {
    if (originalConfigDir !== undefined) {
      process.env.CONFIG_DIR = originalConfigDir;
    } else {
      delete process.env.CONFIG_DIR;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  async function request(method: string, url: string, body?: unknown) {
    const req = new Request(`http://localhost${url}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    return router.fetch(req);
  }

  describe('GET /', () => {
    it('首次请求返回默认题材列表', async () => {
      const res = await request('GET', '/');
      expect(res.status).toBe(200);
      const json = (await res.json()) as { data: unknown[]; total: number };
      expect(json.total).toBeGreaterThanOrEqual(9);
      expect(json.data.map((g: { id: string }) => g.id)).toContain('urban');
    });

    it('从已保存文件读取', async () => {
      const customDir = path.join(tmpDir, '.cybernovelist');
      fs.mkdirSync(customDir, { recursive: true });
      fs.writeFileSync(
        path.join(customDir, 'genres.json'),
        JSON.stringify([
          { id: 'custom', name: '自定义', description: '', constraints: [], tags: [] },
        ]),
      );

      const res = await request('GET', '/');
      const json = (await res.json()) as { data: unknown[]; total: number };
      expect(json.total).toBe(1);
      expect(json.data[0]).toMatchObject({ id: 'custom' });
    });

    it('损坏 JSON 回退到默认值', async () => {
      const customDir = path.join(tmpDir, '.cybernovelist');
      fs.mkdirSync(customDir, { recursive: true });
      fs.writeFileSync(path.join(customDir, 'genres.json'), 'not-json');

      const res = await request('GET', '/');
      const json = (await res.json()) as { data: unknown[]; total: number };
      expect(json.total).toBeGreaterThanOrEqual(9);
    });
  });

  describe('POST /', () => {
    it('创建新题材', async () => {
      const res = await request('POST', '/', {
        name: '测试题材',
        description: '用于测试',
        constraints: ['约束1'],
        tags: ['标签1'],
      });
      expect(res.status).toBe(201);
      const json = (await res.json()) as { data: { id: string; name: string } };
      expect(json.data.name).toBe('测试题材');
      expect(json.data.id).toBeDefined();
    });

    it('无效数据返回 400', async () => {
      const res = await request('POST', '/', { name: '' });
      expect(res.status).toBe(400);
    });
  });

  describe('PUT /:genreId', () => {
    it('更新已有题材', async () => {
      const createRes = await request('POST', '/', {
        name: '原名称',
        description: '',
        constraints: [],
        tags: [],
      });
      const { data } = (await createRes.json()) as { data: { id: string } };

      const res = await request('PUT', `/${data.id}`, { name: '新名称' });
      expect(res.status).toBe(200);
      const json = (await res.json()) as { data: { name: string } };
      expect(json.data.name).toBe('新名称');
    });

    it('更新不存在题材返回 404', async () => {
      const res = await request('PUT', '/not-exist', { name: 'x' });
      expect(res.status).toBe(404);
    });

    it('无效数据返回 400', async () => {
      const res = await request('PUT', '/any', { name: 123 });
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /:genreId', () => {
    it('删除已有题材', async () => {
      const createRes = await request('POST', '/', {
        name: '待删除',
        description: '',
        constraints: [],
        tags: [],
      });
      const { data } = (await createRes.json()) as { data: { id: string } };

      const res = await request('DELETE', `/${data.id}`);
      expect(res.status).toBe(204);

      const listRes = await request('GET', '/');
      const json = (await listRes.json()) as { data: unknown[] };
      expect(json.data.find((g: { id: string }) => g.id === data.id)).toBeUndefined();
    });

    it('删除不存在题材返回 404', async () => {
      const res = await request('DELETE', '/not-exist');
      expect(res.status).toBe(404);
    });
  });
});
