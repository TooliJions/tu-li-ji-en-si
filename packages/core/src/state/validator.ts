import { ManifestSchema, DeltaSchema } from '../models/state';

// ─── StateValidator ─────────────────────────────────────────────
// 基于 Zod 的运行时状态校验。

export type ValidationResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; errors: string[] };

/**
 * 校验 Manifest 结构。
 * 非法状态返回详细错误信息，合法状态返回解析后的数据。
 */
export function validateManifest(raw: unknown): ValidationResult<ManifestSchema['_output']> {
  const result = ManifestSchema.safeParse(raw);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    errors: result.error.issues.map((issue) => `[${issue.path.join('.')}] ${issue.message}`),
  };
}

/**
 * 校验 Delta 结构。
 */
export function validateDelta(raw: unknown): ValidationResult<DeltaSchema['_output']> {
  const result = DeltaSchema.safeParse(raw);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    errors: result.error.issues.map((issue) => `[${issue.path.join('.')}] ${issue.message}`),
  };
}
