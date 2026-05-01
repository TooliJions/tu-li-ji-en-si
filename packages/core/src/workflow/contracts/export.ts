import { z } from 'zod';

export const ExportFormatSchema = z.enum(['epub', 'txt', 'markdown', 'qidian', 'fanqiao']);

export const ExportJobStatusSchema = z.enum(['pending', 'running', 'completed', 'failed']);

export const ExportJobSchema = z.object({
  id: z.string().min(1),
  bookId: z.string().min(1),
  format: ExportFormatSchema,
  chapterFrom: z.number().int().positive().optional(),
  chapterTo: z.number().int().positive().optional(),
  status: ExportJobStatusSchema,
  filePath: z.string().min(1).optional(),
  fileSize: z.number().int().nonnegative().optional(),
  error: z.string().min(1).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const CreateExportJobInputSchema = z.object({
  bookId: z.string().min(1),
  format: ExportFormatSchema,
  chapterFrom: z.number().int().positive().optional(),
  chapterTo: z.number().int().positive().optional(),
});

export const UpdateExportJobPatchSchema = z.object({
  format: ExportFormatSchema.optional(),
  chapterFrom: z.number().int().positive().optional(),
  chapterTo: z.number().int().positive().optional(),
  status: ExportJobStatusSchema.optional(),
  filePath: z.string().min(1).optional(),
  fileSize: z.number().int().nonnegative().optional(),
  error: z.string().min(1).optional(),
});

export type ExportFormat = z.infer<typeof ExportFormatSchema>;
export type ExportJobStatus = z.infer<typeof ExportJobStatusSchema>;
export type ExportJob = z.infer<typeof ExportJobSchema>;
export type CreateExportJobInput = z.infer<typeof CreateExportJobInputSchema>;
export type UpdateExportJobPatch = z.infer<typeof UpdateExportJobPatchSchema>;
