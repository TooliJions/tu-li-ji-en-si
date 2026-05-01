import { describe, it, expect } from 'vitest';
import {
  AUDIT_DIMENSIONS,
  getDimensionById,
  getDimensionByName,
  getDimensionsByTier,
  buildDimensionPromptSection,
} from './audit-dimensions';

describe('audit-dimensions', () => {
  it('has exactly 33 dimensions', () => {
    expect(AUDIT_DIMENSIONS).toHaveLength(33);
  });

  it('has unique sequential ids from 1 to 33', () => {
    const ids = AUDIT_DIMENSIONS.map((d) => d.id);
    expect(new Set(ids).size).toBe(33);
    expect(Math.min(...ids)).toBe(1);
    expect(Math.max(...ids)).toBe(33);
  });

  it('has unique names', () => {
    const names = AUDIT_DIMENSIONS.map((d) => d.name);
    expect(new Set(names).size).toBe(33);
  });

  it('has correct tier distribution', () => {
    const blockers = AUDIT_DIMENSIONS.filter((d) => d.tier === 'blocker');
    const warnings = AUDIT_DIMENSIONS.filter((d) => d.tier === 'warning');
    const suggestions = AUDIT_DIMENSIONS.filter((d) => d.tier === 'suggestion');
    expect(blockers).toHaveLength(12);
    expect(warnings).toHaveLength(12);
    expect(suggestions).toHaveLength(9);
  });

  it('every dimension has all required fields', () => {
    for (const d of AUDIT_DIMENSIONS) {
      expect(d.id).toBeGreaterThan(0);
      expect(d.name).toBeTruthy();
      expect(d.displayName).toBeTruthy();
      expect(['blocker', 'warning', 'suggestion']).toContain(d.tier);
      expect(d.weight).toBeGreaterThan(0);
      expect(d.description).toBeTruthy();
    }
  });

  it('blockers have weight 1.0', () => {
    for (const d of AUDIT_DIMENSIONS) {
      if (d.tier === 'blocker') {
        expect(d.weight).toBe(1.0);
      }
    }
  });

  describe('getDimensionById', () => {
    it('returns dimension for valid id', () => {
      const d = getDimensionById(1);
      expect(d).toBeDefined();
      expect(d!.id).toBe(1);
    });

    it('returns undefined for invalid id', () => {
      expect(getDimensionById(0)).toBeUndefined();
      expect(getDimensionById(34)).toBeUndefined();
    });
  });

  describe('getDimensionByName', () => {
    it('returns dimension for valid name', () => {
      const d = getDimensionByName('character_state_consistency');
      expect(d).toBeDefined();
      expect(d!.name).toBe('character_state_consistency');
    });

    it('returns undefined for invalid name', () => {
      expect(getDimensionByName('nonexistent')).toBeUndefined();
    });
  });

  describe('getDimensionsByTier', () => {
    it('returns correct counts', () => {
      expect(getDimensionsByTier('blocker')).toHaveLength(12);
      expect(getDimensionsByTier('warning')).toHaveLength(12);
      expect(getDimensionsByTier('suggestion')).toHaveLength(9);
    });

    it('returns empty array for invalid tier', () => {
      expect(getDimensionsByTier('invalid' as never)).toHaveLength(0);
    });
  });

  describe('buildDimensionPromptSection', () => {
    it('includes all tiers', () => {
      const section = buildDimensionPromptSection();
      expect(section).toContain('阻断级');
      expect(section).toContain('警告级');
      expect(section).toContain('建议级');
    });

    it('includes dimension details', () => {
      const section = buildDimensionPromptSection();
      expect(section).toContain('角色状态一致性');
      expect(section).toContain('character_state_consistency');
    });

    it('counts correct totals per tier', () => {
      const section = buildDimensionPromptSection();
      expect(section).toContain('阻断级（12 维）');
      expect(section).toContain('警告级（12 维）');
      expect(section).toContain('建议级（9 维）');
    });
  });
});
