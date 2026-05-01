import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { checkWorldRules, buildMemoryDelta } from './memory-helpers';
import { StateManager } from '../state/manager';
import { RuntimeStateStore } from '../state/runtime-store';
import type { Manifest } from '../models/state';
import type { LLMProvider } from '../llm/provider';

describe('memory-helpers', () => {
  let tmpDir: string;
  let stateManager: StateManager;
  let stateStore: RuntimeStateStore;
  const bookId = 'book-test-001';

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(process.env.TEMP ?? '/tmp', 'mem-test-'));
    stateManager = new StateManager(tmpDir);
    stateStore = new RuntimeStateStore(stateManager);
    stateManager.ensureBookStructure(bookId);
    stateStore.initializeBookState(bookId);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── checkWorldRules ───────────────────────────────────────────

  describe('checkWorldRules', () => {
    it('returns empty array when no rules', async () => {
      const result = await checkWorldRules('content', 1, [], mockProvider());
      expect(result).toEqual([]);
    });

    it('returns violations from LLM', async () => {
      const provider = mockProvider({
        generateJSON: async () => [{ ruleId: 'rule-1', violation: '违反了灵气规则' }],
      });
      const rules = [{ id: 'rule-1', category: 'magic', rule: '灵气有限', exceptions: [] }];

      const result = await checkWorldRules('content', 1, rules, provider);

      expect(result).toHaveLength(1);
      expect(result[0]).toContain('违反了灵气规则');
    });

    it('returns empty array on LLM error', async () => {
      const provider = mockProvider({
        generateJSON: async () => {
          throw new Error('fail');
        },
      });
      const rules = [{ id: 'rule-1', category: 'magic', rule: '规则', exceptions: [] }];

      const result = await checkWorldRules('content', 1, rules, provider);
      expect(result).toEqual([]);
    });
  });

  // ── buildMemoryDelta ──────────────────────────────────────────

  describe('buildMemoryDelta', () => {
    const baseManifest = (): Manifest => ({
      bookId,
      versionToken: 1,
      lastChapterWritten: 0,
      currentFocus: undefined,
      hooks: [],
      facts: [],
      characters: [],
      worldRules: [],
      updatedAt: new Date().toISOString(),
    });

    it('returns empty actions when no facts or hooks', () => {
      const manifest = baseManifest();
      const result = buildMemoryDelta({ facts: [], newHooks: [], updatedHooks: [] }, manifest, 1);
      expect(result).toEqual([]);
    });

    it('creates add_fact actions', () => {
      const manifest = baseManifest();
      const result = buildMemoryDelta(
        {
          facts: [{ content: '林风是青云门弟子', category: 'character', confidence: 'high' }],
          newHooks: [],
          updatedHooks: [],
        },
        manifest,
        1,
      );

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('add_fact');
      expect(result[0].payload.content).toBe('林风是青云门弟子');
    });

    it('skips duplicate facts in same chapter', () => {
      const manifest = baseManifest();
      manifest.facts = [
        {
          id: 'f1',
          content: '已有事实',
          chapterNumber: 1,
          confidence: 'high',
          category: 'plot',
          createdAt: '',
        },
      ];
      const result = buildMemoryDelta(
        {
          facts: [{ content: '已有事实', category: 'plot', confidence: 'medium' }],
          newHooks: [],
          updatedHooks: [],
        },
        manifest,
        1,
      );

      expect(result).toHaveLength(0);
    });

    it('upgrades confidence for cross-chapter duplicates', () => {
      const manifest = baseManifest();
      manifest.facts = [
        {
          id: 'f1',
          content: '已有事实',
          chapterNumber: 2,
          confidence: 'medium',
          category: 'plot',
          createdAt: '',
        },
      ];
      const result = buildMemoryDelta(
        {
          facts: [{ content: '已有事实', category: 'plot', confidence: 'medium' }],
          newHooks: [],
          updatedHooks: [],
        },
        manifest,
        1,
      );

      expect(result).toHaveLength(2);
      expect(result.some((a) => a.type === 'update_fact' && a.payload.confidence === 'high')).toBe(
        true,
      );
    });

    it('creates add_hook actions', () => {
      const manifest = baseManifest();
      const result = buildMemoryDelta(
        {
          facts: [],
          newHooks: [
            {
              id: 'h1',
              description: '神秘玉佩',
              type: 'narrative',
              status: 'open',
              priority: 'major',
            },
          ],
          updatedHooks: [],
        },
        manifest,
        1,
      );

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('add_hook');
    });

    it('skips duplicate hooks', () => {
      const manifest = baseManifest();
      manifest.hooks = [
        {
          id: 'h1',
          description: '神秘玉佩',
          type: 'narrative',
          status: 'open',
          priority: 'major',
          plantedChapter: 1,
          relatedCharacters: [],
          relatedChapters: [],
          createdAt: '',
          updatedAt: '',
        },
      ];
      const result = buildMemoryDelta(
        {
          facts: [],
          newHooks: [{ id: 'h1', description: '神秘玉佩' }],
          updatedHooks: [],
        },
        manifest,
        1,
      );

      expect(result).toHaveLength(0);
    });

    it('creates update_hook actions', () => {
      const manifest = baseManifest();
      manifest.hooks = [
        {
          id: 'h1',
          description: '神秘玉佩',
          type: 'narrative',
          status: 'open',
          priority: 'major',
          plantedChapter: 1,
          relatedCharacters: [],
          relatedChapters: [],
          createdAt: '',
          updatedAt: '',
        },
      ];
      const result = buildMemoryDelta(
        {
          facts: [],
          newHooks: [],
          updatedHooks: [{ id: 'h1', status: 'progressing' }],
        },
        manifest,
        1,
      );

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('update_hook');
    });

    it('filters undefined payload values', () => {
      const manifest = baseManifest();
      const result = buildMemoryDelta(
        {
          facts: [{ content: '事实', category: 'plot', confidence: 'high' }],
          newHooks: [],
          updatedHooks: [],
        },
        manifest,
        1,
      );

      const addFact = result.find((a) => a.type === 'add_fact');
      expect(addFact).toBeDefined();
      // undefined values should be filtered from payload
      const payload = addFact!.payload as Record<string, unknown>;
      expect(Object.values(payload).some((v) => v === undefined)).toBe(false);
    });
  });
});

// ── Helpers ──────────────────────────────────────────────────────

function mockProvider(overrides: Partial<LLMProvider> = {}): LLMProvider {
  return {
    generate: vi.fn().mockResolvedValue({ text: '', usage: undefined }),
    generateJSON: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as LLMProvider;
}
