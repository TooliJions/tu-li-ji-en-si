import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from './server';
import { pipelineStore } from './routes/pipeline';
import * as fs from 'fs';
import * as path from 'path';

/**
 * E2E 集成测试：通过 Hono app.fetch() 直接测试完整 API 链路。
 * 覆盖关键用户路径：创建书籍 → 快速试写 → 草稿转正 → 守护进程 → 导出 → 伏笔 → 数据分析
 */
describe('E2E: Critical User Paths', () => {
  let app: ReturnType<typeof createApp>;
  let tmpDir: string;
  let bookId = '';

  beforeAll(() => {
    app = createApp();
    tmpDir = fs.mkdtempSync(path.join(process.cwd(), 'e2e-'));
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  async function fetchJson(method: string, url: string, body?: Record<string, unknown>) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const res = await app.fetch(
      new Request(`http://localhost${url}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      })
    );
    return {
      status: res.status,
      headers: res.headers,
      body: (await res.json().catch(() => null)) as unknown,
    };
  }

  const get = (url: string) => fetchJson('GET', url);
  const post = (url: string, body?: Record<string, unknown>) => fetchJson('POST', url, body);
  const put = (url: string, body: Record<string, unknown>) => fetchJson('PUT', url, body);
  const patch = (url: string, body: Record<string, unknown>) => fetchJson('PATCH', url, body);

  // ── 1. Health Check ─────────────────────────────────────

  describe('1. System health', () => {
    it('responds to health check', async () => {
      const { status, body } = await get('/api/health');
      expect(status).toBe(200);
      expect((body as Record<string, unknown>).status).toBe('ok');
    });
  });

  // ── 2. Create Book ──────────────────────────────────────

  describe('2. Create and manage book', () => {
    it('creates a new book', async () => {
      const { status, body } = await post('/api/books', {
        title: 'E2E 测试小说',
        genre: 'xianxia',
        targetWords: 30000,
        brief: '这是一个端到端测试用的修仙故事',
      });

      expect(status).toBe(201);
      const data = body as { data: { id: string; title: string; genre: string } };
      expect(data.data.title).toBe('E2E 测试小说');
      expect(data.data.genre).toBe('xianxia');
      bookId = data.data.id;
    });

    it('returns book info by ID', async () => {
      const { status, body } = await get(`/api/books/${bookId}`);
      expect(status).toBe(200);
      const data = body as { data: { title: string; genre: string } };
      expect(data.data.title).toBe('E2E 测试小说');
      expect(data.data.genre).toBe('xianxia');
    });

    it('lists the created book', async () => {
      const { status, body } = await get('/api/books');
      expect(status).toBe(200);
      const data = body as { data: Array<{ id: string }> };
      expect(data.data.some((b) => b.id === bookId)).toBe(true);
    });
  });

  // ── 3. Fast Draft ───────────────────────────────────────

  describe('3. Fast draft (quick trial write)', () => {
    it('generates a fast draft', async () => {
      const { status, body } = await post(`/api/books/${bookId}/pipeline/fast-draft`, {
        customIntent: '写一章主角出场的内容',
        wordCount: 500,
      });

      expect(status).toBe(200);
      const data = body as { data: { content: string; wordCount: number; draftId: string } };
      expect(data.data.content).toBeTruthy();
      expect(data.data.wordCount).toBe(500);
      expect(data.data.draftId).toBeTruthy();
    });

    it('returns draft preview without persisting', async () => {
      const { status, body } = await post(`/api/books/${bookId}/pipeline/fast-draft`, {
        customIntent: '写一章战斗场景',
        wordCount: 300,
      });

      expect(status).toBe(200);
      const data = body as { data: { content: string } };
      expect(data.data.content).toBeTruthy();
    });
  });

  // ── 4. Write Draft (persisted) ─────────────────────────

  describe('4. Write draft (persisted chapter)', () => {
    it('writes a draft chapter and persists it to chapter listing', async () => {
      const { status, body } = await post(`/api/books/${bookId}/pipeline/write-draft`, {
        chapterNumber: 1,
      });

      expect(status).toBe(200);
      const data = body as { data: { number: number; status: string; content: string } };
      expect(data.data.number).toBe(1);
      expect(data.data.status).toBe('draft');
      expect(data.data.content).toBeTruthy();
    });

    it('lists chapters after write-draft persistence', async () => {
      const { status, body } = await get(`/api/books/${bookId}/chapters`);
      expect(status).toBe(200);
      const data = body as { data: Array<{ number: number; status: string }> };
      expect(data.data.some((chapter) => chapter.number === 1 && chapter.status === 'draft')).toBe(
        true
      );
    });
  });

  // ── 5. Upgrade Draft ────────────────────────────────────

  describe('5. Upgrade draft to final', () => {
    it('starts upgrade pipeline (async 202)', async () => {
      const { status, body } = await post(`/api/books/${bookId}/pipeline/upgrade-draft`, {
        chapterNumber: 1,
        userIntent: '将草稿润色为正式章节',
      });

      expect(status).toBe(202);
      const data = body as { data: { pipelineId: string; status: string } };
      expect(data.data.pipelineId).toBeTruthy();
      expect(data.data.status).toBe('running');
    });
  });

  // ── 6. Write Next Chapter (full pipeline) ───────────────

  describe('6. Full pipeline: write next chapter', () => {
    it('starts write-next pipeline (async 202)', async () => {
      const { status, body } = await post(`/api/books/${bookId}/pipeline/write-next`, {
        chapterNumber: 2,
        userIntent: '主角遇到第一个对手',
        skipAudit: false,
      });

      expect(status).toBe(202);
      const data = body as { data: { pipelineId: string; status: string; stages: string[] } };
      expect(data.data.pipelineId).toBeTruthy();
      expect(data.data.status).toBe('running');
      expect(data.data.stages).toContain('planning');
    });
  });

  // ── 7. Analytics ────────────────────────────────────────

  describe('7. Analytics endpoints', () => {
    it('fetches word count analytics', async () => {
      const { status, body } = await get(`/api/books/${bookId}/analytics/word-count`);
      expect(status).toBe(200);
      const data = body as { data: { totalWords: number } };
      expect(data.data.totalWords).toBeGreaterThanOrEqual(0);
    });

    it('fetches AI trace analytics', async () => {
      const { status } = await get(`/api/books/${bookId}/analytics/ai-trace`);
      expect(status).toBe(200);
    });
  });

  // ── 8. Hooks (Foreshadowing) ────────────────────────────

  describe('8. Hook management', () => {
    it('creates a new hook', async () => {
      const { status, body } = await post(`/api/books/${bookId}/hooks`, {
        description: '神秘玉佩的来历',
        chapter: 1,
        priority: 'major',
      });

      expect(status).toBe(201);
      const data = body as { data: { description: string } };
      expect(data.data.description).toBe('神秘玉佩的来历');
    });

    it('lists hooks', async () => {
      const { status, body } = await get(`/api/books/${bookId}/hooks`);
      expect(status).toBe(200);
      const data = body as { data: unknown[] };
      expect(data.data.length).toBeGreaterThanOrEqual(1);
    });

    it('fetches hook health', async () => {
      const { status } = await get(`/api/books/${bookId}/hooks/health`);
      expect(status).toBe(200);
    });

    it('fetches hook timeline', async () => {
      const { status } = await get(
        `/api/books/${bookId}/hooks/timeline?fromChapter=1&toChapter=10`
      );
      expect(status).toBe(200);
    });
  });

  // ── 9. Daemon Control ───────────────────────────────────

  describe('9. Daemon control', () => {
    it('fetches daemon status', async () => {
      const { status } = await get(`/api/books/${bookId}/daemon`);
      expect(status).toBe(200);
    });

    it('starts daemon (short run for testing)', async () => {
      const { status } = await post(`/api/books/${bookId}/daemon/start`, {
        fromChapter: 3,
        toChapter: 3,
        interval: 1,
      });
      expect(status).toBe(200);
    });

    it('pauses daemon', async () => {
      const { status } = await post(`/api/books/${bookId}/daemon/pause`);
      expect(status).toBe(200);
    });

    it('stops daemon', async () => {
      const { status } = await post(`/api/books/${bookId}/daemon/stop`);
      expect(status).toBe(200);
    });
  });

  // ── 10. Export ──────────────────────────────────────────

  describe('10. Export', () => {
    it('exports as TXT', async () => {
      const { status } = await post(`/api/books/${bookId}/export/txt`);
      expect(status).toBe(200);
    });

    it('exports as EPUB', async () => {
      const { status } = await post(`/api/books/${bookId}/export/epub`, {
        metadata: { title: 'E2E 测试小说', author: '测试作者' },
      });
      expect(status).toBe(200);
    });

    it('exports as Markdown', async () => {
      const { status } = await post(`/api/books/${bookId}/export/markdown`);
      expect(status).toBe(200);
    });
  });

  // ── 11. System / State ──────────────────────────────────

  describe('11. System and state', () => {
    it('fetches truth files list', async () => {
      const { status, body } = await get(`/api/books/${bookId}/state`);
      expect(status).toBe(200);
      const data = body as { data: { files: unknown[] } };
      expect(Array.isArray(data.data.files)).toBe(true);
    });

    it('fetches projection status', async () => {
      const { status } = await get(`/api/books/${bookId}/state/projection-status`);
      expect(status).toBe(200);
    });

    it('fetches system doctor status', async () => {
      const { status, body } = await get('/api/system/doctor');
      expect(status).toBe(200);
      const data = body as { data: { qualityBaseline: unknown; providerHealth: unknown } };
      expect(data.data.qualityBaseline).toBeDefined();
      expect(Array.isArray(data.data.providerHealth)).toBe(true);
    });

    it('updates configuration', async () => {
      const { status } = await put('/api/config', {
        llm: { apiKey: 'test-key', model: 'test-model' },
      });
      expect(status).toBe(200);
    });

    it('fetches updated configuration', async () => {
      const { status } = await get('/api/config');
      expect(status).toBe(200);
    });
  });

  // ── 12. Chapter operations ─────────────────────────────

  describe('12. Chapter operations', () => {
    it('fetches the persisted draft chapter', async () => {
      const { status, body } = await get(`/api/books/${bookId}/chapters/1`);
      expect(status).toBe(200);
      const data = body as { data: { number: number; content: string } };
      expect(data.data.number).toBe(1);
      expect(data.data.content).toBeTruthy();
    });

    it('updates chapter content', async () => {
      const { status, body } = await patch(`/api/books/${bookId}/chapters/1`, {
        content: '更新后的第一章内容',
      });
      expect(status).toBe(200);
      const data = body as { data: { content: string } };
      expect(data.data.content).toBe('更新后的第一章内容');
    });

    it('lists chapters after insertion', async () => {
      const { status, body } = await get(`/api/books/${bookId}/chapters`);
      expect(status).toBe(200);
      const data = body as { data: Array<{ number: number }> };
      expect(data.data.some((c) => c.number === 1)).toBe(true);
    });
  });

  // ── 13. Pipeline status tracking ────────────────────────

  describe('13. Pipeline status tracking', () => {
    it('fetches pipeline status by ID', async () => {
      // Use an existing pipeline ID from earlier tests
      const entries = Array.from(pipelineStore.entries());
      if (entries.length > 0) {
        const [pipelineId] = entries[0];
        const { status, body } = await get(`/api/books/${bookId}/pipeline/${pipelineId}`);
        expect(status).toBe(200);
        const data = body as { data: { pipelineId: string; status: string } };
        expect(data.data.pipelineId).toBe(pipelineId);
      }
    });

    it('returns 404 for nonexistent pipeline', async () => {
      const { status } = await get(`/api/books/${bookId}/pipeline/nonexistent-pipeline`);
      expect(status).toBe(404);
    });
  });
});
