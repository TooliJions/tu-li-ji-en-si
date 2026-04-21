import { z } from 'zod';

// ─── Agent Type ──────────────────────────────────────────────

export const AgentTypeSchema = z.enum(['planner', 'executor', 'auditor', 'special']);

export type AgentType = z.infer<typeof AgentTypeSchema>;

// ─── Agent Config ────────────────────────────────────────────

export const AgentConfigSchema = z.object({
  name: z.string(),
  type: AgentTypeSchema,
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().int().min(1).optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

// ─── Agent Output ────────────────────────────────────────────

export const AgentOutputSchema = z.object({
  agentName: z.string(),
  content: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  usage: z
    .object({
      promptTokens: z.number(),
      completionTokens: z.number(),
    })
    .optional(),
  timestamp: z.string(),
});

export type AgentOutput = z.infer<typeof AgentOutputSchema>;

// ─── Agent Registry ──────────────────────────────────────────

export const AgentRegistrySchema = z.object({
  agents: z.array(AgentConfigSchema),
  version: z.string(),
});

export type AgentRegistry = z.infer<typeof AgentRegistrySchema>;
