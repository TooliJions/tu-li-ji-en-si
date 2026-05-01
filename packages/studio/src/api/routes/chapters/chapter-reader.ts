import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import { PipelinePersistence, StateManager } from '@cybernovelist/core';
import { getStudioRuntimeRootDir, hasStudioBookRuntime } from '../../core-bridge';

export interface ChapterRecord {
  number: number;
  title: string | null;
  content: string;
  status: 'draft' | 'published';
  wordCount: number;
  qualityScore: number | null;
  aiTraceScore: number | null;
  auditStatus: string | null;
  auditReport: unknown | null;
  warningCode?: string | null;
  warning?: string | null;
  isPolluted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ChapterWarningMeta {
  warningCode?: string | null;
  warning?: string | null;
}

export interface AuditIssueItem {
  rule: string;
  severity: 'blocker' | 'warning' | 'suggestion';
  message: string;
}

export interface AuditTierSummary {
  total: number;
  passed: number;
  failed: number;
  items: AuditIssueItem[];
}

export interface ChapterAuditReport {
  chapterNumber: number;
  overallStatus: 'passed' | 'needs_revision';
  tiers: {
    blocker: AuditTierSummary;
    warning: AuditTierSummary;
    suggestion: AuditTierSummary;
  };
  radarScores: Array<{ dimension: string; label: string; score: number }>;
}

export interface AuditCheck {
  rule: string;
  severity: 'blocker' | 'warning' | 'suggestion';
  passed: boolean;
  message?: string;
}

export const updateChapterSchema = z.object({
  content: z.string().optional(),
  title: z.string().nullable().optional(),
});

export const mergeSchema = z.object({
  fromChapter: z.number().int().positive(),
  toChapter: z.number().int().positive(),
});

export const splitSchema = z.object({
  splitAtPosition: z.number().int().positive(),
});

export const rollbackSchema = z.object({
  toSnapshot: z.string().min(1),
});

export function getStateManager(): StateManager {
  return new StateManager(getStudioRuntimeRootDir());
}

export function getPersistence(): PipelinePersistence {
  return new PipelinePersistence(getStudioRuntimeRootDir());
}

export function getChapterAuditPath(bookId: string, chapterNumber: number): string {
  const padded = String(chapterNumber).padStart(4, '0');
  return path.join(
    getStudioRuntimeRootDir(),
    bookId,
    'story',
    'state',
    'audits',
    `chapter-${padded}.json`,
  );
}

export function mapPersistedStatus(status: string | undefined): ChapterRecord['status'] {
  if (status === 'draft') {
    return 'draft';
  }
  return 'published';
}

export function mapApiStatusToPersisted(status: ChapterRecord['status']): 'draft' | 'final' {
  return status === 'draft' ? 'draft' : 'final';
}

export function parseChapterFile(raw: string): {
  title: string | null;
  status: string | undefined;
  createdAt: string | undefined;
  warningCode?: string;
  warning?: string;
  content: string;
} {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    return {
      title: null,
      status: undefined,
      createdAt: undefined,
      warningCode: undefined,
      warning: undefined,
      content: raw.trim(),
    };
  }

  const metadata = Object.fromEntries(
    match[1]
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && line.includes(':'))
      .map((line) => {
        const separator = line.indexOf(':');
        const key = line.slice(0, separator).trim();
        const value = line.slice(separator + 1).trim();
        return [key, value];
      }),
  );

  return {
    title: typeof metadata.title === 'string' && metadata.title.length > 0 ? metadata.title : null,
    status: typeof metadata.status === 'string' ? metadata.status : undefined,
    createdAt: typeof metadata.createdAt === 'string' ? metadata.createdAt : undefined,
    warningCode: typeof metadata.warningCode === 'string' ? metadata.warningCode : undefined,
    warning: typeof metadata.warning === 'string' ? metadata.warning : undefined,
    content: raw.slice(match[0].length).trim(),
  };
}

export function getAuditStatus(auditReport: unknown): string | null {
  if (!auditReport || typeof auditReport !== 'object') {
    return null;
  }

  const overallStatus = (auditReport as { overallStatus?: string }).overallStatus;
  return typeof overallStatus === 'string' ? overallStatus : null;
}

export function isChapterPolluted(chapter: Pick<ChapterRecord, 'warningCode'>): boolean {
  return chapter.warningCode === 'accept_with_warnings';
}

export function mergeWarningMeta(...items: ChapterWarningMeta[]): ChapterWarningMeta {
  const forcedAcceptance = items.find((item) => item.warningCode === 'accept_with_warnings');
  if (forcedAcceptance) {
    return forcedAcceptance;
  }

  return items.find((item) => item.warningCode || item.warning) ?? {};
}

export function readChapterIndex(bookId: string) {
  return getStateManager().readIndex(bookId);
}

export function writeChapterIndex(bookId: string, index: ReturnType<typeof readChapterIndex>) {
  getStateManager().writeIndex(bookId, index);
}

export function readAuditReport(bookId: string, chapterNumber: number): unknown | null {
  const auditPath = getChapterAuditPath(bookId, chapterNumber);
  if (!fs.existsSync(auditPath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(auditPath, 'utf-8')) as unknown;
  } catch {
    return null;
  }
}

export function writeAuditReport(bookId: string, chapterNumber: number, report: unknown): void {
  const auditPath = getChapterAuditPath(bookId, chapterNumber);
  fs.mkdirSync(path.dirname(auditPath), { recursive: true });
  fs.writeFileSync(auditPath, JSON.stringify(report, null, 2), 'utf-8');
}

export function isLegacyAuditReport(report: unknown): boolean {
  if (!report || typeof report !== 'object') {
    return false;
  }

  const radarScores = (report as { radarScores?: Array<{ dimension?: string }> }).radarScores;
  return (
    Array.isArray(radarScores) &&
    radarScores.some(
      (score) => score && typeof score === 'object' && score.dimension === 'creativity',
    )
  );
}

export function readChapterRecord(
  bookId: string,
  chapterNumber: number,
  preloadedIndex?: ReturnType<typeof readChapterIndex>,
): ChapterRecord | null {
  const index = preloadedIndex ?? readChapterIndex(bookId);
  const entry = index.chapters.find((chapter) => chapter.number === chapterNumber);
  if (!entry) {
    return null;
  }

  const filePath = getStateManager().getChapterFilePath(bookId, chapterNumber);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  const parsed = parseChapterFile(raw);
  const stat = fs.statSync(filePath);
  const auditReport = readAuditReport(bookId, chapterNumber);

  return {
    number: chapterNumber,
    title: entry.title ?? parsed.title,
    content: parsed.content,
    status: mapPersistedStatus(parsed.status),
    wordCount: entry.wordCount,
    qualityScore: null,
    aiTraceScore: null,
    auditStatus: getAuditStatus(auditReport),
    auditReport,
    warningCode: parsed.warningCode ?? null,
    warning: parsed.warning ?? null,
    isPolluted: isChapterPolluted({ warningCode: parsed.warningCode ?? null }),
    createdAt: parsed.createdAt ?? entry.createdAt,
    updatedAt: stat.mtime.toISOString(),
  };
}

export function listChapterRecords(bookId: string): ChapterRecord[] {
  const index = readChapterIndex(bookId);
  return index.chapters
    .map((chapter) => readChapterRecord(bookId, chapter.number, index))
    .filter((chapter): chapter is ChapterRecord => chapter !== null)
    .sort((left, right) => left.number - right.number);
}

export function createChapterSnapshot(bookId: string, chapterNumber: number): string | undefined {
  const chapterPath = getStateManager().getChapterFilePath(bookId, chapterNumber);
  if (!fs.existsSync(chapterPath)) {
    return undefined;
  }

  const snapshotId = getPersistence().createSnapshot(bookId, chapterNumber);
  const snapshotDir = path.join(
    getStudioRuntimeRootDir(),
    bookId,
    'story',
    'state',
    'snapshots',
    snapshotId,
  );
  fs.copyFileSync(chapterPath, path.join(snapshotDir, path.basename(chapterPath)));
  return snapshotId;
}

export async function persistChapterRecord(
  bookId: string,
  chapterNumber: number,
  title: string | null,
  content: string,
  status: ChapterRecord['status'],
  metadata?: ChapterWarningMeta,
): Promise<ChapterRecord> {
  const result = await getPersistence().persistChapter({
    bookId,
    chapterNumber,
    title: title ?? `第 ${chapterNumber} 章`,
    content,
    status: mapApiStatusToPersisted(status),
    warningCode: metadata?.warningCode ?? undefined,
    warning: metadata?.warning ?? undefined,
  });

  if (!result.success) {
    throw new Error(result.error ?? '章节持久化失败');
  }

  const chapter = readChapterRecord(bookId, chapterNumber);
  if (!chapter) {
    throw new Error(`第 ${chapterNumber} 章持久化后不可读`);
  }
  return chapter;
}

export function rewriteIndex(
  bookId: string,
  updater: (index: ReturnType<typeof readChapterIndex>) => ReturnType<typeof readChapterIndex>,
) {
  const nextIndex = updater(readChapterIndex(bookId));
  nextIndex.totalChapters = nextIndex.chapters.length;
  nextIndex.totalWords = nextIndex.chapters.reduce((sum, chapter) => sum + chapter.wordCount, 0);
  nextIndex.lastUpdated = new Date().toISOString();
  writeChapterIndex(bookId, nextIndex);
}

export function removeAuditReport(bookId: string, chapterNumber: number): void {
  const auditPath = getChapterAuditPath(bookId, chapterNumber);
  if (fs.existsSync(auditPath)) {
    fs.unlinkSync(auditPath);
  }
}
