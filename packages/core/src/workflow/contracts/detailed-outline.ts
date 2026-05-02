import { z } from 'zod';
import { SatisfactionTypeSchema } from './outline';

// ─── contextForWriter:章节自给自足上下文 ───────────────────

export const ForeshadowingOperationSchema = z.enum(['plant', 'advance', 'resolve']);

export const ForeshadowingOpEntrySchema = z.object({
  foreshadowingId: z.string().trim().min(1),
  operation: ForeshadowingOperationSchema,
  description: z.string().trim().default(''),
});

export const CharacterStateSchema = z.object({
  characterId: z.string().trim().min(1),
  powerLevel: z.string().trim().default(''),
  emotionalState: z.string().trim().default(''),
  keySecret: z.string().trim().default(''),
  relationshipWithPov: z.string().trim().default(''),
});

export const ActiveForeshadowingStatusSchema = z.object({
  foreshadowingId: z.string().trim().min(1),
  status: z.enum(['planted', 'advanced', 'ready']).default('planted'),
  note: z.string().trim().default(''),
});

export const PrecedingChapterBridgeSchema = z.object({
  cliffhanger: z.string().trim().default(''),
  emotionalCarry: z.string().trim().default(''),
  unresolvedTension: z.string().trim().default(''),
});

export const NextChapterSetupSchema = z.object({
  seedForNext: z.string().trim().default(''),
  expectedDevelopment: z.string().trim().default(''),
});

export const ContextForWriterSchema = z.object({
  storyProgress: z.string().trim().min(1),
  chapterPositionNote: z.string().trim().default(''),
  characterStates: z.array(CharacterStateSchema).default([]),
  activeWorldRules: z.array(z.string().trim().min(1)).default([]),
  activeForeshadowingStatus: z.array(ActiveForeshadowingStatusSchema).default([]),
  precedingChapterBridge: PrecedingChapterBridgeSchema.default({
    cliffhanger: '',
    emotionalCarry: '',
    unresolvedTension: '',
  }),
  nextChapterSetup: NextChapterSetupSchema.default({
    seedForNext: '',
    expectedDevelopment: '',
  }),
});

// ─── ChapterEntry:每章细纲 ───────────────────────────────

export const ChapterEntrySchema = z.object({
  chapterNumber: z.number().int().positive(),
  title: z.string().trim().min(1),
  wordCountTarget: z.string().trim().default(''),
  sceneSetup: z.string().trim().default(''),
  charactersPresent: z.array(z.string().trim().min(1)).default([]),
  coreEvents: z.array(z.string().trim().min(1)).min(1),
  emotionArc: z.string().trim().default(''),
  chapterEndHook: z.string().trim().default(''),
  foreshadowingOps: z.array(ForeshadowingOpEntrySchema).default([]),
  satisfactionType: SatisfactionTypeSchema.optional(),
  keyDialogueHints: z.array(z.string().trim().min(1)).default([]),
  writingNotes: z.string().trim().default(''),
  contextForWriter: ContextForWriterSchema,
});

// ─── VolumeEntry:卷 ───────────────────────────────────────

export const VolumeEntrySchema = z.object({
  volumeNumber: z.number().int().positive(),
  title: z.string().trim().min(1),
  arcSummary: z.string().trim().min(1),
  chapterCount: z.number().int().positive(),
  startChapter: z.number().int().positive(),
  endChapter: z.number().int().positive(),
  chapters: z.array(ChapterEntrySchema).min(1),
});

// ─── DetailedOutline 顶层 ─────────────────────────────────

export const DetailedOutlineSchema = z.object({
  id: z.string().min(1),
  storyBlueprintId: z.string().min(1),
  totalChapters: z.number().int().positive(),
  estimatedTotalWords: z.string().trim().default(''),
  volumes: z.array(VolumeEntrySchema).min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const CreateDetailedOutlineInputSchema = z.object({
  storyBlueprintId: z.string().min(1),
  totalChapters: z.number().int().positive(),
  estimatedTotalWords: z.string().trim().default(''),
  volumes: z.array(VolumeEntrySchema).min(1),
});

export const UpdateDetailedOutlinePatchSchema = z.object({
  estimatedTotalWords: z.string().trim().optional(),
  volumes: z.array(VolumeEntrySchema).optional(),
});

// ─── 类型导出 ──────────────────────────────────────────────

export type ForeshadowingOperation = z.infer<typeof ForeshadowingOperationSchema>;
export type ForeshadowingOpEntry = z.infer<typeof ForeshadowingOpEntrySchema>;
export type CharacterState = z.infer<typeof CharacterStateSchema>;
export type ActiveForeshadowingStatus = z.infer<typeof ActiveForeshadowingStatusSchema>;
export type PrecedingChapterBridge = z.infer<typeof PrecedingChapterBridgeSchema>;
export type NextChapterSetup = z.infer<typeof NextChapterSetupSchema>;
export type ContextForWriter = z.infer<typeof ContextForWriterSchema>;
export type ChapterEntry = z.infer<typeof ChapterEntrySchema>;
export type VolumeEntry = z.infer<typeof VolumeEntrySchema>;
export type DetailedOutline = z.infer<typeof DetailedOutlineSchema>;
export type CreateDetailedOutlineInput = z.infer<typeof CreateDetailedOutlineInputSchema>;
export type UpdateDetailedOutlinePatch = z.infer<typeof UpdateDetailedOutlinePatchSchema>;
