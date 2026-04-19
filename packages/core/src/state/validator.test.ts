import { describe, it, expect } from 'vitest';
import { validateManifest, validateDelta } from './validator';
import type { Manifest } from '../models/state';

// ── 工厂函数 ──────────────────────────────────────────────

function validManifest(): Manifest {
  const now = new Date().toISOString();
  return {
    bookId: 'book-001',
    versionToken: 1,
    lastChapterWritten: 0,
    currentFocus: '开篇',
    hooks: [],
    facts: [],
    characters: [],
    worldRules: [],
    updatedAt: now,
  };
}

// ── validateManifest ─────────────────────────────────────

describe('validateManifest', () => {
  it('passes for a valid manifest', () => {
    const manifest = validManifest();
    const result = validateManifest(manifest);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.bookId).toBe('book-001');
    }
  });

  it('returns success with the validated data', () => {
    const manifest = validManifest();
    manifest.currentFocus = '新重点';
    const result = validateManifest(manifest);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.currentFocus).toBe('新重点');
    }
  });

  it('fails when bookId is missing', () => {
    const manifest = { ...validManifest() } as Partial<Manifest>;
    delete manifest.bookId;
    const result = validateManifest(manifest);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it('fails when versionToken is not positive', () => {
    const manifest = { ...validManifest(), versionToken: 0 };
    const result = validateManifest(manifest);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors).toContainEqual(expect.stringMatching(/versionToken/));
    }
  });

  it('fails when lastChapterWritten is negative', () => {
    const manifest = { ...validManifest(), lastChapterWritten: -1 };
    const result = validateManifest(manifest);

    expect(result.success).toBe(false);
  });

  it('fails when hooks array contains invalid item', () => {
    const manifest = {
      ...validManifest(),
      hooks: [{ id: 'hook-1', status: 'invalid-status' }],
    } as unknown;
    const result = validateManifest(manifest);

    expect(result.success).toBe(false);
  });

  it('fails when facts array has bad confidence', () => {
    const manifest = {
      ...validManifest(),
      facts: [{ id: 'f1', confidence: 'impossible' }],
    } as unknown;
    const result = validateManifest(manifest);

    expect(result.success).toBe(false);
  });

  it('fails when character role is invalid', () => {
    const manifest = {
      ...validManifest(),
      characters: [{ id: 'c1', role: 'wizard' }],
    } as unknown;
    const result = validateManifest(manifest);

    expect(result.success).toBe(false);
  });

  it('handles optional currentFocus being undefined', () => {
    const manifest = { ...validManifest() } as Partial<Manifest>;
    delete manifest.currentFocus;
    const result = validateManifest(manifest);

    expect(result.success).toBe(true);
  });

  it('returns detailed error messages', () => {
    const manifest = { ...validManifest() } as Partial<Manifest>;
    delete manifest.bookId;
    const result = validateManifest({
      ...manifest,
      versionToken: -1,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
    }
  });

  // ── validateDelta ───────────────────────────────────────

  describe('validateDelta', () => {
    it('passes for a valid delta', () => {
      const delta = {
        actions: [{ type: 'add_fact', payload: { id: 'f1' } }],
      };
      const result = validateDelta(delta);

      expect(result.success).toBe(true);
    });

    it('passes for empty actions', () => {
      const delta = { actions: [] };
      const result = validateDelta(delta);

      expect(result.success).toBe(true);
    });

    it('fails when actions is not an array', () => {
      const delta = { actions: 'not-array' };
      const result = validateDelta(delta);

      expect(result.success).toBe(false);
    });

    it('fails when action type is invalid', () => {
      const delta = {
        actions: [{ type: 'invalid_action', payload: {} }],
      };
      const result = validateDelta(delta);

      expect(result.success).toBe(false);
    });

    it('fails when action is missing type', () => {
      const delta = {
        actions: [{ payload: {} }],
      };
      const result = validateDelta(delta);

      expect(result.success).toBe(false);
    });

    it('passes for all valid action types', () => {
      const types = [
        'add_hook',
        'update_hook',
        'resolve_hook',
        'add_fact',
        'update_fact',
        'add_character',
        'update_character',
        'add_world_rule',
        'update_world_rule',
        'set_focus',
        'advance_chapter',
      ];

      for (const type of types) {
        const delta = { actions: [{ type, payload: {} }] };
        const result = validateDelta(delta);
        expect(result.success).toBe(true);
      }
    });
  });
});
