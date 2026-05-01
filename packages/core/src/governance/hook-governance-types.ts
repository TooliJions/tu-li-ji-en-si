import type { Hook } from '../models/state';

export interface AdmissionResult {
  admitted: boolean;
  reason?: string;
  relatedHookIds?: string[];
}

export interface PayoffValidation {
  valid: boolean;
  issues: string[];
  qualityScore: number; // 0-100
}

export interface HealthReport {
  totalHooks: number;
  byStatus: Record<Hook['status'], number>;
  overdueCount: number;
  dormantCount: number;
  inResolutionWindow: number;
  healthScore: number; // 0-100
  warnings: string[];
}

export interface DormantResult {
  success: boolean;
  hookId: string;
  newStatus: string;
  reason?: string;
}

export interface IntentResult {
  success: boolean;
  hookId: string;
  reason?: string;
}
