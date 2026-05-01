// ─── SQLite 任务队列 ─────────────────────────────────────────────
// 提供崩溃安全的异步任务持久化，替换 fire-and-forget IIFE。

import { type DatabaseDriver, createDriver } from '../state/db-driver';

// ─── Types ───────────────────────────────────────────────────────

export type TaskType = 'write-next' | 'upgrade-draft';
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface TaskRecord {
  id: string;
  bookId: string;
  pipelineId: string;
  type: TaskType;
  payload: string;
  status: TaskStatus;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  attempts: number;
  maxAttempts: number;
}

export interface EnqueueInput {
  bookId: string;
  pipelineId: string;
  type: TaskType;
  payload: Record<string, unknown>;
  maxAttempts?: number;
}

// ─── TaskQueue ───────────────────────────────────────────────────

export class TaskQueue {
  private driver: DatabaseDriver;

  constructor(driver: DatabaseDriver) {
    this.driver = driver;
    this.#initTables();
  }

  static async create(dbPath: string): Promise<TaskQueue> {
    const driver = await createDriver({ path: dbPath });
    return new TaskQueue(driver);
  }

  // ── Public API ────────────────────────────────────────────────

  enqueue(input: EnqueueInput): string {
    const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();
    this.driver.run(
      `INSERT INTO tasks (id, book_id, pipeline_id, type, payload, status, created_at, attempts, max_attempts)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.bookId,
        input.pipelineId,
        input.type,
        JSON.stringify(input.payload),
        'pending',
        now,
        0,
        input.maxAttempts ?? 3,
      ],
    );
    return id;
  }

  /**
   * 原子地认领下一个 pending 任务。
   * 返回被认领的任务，如果没有 pending 任务则返回 undefined。
   */
  claimNext(): TaskRecord | undefined {
    return this.driver.transaction(() => {
      const row = this.driver.get<Record<string, unknown>>(
        `SELECT * FROM tasks WHERE status = 'pending' ORDER BY created_at LIMIT 1`,
      );
      if (!row) return undefined;

      const now = new Date().toISOString();
      this.driver.run(
        `UPDATE tasks SET status = 'running', started_at = ?, attempts = attempts + 1 WHERE id = ?`,
        [now, row.id],
      );

      return this.#hydrate({
        ...row,
        status: 'running',
        started_at: now,
        attempts: (row.attempts as number) + 1,
      });
    });
  }

  markCompleted(id: string): void {
    const now = new Date().toISOString();
    this.driver.run(`UPDATE tasks SET status = 'completed', completed_at = ? WHERE id = ?`, [
      now,
      id,
    ]);
  }

  markFailed(id: string, error: string): void {
    const now = new Date().toISOString();
    this.driver.run(
      `UPDATE tasks SET status = 'failed', completed_at = ?, error = ? WHERE id = ?`,
      [now, error, id],
    );
  }

  /**
   * 将 running 任务重新标记为 pending，用于重试。
   */
  retry(id: string): void {
    this.driver.run(`UPDATE tasks SET status = 'pending', started_at = NULL WHERE id = ?`, [id]);
  }

  /**
   * 启动时调用：将上次崩溃遗留的 running 任务重置为 pending。
   * 返回重置的任务数量。
   */
  resetRunningTasks(): number {
    const result = this.driver.run(
      `UPDATE tasks SET status = 'pending', started_at = NULL WHERE status = 'running'`,
    );
    return result.changes;
  }

  getById(id: string): TaskRecord | undefined {
    const row = this.driver.get<Record<string, unknown>>(`SELECT * FROM tasks WHERE id = ?`, [id]);
    return row ? this.#hydrate(row) : undefined;
  }

  getPendingCount(): number {
    const row = this.driver.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM tasks WHERE status = 'pending'`,
    );
    return row?.count ?? 0;
  }

  close(): void {
    this.driver.close();
  }

  // ── Private ───────────────────────────────────────────────────

  #initTables(): void {
    this.driver.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        book_id TEXT NOT NULL,
        pipeline_id TEXT NOT NULL,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        error TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 3
      )
    `);
    this.driver.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)`);
    this.driver.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_book ON tasks(book_id)`);
  }

  #hydrate(row: Record<string, unknown>): TaskRecord {
    return {
      id: String(row.id),
      bookId: String(row.book_id),
      pipelineId: String(row.pipeline_id),
      type: String(row.type) as TaskType,
      payload: String(row.payload),
      status: String(row.status) as TaskStatus,
      createdAt: String(row.created_at),
      startedAt: row.started_at ? String(row.started_at) : undefined,
      completedAt: row.completed_at ? String(row.completed_at) : undefined,
      error: row.error ? String(row.error) : undefined,
      attempts: Number(row.attempts),
      maxAttempts: Number(row.max_attempts),
    };
  }
}
