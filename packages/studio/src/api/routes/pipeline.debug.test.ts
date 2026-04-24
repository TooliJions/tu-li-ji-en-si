import { describe, it } from 'vitest';
import { Hono } from 'hono';
import { createPipelineRouter, pipelineStore } from './pipeline';
import { createBookRouter, resetBookStoreForTests } from './books';
import { resetStudioCoreBridgeForTests } from '../core-bridge';
import { createBookContextMiddleware } from '../context';

function createTestApp() {
  const app = new Hono();
  app.use('/api/books/:bookId/*', createBookContextMiddleware());
  app.route('/api/books', createBookRouter());
  app.route('/api/books/:bookId/pipeline', createPipelineRouter());
  return app;
}

describe('pipeline debug', () => {
  it('logs failed write-next result', async () => {
    const app = createTestApp();
    pipelineStore.clear();
    resetBookStoreForTests();
    resetStudioCoreBridgeForTests();

    const createRes = await app.request('/api/books', {
      method: 'POST',
      body: JSON.stringify({ title: '测试小说', genre: 'urban', targetWords: 100000 }),
      headers: { 'Content-Type': 'application/json' },
    });
    const createData = (await createRes.json()) as { data: { id: string } };
    const bookId = createData.data.id;

    const res = await app.request(`/api/books/${bookId}/pipeline/write-next`, {
      method: 'POST',
      body: JSON.stringify({ chapterNumber: 1 }),
      headers: { 'Content-Type': 'application/json' },
    });
    const data = (await res.json()) as { data: { pipelineId: string } };

    for (let attempt = 0; attempt < 20; attempt++) {
      const statusRes = await app.request(`/api/books/${bookId}/pipeline/${data.data.pipelineId}`);
      const statusData = await statusRes.json();
      if (statusData.data.status !== 'running') {
        // eslint-disable-next-line no-console
        console.log('DEBUG_PIPELINE_RESULT', JSON.stringify(statusData, null, 2));
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    // eslint-disable-next-line no-console
    console.log('DEBUG_PIPELINE_RESULT timeout');
  });
});
