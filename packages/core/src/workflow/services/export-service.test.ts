import { describe, expect, it } from 'vitest';
import { DefaultExportService, type ExportService } from './export-service';

describe('DefaultExportService', () => {
  const fixedId = 'export_test_001';
  const fixedTime = '2026-05-01T00:00:00.000Z';
  let callCount = 0;
  const nowGenerator = () => {
    callCount += 1;
    return `${fixedTime.slice(0, -4)}${String(callCount).padStart(3, '0')}Z`;
  };

  function makeService(): ExportService {
    callCount = 0;
    return new DefaultExportService({
      idGenerator: () => fixedId,
      now: nowGenerator,
    });
  }

  describe('createJob()', () => {
    it('creates a pending export job with minimal input', () => {
      const service = makeService();
      const job = service.createJob({
        bookId: 'book-001',
        format: 'epub',
      });

      expect(job.id).toBe(fixedId);
      expect(job.bookId).toBe('book-001');
      expect(job.format).toBe('epub');
      expect(job.status).toBe('pending');
      expect(job.createdAt).toBeTruthy();
      expect(job.updatedAt).toBe(job.createdAt);
      expect(job.filePath).toBeUndefined();
      expect(job.error).toBeUndefined();
    });

    it('creates a job with chapter range', () => {
      const service = makeService();
      const job = service.createJob({
        bookId: 'book-002',
        format: 'txt',
        chapterFrom: 1,
        chapterTo: 10,
      });

      expect(job.chapterFrom).toBe(1);
      expect(job.chapterTo).toBe(10);
    });

    it('throws on invalid format', () => {
      const service = makeService();
      expect(() =>
        service.createJob({
          bookId: 'book-001',
          format: 'pdf' as unknown as 'epub',
        }),
      ).toThrow();
    });

    it('throws on empty bookId', () => {
      const service = makeService();
      expect(() =>
        service.createJob({
          bookId: '',
          format: 'epub',
        }),
      ).toThrow();
    });
  });

  describe('updateJob()', () => {
    it('updates chapter range', () => {
      const service = makeService();
      const job = service.createJob({
        bookId: 'book-001',
        format: 'epub',
      });
      const updated = service.updateJob(job, {
        chapterFrom: 3,
        chapterTo: 5,
      });

      expect(updated.chapterFrom).toBe(3);
      expect(updated.chapterTo).toBe(5);
      expect(updated.updatedAt).not.toBe(job.updatedAt);
    });

    it('preserves unmodified fields', () => {
      const service = makeService();
      const job = service.createJob({
        bookId: 'book-001',
        format: 'epub',
      });
      const updated = service.updateJob(job, { status: 'running' });

      expect(updated.bookId).toBe('book-001');
      expect(updated.format).toBe('epub');
    });

    it('throws on invalid patch', () => {
      const service = makeService();
      const job = service.createJob({
        bookId: 'book-001',
        format: 'epub',
      });
      expect(() => service.updateJob(job, { fileSize: -1 })).toThrow();
    });
  });

  describe('setStatus()', () => {
    it('transitions job to running', () => {
      const service = makeService();
      const job = service.createJob({
        bookId: 'book-001',
        format: 'markdown',
      });
      const updated = service.setStatus(job, 'running');

      expect(updated.status).toBe('running');
      expect(updated.updatedAt).not.toBe(job.updatedAt);
    });
  });

  describe('setResult()', () => {
    it('marks completed with filePath and fileSize', () => {
      const service = makeService();
      const job = service.createJob({
        bookId: 'book-001',
        format: 'epub',
      });
      const failed = service.setError(job, 'disk full');
      const completed = service.setResult(failed, '/output/book.epub', 1024);

      expect(completed.status).toBe('completed');
      expect(completed.filePath).toBe('/output/book.epub');
      expect(completed.fileSize).toBe(1024);
      expect(completed.error).toBeUndefined();
    });

    it('works without fileSize', () => {
      const service = makeService();
      const job = service.createJob({
        bookId: 'book-001',
        format: 'txt',
      });
      const completed = service.setResult(job, '/output/book.txt');

      expect(completed.filePath).toBe('/output/book.txt');
      expect(completed.fileSize).toBeUndefined();
    });
  });

  describe('setError()', () => {
    it('marks failed and clears previous result', () => {
      const service = makeService();
      const job = service.createJob({
        bookId: 'book-001',
        format: 'epub',
      });
      const completed = service.setResult(job, '/out.epub', 100);
      const failed = service.setError(completed, 'encoding error');

      expect(failed.status).toBe('failed');
      expect(failed.error).toBe('encoding error');
      expect(failed.filePath).toBeUndefined();
      expect(failed.fileSize).toBeUndefined();
    });
  });

  describe('parseJob()', () => {
    it('parses valid job object', () => {
      const service = makeService();
      const parsed = service.parseJob({
        id: 'export_123',
        bookId: 'book-001',
        format: 'qidian',
        status: 'pending',
        createdAt: fixedTime,
        updatedAt: fixedTime,
      });

      expect(parsed.id).toBe('export_123');
      expect(parsed.format).toBe('qidian');
    });

    it('throws on missing required fields', () => {
      const service = makeService();
      expect(() => service.parseJob({ bookId: 'book-001' })).toThrow();
    });
  });

  describe('canDownload()', () => {
    it('returns true for completed job with filePath', () => {
      const service = makeService();
      const job = service.setResult(
        service.createJob({ bookId: 'b1', format: 'epub' }),
        '/path/to/file.epub',
        2048,
      );
      expect(service.canDownload(job)).toBe(true);
    });

    it('returns false for pending job', () => {
      const service = makeService();
      const job = service.createJob({ bookId: 'b1', format: 'epub' });
      expect(service.canDownload(job)).toBe(false);
    });

    it('returns false for running job', () => {
      const service = makeService();
      const job = service.setStatus(service.createJob({ bookId: 'b1', format: 'epub' }), 'running');
      expect(service.canDownload(job)).toBe(false);
    });

    it('returns false for completed job without filePath', () => {
      const service = makeService();
      const job = service.setStatus(
        service.createJob({ bookId: 'b1', format: 'epub' }),
        'completed',
      );
      expect(service.canDownload(job)).toBe(false);
    });

    it('returns false for failed job even with filePath', () => {
      const service = makeService();
      let job = service.createJob({ bookId: 'b1', format: 'epub' });
      job = service.setResult(job, '/path/old.epub');
      job = service.setError(job, 'corrupted');
      expect(service.canDownload(job)).toBe(false);
    });
  });

  describe('isFailed()', () => {
    it('returns true for failed status', () => {
      const service = makeService();
      const job = service.setError(service.createJob({ bookId: 'b1', format: 'epub' }), 'timeout');
      expect(service.isFailed(job)).toBe(true);
    });

    it('returns true when error is present even if status not failed', () => {
      const service = makeService();
      const job = service.updateJob(service.createJob({ bookId: 'b1', format: 'epub' }), {
        error: 'something wrong',
      });
      expect(service.isFailed(job)).toBe(true);
    });

    it('returns false for pending job', () => {
      const service = makeService();
      const job = service.createJob({ bookId: 'b1', format: 'epub' });
      expect(service.isFailed(job)).toBe(false);
    });

    it('returns false for completed job', () => {
      const service = makeService();
      const job = service.setResult(
        service.createJob({ bookId: 'b1', format: 'epub' }),
        '/out.epub',
      );
      expect(service.isFailed(job)).toBe(false);
    });
  });

  describe('all formats', () => {
    const formats = ['epub', 'txt', 'markdown', 'qidian', 'fanqiao'] as const;
    it.each(formats)('accepts format %s', (format) => {
      const service = makeService();
      const job = service.createJob({ bookId: 'b1', format });
      expect(job.format).toBe(format);
    });
  });
});
