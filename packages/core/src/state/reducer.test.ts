import { describe, it, expect } from 'vitest';
import { applyRuntimeStateDelta } from './reducer';
import type { Manifest } from '../models/state';

// ── 工厂函数 ──────────────────────────────────────────────

function createEmptyManifest(): Manifest {
  const now = new Date().toISOString();
  return {
    bookId: 'test-book',
    versionToken: 1,
    lastChapterWritten: 0,
    currentFocus: 'test',
    hooks: [],
    facts: [],
    characters: [],
    worldRules: [],
    updatedAt: now,
  };
}

function createManifestWithHooks(): Manifest {
  const now = new Date().toISOString();
  return {
    ...createEmptyManifest(),
    hooks: [
      {
        id: 'hook-001',
        description: '神秘老人',
        type: 'character',
        status: 'open',
        priority: 'major',
        plantedChapter: 1,
        relatedCharacters: [],
        relatedChapters: [],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'hook-002',
        description: '失传秘籍',
        type: 'plot',
        status: 'progressing',
        priority: 'critical',
        plantedChapter: 2,
        expectedResolutionMin: 5,
        expectedResolutionMax: 10,
        relatedCharacters: [],
        relatedChapters: [],
        createdAt: now,
        updatedAt: now,
      },
    ],
  };
}

// ── 测试 ──────────────────────────────────────────────────

describe('applyRuntimeStateDelta', () => {
  // ── 不可变性 ────────────────────────────────────────────

  it('returns a new object, original unchanged', () => {
    const original = createEmptyManifest();
    const updated = applyRuntimeStateDelta(original, {
      actions: [],
      sourceChapter: 1,
    });

    expect(updated).not.toBe(original);
    expect(original.versionToken).toBe(1);
  });

  // ── set_focus ───────────────────────────────────────────

  it('updates currentFocus via set_focus', () => {
    const state = createEmptyManifest();
    const updated = applyRuntimeStateDelta(state, {
      actions: [
        {
          type: 'set_focus',
          payload: { focus: '新的写作重点' },
        },
      ],
      sourceChapter: 1,
    });

    expect(updated.currentFocus).toBe('新的写作重点');
    expect(state.currentFocus).toBe('test');
  });

  // ── advance_chapter ────────────────────────────────────

  it('advances lastChapterWritten via advance_chapter', () => {
    const state = createEmptyManifest();
    const updated = applyRuntimeStateDelta(state, {
      actions: [
        {
          type: 'advance_chapter',
          payload: { chapterNumber: 5 },
        },
      ],
      sourceChapter: 5,
    });

    expect(updated.lastChapterWritten).toBe(5);
  });

  // ── 伏笔 upsert ─────────────────────────────────────────

  it('adds new hook via add_hook', () => {
    const state = createEmptyManifest();
    const now = new Date().toISOString();
    const updated = applyRuntimeStateDelta(state, {
      actions: [
        {
          type: 'add_hook',
          payload: {
            id: 'hook-new',
            description: '新伏笔',
            type: 'plot',
            status: 'open',
            priority: 'minor',
            plantedChapter: 3,
            relatedCharacters: [],
            relatedChapters: [],
            createdAt: now,
            updatedAt: now,
          },
        },
      ],
      sourceChapter: 3,
    });

    expect(updated.hooks).toHaveLength(1);
    expect(updated.hooks[0].id).toBe('hook-new');
  });

  it('updates existing hook via update_hook', () => {
    const state = createManifestWithHooks();
    const updated = applyRuntimeStateDelta(state, {
      actions: [
        {
          type: 'update_hook',
          payload: {
            id: 'hook-001',
            description: '神秘老人 — 其实是主角父亲',
            expectedResolutionMin: 8,
          },
        },
      ],
      sourceChapter: 3,
    });

    expect(updated.hooks).toHaveLength(2);
    const hook = updated.hooks.find((h) => h.id === 'hook-001')!;
    expect(hook.description).toBe('神秘老人 — 其实是主角父亲');
    expect(hook.expectedResolutionMin).toBe(8);
    // Unchanged fields remain
    expect(hook.priority).toBe('major');
    expect(hook.plantedChapter).toBe(1);
  });

  it('throws when update_hook targets non-existent hook', () => {
    const state = createEmptyManifest();
    expect(() =>
      applyRuntimeStateDelta(state, {
        actions: [
          {
            type: 'update_hook',
            payload: { id: 'nonexistent', description: 'should fail' },
          },
        ],
        sourceChapter: 1,
      })
    ).toThrow(/hook.*not found/i);
  });

  // ── 伏笔 resolve ────────────────────────────────────────

  it('resolves hook via resolve_hook', () => {
    const state = createManifestWithHooks();
    const updated = applyRuntimeStateDelta(state, {
      actions: [
        {
          type: 'resolve_hook',
          payload: {
            id: 'hook-001',
            payoffDescription: '神秘老人身份揭晓',
          },
        },
      ],
      sourceChapter: 5,
    });

    const hook = updated.hooks.find((h) => h.id === 'hook-001')!;
    expect(hook.status).toBe('resolved');
    expect(hook.payoffDescription).toBe('神秘老人身份揭晓');
  });

  it('throws when resolve_hook targets non-existent hook', () => {
    const state = createEmptyManifest();
    expect(() =>
      applyRuntimeStateDelta(state, {
        actions: [
          {
            type: 'resolve_hook',
            payload: { id: 'missing' },
          },
        ],
        sourceChapter: 1,
      })
    ).toThrow(/hook.*not found/i);
  });

  // ── 伏笔 defer ──────────────────────────────────────────

  it('defers hook via update_hook with status=deferred', () => {
    const state = createManifestWithHooks();
    const updated = applyRuntimeStateDelta(state, {
      actions: [
        {
          type: 'update_hook',
          payload: {
            id: 'hook-002',
            status: 'deferred',
            wakeAtChapter: 10,
          },
        },
      ],
      sourceChapter: 4,
    });

    const hook = updated.hooks.find((h) => h.id === 'hook-002')!;
    expect(hook.status).toBe('deferred');
    expect(hook.wakeAtChapter).toBe(10);
  });

  // ── 伏笔 dormant ────────────────────────────────────────

  it('sets hook to dormant via update_hook with status=dormant', () => {
    const state = createManifestWithHooks();
    const updated = applyRuntimeStateDelta(state, {
      actions: [
        {
          type: 'update_hook',
          payload: { id: 'hook-001', status: 'dormant' },
        },
      ],
      sourceChapter: 6,
    });

    const hook = updated.hooks.find((h) => h.id === 'hook-001')!;
    expect(hook.status).toBe('dormant');
  });

  // ── 伏笔 abandon ────────────────────────────────────────

  it('abandons hook via update_hook with status=abandoned', () => {
    const state = createManifestWithHooks();
    const updated = applyRuntimeStateDelta(state, {
      actions: [
        {
          type: 'update_hook',
          payload: { id: 'hook-001', status: 'abandoned' },
        },
      ],
      sourceChapter: 6,
    });

    const hook = updated.hooks.find((h) => h.id === 'hook-001')!;
    expect(hook.status).toBe('abandoned');
  });

  // ── 事实操作 ────────────────────────────────────────────

  it('adds fact via add_fact', () => {
    const state = createEmptyManifest();
    const now = new Date().toISOString();
    const updated = applyRuntimeStateDelta(state, {
      actions: [
        {
          type: 'add_fact',
          payload: {
            id: 'fact-001',
            content: '青云城是故事起点',
            chapterNumber: 1,
            confidence: 'high',
            category: 'world',
            createdAt: now,
          },
        },
      ],
      sourceChapter: 1,
    });

    expect(updated.facts).toHaveLength(1);
    expect(updated.facts[0].content).toBe('青云城是故事起点');
  });

  it('updates fact via update_fact', () => {
    const now = new Date().toISOString();
    const state: Manifest = {
      ...createEmptyManifest(),
      facts: [
        {
          id: 'fact-001',
          content: '初始内容',
          chapterNumber: 1,
          confidence: 'low',
          category: 'character',
          createdAt: now,
        },
      ],
    };

    const updated = applyRuntimeStateDelta(state, {
      actions: [
        {
          type: 'update_fact',
          payload: {
            id: 'fact-001',
            confidence: 'high',
            content: '更新后的内容',
          },
        },
      ],
      sourceChapter: 3,
    });

    const fact = updated.facts.find((f) => f.id === 'fact-001')!;
    expect(fact.content).toBe('更新后的内容');
    expect(fact.confidence).toBe('high');
  });

  it('throws when update_fact targets non-existent fact', () => {
    const state = createEmptyManifest();
    expect(() =>
      applyRuntimeStateDelta(state, {
        actions: [
          {
            type: 'update_fact',
            payload: { id: 'missing', content: 'fail' },
          },
        ],
        sourceChapter: 1,
      })
    ).toThrow(/fact.*not found/i);
  });

  // ── 角色操作 ────────────────────────────────────────────

  it('adds character via add_character', () => {
    const state = createEmptyManifest();
    const updated = applyRuntimeStateDelta(state, {
      actions: [
        {
          type: 'add_character',
          payload: {
            id: 'char-001',
            name: '林风',
            role: 'protagonist',
            traits: ['勇敢'],
            relationships: {},
          },
        },
      ],
      sourceChapter: 1,
    });

    expect(updated.characters).toHaveLength(1);
    expect(updated.characters[0].name).toBe('林风');
  });

  it('updates character via update_character', () => {
    const state: Manifest = {
      ...createEmptyManifest(),
      characters: [
        {
          id: 'char-001',
          name: '林风',
          role: 'protagonist',
          traits: ['勇敢'],
          relationships: {},
        },
      ],
    };

    const updated = applyRuntimeStateDelta(state, {
      actions: [
        {
          type: 'update_character',
          payload: {
            id: 'char-001',
            traits: ['勇敢', '坚韧'],
            lastAppearance: 5,
          },
        },
      ],
      sourceChapter: 5,
    });

    const char = updated.characters.find((c) => c.id === 'char-001')!;
    expect(char.traits).toEqual(['勇敢', '坚韧']);
    expect(char.lastAppearance).toBe(5);
  });

  it('throws when update_character targets non-existent character', () => {
    const state = createEmptyManifest();
    expect(() =>
      applyRuntimeStateDelta(state, {
        actions: [
          {
            type: 'update_character',
            payload: { id: 'missing' },
          },
        ],
        sourceChapter: 1,
      })
    ).toThrow(/character.*not found/i);
  });

  // ── 世界规则操作 ────────────────────────────────────────

  it('adds world rule via add_world_rule', () => {
    const state = createEmptyManifest();
    const updated = applyRuntimeStateDelta(state, {
      actions: [
        {
          type: 'add_world_rule',
          payload: {
            id: 'rule-001',
            category: 'magic-system',
            rule: '灵力等级分为九级',
            exceptions: [],
          },
        },
      ],
      sourceChapter: 1,
    });

    expect(updated.worldRules).toHaveLength(1);
    expect(updated.worldRules[0].rule).toBe('灵力等级分为九级');
  });

  it('updates world rule via update_world_rule', () => {
    const state: Manifest = {
      ...createEmptyManifest(),
      worldRules: [
        {
          id: 'rule-001',
          category: 'magic-system',
          rule: '灵力等级分为九级',
          exceptions: [],
        },
      ],
    };

    const updated = applyRuntimeStateDelta(state, {
      actions: [
        {
          type: 'update_world_rule',
          payload: {
            id: 'rule-001',
            exceptions: ['天灵根除外'],
          },
        },
      ],
      sourceChapter: 2,
    });

    const rule = updated.worldRules.find((r) => r.id === 'rule-001')!;
    expect(rule.exceptions).toEqual(['天灵根除外']);
    expect(rule.rule).toBe('灵力等级分为九级');
  });

  it('throws when update_world_rule targets non-existent rule', () => {
    const state = createEmptyManifest();
    expect(() =>
      applyRuntimeStateDelta(state, {
        actions: [
          {
            type: 'update_world_rule',
            payload: { id: 'missing', rule: 'fail' },
          },
        ],
        sourceChapter: 1,
      })
    ).toThrow(/world rule.*not found/i);
  });

  // ── 多操作组合 ──────────────────────────────────────────

  it('applies multiple actions in sequence', () => {
    const state = createEmptyManifest();
    const now = new Date().toISOString();
    const updated = applyRuntimeStateDelta(state, {
      actions: [
        {
          type: 'add_character',
          payload: {
            id: 'char-001',
            name: '林风',
            role: 'protagonist',
            traits: [],
            relationships: {},
          },
        },
        {
          type: 'add_fact',
          payload: {
            id: 'fact-001',
            content: '主角出生在青云城',
            chapterNumber: 1,
            confidence: 'high',
            category: 'character',
            createdAt: now,
          },
        },
        {
          type: 'set_focus',
          payload: { focus: '开篇介绍主角' },
        },
      ],
      sourceChapter: 1,
    });

    expect(updated.characters).toHaveLength(1);
    expect(updated.facts).toHaveLength(1);
    expect(updated.currentFocus).toBe('开篇介绍主角');
  });

  // ── 空操作 ──────────────────────────────────────────────

  it('returns a copy when no actions provided', () => {
    const state = createEmptyManifest();
    const updated = applyRuntimeStateDelta(state, {
      actions: [],
    });

    expect(updated).not.toBe(state);
    expect(updated.versionToken).toBe(state.versionToken + 1);
    expect(updated.hooks).toEqual(state.hooks);
  });

  // ── versionToken 递增 ──────────────────────────────────

  it('increments versionToken after applying actions', () => {
    const state = createEmptyManifest();
    const updated = applyRuntimeStateDelta(state, {
      actions: [
        {
          type: 'add_fact',
          payload: {
            id: 'fact-001',
            content: 'test',
            chapterNumber: 1,
            confidence: 'high',
            category: 'world',
            createdAt: new Date().toISOString(),
          },
        },
      ],
      sourceChapter: 1,
    });

    expect(updated.versionToken).toBe(state.versionToken + 1);
  });

  // ── updatedAt 更新 ─────────────────────────────────────

  it('updates updatedAt timestamp', () => {
    const state = createEmptyManifest();
    state.updatedAt = '2020-01-01T00:00:00.000Z';
    const updated = applyRuntimeStateDelta(state, {
      actions: [{ type: 'set_focus', payload: { focus: 'new' } }],
    });

    expect(updated.updatedAt).not.toBe('2020-01-01T00:00:00.000Z');
  });
});
