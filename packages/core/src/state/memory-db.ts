import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import * as fs from 'fs';

// ─── Types ─────────────────────────────────────────────────────

export interface InsertFactParams {
  chapter: number;
  entity_type: string;
  entity_name: string;
  fact_text: string;
  valid_from?: number;
  valid_until?: number | null;
  confidence?: 'high' | 'medium' | 'low';
}

export interface FactRecord {
  id: number;
  chapter: number;
  entity_type: string;
  entity_name: string;
  fact_text: string;
  valid_from: number;
  valid_until: number | null;
  confidence: string;
  created_at: string;
}

export interface InsertChapterSummaryParams {
  chapter: number;
  summary: string;
  key_events?: string[];
  state_changes?: Record<string, unknown>;
}

export interface ChapterSummaryRecord {
  chapter: number;
  summary: string;
  key_events: string | null;
  state_changes: string | null;
  created_at: string;
}

export interface InsertHookParams {
  planted_ch: number;
  description: string;
  status: 'open' | 'progressing' | 'deferred' | 'dormant' | 'resolved' | 'abandoned';
  priority: 'critical' | 'major' | 'minor';
  last_advanced?: number;
  resolved_ch?: number;
  expected_resolution_min?: number;
  expected_resolution_max?: number;
  is_dormant?: boolean;
}

export interface HookRecord {
  id: number;
  planted_ch: number;
  description: string;
  status: string;
  priority: string;
  last_advanced: number | null;
  resolved_ch: number | null;
  expected_resolution_min: number | null;
  expected_resolution_max: number | null;
  is_dormant: number;
  created_at: string;
}

// ─── MemoryDB ─────────────────────────────────────────────────

export class MemoryDB {
  private db: Database;
  private closed = false;
  private sqlJs: SqlJsStatic;

  private constructor(db: Database, sqlJs: SqlJsStatic) {
    this.db = db;
    this.sqlJs = sqlJs;
    this.#initTables();
  }

  static async create(dbPath: string): Promise<MemoryDB> {
    const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm');
    const SQL = await initSqlJs({ locateFile: () => wasmPath });
    let db: Database;

    if (fs.existsSync(dbPath)) {
      const buffer = fs.readFileSync(dbPath);
      db = new SQL.Database(buffer);
    } else {
      db = new SQL.Database();
    }

    db.run('PRAGMA journal_mode = WAL');
    db.run('PRAGMA foreign_keys = ON');

    const instance = new MemoryDB(db, SQL);
    instance.#saveToDisk(dbPath);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (instance as any)._dbPath = dbPath;
    return instance;
  }

  // ── Persistence ─────────────────────────────────────────

  #saveToDisk(path: string): void {
    const data = this.db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(path, buffer);
  }

  #persist(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const path = (this as any)._dbPath as string | undefined;
    if (path) this.#saveToDisk(path);
  }

  // ── Schema ──────────────────────────────────────────────

  #initTables(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS facts (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        chapter     INTEGER NOT NULL,
        entity_type TEXT    NOT NULL,
        entity_name TEXT    NOT NULL,
        fact_text   TEXT    NOT NULL,
        valid_from  INTEGER NOT NULL,
        valid_until INTEGER,
        confidence  TEXT    NOT NULL DEFAULT 'high',
        created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS chapter_summaries (
        chapter       INTEGER PRIMARY KEY,
        summary       TEXT    NOT NULL,
        key_events    TEXT,
        state_changes TEXT,
        created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS hooks (
        id                      INTEGER PRIMARY KEY AUTOINCREMENT,
        planted_ch              INTEGER NOT NULL,
        description             TEXT    NOT NULL,
        status                  TEXT    NOT NULL,
        priority                TEXT    NOT NULL,
        last_advanced           INTEGER,
        resolved_ch             INTEGER,
        expected_resolution_min INTEGER,
        expected_resolution_max INTEGER,
        is_dormant              INTEGER NOT NULL DEFAULT 0,
        created_at              TEXT    NOT NULL DEFAULT (datetime('now'))
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS memory_snapshots (
        chapter    INTEGER PRIMARY KEY,
        snapshot   TEXT    NOT NULL,
        created_at TEXT    NOT NULL DEFAULT (datetime('now'))
      )
    `);

    this.db.run(`CREATE INDEX IF NOT EXISTS idx_facts_entity ON facts(entity_type, entity_name)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_facts_validity ON facts(valid_from, valid_until)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_hooks_status ON hooks(status)`);
  }

  // ── Facts ───────────────────────────────────────────────

  insertFact(params: InsertFactParams): number {
    this.db.run(
      `INSERT INTO facts (chapter, entity_type, entity_name, fact_text, valid_from, valid_until, confidence)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        params.chapter,
        params.entity_type,
        params.entity_name,
        params.fact_text,
        params.valid_from ?? params.chapter,
        params.valid_until ?? null,
        params.confidence ?? 'high',
      ]
    );
    this.#persist();

    const row = this.db.exec('SELECT MAX(id) FROM facts')[0];
    return (row.values[0][0] as number) ?? 0;
  }

  queryFacts(chapter: number): FactRecord[] {
    return this.#all<FactRecord>('SELECT * FROM facts WHERE chapter = ? ORDER BY id', [chapter]);
  }

  queryFactsByConfidence(confidence: string): FactRecord[] {
    return this.#all<FactRecord>('SELECT * FROM facts WHERE confidence = ? ORDER BY id', [
      confidence,
    ]);
  }

  queryFactsByEntity(entityType: string, entityName: string): FactRecord[] {
    return this.#all<FactRecord>(
      'SELECT * FROM facts WHERE entity_type = ? AND entity_name = ? ORDER BY id',
      [entityType, entityName]
    );
  }

  queryFactsInRange(fromChapter: number, toChapter: number): FactRecord[] {
    return this.#all<FactRecord>(
      'SELECT * FROM facts WHERE valid_from <= ? AND (valid_until IS NULL OR valid_until >= ?) AND valid_from >= ? ORDER BY chapter',
      [toChapter, fromChapter, fromChapter]
    );
  }

  // ── Chapter Summaries ──────────────────────────────────

  insertChapterSummary(params: InsertChapterSummaryParams): void {
    this.db.run(
      `INSERT INTO chapter_summaries (chapter, summary, key_events, state_changes)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(chapter) DO UPDATE SET
         summary = excluded.summary,
         key_events = excluded.key_events,
         state_changes = excluded.state_changes`,
      [
        params.chapter,
        params.summary,
        params.key_events ? JSON.stringify(params.key_events) : null,
        params.state_changes ? JSON.stringify(params.state_changes) : null,
      ]
    );
    this.#persist();
  }

  getChapterSummary(chapter: number): ChapterSummaryRecord | null {
    const rows = this.#all<ChapterSummaryRecord>(
      'SELECT * FROM chapter_summaries WHERE chapter = ?',
      [chapter]
    );
    return rows[0] ?? null;
  }

  listChapterSummaryChapters(): number[] {
    return this.#all<{ chapter: number }>(
      'SELECT chapter FROM chapter_summaries ORDER BY chapter',
      []
    ).map((r) => r.chapter);
  }

  // ── Hooks ──────────────────────────────────────────────

  insertHook(params: InsertHookParams): number {
    this.db.run(
      `INSERT INTO hooks (
        planted_ch, description, status, priority,
        last_advanced, resolved_ch,
        expected_resolution_min, expected_resolution_max, is_dormant
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        params.planted_ch,
        params.description,
        params.status,
        params.priority,
        params.last_advanced ?? null,
        params.resolved_ch ?? null,
        params.expected_resolution_min ?? null,
        params.expected_resolution_max ?? null,
        params.is_dormant ? 1 : 0,
      ]
    );
    this.#persist();

    const row = this.db.exec('SELECT MAX(id) FROM hooks')[0];
    return (row.values[0][0] as number) ?? 0;
  }

  queryHooks(status: string): HookRecord[] {
    return this.#all<HookRecord>('SELECT * FROM hooks WHERE status = ? ORDER BY id', [status]);
  }

  queryActiveHooks(): HookRecord[] {
    return this.#all<HookRecord>('SELECT * FROM hooks WHERE is_dormant = 0 ORDER BY id', []);
  }

  getHook(id: number): HookRecord | null {
    const rows = this.#all<HookRecord>('SELECT * FROM hooks WHERE id = ?', [id]);
    return rows[0] ?? null;
  }

  updateHookStatus(id: number, status: string, resolvedChapter?: number): void {
    if (resolvedChapter !== undefined) {
      this.db.run('UPDATE hooks SET status = ?, resolved_ch = ? WHERE id = ?', [
        status,
        resolvedChapter,
        id,
      ]);
    } else {
      this.db.run('UPDATE hooks SET status = ? WHERE id = ?', [status, id]);
    }
    this.#persist();
  }

  // ── Snapshots ──────────────────────────────────────────

  saveSnapshot(chapter: number, data: Record<string, unknown>): void {
    this.db.run(
      `INSERT INTO memory_snapshots (chapter, snapshot)
       VALUES (?, ?)
       ON CONFLICT(chapter) DO UPDATE SET snapshot = excluded.snapshot`,
      [chapter, JSON.stringify(data)]
    );
    this.#persist();
  }

  loadSnapshot(chapter: number): Record<string, unknown> | null {
    const rows = this.db.exec(`SELECT snapshot FROM memory_snapshots WHERE chapter = ${chapter}`);
    if (rows.length === 0 || rows[0].values.length === 0) return null;
    return JSON.parse(rows[0].values[0][0] as string) as Record<string, unknown>;
  }

  listSnapshotChapters(): number[] {
    const rows = this.db.exec('SELECT chapter FROM memory_snapshots ORDER BY chapter');
    if (rows.length === 0) return [];
    return rows[0].values.map((r) => r[0] as number);
  }

  // ── Transaction ────────────────────────────────────────

  transaction<T>(fn: () => T): T {
    const saved = this.db.export();
    try {
      const result = fn();
      this.#persist();
      return result;
    } catch (err) {
      this.db = new this.sqlJs.Database(saved);
      throw err;
    }
  }

  // ── Close ──────────────────────────────────────────────

  close(): void {
    if (!this.closed) {
      this.#persist();
      this.db.close();
      this.closed = true;
    }
  }

  // ── Helpers ────────────────────────────────────────────

  #all<T>(sql: string, params: unknown[]): T[] {
    const stmt = this.db.prepare(sql);
    stmt.bind(params as (string | number | null | Uint8Array)[]);

    const results: T[] = [];
    const columns = stmt.getColumnNames();

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
}
