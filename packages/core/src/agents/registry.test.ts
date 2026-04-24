import { describe, it, expect, vi } from 'vitest';
// Import auto-register first so agentRegistry is populated before tests run
import './auto-register';
import { AgentRegistry, agentRegistry } from './registry';
import { BaseAgent } from './base';
import type { LLMProvider } from '../llm/provider';

// Mock provider for tests
function createMockProvider(): LLMProvider {
  return {
    generate: vi.fn(),
    generateJSON: vi.fn(),
    generateJSONWithMeta: vi.fn(),
  } as unknown as LLMProvider;
}

class DummyAgent extends BaseAgent {
  readonly name = 'dummy';
  readonly temperature = 0.5;

  async execute() {
    return { success: true };
  }
}

describe('AgentRegistry', () => {
  it('registers and creates an agent', () => {
    const registry = new AgentRegistry();
    const provider = createMockProvider();

    registry.register('dummy', (p) => new DummyAgent(p));

    const agent = registry.create('dummy', provider);
    expect(agent).toBeInstanceOf(DummyAgent);
    expect(agent.name).toBe('dummy');
  });

  it('throws when agent is not registered', () => {
    const registry = new AgentRegistry();
    const provider = createMockProvider();

    expect(() => registry.create('nonexistent', provider)).toThrow(
      'Agent "nonexistent" not registered'
    );
  });

  it('lists registered agents', () => {
    const registry = new AgentRegistry();
    registry.register('a', (p) => new DummyAgent(p));
    registry.register('b', (p) => new DummyAgent(p));

    expect(registry.list()).toEqual(['a', 'b']);
  });

  it('checks if an agent is registered', () => {
    const registry = new AgentRegistry();
    registry.register('existing', (p) => new DummyAgent(p));

    expect(registry.has('existing')).toBe(true);
    expect(registry.has('missing')).toBe(false);
  });

  it('global agentRegistry has all core agents registered', () => {
    // auto-register.ts should have populated the singleton
    expect(agentRegistry.has('context-card')).toBe(true);
    expect(agentRegistry.has('intent-director')).toBe(true);
    expect(agentRegistry.has('chapter-executor')).toBe(true);
    expect(agentRegistry.has('scene-polisher')).toBe(true);
    expect(agentRegistry.has('chapter-planner')).toBe(true);
    expect(agentRegistry.has('quality-reviewer')).toBe(true);
    expect(agentRegistry.has('fact-checker')).toBe(true);
    expect(agentRegistry.has('surgical-rewriter')).toBe(true);
    expect(agentRegistry.has('memory-extractor')).toBe(true);
  });

  it('global agentRegistry can create a context-card agent', () => {
    const provider = createMockProvider();
    const agent = agentRegistry.create('context-card', provider);
    expect(agent.name).toBe('ContextCard');
  });
});
