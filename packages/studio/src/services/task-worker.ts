// ─── 任务工作器 ──────────────────────────────────────────────────
// 后台轮询 SQLite 任务队列，取出 pending 任务并执行。

import { TaskQueue } from '@cybernovelist/core';
import { executeTask } from './task-executor.js';
import { finalizePipeline } from './pipeline.js';

export interface TaskWorkerOptions {
  /** 轮询间隔（毫秒），默认 1000 */
  pollIntervalMs?: number;
}

export class TaskWorker {
  readonly queue: TaskQueue;
  readonly options: Required<TaskWorkerOptions>;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private isRunning = false;

  constructor(queue: TaskQueue, options: TaskWorkerOptions = {}) {
    this.queue = queue;
    this.options = {
      pollIntervalMs: options.pollIntervalMs ?? 1000,
    };
  }

  /** 启动工作器：重置崩溃遗留任务，开始轮询 */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    const resetCount = this.queue.resetRunningTasks();
    if (resetCount > 0) {
      console.warn(`[TaskWorker] 重置 ${resetCount} 个崩溃遗留任务为 pending`);
    }

    this.#scheduleNext();
  }

  /** 停止工作器 */
  stop(): void {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /** 同步执行一次轮询（用于测试） */
  async tick(): Promise<void> {
    await this.#processOne();
  }

  // ── Private ───────────────────────────────────────────────────

  #scheduleNext(): void {
    if (!this.isRunning) return;
    this.timer = setTimeout(() => {
      void this.#tick();
    }, this.options.pollIntervalMs);
  }

  async #tick(): Promise<void> {
    await this.#processOne();
    this.#scheduleNext();
  }

  async #processOne(): Promise<void> {
    const task = this.queue.claimNext();
    if (!task) return;

    try {
      await executeTask(task);
      this.queue.markCompleted(task.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[TaskWorker] 任务执行失败 (${task.id}):`, message);

      if (task.attempts >= task.maxAttempts) {
        this.queue.markFailed(task.id, message);
        // 同步更新 pipelineStore 状态
        finalizePipeline(task.pipelineId, {
          success: false,
          chapterNumber: Number(JSON.parse(task.payload).chapterNumber ?? 0),
          status: 'error',
          persisted: false,
          error: message,
        });
      } else {
        // 未达到最大重试次数，重新标记为 pending
        this.queue.retry(task.id);
      }
    }
  }
}
