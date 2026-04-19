import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../lib/api', () => ({
  fetchBook: vi.fn(),
  fetchChapters: vi.fn(),
  fetchChapterSnapshots: vi.fn(),
  mergeChapters: vi.fn(),
  splitChapter: vi.fn(),
  rollbackChapter: vi.fn(),
}));

import * as api from '../lib/api';
import BookDetail from './book-detail';

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
    title: null,
    content: '内容2',
    status: 'draft' as const,
    wordCount: 3000,
    qualityScore: null,
    auditStatus: null,
  },
];

const mockSnapshots = [
  {
    id: 'snap-1',
    chapter: 2,
    label: '第2章快照',
    timestamp: '2026-04-19T08:00:00.000Z',
  },
];

function renderWithRouter(bookId = 'book-001') {
  return render(
    <MemoryRouter initialEntries={[`/book/${bookId}`]}>
      <Routes>
        <Route path="/book/:bookId" element={<BookDetail />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('BookDetail Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls fetchBook and fetchChapters on mount', async () => {
    vi.mocked(api.fetchBook).mockResolvedValue(mockBook);
    vi.mocked(api.fetchChapters).mockResolvedValue(mockChapters);

    await act(async () => {
      renderWithRouter();
    });

    expect(api.fetchBook).toHaveBeenCalledWith('book-001');
    expect(api.fetchChapters).toHaveBeenCalledWith('book-001');
  });

  it('renders book info and chapter list on success', async () => {
    vi.mocked(api.fetchBook).mockResolvedValue(mockBook);
    vi.mocked(api.fetchChapters).mockResolvedValue(mockChapters);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('测试小说')).toBeTruthy();
    });
    expect(screen.getByText('玄幻')).toBeTruthy();
    expect(screen.getByText('6,000 字')).toBeTruthy();
    expect(screen.getByText('2/10')).toBeTruthy();
    expect(screen.getByText('第一章')).toBeTruthy();
  });

  it('renders not-found state when book does not exist', async () => {
    vi.mocked(api.fetchBook).mockRejectedValue(new Error('书籍不存在'));
    vi.mocked(api.fetchChapters).mockResolvedValue([]);

    renderWithRouter('nonexistent');

    await waitFor(() => {
      expect(screen.getByText('书籍不存在')).toBeTruthy();
    });
  });

  it('renders empty chapter state when no chapters', async () => {
    vi.mocked(api.fetchBook).mockResolvedValue({ ...mockBook, chapterCount: 0, currentWords: 0 });
    vi.mocked(api.fetchChapters).mockResolvedValue([]);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('还没有章节，开始创作后章节会出现在这里')).toBeTruthy();
    });
  });

  it('shows chapter status badges', async () => {
    vi.mocked(api.fetchBook).mockResolvedValue(mockBook);
    vi.mocked(api.fetchChapters).mockResolvedValue(mockChapters);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('草稿')).toBeTruthy();
    });
    expect(screen.getByText('已审计')).toBeTruthy();
  });

  it('opens and closes action menu', async () => {
    vi.mocked(api.fetchBook).mockResolvedValue(mockBook);
    vi.mocked(api.fetchChapters).mockResolvedValue(mockChapters);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('测试小说')).toBeTruthy();
    });

    const menuButtons = screen.getAllByTitle('更多操作');
    fireEvent.click(menuButtons[menuButtons.length - 1]);

    expect(screen.getByText('与上一章合并')).toBeTruthy();
    expect(screen.getByText('拆分为两章')).toBeTruthy();
    expect(screen.getByText('回滚到快照')).toBeTruthy();

    fireEvent.click(menuButtons[menuButtons.length - 1]);
    expect(screen.queryByText('与上一章合并')).toBeNull();
  });

  it('calls merge API when merging chapters', async () => {
    vi.mocked(api.fetchBook).mockResolvedValue(mockBook);
    vi.mocked(api.fetchChapters).mockResolvedValue(mockChapters);
    vi.mocked(api.fetchChapterSnapshots).mockResolvedValue([]);
    vi.mocked(api.mergeChapters).mockResolvedValue(true);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('测试小说')).toBeTruthy();
    });

    const menuButtons = screen.getAllByTitle('更多操作');
    fireEvent.click(menuButtons[menuButtons.length - 1]);

    await act(async () => {
      fireEvent.click(screen.getByText('与上一章合并'));
    });

    await waitFor(() => {
      expect(api.mergeChapters).toHaveBeenCalledWith('book-001', 1, 2);
    });
  });

  it('shows pollution badge on polluted chapters', async () => {
    const pollutedChapters = [
      { ...mockChapters[0], qualityScore: null, warningCode: 'accept_with_warnings' as const },
      mockChapters[1],
    ];
    vi.mocked(api.fetchBook).mockResolvedValue(mockBook);
    vi.mocked(api.fetchChapters).mockResolvedValue(pollutedChapters);
    vi.mocked(api.fetchChapterSnapshots).mockResolvedValue([]);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('污染隔离')).toBeTruthy();
    });
    expect(screen.getByText('强制通过')).toBeTruthy();
  });

  it('does not show pollution badge on clean chapters', async () => {
    const cleanChapters = [{ ...mockChapters[0], qualityScore: 85 }, mockChapters[1]];
    vi.mocked(api.fetchBook).mockResolvedValue(mockBook);
    vi.mocked(api.fetchChapters).mockResolvedValue(cleanChapters);
    vi.mocked(api.fetchChapterSnapshots).mockResolvedValue([]);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('测试小说')).toBeTruthy();
    });

    expect(screen.queryByText('污染隔离')).toBeNull();
  });

  it('opens TimeDial with real snapshots before rollback', async () => {
    vi.mocked(api.fetchBook).mockResolvedValue(mockBook);
    vi.mocked(api.fetchChapters).mockResolvedValue(mockChapters);
    vi.mocked(api.fetchChapterSnapshots).mockResolvedValue(mockSnapshots);
    vi.mocked(api.rollbackChapter).mockResolvedValue(true);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('测试小说')).toBeTruthy();
    });

    const menuButtons = screen.getAllByTitle('更多操作');
    fireEvent.click(menuButtons[menuButtons.length - 1]);

    await act(async () => {
      fireEvent.click(screen.getByText('回滚到快照'));
    });

    await waitFor(() => {
      expect(api.fetchChapterSnapshots).toHaveBeenCalledWith('book-001', 2);
      expect(screen.getByText('时间回溯')).toBeTruthy();
      expect(screen.getByText('第2章快照')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('第2章快照'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('确认回滚'));
    });

    await waitFor(
      () => {
        expect(api.rollbackChapter).toHaveBeenCalledWith('book-001', 2, 'snap-1');
      },
      { timeout: 2000 }
    );
  });
});
