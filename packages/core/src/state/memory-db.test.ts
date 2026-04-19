import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryDB } from './memory-db';
import * as fs from 'fs';
import * as path from 'path';

describe('MemoryDB', () => {
  let tmpDir: string;
  let dbPath: string;
  let db: MemoryDB;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(process.cwd(), 'test-memory-'));
    dbPath = path.join(tmpDir, 'test-memory.db');
    db = await MemoryDB.create(dbPath);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── 初始化 ──────────────────────────────────────────────

  describe('constructor / initialization', () => {
    it('creates the database file', () => {
      expect(fs.existsSync(dbPath)).toBe(true);
    });

    it('creates all four tables', () => {
      const tables = db['db'].exec(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
      );
      const names = tables[0].values.map((v) => v[0] as string);
      expect(names).toContain('facts');
      expect(names).toContain('chapter_summaries');
      expect(names).toContain('hooks');
      expect(names).toContain('memory_snapshots');
    });

    it('creates expected indexes', () => {
      const indexes = db['db'].exec(
        "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'"
      );
      expect(indexes[0].values.length).toBe(3);
    });
  });

  // ── 事实操作 ────────────────────────────────────────────

  describe('insertFact / queryFacts', () => {
    it('inserts a fact and retrieves it', () => {
      const id = db.insertFact({
        chapter: 1,
        entity_type: 'character',
        entity_name: '林风',
        fact_text: '林风是青云门弟子',
        confidence: 'high',
      });

      expect(id).toBe(1);

      const facts = db.queryFacts(1);
      expect(facts).toHaveLength(1);
      expect(facts[0].entity_name).toBe('林风');
      expect(facts[0].fact_text).toBe('林风是青云门弟子');
    });

    it('supports medium and low confidence', () => {
      db.insertFact({
        chapter: 1,
        entity_type: 'world',
        entity_name: '青云城',
        fact_text: '城池有东门',
        confidence: 'medium',
      });

      db.insertFact({
        chapter: 1,
        entity_type: 'world',
        entity_name: '青云城',
        fact_text: '据说有密道',
        confidence: 'low',
      });

      const medium = db.queryFactsByConfidence('medium');
      expect(medium).toHaveLength(1);
      expect(medium[0].confidence).toBe('medium');
    });

    it('returns empty array when no facts for chapter', () => {
      const facts = db.queryFacts(99);
      expect(facts).toHaveLength(0);
    });

    it('queries facts by entity', () => {
      db.insertFact({
        chapter: 1,
        entity_type: 'character',
        entity_name: '林风',
        fact_text: '入门弟子',
      });
      db.insertFact({
        chapter: 2,
        entity_type: 'character',
        entity_name: '苏瑶',
        fact_text: '外门弟子',
      });

      const linFacts = db.queryFactsByEntity('character', '林风');
      expect(linFacts).toHaveLength(1);
      expect(linFacts[0].entity_name).toBe('林风');
    });

    it('queries facts within chapter range', () => {
      db.insertFact({ chapter: 1, entity_type: 'world', entity_name: '城', fact_text: '事实1' });
      db.insertFact({ chapter: 3, entity_type: 'world', entity_name: '城', fact_text: '事实2' });
      db.insertFact({ chapter: 5, entity_type: 'world', entity_name: '城', fact_text: '事实3' });

      const rangeFacts = db.queryFactsInRange(2, 4);
      expect(rangeFacts).toHaveLength(1);
      expect(rangeFacts[0].chapter).toBe(3);
    });
  });

  // ── 章节摘要操作 ────────────────────────────────────────

  describe('insertChapterSummary / getChapterSummary', () => {
    it('inserts and retrieves chapter summary', () => {
      db.insertChapterSummary({
        chapter: 1,
        summary: '主角林风入门',
        key_events: ['拜师', '测灵根'],
        state_changes: { level: 1 },
      });

      const result = db.getChapterSummary(1);
      expect(result).not.toBeNull();
      expect(result!.summary).toBe('主角林风入门');
      expect(JSON.parse(result!.key_events!)).toEqual(['拜师', '测灵根']);
    });

    it('returns null for non-existent chapter', () => {
      const result = db.getChapterSummary(99);
      expect(result).toBeNull();
    });

    it('overwrites existing summary for same chapter', () => {
      db.insertChapterSummary({ chapter: 1, summary: '第一版摘要' });
      db.insertChapterSummary({ chapter: 1, summary: '第二版摘要' });

      const result = db.getChapterSummary(1);
      expect(result!.summary).toBe('第二版摘要');
    });
  });

  // ── 伏笔操作 ────────────────────────────────────────────

  describe('insertHook / queryHooks', () => {
    it('inserts a hook and retrieves it', () => {
      const id = db.insertHook({
        planted_ch: 1,
        description: '神秘老人身份',
        status: 'open',
        priority: 'major',
        expected_resolution_min: 5,
        expected_resolution_max: 10,
      });

      expect(id).toBe(1);

      const hooks = db.queryHooks('open');
      expect(hooks).toHaveLength(1);
      expect(hooks[0].description).toBe('神秘老人身份');
    });

    it('filters hooks by status', () => {
      db.insertHook({ planted_ch: 1, description: '伏笔A', status: 'open', priority: 'major' });
      db.insertHook({ planted_ch: 2, description: '伏笔B', status: 'resolved', priority: 'minor' });
      db.insertHook({ planted_ch: 3, description: '伏笔C', status: 'open', priority: 'critical' });

      const openHooks = db.queryHooks('open');
      expect(openHooks).toHaveLength(2);

      const resolvedHooks = db.queryHooks('resolved');
      expect(resolvedHooks).toHaveLength(1);
    });

    it('updates hook status', () => {
      const id = db.insertHook({
        planted_ch: 1,
        description: '待回收伏笔',
        status: 'open',
        priority: 'major',
      });

      db.updateHookStatus(id, 'resolved', 5);

      const hook = db.getHook(id);
      expect(hook).not.toBeNull();
      expect(hook!.status).toBe('resolved');
      expect(hook!.resolved_ch).toBe(5);
    });

    it('returns null for non-existent hook', () => {
      const hook = db.getHook(999);
      expect(hook).toBeNull();
    });

    it('queries active hooks (non-dormant)', () => {
      db.insertHook({ planted_ch: 1, description: '活跃伏笔', status: 'open', priority: 'major' });
      db.insertHook({
        planted_ch: 2,
        description: '休眠伏笔',
        status: 'open',
        priority: 'minor',
        is_dormant: true,
      });

      const active = db.queryActiveHooks();
      expect(active).toHaveLength(1);
      expect(active[0].description).toBe('活跃伏笔');
    });
  });

  // ── 记忆快照操作 ───────────────────────────────────────

  describe('saveSnapshot / loadSnapshot', () => {
    it('saves and loads a snapshot', () => {
      const snapshotData = {
        hooks: [{ id: 'h1', status: 'open' }],
        facts: [{ id: 'f1', content: 'test' }],
      };

      db.saveSnapshot(1, snapshotData);

      const loaded = db.loadSnapshot(1);
      expect(loaded).not.toBeNull();
      expect(loaded!.hooks).toHaveLength(1);
      expect(loaded!.facts).toHaveLength(1);
    });

    it('returns null for non-existent snapshot', () => {
      const result = db.loadSnapshot(99);
      expect(result).toBeNull();
    });

    it('overwrites existing snapshot', () => {
      db.saveSnapshot(1, { version: 1 });
      db.saveSnapshot(1, { version: 2, extra: true });

      const loaded = db.loadSnapshot(1);
      expect(loaded!.version).toBe(2);
    });

    it('lists all snapshot chapters', () => {
      db.saveSnapshot(1, { v: 1 });
      db.saveSnapshot(3, { v: 2 });
      db.saveSnapshot(5, { v: 3 });

      const chapters = db.listSnapshotChapters();
      expect(chapters).toEqual([1, 3, 5]);
    });
  });

  // ── 事务操作 ────────────────────────────────────────────

  describe('transaction', () => {
    it('commits on success', () => {
      db.transaction(() => {
        db.insertFact({
          chapter: 1,
          entity_type: 'character',
          entity_name: '测试',
          fact_text: '事务内事实',
        });
      });

      const facts = db.queryFacts(1);
      expect(facts).toHaveLength(1);
    });

    it('rolls back on error', () => {
      expect(() => {
        db.transaction(() => {
          db.insertFact({
            chapter: 1,
            entity_type: 'character',
            entity_name: '回滚测试',
            fact_text: '应该被回滚',
          });
          throw new Error('simulate failure');
        });
      }).toThrow('simulate failure');

      const facts = db.queryFacts(1);
      expect(facts).toHaveLength(0);
    });
  });

  // ── 持久化：关闭后重启 ─────────────────────────────────

  describe('persistence', () => {
    it('persists data across reopen', async () => {
      db.insertFact({
        chapter: 1,
        entity_type: 'character',
        entity_name: '持久化测试',
        fact_text: '重启后仍然存在',
      });
      db.close();

      const db2 = await MemoryDB.create(dbPath);
      const facts = db2.queryFacts(1);
      expect(facts).toHaveLength(1);
      expect(facts[0].entity_name).toBe('持久化测试');
      db2.close();
    });
  });

  // ── 关闭 ────────────────────────────────────────────────

  describe('close', () => {
    it('closes the database connection', () => {
      db.close();
      expect(() => db.queryFacts(1)).toThrow();
    });
  });
});
