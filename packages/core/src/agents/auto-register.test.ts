import { describe, it, expect } from 'vitest';
import { agentRegistry } from './registry';

// 导入 side-effect 模块触发注册
import './auto-register';

describe('Agent Auto-Registration', () => {
  it('注册所有预期的 Agent', () => {
    const expected = [
      'context-card',
      'intent-director',
      'chapter-executor',
      'scene-polisher',
      'chapter-planner',
      'quality-reviewer',
      'fact-checker',
      'surgical-rewriter',
      'memory-extractor',
      'chapter-summarizer',
      'summary-compressor',
      'audit-tier-classifier',
      'character',
      'compliance-reviewer',
      'dialogue-checker',
      'entity-auditor',
      'fatigue-analyzer',
      'hook-auditor',
      'market-injector',
      'planner',
      'style-auditor',
      'style-fingerprint',
      'style-refiner',
      'title-voice-auditor',
    ];

    for (const name of expected) {
      expect(agentRegistry.has(name)).toBe(true);
    }
  });

  it('可以通过 registry 创建已注册的 Agent', () => {
    const names = agentRegistry.list();
    expect(names.length).toBeGreaterThanOrEqual(24);

    for (const name of names) {
      const factory = agentRegistry.create.bind(agentRegistry, name, {} as never);
      expect(factory).not.toThrow(/not registered/);
    }
  });
});
