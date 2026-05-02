// CyberNovelist Core — Public API Facade
// Re-export all public interfaces from the core engine

export * from './utils';
export * from './llm/provider';
export * from './llm/output-validator';
export * from './llm/routed-provider';
export * from './llm/claude-provider';
export * from './llm/ollama-provider';
export * from './llm/dashscope-provider';
export * from './llm/gemini-provider';
export * from './llm/deepseek-provider';
export * from './models/schemas';
export * from './state/manager';
export * from './state/runtime-store';
export * from './state/reducer';
export * from './state/validator';
export * from './state/snapshot';
export * from './state/bootstrap';
export * from './state/recovery';
export * from './state/lock-manager';
export * from './state/reorg-lock';
export * from './state/sync-validator';
export * from './state/state-importer';
export {
  MemoryDB,
  type InsertFactParams,
  type FactRecord,
  type InsertChapterSummaryParams,
  type ChapterSummaryRecord as MemoryDBChapterSummaryRecord,
  type InsertHookParams,
  type HookRecord,
} from './state/memory-db';
export { ProjectionRenderer, type ProjectionFile } from './state/projections';
export { type ChapterSummaryRecord as ProjectionChapterSummaryRecord } from './models/state';
export {
  HookPolicy,
  type WakePolicy,
  type ResolutionWindow,
  type HookPolicyConfig,
  type HookPolicyStatus,
} from './governance/hook-policy';
export {
  HookAgenda,
  type HookScheduleItem,
  type OverdueReport,
  type WakeResult as HookAgendaWakeResult,
  type WakeDeferredResult,
} from './governance/hook-agenda';
export {
  HookGovernance,
  type AdmissionResult,
  type PayoffValidation,
  type HealthReport,
  type DormantResult,
  type IntentResult,
  type WakeResult as HookGovernanceWakeResult,
} from './governance/hook-governance';
export { AgentRegistry, agentRegistry, type AgentFactory } from './agents/registry';
export * from './agents/base';
export * from './agents/planner';
export * from './agents/character';
export * from './agents/chapter-planner';
export * from './agents/executor';
export * from './agents/context-card';
export * from './agents/scene-polisher';
export * from './agents/style-refiner';
export * from './agents/intent-director';
export * from './agents/memory-extractor';
export {
  QualityReviewer,
  type QualityIssueLocation,
  type QualityIssue,
  type ChapterPlanContext,
  type ReviewInput,
  type ReviewOutput,
} from './agents/quality-reviewer';
export * from './agents/fact-checker';
export {
  EntityAuditor,
  type EntityRecord,
  type EntityIssue,
  type EntityAuditInput,
  type EntityAuditOutput,
} from './agents/entity-auditor';
export * from './agents/style-auditor';
export * from './agents/title-voice-auditor';
export {
  ComplianceReviewer,
  type ComplianceIssueLocation,
  type ComplianceIssue,
  type ComplianceInput,
  type ComplianceOutput,
} from './agents/compliance-reviewer';
export * from './agents/hook-auditor';
export * from './agents/fatigue-analyzer';
export {
  AuditTierClassifier,
  type ClassifiedIssue,
  type TierSummary,
  type AuditInput as AuditTierInput,
  type AuditOutput as AuditTierOutput,
} from './agents/audit-tier-classifier';
export * from './agents/market-injector';
export * from './agents/surgical-rewriter';
export * from './agents/entity-registry';

// Pipeline
export * from './pipeline/runner';
export * from './pipeline/persistence';
export * from './pipeline/restructurer';
export * from './pipeline/revision-loop';
export { AtomicPipelineOps, type AtomicOperationResult } from './pipeline/atomic-ops';
export * from './pipeline/truth-validation';
export { DetectionRunner, type DetectionInput } from './pipeline/detection-runner';

// Export
export * from './export/epub';
export * from './export/markdown';
export * from './export/txt';
export * from './export/platform-adapter';

// Governance
export * from './governance/hook-admission';
export * from './governance/hook-arbiter';
export * from './governance/hook-lifecycle';
export * from './governance/rule-stack-compiler';
export * from './governance/context-governor';

// Other Modules
export * from './prompts/index';

// Quality & Telemetry
export * from './telemetry/logger';
export * from './quality/ai-detector';
export * from './quality/baseline';
export * from './quality/analytics-aggregator';
export * from './quality/emotional-arc-tracker';

export * from './errors';

// Workflow
export * from './workflow/contracts';
export * from './workflow/services';
