// ─── MemoryDB Types ──────────────────────────────────────────────

export interface InsertFactParams {
  chapter: number;
  entity_type: string;
  entity_name: string;
  fact_text: string;
  valid_from?: number;
  valid_until?: number | null;
  confidence?: 'high' | 'medium' | 'low';
}

export interface FactRecord {
  id: number;
  chapter: number;
  entity_type: string;
  entity_name: string;
  fact_text: string;
  valid_from: number;
  valid_until: number | null;
  confidence: string;
  created_at: string;
}

export interface InsertChapterSummaryParams {
  chapter: number;
  summary: string;
  key_events?: string[];
  state_changes?: Record<string, unknown>;
}

export interface MemoryDbChapterSummary {
  chapter: number;
  summary: string;
  key_events: string | null;
  state_changes: string | null;
  created_at: string;
}

export interface InsertHookParams {
  planted_ch: number;
  description: string;
  status: 'open' | 'progressing' | 'deferred' | 'dormant' | 'resolved' | 'abandoned';
  priority: 'critical' | 'major' | 'minor';
  last_advanced?: number;
  resolved_ch?: number;
  expected_resolution_min?: number;
  expected_resolution_max?: number;
  is_dormant?: boolean;
}

export interface HookRecord {
  id: number;
  planted_ch: number;
  description: string;
  status: string;
  priority: string;
  last_advanced: number | null;
  resolved_ch: number | null;
  expected_resolution_min: number | null;
  expected_resolution_max: number | null;
  is_dormant: number;
  created_at: string;
}
