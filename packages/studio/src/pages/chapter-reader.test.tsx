import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../lib/api', () => ({
  fetchChapter: vi.fn(),
  fetchAuditReport: vi.fn(),
  updateChapter: vi.fn(),
  runAudit: vi.fn(),
}));

import * as api from '../lib/api';
import ChapterReader from './chapter-reader';

const mockChapter = {
  number: 3,
  title: '第三章 暗流涌动',
  content:
    '林晨坐在教室里，望着窗外的雨幕。\n\n"你今天怎么了？"苏小雨轻声问道。\n\n"没什么，只是觉得有些事情不对劲。"林晨收回目光，将试卷翻到下一页。\n\n竞赛试卷的最后一道题，和他昨晚在旧档案室里看到的那份文件有着惊人的相似之处。',
  status: 'draft' as const,
  wordCount: 120,
  qualityScore: 85,
  auditStatus: null,
  createdAt: '2026-04-19T00:00:00.000Z',
  updatedAt: '2026-04-19T01:00:00.000Z',
};

const mockAuditReport = {
  chapterNumber: 3,
  overallStatus: 'passed',
  tiers: {
    blocker: { total: 12, passed: 12, failed: 0, items: [] },
    warning: {
      total: 12,
      passed: 11,
      failed: 1,
      items: [{ rule: 'POV_SHIFT', severity: 'warning', message: '段落3存在视角偏移' }],
    },
    suggestion: { total: 9, passed: 9, failed: 0, items: [] },
  },
  radarScores: [
    { dimension: 'ai_trace', label: 'AI 痕迹', score: 0.12 },
    { dimension: 'coherence', label: '连贯性', score: 0.91 },
    { dimension: 'pacing', label: '节奏', score: 0.78 },
    { dimension: 'dialogue', label: '对话', score: 0.85 },
  ],
};

function renderWithRouter(bookId = 'book-001', chapterNumber = '3') {
  return render(
    <MemoryRouter initialEntries={[`/book/${bookId}/chapter/${chapterNumber}`]}>
      <Routes>
        <Route path="/book/:bookId/chapter/:chapterNumber" element={<ChapterReader />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ChapterReader Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls fetchChapter on mount', async () => {
    vi.mocked(api.fetchChapter).mockResolvedValue(mockChapter);

    await act(async () => {
      renderWithRouter();
    });

    expect(api.fetchChapter).toHaveBeenCalledWith('book-001', 3);
  });

  it('renders chapter title and content on success', async () => {
    vi.mocked(api.fetchChapter).mockResolvedValue(mockChapter);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('第三章 暗流涌动')).toBeTruthy();
    });
    expect(screen.getByText(/林晨坐在教室里/)).toBeTruthy();
    expect(screen.getByText(/竞赛试卷的最后一道题/)).toBeTruthy();
  });

  it('shows chapter metadata', async () => {
    vi.mocked(api.fetchChapter).mockResolvedValue(mockChapter);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('120 字')).toBeTruthy();
    });
  });

  it('shows not-found state when chapter does not exist', async () => {
    vi.mocked(api.fetchChapter).mockRejectedValue(new Error('章节不存在'));

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('章节不存在')).toBeTruthy();
    });
  });

  it('toggles edit mode when clicking edit button', async () => {
    vi.mocked(api.fetchChapter).mockResolvedValue(mockChapter);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('第三章 暗流涌动')).toBeTruthy();
    });

    fireEvent.click(screen.getByTitle('编辑'));

    // Should show textarea for editing
    const textarea = screen.getByRole('textbox');
    expect(textarea).toBeTruthy();
    expect((textarea as HTMLTextAreaElement).value).toContain('林晨坐在教室里');
  });

  it('saves changes when clicking save in edit mode', async () => {
    vi.mocked(api.fetchChapter).mockResolvedValue(mockChapter);
    vi.mocked(api.updateChapter).mockResolvedValue({ ...mockChapter, content: '更新后的内容' });

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('第三章 暗流涌动')).toBeTruthy();
    });

    fireEvent.click(screen.getByTitle('编辑'));

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: '更新后的内容' } });

    await act(async () => {
      fireEvent.click(screen.getByTitle('保存'));
    });

    await waitFor(() => {
      expect(api.updateChapter).toHaveBeenCalledWith('book-001', 3, '更新后的内容');
    });
  });

  it('cancels edit mode when clicking cancel', async () => {
    vi.mocked(api.fetchChapter).mockResolvedValue(mockChapter);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('第三章 暗流涌动')).toBeTruthy();
    });

    fireEvent.click(screen.getByTitle('编辑'));
    expect(screen.getByRole('textbox')).toBeTruthy();

    fireEvent.click(screen.getByTitle('取消'));
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('toggles audit report panel when clicking audit button', async () => {
    vi.mocked(api.fetchChapter).mockResolvedValue(mockChapter);
    vi.mocked(api.fetchAuditReport).mockResolvedValue(mockAuditReport);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('第三章 暗流涌动')).toBeTruthy();
    });

    fireEvent.click(screen.getByTitle('审计报告'));

    await waitFor(() => {
      expect(screen.getByText('审计报告')).toBeTruthy();
    });
    expect(screen.getByText('AI 痕迹')).toBeTruthy();
    expect(screen.getByText('连贯性')).toBeTruthy();
  });

  it('toggles flow mode when clicking flow mode button', async () => {
    vi.mocked(api.fetchChapter).mockResolvedValue(mockChapter);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('第三章 暗流涌动')).toBeTruthy();
    });

    // Flow mode button should exist
    fireEvent.click(screen.getByTitle('心流模式'));

    // In flow mode, metadata and other UI elements should be hidden
    // Only the content should be prominently visible
    expect(screen.getByText(/林晨坐在教室里/)).toBeTruthy();
  });

  it('shows navigation to previous/next chapter', async () => {
    vi.mocked(api.fetchChapter).mockResolvedValue(mockChapter);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('第三章 暗流涌动')).toBeTruthy();
    });

    // Should have navigation links
    expect(screen.getByTitle('上一章')).toBeTruthy();
    expect(screen.getByTitle('下一章')).toBeTruthy();
  });

  it('shows pollution warning banner for polluted chapters', async () => {
    const pollutedChapter = {
      ...mockChapter,
      qualityScore: 20,
      status: 'draft' as const,
    };
    vi.mocked(api.fetchChapter).mockResolvedValue(pollutedChapter);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getAllByText('污染隔离').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows draft status badge', async () => {
    vi.mocked(api.fetchChapter).mockResolvedValue(mockChapter);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('草稿')).toBeTruthy();
    });
  });

  it('shows PollutionBadge component for polluted chapters', async () => {
    const pollutedChapter = {
      ...mockChapter,
      qualityScore: 20,
      status: 'draft' as const,
    };
    vi.mocked(api.fetchChapter).mockResolvedValue(pollutedChapter);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getAllByText('污染隔离').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('does not show PollutionBadge for clean chapters', async () => {
    vi.mocked(api.fetchChapter).mockResolvedValue(mockChapter);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('第三章 暗流涌动')).toBeTruthy();
    });

    expect(screen.queryByText('污染隔离')).toBeNull();
  });
});
