import { z } from 'zod';

export const InspirationSourceTypeSchema = z.enum(['manual', 'shuffle', 'import']);

export const InspirationSeedSchema = z.object({
  id: z.string().min(1),
  sourceText: z.string().min(1),
  genre: z.string().trim().optional(),
  theme: z.string().trim().optional(),
  conflict: z.string().trim().optional(),
  tone: z.string().trim().optional(),
  constraints: z.array(z.string().min(1)).default([]),
  sourceType: InspirationSourceTypeSchema,
  createdAt: z.string().datetime(),
});

export const CreateInspirationSeedInputSchema = z.object({
  sourceText: z.string().min(1),
  genre: z.string().trim().optional(),
  theme: z.string().trim().optional(),
  conflict: z.string().trim().optional(),
  tone: z.string().trim().optional(),
  constraints: z.array(z.string().min(1)).default([]),
  sourceType: InspirationSourceTypeSchema,
});

export type InspirationSourceType = z.infer<typeof InspirationSourceTypeSchema>;
export type InspirationSeed = z.infer<typeof InspirationSeedSchema>;
export type CreateInspirationSeedInput = z.infer<typeof CreateInspirationSeedInputSchema>;
