import { Hono } from 'hono';
import { createPipelineRouter, pipelineStore } from '../packages/studio/src/api/routes/pipeline.ts';
import { createBookRouter, resetBookStoreForTests } from '../packages/studio/src/api/routes/books.ts';
import { resetStudioCoreBridgeForTests } from '../packages/studio/src/api/core-bridge.ts';

const app = new Hono();
app.route('/api/books', createBookRouter());
app.route('/api/books/:bookId/pipeline', createPipelineRouter());

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

const writeRes = await app.request(`/api/books/${bookId}/pipeline/write-next`, {
  method: 'POST',
  body: JSON.stringify({ chapterNumber: 1 }),
  headers: { 'Content-Type': 'application/json' },
});
const writeData = (await writeRes.json()) as { data: { pipelineId: string } };
const pipelineId = writeData.data.pipelineId;

for (let attempt = 0; attempt < 50; attempt++) {
  const statusRes = await app.request(`/api/books/${bookId}/pipeline/${pipelineId}`);
  const statusData = await statusRes.json();
  if (statusData.data.status !== 'running') {
    console.log(JSON.stringify(statusData, null, 2));
    process.exit(0);
  }
  await new Promise((resolve) => setTimeout(resolve, 20));
}

console.log('timeout');
