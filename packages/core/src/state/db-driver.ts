// ─── DatabaseDriver 抽象层 ────────────────────────────────────────
// 解耦业务逻辑与 SQLite 驱动实现。
// 默认回退到 sql.js（零编译依赖），better-sqlite3 编译成功后自动生效。

import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import * as fs from 'fs';

// ─── Interfaces ──────────────────────────────────────────────────

export interface DriverConfig {
  /** ':memory:' 或文件路径 */
  path: string;
  /** 是否启用 WAL（仅 better-sqlite3 有效） */
  wal?: boolean;
}

export interface RunResult {
  changes: number;
  lastInsertRowid: number;
}

export interface DatabaseDriver {
  readonly mode: 'file' | 'memory';
  exec(sql: string): void;
  run(sql: string, params?: unknown[]): RunResult;
  get<T = Record<string, unknown>>(sql: string, params?: unknown[]): T | undefined;
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[];
  transaction<T>(fn: () => T): T;
  close(): void;
}

// ─── 工厂函数 ────────────────────────────────────────────────────

export async function createDriver(config: DriverConfig): Promise<DatabaseDriver> {
  // 优先尝试 better-sqlite3（如果已编译成功）
  const betterDriver = tryCreateBetterSqlite3Driver(config);
  if (betterDriver) return betterDriver;

  // 回退到 sql.js
  return createSqlJsDriver(config);
}

// ─── BetterSqlite3Driver ─────────────────────────────────────────

function tryCreateBetterSqlite3Driver(config: DriverConfig): DatabaseDriver | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require('better-sqlite3') as typeof import('better-sqlite3');
    const db = new Database(config.path);

    if (config.wal !== false) {
      db.pragma('journal_mode = WAL');
    }
    db.pragma('foreign_keys = ON');

    return new BetterSqlite3Driver(db);
  } catch {
    return null;
  }
}

class BetterSqlite3Driver implements DatabaseDriver {
  readonly mode: 'file' | 'memory';

  constructor(private db: InstanceType<typeof import('better-sqlite3')>) {
    this.mode = db.name === ':memory:' ? 'memory' : 'file';
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  run(sql: string, params: unknown[] = []): RunResult {
    const result = this.db.prepare(sql).run(...params);
    return {
      changes: result.changes,
      lastInsertRowid: Number(result.lastInsertRowid),
    };
  }

  get<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T | undefined {
    return this.db.prepare(sql).get(...params) as T | undefined;
  }

  all<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
    return (this.db.prepare(sql).all(...params) as T[]) ?? [];
  }

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  close(): void {
    this.db.close();
  }
}

// ─── SqlJsDriver ─────────────────────────────────────────────────

async function createSqlJsDriver(config: DriverConfig): Promise<DatabaseDriver> {
  const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm');
  const SQL = await initSqlJs({ locateFile: () => wasmPath });

  let db: Database;
  if (config.path !== ':memory:' && fs.existsSync(config.path)) {
    const buffer = fs.readFileSync(config.path);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA foreign_keys = ON');

  return new SqlJsDriver(db, SQL, config.path);
}

class SqlJsDriver implements DatabaseDriver {
  readonly mode: 'file' | 'memory';
  private closed = false;

  constructor(
    private db: Database,
    private sqlJs: SqlJsStatic,
    private dbPath: string,
  ) {
    this.mode = dbPath === ':memory:' ? 'memory' : 'file';
    // sql.js 在 :memory: 模式下不自动落盘；文件模式下初始化后立即保存一次
    this.#persist();
  }

  exec(sql: string): void {
    this.db.run(sql);
  }

  run(sql: string, params: unknown[] = []): RunResult {
    const stmt = this.db.prepare(sql);
    stmt.bind(params as (string | number | null | Uint8Array)[]);
    stmt.step();

    // sql.js 不支持直接获取 changes，使用 last_insert_rowid() 获取
    const lastIdStmt = this.db.prepare('SELECT last_insert_rowid()');
    lastIdStmt.step();
    const lastId = (lastIdStmt.get()[0] as number) ?? 0;
    lastIdStmt.free();
    stmt.free();

    return { changes: 1, lastInsertRowid: lastId };
  }

  get<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T | undefined {
    const stmt = this.db.prepare(sql);
    stmt.bind(params as (string | number | null | Uint8Array)[]);

    if (!stmt.step()) {
      stmt.free();
      return undefined;
    }

    const row = stmt.get();
    const columns = stmt.getColumnNames();
    const obj: Record<string, unknown> = {};
    for (let i = 0; i < columns.length; i++) {
      obj[columns[i]] = row[i];
    }
    stmt.free();
    return obj as T;
  }

  all<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
    const stmt = this.db.prepare(sql);
    stmt.bind(params as (string | number | null | Uint8Array)[]);

    const columns = stmt.getColumnNames();
    const results: T[] = [];
    while (stmt.step()) {
      const row = stmt.get();
      const obj: Record<string, unknown> = {};
      for (let i = 0; i < columns.length; i++) {
        obj[columns[i]] = row[i];
      }
      results.push(obj as T);
    }
    stmt.free();
    return results;
  }

  transaction<T>(fn: () => T): T {
    const saved = this.db.export();
    const savedSizeMB = saved.byteLength / (1024 * 1024);
    // 超过 100MB 的数据库回退到 savepoint 模式，避免 OOM
    if (savedSizeMB > 100) {
      this.db.run('SAVEPOINT tx_savepoint');
      try {
        const result = fn();
        this.db.run('RELEASE SAVEPOINT tx_savepoint');
        this.#persist();
        return result;
      } catch (err) {
        this.db.run('ROLLBACK TO SAVEPOINT tx_savepoint');
        throw err;
      }
    }
    try {
      const result = fn();
      this.#persist();
      return result;
    } catch (err) {
      this.db = new this.sqlJs.Database(saved);
      throw err;
    }
  }

  close(): void {
    if (!this.closed) {
      this.#persist();
      this.db.close();
      this.closed = true;
    }
  }

  #persist(): void {
    if (this.dbPath !== ':memory:') {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(this.dbPath, buffer);
    }
  }
}
