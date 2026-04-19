import { describe, it, expect } from 'vitest';
import { FanficMode, buildFanficConstraints, buildFanficPrompt, applyFanficMode } from './fanfic';

describe('Fanfic Core', () => {
  describe('FanficMode enum', () => {
    it('defines four modes', () => {
      expect(FanficMode.CANON).toBe('canon');
      expect(FanficMode.AU).toBe('au');
      expect(FanficMode.OOC).toBe('ooc');
      expect(FanficMode.CP).toBe('cp');
    });
  });

  describe('buildFanficConstraints', () => {
    it('returns canon constraints', () => {
      const constraints = buildFanficConstraints('canon');
      expect(constraints.must).toContain('遵循原作世界观和角色设定');
      expect(constraints.mode).toBe('canon');
    });

    it('returns AU constraints', () => {
      const constraints = buildFanficConstraints('au');
      expect(constraints.must).toContain('角色核心特质必须保留');
      expect(constraints.can).toContain('自由构建世界观');
      expect(constraints.mode).toBe('au');
    });

    it('returns OOC constraints', () => {
      const constraints = buildFanficConstraints('ooc');
      expect(constraints.must).toContain('角色性格可以发生显著偏离');
      expect(constraints.cannot).toContain('无理由的性格突变');
      expect(constraints.mode).toBe('ooc');
    });

    it('returns CP constraints', () => {
      const constraints = buildFanficConstraints('cp');
      expect(constraints.must).toContain('以角色配对关系为核心驱动');
      expect(constraints.mode).toBe('cp');
    });

    it('returns generic constraints for unknown mode', () => {
      const constraints = buildFanficConstraints('unknown' as any);
      expect(constraints.must.length).toBe(0);
      expect(constraints.mode).toBe('unknown');
    });
  });

  describe('buildFanficPrompt', () => {
    it('builds prompt with constraints for canon mode', () => {
      const prompt = buildFanficPrompt('canon', '这是一个侦探故事');
      expect(prompt).toContain('CANON');
      expect(prompt).toContain('侦探故事');
      expect(prompt).toContain('遵循原作');
    });

    it('includes custom description in prompt', () => {
      const prompt = buildFanficPrompt('au', '假如他们在太空站相遇');
      expect(prompt).toContain('太空站');
    });

    it('includes canon reference text when provided', () => {
      const prompt = buildFanficPrompt('canon', '', '正典参考内容');
      expect(prompt).toContain('正典参考');
    });

    it('formats constraints as bullet list', () => {
      const prompt = buildFanficPrompt('ooc', '假如反派突然变善良');
      // Each constraint should start with "- "
      expect(prompt).toMatch(/^- /m);
    });
  });

  describe('applyFanficMode', () => {
    it('injects constraints into base prompt', () => {
      const basePrompt = '请续写下一章';
      const result = applyFanficMode('canon', basePrompt, '原作设定说明');
      expect(result).toContain('请续写下一章');
      expect(result).toContain('遵循原作世界观');
      expect(result).toContain('正典参考');
    });

    it('works without canon reference', () => {
      const basePrompt = '请续写下一章';
      const result = applyFanficMode('au', basePrompt);
      expect(result).toContain('请续写下一章');
      expect(result).toContain('AU');
      expect(result).not.toContain('正典参考');
    });

    it('applies all four modes correctly', () => {
      const modes = ['canon', 'au', 'ooc', 'cp'] as const;
      const basePrompt = '写一章小说';

      for (const mode of modes) {
        const result = applyFanficMode(mode, basePrompt);
        expect(result).toContain(basePrompt);
        expect(result.length).toBeGreaterThan(basePrompt.length);
      }
    });

    it('throws on empty mode', () => {
      expect(() => applyFanficMode('' as any, 'test')).toThrow();
    });
  });
});
