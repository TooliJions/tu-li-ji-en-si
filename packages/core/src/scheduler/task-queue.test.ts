import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskQueue } from './task-queue';
import { createDriver } from '../state/db-driver';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('TaskQueue', () => {
  let queue: TaskQueue;
  let dbPath: string;

  beforeEach(async () => {
    dbPath = path.join(os.tmpdir(), `task-queue-test-${Date.now()}.sqlite`);
    const driver = await createDriver({ path: dbPath });
    queue = new TaskQueue(driver);
  });

  afterEach(() => {
    queue.close();
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  });

  it('enqueues and retrieves a task', () => {
    const id = queue.enqueue({
      bookId: 'book-1',
      pipelineId: 'pipe-1',
      type: 'write-next',
      payload: { chapterNumber: 1 },
    });

    const task = queue.getById(id);
    expect(task).toBeDefined();
    expect(task!.bookId).toBe('book-1');
    expect(task!.type).toBe('write-next');
    expect(task!.status).toBe('pending');
    expect(task!.attempts).toBe(0);
  });

  it('claims next pending task atomically', () => {
    queue.enqueue({ bookId: 'b1', pipelineId: 'p1', type: 'write-next', payload: {} });
    queue.enqueue({ bookId: 'b2', pipelineId: 'p2', type: 'upgrade-draft', payload: {} });

    const claimed = queue.claimNext();
    expect(claimed).toBeDefined();
    expect(claimed!.status).toBe('running');
    expect(claimed!.attempts).toBe(1);

    const remaining = queue.getPendingCount();
    expect(remaining).toBe(1);
  });

  it('returns undefined when no pending tasks', () => {
    const claimed = queue.claimNext();
    expect(claimed).toBeUndefined();
  });

  it('marks task as completed', () => {
    const id = queue.enqueue({ bookId: 'b1', pipelineId: 'p1', type: 'write-next', payload: {} });
    queue.claimNext();
    queue.markCompleted(id);

    const task = queue.getById(id);
    expect(task!.status).toBe('completed');
    expect(task!.completedAt).toBeDefined();
  });

  it('marks task as failed', () => {
    const id = queue.enqueue({ bookId: 'b1', pipelineId: 'p1', type: 'write-next', payload: {} });
    queue.claimNext();
    queue.markFailed(id, 'execution error');

    const task = queue.getById(id);
    expect(task!.status).toBe('failed');
    expect(task!.error).toBe('execution error');
  });

  it('resets running tasks to pending', () => {
    const id = queue.enqueue({ bookId: 'b1', pipelineId: 'p1', type: 'write-next', payload: {} });
    queue.claimNext();

    const resetCount = queue.resetRunningTasks();
    expect(resetCount).toBe(1);

    const task = queue.getById(id);
    expect(task!.status).toBe('pending');
    expect(task!.startedAt).toBeUndefined();
  });

  it('retries a running task', () => {
    const id = queue.enqueue({ bookId: 'b1', pipelineId: 'p1', type: 'write-next', payload: {} });
    queue.claimNext();
    queue.retry(id);

    const task = queue.getById(id);
    expect(task!.status).toBe('pending');
  });

  it('respects maxAttempts', () => {
    const id = queue.enqueue({
      bookId: 'b1',
      pipelineId: 'p1',
      type: 'write-next',
      payload: {},
      maxAttempts: 2,
    });

    const task = queue.getById(id);
    expect(task!.maxAttempts).toBe(2);
  });
});
