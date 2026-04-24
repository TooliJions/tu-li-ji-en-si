import type { Manifest } from '../models/state';

export function normalizeFactCategory(category: string): Manifest['facts'][number]['category'] {
  return ['character', 'world', 'plot', 'timeline', 'resource'].includes(category)
    ? (category as Manifest['facts'][number]['category'])
    : 'plot';
}

export function normalizeFactConfidence(
  confidence: string
): Manifest['facts'][number]['confidence'] {
  return ['high', 'medium', 'low'].includes(confidence)
    ? (confidence as Manifest['facts'][number]['confidence'])
    : 'medium';
}

export function normalizeHookType(type: unknown): string {
  return typeof type === 'string' && type.trim().length > 0 ? type : 'plot';
}

export function normalizeHookStatus(
  status: unknown,
  allowUndefined: boolean = false
): Manifest['hooks'][number]['status'] | undefined {
  if (typeof status !== 'string') {
    return allowUndefined ? undefined : 'open';
  }
  return ['open', 'progressing', 'deferred', 'dormant', 'resolved', 'abandoned'].includes(status)
    ? (status as Manifest['hooks'][number]['status'])
    : allowUndefined
      ? undefined
      : 'open';
}

export function normalizeHookPriority(
  priority: unknown,
  allowUndefined: boolean = false
): Manifest['hooks'][number]['priority'] | undefined {
  if (typeof priority !== 'string') {
    return allowUndefined ? undefined : 'minor';
  }
  return ['critical', 'major', 'minor'].includes(priority)
    ? (priority as Manifest['hooks'][number]['priority'])
    : allowUndefined
      ? undefined
      : 'minor';
}

export function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

export function normalizeChapterArray(value: unknown, fallbackChapter: number): number[] {
  if (!Array.isArray(value)) {
    return [fallbackChapter];
  }
  const chapters = value.filter(
    (item): item is number => typeof item === 'number' && Number.isInteger(item) && item > 0
  );
  return chapters.length > 0 ? chapters : [fallbackChapter];
}

export function toPositiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}
