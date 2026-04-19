import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../lib/api', () => ({
  fetchWordCount: vi.fn(),
  fetchAuditRate: vi.fn(),
  fetchTokenUsage: vi.fn(),
  fetchAiTrace: vi.fn(),
  fetchQualityBaseline: vi.fn(),
  fetchBaselineAlert: vi.fn(),
  triggerInspirationShuffle: vi.fn(),
}));

import * as api from '../lib/api';
import Analytics from './analytics';

const mockWordCount = {
  totalWords: 12000,
  averagePerChapter: 3000,
  chapters: [
    { number: 1, words: 3200 },
    { number: 2, words: 2800 },
    { number: 3, words: 3000 },
    { number: 4, words: 3000 },
  ],
};

const mockAuditRate = {
  totalAudits: 3,
  passRate: 0.85,
  perChapter: [
    { number: 1, passed: true },
    { number: 2, passed: false },
    { number: 3, passed: true },
  ],
};

const mockTokenUsage = {
  totalTokens: 45000,
  perChapter: {
    writer: 20000,
    auditor: 12000,
    planner: 5000,
    composer: 3000,
    reviser: 5000,
  },
};

const mockAiTrace = {
  trend: [
    { chapter: 1, score: 0.25 },
    { chapter: 2, score: 0.18 },
    { chapter: 3, score: 0.12 },
  ],
  average: 0.18,
  latest: 0.12,
};

const mockQualityBaseline = {
  baseline: {
    version: 1,
    basedOnChapters: [1, 2],
    createdAt: '2026-04-18T00:00:00.000Z',
    metrics: { aiTraceScore: 0.15, sentenceDiversity: 0.82, avgParagraphLength: 48 },
  },
  current: {
    aiTraceScore: 0.15,
    sentenceDiversity: 0.82,
    avgParagraphLength: 48,
    driftPercentage: 0,
    alert: false,
  },
};

const mockBaselineAlert = {
  metric: 'aiTraceScore',
  baseline: 0.15,
  threshold: 0.2,
  windowSize: 3,
  slidingAverage: 0.15,
  chaptersAnalyzed: [1, 2, 3],
  triggered: false,
  consecutiveChapters: 0,
  severity: 'ok',
  suggestedAction: null,
  inspirationShuffle: { available: false },
};

const mockInspirationShuffle = {
  alternatives: [
    {
      id: 'A',
      style: 'fast_paced',
      label: '快节奏视角',
      text: '门被猛地推开，林晨冲进走廊。他的心跳加速，呼吸急促。没有时间犹豫了。档案室的钥匙在口袋里发烫，每一秒都可能是最后的机会。',
      wordCount: 2800,
      characteristics: ['短句为主', '紧张感拉满'],
    },
    {
      id: 'B',
      style: 'lyrical',
      label: '抒情回忆',
      text: '窗外的雨，像极了那个秋天的午后。林晨望着玻璃上滑落的水珠，思绪飘向了远方。那时候的苏小雨，总是笑着说起未来的事。',
      wordCount: 2600,
      characteristics: ['情感细腻', '回忆交织'],
    },
  ],
  generationTime: 8.2,
};

function renderWithRouter(bookId = 'book-001') {
  return render(
    <MemoryRouter initialEntries={[`/analytics?bookId=${bookId}`]}>
      <Routes>
        <Route path="/analytics" element={<Analytics />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('Analytics Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state', () => {
    vi.mocked(api.fetchWordCount).mockResolvedValue(mockWordCount);
    vi.mocked(api.fetchAuditRate).mockResolvedValue(mockAuditRate);
    vi.mocked(api.fetchTokenUsage).mockResolvedValue(mockTokenUsage);
    vi.mocked(api.fetchAiTrace).mockResolvedValue(mockAiTrace);
    vi.mocked(api.fetchQualityBaseline).mockResolvedValue(mockQualityBaseline);
    vi.mocked(api.fetchBaselineAlert).mockResolvedValue(mockBaselineAlert);

    renderWithRouter();

    expect(screen.getByText('加载中…')).toBeTruthy();
  });

  it('renders word count chart with chapter data', async () => {
    vi.mocked(api.fetchWordCount).mockResolvedValue(mockWordCount);
    vi.mocked(api.fetchAuditRate).mockResolvedValue(mockAuditRate);
    vi.mocked(api.fetchTokenUsage).mockResolvedValue(mockTokenUsage);
    vi.mocked(api.fetchAiTrace).mockResolvedValue(mockAiTrace);
    vi.mocked(api.fetchQualityBaseline).mockResolvedValue(mockQualityBaseline);
    vi.mocked(api.fetchBaselineAlert).mockResolvedValue(mockBaselineAlert);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('字数统计')).toBeTruthy();
    });
    // Chapter bars should be visible
    expect(screen.getByText('第1章')).toBeTruthy();
    expect(screen.getByText('第4章')).toBeTruthy();
    // Word count bars show chapter word counts
    expect(screen.getByText('3,200')).toBeTruthy();
    expect(screen.getByText('2,800')).toBeTruthy();
  });

  it('renders audit rate section', async () => {
    vi.mocked(api.fetchWordCount).mockResolvedValue(mockWordCount);
    vi.mocked(api.fetchAuditRate).mockResolvedValue(mockAuditRate);
    vi.mocked(api.fetchTokenUsage).mockResolvedValue(mockTokenUsage);
    vi.mocked(api.fetchAiTrace).mockResolvedValue(mockAiTrace);
    vi.mocked(api.fetchQualityBaseline).mockResolvedValue(mockQualityBaseline);
    vi.mocked(api.fetchBaselineAlert).mockResolvedValue(mockBaselineAlert);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('审计通过率')).toBeTruthy();
    });
    expect(screen.getByText('85.0%')).toBeTruthy();
  });

  it('renders token usage breakdown', async () => {
    vi.mocked(api.fetchWordCount).mockResolvedValue(mockWordCount);
    vi.mocked(api.fetchAuditRate).mockResolvedValue(mockAuditRate);
    vi.mocked(api.fetchTokenUsage).mockResolvedValue(mockTokenUsage);
    vi.mocked(api.fetchAiTrace).mockResolvedValue(mockAiTrace);
    vi.mocked(api.fetchQualityBaseline).mockResolvedValue(mockQualityBaseline);
    vi.mocked(api.fetchBaselineAlert).mockResolvedValue(mockBaselineAlert);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('Token 用量')).toBeTruthy();
    });
    expect(screen.getByText('45,000')).toBeTruthy();
    expect(screen.getByText('writer')).toBeTruthy();
    expect(screen.getByText('auditor')).toBeTruthy();
  });

  it('renders AI trace trend', async () => {
    vi.mocked(api.fetchWordCount).mockResolvedValue(mockWordCount);
    vi.mocked(api.fetchAuditRate).mockResolvedValue(mockAuditRate);
    vi.mocked(api.fetchTokenUsage).mockResolvedValue(mockTokenUsage);
    vi.mocked(api.fetchAiTrace).mockResolvedValue(mockAiTrace);
    vi.mocked(api.fetchQualityBaseline).mockResolvedValue(mockQualityBaseline);
    vi.mocked(api.fetchBaselineAlert).mockResolvedValue(mockBaselineAlert);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('AI 痕迹趋势')).toBeTruthy();
    });
    expect(screen.getByText('12.0%')).toBeTruthy(); // latest score
  });

  it('renders quality baseline info', async () => {
    vi.mocked(api.fetchWordCount).mockResolvedValue(mockWordCount);
    vi.mocked(api.fetchAuditRate).mockResolvedValue(mockAuditRate);
    vi.mocked(api.fetchTokenUsage).mockResolvedValue(mockTokenUsage);
    vi.mocked(api.fetchAiTrace).mockResolvedValue(mockAiTrace);
    vi.mocked(api.fetchQualityBaseline).mockResolvedValue(mockQualityBaseline);
    vi.mocked(api.fetchBaselineAlert).mockResolvedValue(mockBaselineAlert);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('质量基线')).toBeTruthy();
    });
    expect(screen.getByText('v1')).toBeTruthy();
  });

  it('shows baseline alert status', async () => {
    vi.mocked(api.fetchWordCount).mockResolvedValue(mockWordCount);
    vi.mocked(api.fetchAuditRate).mockResolvedValue(mockAuditRate);
    vi.mocked(api.fetchTokenUsage).mockResolvedValue(mockTokenUsage);
    vi.mocked(api.fetchAiTrace).mockResolvedValue(mockAiTrace);
    vi.mocked(api.fetchQualityBaseline).mockResolvedValue(mockQualityBaseline);
    vi.mocked(api.fetchBaselineAlert).mockResolvedValue({
      ...mockBaselineAlert,
      triggered: true,
      severity: 'warning',
      suggestedAction: '建议运行灵感洗牌',
    });

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('基线漂移告警')).toBeTruthy();
    });
    expect(screen.getByText('建议运行灵感洗牌')).toBeTruthy();
  });

  it('triggers inspiration shuffle and shows results', async () => {
    vi.mocked(api.fetchWordCount).mockResolvedValue(mockWordCount);
    vi.mocked(api.fetchAuditRate).mockResolvedValue(mockAuditRate);
    vi.mocked(api.fetchTokenUsage).mockResolvedValue(mockTokenUsage);
    vi.mocked(api.fetchAiTrace).mockResolvedValue(mockAiTrace);
    vi.mocked(api.fetchQualityBaseline).mockResolvedValue(mockQualityBaseline);
    vi.mocked(api.fetchBaselineAlert).mockResolvedValue(mockBaselineAlert);
    vi.mocked(api.triggerInspirationShuffle).mockResolvedValue(mockInspirationShuffle);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('灵感洗牌')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('生成灵感'));
    });

    await waitFor(() => {
      expect(api.triggerInspirationShuffle).toHaveBeenCalled();
    });

    expect(screen.getByText('快节奏视角')).toBeTruthy();
    expect(screen.getByText('抒情回忆')).toBeTruthy();
  });
});
