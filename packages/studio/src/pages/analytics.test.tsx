import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Analytics from './analytics';
import * as api from '../lib/api';

vi.mock('../lib/api', () => ({
  fetchWordCount: vi.fn(),
  fetchAuditRate: vi.fn(),
  fetchTokenUsage: vi.fn(),
  fetchAiTrace: vi.fn(),
  fetchQualityBaseline: vi.fn(),
  fetchBaselineAlert: vi.fn(),
  fetchEmotionalArcs: vi.fn(),
  triggerInspirationShuffle: vi.fn(),
}));

const mockAiTraceHigh = {
  trend: [
    { chapter: 1, score: 0.1 },
    { chapter: 2, score: 0.15 },
    { chapter: 3, score: 0.25 },
  ],
  average: 0.17,
  latest: 0.25,
};

const mockAiTraceLow = {
  trend: [
    { chapter: 1, score: 0.05 },
    { chapter: 2, score: 0.08 },
    { chapter: 3, score: 0.1 },
  ],
  average: 0.08,
  latest: 0.1,
};

describe('Analytics - AI Trace Attention Zone', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.fetchWordCount as any).mockResolvedValue({
      totalWords: 10000,
      averagePerChapter: 3000,
      chapters: [],
    });
    (api.fetchAuditRate as any).mockResolvedValue({
      totalAudits: 5,
      passRate: 0.8,
      perChapter: [],
    });
    (api.fetchTokenUsage as any).mockResolvedValue({
      totalTokens: 5000,
      perChannel: { writer: 2000, auditor: 1000, planner: 500, composer: 500, reviser: 1000 },
      perChapter: [],
    });
    (api.fetchQualityBaseline as any).mockResolvedValue({
      baseline: {
        version: 1,
        basedOnChapters: [1, 2],
        createdAt: '2026-04-01',
        metrics: { aiTraceScore: 0.1, sentenceDiversity: 0.7, avgParagraphLength: 200 },
      },
      current: {
        aiTraceScore: 0.12,
        sentenceDiversity: 0.68,
        avgParagraphLength: 195,
        driftPercentage: 0.02,
        alert: false,
      },
    });
    (api.fetchBaselineAlert as any).mockResolvedValue(null);
    (api.fetchEmotionalArcs as any).mockResolvedValue({ characters: [], alerts: [] });
  });

  it('shows attention zone on AI trace chart', async () => {
    (api.fetchAiTrace as any).mockResolvedValue(mockAiTraceHigh);

    render(
      <MemoryRouter initialEntries={['/analytics?bookId=book-1']}>
        <Analytics />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(document.querySelector('[data-attention-zone]')).toBeInTheDocument();
    });
    expect(screen.getByText('关注区 0.20')).toBeDefined();
  });

  it('shows suggestion bubble when recent chapters enter attention zone', async () => {
    (api.fetchAiTrace as any).mockResolvedValue(mockAiTraceHigh);

    render(
      <MemoryRouter initialEntries={['/analytics?bookId=book-1']}>
        <Analytics />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('建议')).toBeDefined();
    });
    expect(screen.getByText(/近期的文字似乎有些刻板/)).toBeDefined();
  });

  it('does NOT show suggestion bubble when all scores are below threshold', async () => {
    (api.fetchAiTrace as any).mockResolvedValue(mockAiTraceLow);

    render(
      <MemoryRouter initialEntries={['/analytics?bookId=book-1']}>
        <Analytics />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('AI 痕迹趋势')).toBeDefined();
    });

    expect(screen.queryByText('建议')).toBeNull();
  });
});
