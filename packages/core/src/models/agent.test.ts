import { describe, it, expect } from 'vitest';
import {
  AgentTypeSchema,
  AgentConfigSchema,
  AgentOutputSchema,
  AgentRegistrySchema,
} from './agent';

describe('Agent Schemas', () => {
  describe('AgentTypeSchema', () => {
    it('should accept valid agent types', () => {
      expect(AgentTypeSchema.parse('planner')).toBe('planner');
      expect(AgentTypeSchema.parse('auditor')).toBe('auditor');
    });

    it('should reject invalid type', () => {
      expect(() => AgentTypeSchema.parse('worker')).toThrow();
    });
  });

  describe('AgentConfigSchema', () => {
    it('should use defaults', () => {
      const config = AgentConfigSchema.parse({ name: 'TestAgent', type: 'executor' });
      expect(config.name).toBe('TestAgent');
      expect(config.temperature).toBe(0.7);
    });

    it('should accept full config', () => {
      const config = AgentConfigSchema.parse({
        name: 'Writer',
        type: 'executor',
        temperature: 0.8,
        maxTokens: 4096,
        provider: 'Claude',
        model: 'claude-sonnet-4-20250514',
      });
      expect(config.temperature).toBe(0.8);
      expect(config.maxTokens).toBe(4096);
    });

    it('should reject invalid temperature', () => {
      expect(() =>
        AgentConfigSchema.parse({ name: 'Test', type: 'executor', temperature: 3 })
      ).toThrow();
    });
  });

  describe('AgentOutputSchema', () => {
    it('should validate a valid output', () => {
      const output = AgentOutputSchema.parse({
        agentName: 'ChapterExecutor',
        content: 'Chapter text content',
        timestamp: '2026-04-21T00:00:00Z',
      });
      expect(output.agentName).toBe('ChapterExecutor');
    });

    it('should accept optional fields', () => {
      const output = AgentOutputSchema.parse({
        agentName: 'StyleRefiner',
        content: 'Refined content',
        metadata: { style: 'literary' },
        usage: { promptTokens: 100, completionTokens: 50 },
        timestamp: '2026-04-21T00:00:00Z',
      });
      expect(output.metadata?.style).toBe('literary');
      expect(output.usage?.promptTokens).toBe(100);
    });
  });

  describe('AgentRegistrySchema', () => {
    it('should validate a valid registry', () => {
      const registry = AgentRegistrySchema.parse({
        agents: [
          { name: 'Planner', type: 'planner' },
          { name: 'Executor', type: 'executor' },
        ],
        version: '1.0.0',
      });
      expect(registry.agents).toHaveLength(2);
    });
  });
});
