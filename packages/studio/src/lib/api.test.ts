import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyStyleImitation,
  extractStyleFingerprint,
  fetchBooks,
  fetchEmotionalArcs,
  fetchProjectionStatus,
  fetchStateDiff,
  fetchTruthFile,
  fetchTruthFiles,
  importMarkdown,
  initFanfic,
  reorgRecovery,
  updateTruthFile,
} from './api';

describe('studio api client paths', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses the books collection endpoint with optional filters', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    } as Response);

    await fetchBooks();
    await fetchBooks({ status: 'active', genre: '玄幻' });

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/books');
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/books?status=active&genre=%E7%8E%84%E5%B9%BB');
  });

  it('uses book-scoped truth file endpoints', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ data: { files: [], versionToken: 1 } }),
    } as Response);

    await fetchTruthFiles('book-001');
    await fetchTruthFile('book-001', 'current_state');
    await fetchProjectionStatus('book-001');
    await importMarkdown('book-001', 'current_state', '# heading');
    await updateTruthFile('book-001', 'current_state', '{}', 7);

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/books/book-001/state');
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/books/book-001/state/current_state');
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/api/books/book-001/state/projection-status'
    );
    expect(fetchMock).toHaveBeenNthCalledWith(4, '/api/books/book-001/state/import-markdown', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: 'current_state', markdownContent: '# heading' }),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(5, '/api/books/book-001/state/current_state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '{}', versionToken: 7 }),
    });
  });

  it('uses system-scoped doctor diff and passes recovery bookId', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ data: { ok: true } }),
    } as Response);

    await fetchStateDiff('current_state');
    await reorgRecovery('book-009');

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/system/state-diff?file=current_state');
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/system/doctor/reorg-recovery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookId: 'book-009' }),
    });
  });

  it('uses mounted fanfic, style and emotional-arc endpoints', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ data: { success: true, fingerprint: {}, characters: [], alerts: [] } }),
    } as Response);

    await initFanfic('book-001', {
      mode: 'au',
      description: 'parallel world',
      canonReference: '',
    });
    await extractStyleFingerprint('book-001', {
      referenceText: 'reference text',
      genre: '都市',
    });
    await applyStyleImitation('book-001', {
      fingerprint: { avgSentenceLength: 12 },
      intensity: 70,
    });
    await fetchEmotionalArcs('book-001');

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/books/book-001/fanfic/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'au',
        description: 'parallel world',
        canonReference: '',
      }),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/books/book-001/style/fingerprint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ referenceText: 'reference text', genre: '都市' }),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/books/book-001/style/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fingerprint: { avgSentenceLength: 12 }, intensity: 70 }),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(4, '/api/books/book-001/analytics/emotional-arcs');
  });
});