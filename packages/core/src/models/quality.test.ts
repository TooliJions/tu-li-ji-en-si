import { describe, it, expect } from 'vitest';
import {
  AuditSeveritySchema,
  AuditIssueSchema,
  AuditReportSchema,
  RepairStrategySchema,
  QualityBaselineRecordSchema,
} from './quality';

describe('Quality Schemas', () => {
  describe('AuditSeveritySchema', () => {
    it('should accept valid severity values', () => {
      expect(AuditSeveritySchema.parse('blocking')).toBe('blocking');
      expect(AuditSeveritySchema.parse('warning')).toBe('warning');
      expect(AuditSeveritySchema.parse('suggestion')).toBe('suggestion');
    });

    it('should reject invalid severity', () => {
      expect(() => AuditSeveritySchema.parse('critical')).toThrow();
    });
  });

  describe('AuditIssueSchema', () => {
    it('should validate a valid issue', () => {
      const issue = AuditIssueSchema.parse({
        dimension: 'continuity',
        severity: 'blocking',
        message: 'Character name mismatch',
      });
      expect(issue.severity).toBe('blocking');
    });
  });

  describe('AuditReportSchema', () => {
    it('should validate a valid report', () => {
      const report = AuditReportSchema.parse({
        chapterNumber: 1,
        overallPass: true,
        issues: [],
        dimensions: {},
        timestamp: '2026-04-21T00:00:00Z',
      });
      expect(report.chapterNumber).toBe(1);
      expect(report.overallPass).toBe(true);
    });

    it('should have default empty arrays for blockedBy and warnedBy', () => {
      const report = AuditReportSchema.parse({
        chapterNumber: 1,
        overallPass: true,
        issues: [],
        dimensions: {},
        timestamp: '2026-04-21T00:00:00Z',
      });
      expect(report.blockedBy).toEqual([]);
      expect(report.warnedBy).toEqual([]);
    });
  });

  describe('RepairStrategySchema', () => {
    it('should accept valid strategies', () => {
      expect(RepairStrategySchema.parse('local_replace')).toBe('local_replace');
      expect(RepairStrategySchema.parse('chapter_rewrite')).toBe('chapter_rewrite');
    });

    it('should reject invalid strategy', () => {
      expect(() => RepairStrategySchema.parse('rewrite_all')).toThrow();
    });
  });

  describe('QualityBaselineRecordSchema', () => {
    it('should validate a valid baseline', () => {
      const baseline = QualityBaselineRecordSchema.parse({
        bookId: 'book-1',
        chapterNumber: 5,
        scores: { continuity: 0.9, style: 0.8 },
        timestamp: '2026-04-21T00:00:00Z',
      });
      expect(baseline.bookId).toBe('book-1');
    });
  });
});
