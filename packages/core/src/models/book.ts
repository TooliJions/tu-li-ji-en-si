import { z } from 'zod';

// ─── Book Schemas ───────────────────────────────────────────────

export const BookStatusSchema = z.enum(['active', 'archived', 'completed']);

export const BookGenreSchema = z.enum([
  'urban', // 都市
  'fantasy', // 玄幻
  'xianxia', // 仙侠
  'sci-fi', // 科幻
  'history', // 历史
  'game', // 游戏
  'horror', // 悬疑
  'romance', // 言情
  'fanfic', // 同人
]);

export const LanguageSchema = z.enum(['zh-CN', 'zh-TW', 'en', 'ja']);

export const FanficModeSchema = z.object({
  sourceWork: z.string(), // 原作名称
  sourceAuthor: z.string().optional(),
  canonCharacters: z.array(z.string()),
  timeline: z.string().optional(), // 原作时间线
});

export const BookSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(200),
  genre: BookGenreSchema,
  targetWords: z.number().int().positive(),
  targetChapterCount: z.number().int().positive().optional(),
  currentWords: z.number().int().nonnegative().default(0),
  chapterCount: z.number().int().nonnegative().default(0),
  status: BookStatusSchema.default('active'),
  language: LanguageSchema.default('zh-CN'),
  brief: z.string().optional(),
  promptVersion: z.string().default('v2'),
  fanficMode: FanficModeSchema.nullable().default(null),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const BookCreateSchema = BookSchema.pick({
  title: true,
  genre: true,
  targetWords: true,
  language: true,
  brief: true,
}).extend({
  targetChapterCount: z.number().int().positive().optional(),
  fanficMode: FanficModeSchema.optional(),
});

export const BookUpdateSchema = BookSchema.partial().omit({
  id: true,
  createdAt: true,
});

export type Book = z.infer<typeof BookSchema>;
export type BookCreate = z.infer<typeof BookCreateSchema>;
export type BookUpdate = z.infer<typeof BookUpdateSchema>;

// ─── Activity Schemas ───────────────────────────────────────────

export const ActivityTypeSchema = z.enum([
  'chapter_created',
  'chapter_updated',
  'chapter_deleted',
  'pipeline_started',
  'pipeline_completed',
  'pipeline_failed',
  'daemon_paused',
  'daemon_resumed',
  'hook_planted',
  'hook_resolved',
  'config_updated',
]);

export const ActivitySchema = z.object({
  type: ActivityTypeSchema,
  chapterId: z.string().optional(),
  timestamp: z.string().datetime(),
  detail: z.string(),
});

export type Activity = z.infer<typeof ActivitySchema>;
