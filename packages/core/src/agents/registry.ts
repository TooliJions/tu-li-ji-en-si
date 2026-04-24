import type { LLMProvider } from '../llm/provider';
import { BaseAgent } from './base';

export type AgentFactory = (provider: LLMProvider) => BaseAgent;

export class AgentRegistry {
  private factories = new Map<string, AgentFactory>();

  register(name: string, factory: AgentFactory): void {
    this.factories.set(name, factory);
  }

  create(name: string, provider: LLMProvider): BaseAgent {
    const factory = this.factories.get(name);
    if (!factory) {
      throw new Error(`Agent "${name}" not registered`);
    }
    return factory(provider);
  }

  has(name: string): boolean {
    return this.factories.has(name);
  }

  list(): string[] {
    return Array.from(this.factories.keys());
  }
}

export const agentRegistry = new AgentRegistry();
