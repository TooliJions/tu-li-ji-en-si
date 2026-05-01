import { z } from 'zod';

// ─── Runtime State Schemas ──────────────────────────────────────

export const HookStatusSchema = z.enum([
  'open',
  'progressing',
  'deferred',
  'dormant',
  'resolved',
  'abandoned',
]);

export const HookPrioritySchema = z.enum(['critical', 'major', 'minor']);

export const HookSchema = z.object({
  id: z.string(),
  description: z.string(),
  type: z.string(), // narrative / character / plot / world
  status: HookStatusSchema,
  priority: HookPrioritySchema,
  plantedChapter: z.number().int().positive(),
  expectedResolutionMin: z.number().int().positive().optional(),
  expectedResolutionMax: z.number().int().positive().optional(),
  wakeAtChapter: z.number().int().positive().optional(),
  relatedCharacters: z.array(z.string()).default([]),
  relatedChapters: z.array(z.number().int().positive()).default([]),
  payoffDescription: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Hook = z.infer<typeof HookSchema>;

// ─── Memory / Fact Schemas ──────────────────────────────────────

export const FactConfidenceSchema = z.enum(['high', 'medium', 'low']);

export const FactSchema = z.object({
  id: z.string(),
  content: z.string(),
  chapterNumber: z.number().int().positive(),
  confidence: FactConfidenceSchema.default('high'),
  category: z.enum(['character', 'world', 'plot', 'timeline', 'resource']),
  createdAt: z.string().datetime(),
});

export type Fact = z.infer<typeof FactSchema>;

// ─── Character Schemas ──────────────────────────────────────────

export const CharacterSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.enum(['protagonist', 'antagonist', 'supporting', 'minor']),
  traits: z.array(z.string()),
  relationships: z.record(z.string(), z.string()).default({}), // characterId -> relationship desc
  arc: z.string().optional(),
  firstAppearance: z.number().int().positive().optional(),
  lastAppearance: z.number().int().positive().optional(),
});

export type Character = z.infer<typeof CharacterSchema>;

// ─── World Rules Schemas ────────────────────────────────────────

export const WorldRuleSchema = z.object({
  id: z.string(),
  category: z.string(), // magic-system / society / technology / geography
  rule: z.string(),
  exceptions: z.array(z.string()).default([]),
  sourceChapter: z.number().int().positive().optional(),
});

export type WorldRule = z.infer<typeof WorldRuleSchema>;

// ─── Manifest Schemas ───────────────────────────────────────────

export const SceneBreakdownSchema = z.object({
  title: z.string(),
  description: z.string(),
  characters: z.array(z.string()),
  mood: z.string(),
  wordCount: z.number().int().positive(),
});

export const HookActionSchema = z.object({
  action: z.enum(['plant', 'advance', 'payoff']),
  description: z.string(),
});

export const ChapterPlanStoreSchema = z.object({
  chapterNumber: z.number().int().positive(),
  title: z.string(),
  intention: z.string(),
  wordCountTarget: z.number().int().positive(),
  characters: z.array(z.string()),
  keyEvents: z.array(z.string()),
  hooks: z.array(
    z.object({
      description: z.string(),
      type: z.string(),
      priority: z.string(),
    }),
  ),
  worldRules: z.array(z.string()),
  emotionalBeat: z.string(),
  sceneTransition: z.string(),
  createdAt: z.string().datetime(),
  // 新增字段（向后兼容：旧数据可能缺少这些字段）
  openingHook: z.string().optional().default(''),
  closingHook: z.string().optional().default(''),
  sceneBreakdown: z.array(SceneBreakdownSchema).optional().default([]),
  characterGrowthBeat: z.string().optional().default(''),
  hookActions: z.array(HookActionSchema).optional().default([]),
  pacingTag: z
    .enum(['slow_build', 'rising', 'climax', 'cooldown', 'transition'])
    .optional()
    .default('slow_build'),
});

export type ChapterPlanStore = z.infer<typeof ChapterPlanStoreSchema>;

export const OutlineChapterSchema = z.object({
  chapterNumber: z.number().int().positive(),
  title: z.string(),
  summary: z.string(),
});

export const OutlineActSchema = z.object({
  actNumber: z.number().int().positive(),
  title: z.string(),
  summary: z.string(),
  chapters: z.array(OutlineChapterSchema),
});

export type OutlineAct = z.infer<typeof OutlineActSchema>;

export const ManifestSchema = z.object({
  bookId: z.string(),
  versionToken: z.number().int().positive(),
  lastChapterWritten: z.number().int().nonnegative().default(0),
  currentFocus: z.string().optional(),
  hooks: z.array(HookSchema),
  facts: z.array(FactSchema),
  characters: z.array(CharacterSchema),
  worldRules: z.array(WorldRuleSchema),
  chapterPlans: z.record(z.string(), ChapterPlanStoreSchema).default({}),
  outline: z.array(OutlineActSchema).default([]),
  updatedAt: z.string().datetime(),
});

export type Manifest = z.infer<typeof ManifestSchema>;

// ─── Snapshot Schemas ───────────────────────────────────────────

export const SnapshotSchema = z.object({
  id: z.string(),
  bookId: z.string(),
  chapterNumber: z.number().int().positive(),
  stateHash: z.string(), // SHA-256 of JSON state at snapshot time
  manifest: ManifestSchema,
  createdAt: z.string().datetime(),
});

export type Snapshot = z.infer<typeof SnapshotSchema>;

// ─── Delta / Action Schemas ─────────────────────────────────────

export const DeltaActionSchema = z.enum([
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
]);

export const DeltaSchema = z.object({
  actions: z.array(
    z.object({
      type: DeltaActionSchema,
      payload: z.record(z.string(), z.unknown()),
    }),
  ),
  sourceAgent: z.string().optional(),
  sourceChapter: z.number().int().positive().optional(),
});

export type Delta = z.infer<typeof DeltaSchema>;

// ─── Book Lock Schemas ──────────────────────────────────────────

export const BookLockSchema = z.object({
  bookId: z.string(),
  pid: z.number().int().positive(),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),
  operation: z.string(),
});

export type BookLock = z.infer<typeof BookLockSchema>;

// ─── Chapter Summary Schemas ────────────────────────────────────

export const StateChangeEntrySchema = z.object({
  name: z.string(),
  change: z.string(),
});

export const RelationshipChangeEntrySchema = z.object({
  pair: z.string(),
  change: z.string(),
});

export const WorldChangeEntrySchema = z.object({
  item: z.string(),
  change: z.string(),
});

export const StateChangesSchema = z.object({
  characters: z.array(StateChangeEntrySchema).default([]),
  relationships: z.array(RelationshipChangeEntrySchema).default([]),
  world: z.array(WorldChangeEntrySchema).default([]),
});

export type StateChanges = z.infer<typeof StateChangesSchema>;

export const ChapterSummaryRecordSchema = z.object({
  chapter: z.number().int().positive(),
  briefSummary: z.string(),
  detailedSummary: z.string(),
  keyEvents: z.array(z.string()).default([]),
  stateChanges: StateChangesSchema.nullable().default(null),
  emotionalArc: z.string().nullable().default(null),
  cliffhanger: z.string().nullable().default(null),
  hookImpact: z.array(z.string()).nullable().default(null),
  consistencyScore: z.number().int().min(0).max(100).default(0),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type ChapterSummaryRecord = z.infer<typeof ChapterSummaryRecordSchema>;

export const ChapterSummaryArchiveSchema = z.object({
  bookId: z.string(),
  summaries: z.array(ChapterSummaryRecordSchema).default([]),
  arcSummaries: z.record(z.string(), z.string()).default({}),
  lastUpdated: z.string().datetime(),
});

export type ChapterSummaryArchive = z.infer<typeof ChapterSummaryArchiveSchema>;

// ─── Re-exports from chapter ───────────────────────────────────

export { ChapterIndexSchema, ChapterIndexEntrySchema } from './chapter';
export type { ChapterIndex, ChapterIndexEntry } from './chapter';
