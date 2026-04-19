import { describe, it, expect, beforeEach } from 'vitest';
import { EntityRegistry, type EntityEntry } from './entity-registry';

describe('EntityRegistry', () => {
  let registry: EntityRegistry;

  beforeEach(() => {
    registry = new EntityRegistry();
  });

  // ── Registration ────────────────────────────────────────────

  describe('register()', () => {
    it('registers a new character entity', () => {
      const result = registry.register({
        name: '林风',
        type: 'character',
        sourceChapter: 1,
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('registered');
    });

    it('registers a new location entity', () => {
      const result = registry.register({
        name: '青云门',
        type: 'location',
        sourceChapter: 1,
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('registered');
    });

    it('registers a new item entity', () => {
      const result = registry.register({
        name: '灵剑',
        type: 'item',
        sourceChapter: 2,
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('registered');
    });

    it('registers a new organization entity', () => {
      const result = registry.register({
        name: '天剑宗',
        type: 'organization',
        sourceChapter: 1,
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('registered');
    });

    it('rejects duplicate character with same name', () => {
      registry.register({ name: '林风', type: 'character', sourceChapter: 1 });

      const result = registry.register({
        name: '林风',
        type: 'character',
        sourceChapter: 3,
      });

      expect(result.success).toBe(false);
      expect(result.action).toBe('duplicate');
      expect(result.message).toContain('重复');
    });

    it('allows same name across different entity types', () => {
      registry.register({ name: '灵剑', type: 'item', sourceChapter: 1 });

      // "灵剑" as a character name is allowed (different type)
      const result = registry.register({
        name: '灵剑',
        type: 'character',
        sourceChapter: 2,
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('registered');
    });

    it('rejects near-duplicate names (fuzzy matching)', () => {
      registry.register({ name: '林风', type: 'character', sourceChapter: 1 });

      const result = registry.register({
        name: '林风子',
        type: 'character',
        sourceChapter: 3,
      });

      expect(result.success).toBe(false);
      expect(result.action).toBe('duplicate');
    });
  });

  // ── Detection ───────────────────────────────────────────────

  describe('detectNewEntities()', () => {
    it('detects new characters from text against registry', () => {
      registry.register({ name: '林风', type: 'character', sourceChapter: 1 });

      const detected = registry.detectNewEntities(
        '林风见到了李长老，两人一起走进大殿。',
        'character'
      );

      expect(detected.newEntities.some((e) => e.includes('李长老'))).toBe(true);
      expect(detected.knownEntities).toContain('林风');
    });

    it('detects new locations from text against registry', () => {
      registry.register({ name: '青云门', type: 'location', sourceChapter: 1 });

      const detected = registry.detectNewEntities('他离开青云门，来到了后山禁地。', 'location');

      // 正则可能匹配到包含目标词的更长字符串
      expect(detected.newEntities.some((e) => e.includes('后山'))).toBe(true);
      expect(detected.knownEntities).toContain('青云门');
    });

    it('detects new items from text against registry', () => {
      registry.register({ name: '灵剑', type: 'item', sourceChapter: 1 });

      const detected = registry.detectNewEntities(
        '他从储物袋中取出神秘玉佩， alongside 灵剑。',
        'item'
      );

      expect(detected.newEntities.some((e) => e.includes('玉佩'))).toBe(true);
      expect(detected.knownEntities).toContain('灵剑');
    });

    it('detects new organizations from text against registry', () => {
      registry.register({ name: '青云门', type: 'organization', sourceChapter: 1 });
      registry.register({ name: '魔道盟', type: 'organization', sourceChapter: 2 });

      const detected = registry.detectNewEntities(
        '青云门独自前行，魔道盟暗中监视。天剑宗保持中立。',
        'organization'
      );

      expect(detected.knownEntities).toContain('青云门');
      expect(detected.knownEntities).toContain('魔道盟');
      // 新实体应该被检测到
      expect(detected.newEntities.length).toBeGreaterThan(0);
    });

    it('returns empty arrays when no entities found', () => {
      const detected = registry.detectNewEntities('他走了出去。', 'character');

      expect(detected.newEntities).toEqual([]);
      expect(detected.knownEntities).toEqual([]);
    });

    it('handles empty text gracefully', () => {
      const detected = registry.detectNewEntities('', 'character');

      expect(detected.newEntities).toEqual([]);
      expect(detected.knownEntities).toEqual([]);
    });
  });

  // ── Lookup ──────────────────────────────────────────────────

  describe('lookup()', () => {
    it('finds a registered entity by name', () => {
      registry.register({ name: '林风', type: 'character', sourceChapter: 1 });

      const entity = registry.lookup('林风');

      expect(entity).toBeDefined();
      expect(entity?.name).toBe('林风');
      expect(entity?.type).toBe('character');
    });

    it('returns undefined for unregistered entity', () => {
      const entity = registry.lookup('未知人物');

      expect(entity).toBeUndefined();
    });

    it('finds entity regardless of type when name matches', () => {
      registry.register({ name: '灵剑', type: 'item', sourceChapter: 1 });

      const entity = registry.lookup('灵剑');

      expect(entity?.type).toBe('item');
    });
  });

  // ── List / Query ────────────────────────────────────────────

  describe('listByType()', () => {
    it('returns all characters', () => {
      registry.register({ name: '林风', type: 'character', sourceChapter: 1 });
      registry.register({ name: '苏瑶', type: 'character', sourceChapter: 2 });
      registry.register({ name: '青云门', type: 'location', sourceChapter: 1 });

      const characters = registry.listByType('character');

      expect(characters).toHaveLength(2);
      expect(characters.map((e) => e.name)).toContain('林风');
      expect(characters.map((e) => e.name)).toContain('苏瑶');
    });

    it('returns all locations', () => {
      registry.register({ name: '青云门', type: 'location', sourceChapter: 1 });
      registry.register({ name: '后山', type: 'location', sourceChapter: 2 });

      const locations = registry.listByType('location');

      expect(locations).toHaveLength(2);
    });

    it('returns empty array when no entities of type', () => {
      const items = registry.listByType('item');

      expect(items).toEqual([]);
    });
  });

  describe('listAll()', () => {
    it('returns all registered entities', () => {
      registry.register({ name: '林风', type: 'character', sourceChapter: 1 });
      registry.register({ name: '青云门', type: 'location', sourceChapter: 1 });
      registry.register({ name: '灵剑', type: 'item', sourceChapter: 2 });

      const all = registry.listAll();

      expect(all).toHaveLength(3);
    });
  });

  describe('getNames()', () => {
    it('returns list of all entity names', () => {
      registry.register({ name: '林风', type: 'character', sourceChapter: 1 });
      registry.register({ name: '青云门', type: 'location', sourceChapter: 1 });

      const names = registry.getNames();

      expect(names).toContain('林风');
      expect(names).toContain('青云门');
    });

    it('filters by type', () => {
      registry.register({ name: '林风', type: 'character', sourceChapter: 1 });
      registry.register({ name: '灵剑', type: 'item', sourceChapter: 1 });

      const charNames = registry.getNames('character');

      expect(charNames).toContain('林风');
      expect(charNames).not.toContain('灵剑');
    });
  });

  // ── Removal ─────────────────────────────────────────────────

  describe('remove()', () => {
    it('removes a registered entity', () => {
      registry.register({ name: '林风', type: 'character', sourceChapter: 1 });

      const removed = registry.remove('林风');

      expect(removed).toBe(true);
      expect(registry.lookup('林风')).toBeUndefined();
    });

    it('returns false when removing non-existent entity', () => {
      const removed = registry.remove('不存在');

      expect(removed).toBe(false);
    });
  });

  // ── Bulk Registration ───────────────────────────────────────

  describe('registerBatch()', () => {
    it('registers multiple entities at once', () => {
      const entries: EntityEntry[] = [
        { name: '林风', type: 'character', sourceChapter: 1 },
        { name: '苏瑶', type: 'character', sourceChapter: 1 },
        { name: '青云门', type: 'location', sourceChapter: 1 },
      ];

      const results = registry.registerBatch(entries);

      expect(results).toHaveLength(3);
      expect(results.every((r) => r.success)).toBe(true);
    });

    it('handles duplicates in batch gracefully', () => {
      const entries: EntityEntry[] = [
        { name: '林风', type: 'character', sourceChapter: 1 },
        { name: '林风', type: 'character', sourceChapter: 2 },
      ];

      const results = registry.registerBatch(entries);

      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].action).toBe('duplicate');
    });
  });

  // ── Serialization ───────────────────────────────────────────

  describe('toJSON() / fromJSON()', () => {
    it('serializes and deserializes registry state', () => {
      registry.register({ name: '林风', type: 'character', sourceChapter: 1 });
      registry.register({ name: '青云门', type: 'location', sourceChapter: 1 });

      const json = registry.toJSON();
      const restored = EntityRegistry.fromJSON(json);

      expect(restored.listAll()).toHaveLength(2);
      expect(restored.lookup('林风')).toBeDefined();
      expect(restored.lookup('青云门')).toBeDefined();
    });

    it('preserves all entity fields through serialization', () => {
      registry.register({
        name: '林风',
        type: 'character',
        sourceChapter: 3,
        description: '主角',
        status: 'active',
      });

      const restored = EntityRegistry.fromJSON(registry.toJSON());
      const entity = restored.lookup('林风')!;

      expect(entity.sourceChapter).toBe(3);
      expect(entity.description).toBe('主角');
      expect(entity.status).toBe('active');
    });

    it('handles empty registry serialization', () => {
      const json = registry.toJSON();
      const restored = EntityRegistry.fromJSON(json);

      expect(restored.listAll()).toHaveLength(0);
    });
  });

  // ── Statistics ──────────────────────────────────────────────

  describe('stats()', () => {
    it('returns counts by type', () => {
      registry.register({ name: '林风', type: 'character', sourceChapter: 1 });
      registry.register({ name: '苏瑶', type: 'character', sourceChapter: 2 });
      registry.register({ name: '青云门', type: 'location', sourceChapter: 1 });
      registry.register({ name: '灵剑', type: 'item', sourceChapter: 1 });

      const stats = registry.stats();

      expect(stats.character).toBe(2);
      expect(stats.location).toBe(1);
      expect(stats.item).toBe(1);
      expect(stats.organization).toBe(0);
      expect(stats.total).toBe(4);
    });

    it('returns zero counts for empty registry', () => {
      const stats = registry.stats();

      expect(stats.total).toBe(0);
    });
  });
});
