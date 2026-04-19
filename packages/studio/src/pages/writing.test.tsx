import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../lib/api', () => ({
  fetchBook: vi.fn(),
  fetchChapters: vi.fn(),
  startFastDraft: vi.fn(),
  startWriteNext: vi.fn(),
  startWriteDraft: vi.fn(),
  startUpgradeDraft: vi.fn(),
  getPipelineStatus: vi.fn(),
}));

import * as api from '../lib/api';
import Writing from './writing';

const mockBook = {
  id: 'book-001',
  title: '测试小说',
  genre: '玄幻',
  targetWords: 30000,
  currentWords: 6000,
  chapterCount: 2,
  targetChapterCount: 10,
  status: 'active',
  updatedAt: '2026-04-19T00:00:00.000Z',
};

const mockChapters = [
  {
    number: 1,
    title: '第一章',
    content: '内容1',
    status: 'published' as const,
    wordCount: 3000,
    qualityScore: 80,
    auditStatus: 'passed',
  },
  {
    number: 2,
    title: '第二章',
    content: '内容2',
    status: 'draft' as const,
    wordCount: 3000,
    qualityScore: null,
    auditStatus: null,
  },
];

const mockPipelineStatus = {
  pipelineId: 'pipeline-123',
  status: 'running',
  stages: ['planning', 'composing', 'writing', 'auditing', 'revising', 'persisting'],
  currentStage: 'planning',
  progress: {
    planning: { status: 'running', elapsedMs: 1000 },
    composing: { status: 'pending', elapsedMs: 0 },
    writing: { status: 'pending', elapsedMs: 0 },
    auditing: { status: 'pending', elapsedMs: 0 },
    revising: { status: 'pending', elapsedMs: 0 },
    persisting: { status: 'pending', elapsedMs: 0 },
  },
  startedAt: '2026-04-19T00:00:00.000Z',
};

function renderWithRouter(bookId = 'book-001') {
  return render(
    <MemoryRouter initialEntries={[`/writing?bookId=${bookId}`]}>
      <Routes>
        <Route path="/writing" element={<Writing />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('Writing Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders writing page header and book selector', async () => {
    vi.mocked(api.fetchBook).mockResolvedValue(mockBook);
    vi.mocked(api.fetchChapters).mockResolvedValue(mockChapters);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('快速试写')).toBeTruthy();
    });
    expect(screen.getByText('完整创作')).toBeTruthy();
  });

  it('shows fast draft panel with word count input', async () => {
    vi.mocked(api.fetchBook).mockResolvedValue(mockBook);
    vi.mocked(api.fetchChapters).mockResolvedValue(mockChapters);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('快速试写')).toBeTruthy();
    });

    // Word count input should be present
    const wordInput = screen.getByRole('spinbutton');
    expect(wordInput).toBeTruthy();
  });

  it('submits fast draft and shows result', async () => {
    const draftContent = '这是快速试写的草稿内容...';
    vi.mocked(api.fetchBook).mockResolvedValue(mockBook);
    vi.mocked(api.fetchChapters).mockResolvedValue(mockChapters);
    vi.mocked(api.startFastDraft).mockResolvedValue({
      content: draftContent,
      wordCount: 800,
      elapsedMs: 12000,
      llmCalls: 1,
      draftId: 'draft-temp-123',
    });

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('快速试写')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('开始快速试写'));
    });

    await waitFor(() => {
      expect(api.startFastDraft).toHaveBeenCalled();
    });

    expect(screen.getByText(draftContent)).toBeTruthy();
  });

  it('submits write-next and shows pipeline progress', async () => {
    vi.mocked(api.fetchBook).mockResolvedValue(mockBook);
    vi.mocked(api.fetchChapters).mockResolvedValue(mockChapters);
    vi.mocked(api.startWriteNext).mockResolvedValue({
      pipelineId: 'pipeline-123',
      status: 'running',
    });
    vi.mocked(api.getPipelineStatus).mockResolvedValue(mockPipelineStatus);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('完整创作')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('开始完整创作'));
    });

    await waitFor(() => {
      expect(api.startWriteNext).toHaveBeenCalled();
    });

    // Should show pipeline stages - use getAllByText since "规划中" appears in both status and stage
    const stageElements = screen.getAllByText('规划中');
    expect(stageElements.length).toBeGreaterThan(0);
  });

  it('submits draft mode write', async () => {
    vi.mocked(api.fetchBook).mockResolvedValue(mockBook);
    vi.mocked(api.fetchChapters).mockResolvedValue(mockChapters);
    vi.mocked(api.startWriteDraft).mockResolvedValue({
      number: 3,
      title: null,
      content: '【草稿模式】内容',
      status: 'draft',
      wordCount: 2000,
      qualityScore: null,
    });

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('完整创作')).toBeTruthy();
    });

    // Click draft mode button
    await act(async () => {
      fireEvent.click(screen.getByText('草稿模式'));
    });

    await waitFor(() => {
      expect(api.startWriteDraft).toHaveBeenCalled();
    });
  });

  it('shows quality metrics panel', async () => {
    vi.mocked(api.fetchBook).mockResolvedValue(mockBook);
    vi.mocked(api.fetchChapters).mockResolvedValue(mockChapters);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('质量仪表盘')).toBeTruthy();
    });

    expect(screen.getByText('平均质量')).toBeTruthy();
  });

  it('shows memory section', async () => {
    vi.mocked(api.fetchBook).mockResolvedValue(mockBook);
    vi.mocked(api.fetchChapters).mockResolvedValue(mockChapters);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('记忆提取')).toBeTruthy();
    });
    expect(screen.getByText('林晨')).toBeTruthy();
    expect(screen.getByText('苏小雨')).toBeTruthy();
  });

  it('allows custom intent input for write-next', async () => {
    vi.mocked(api.fetchBook).mockResolvedValue(mockBook);
    vi.mocked(api.fetchChapters).mockResolvedValue(mockChapters);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('完整创作')).toBeTruthy();
    });

    // Intent textarea should be present (in the full creation section)
    const textarea = screen.getByPlaceholderText('输入创作意图…');
    expect(textarea).toBeTruthy();

    fireEvent.change(textarea, { target: { value: '让主角发现线索' } });
    expect((textarea as HTMLTextAreaElement).value).toBe('让主角发现线索');
  });
});
