import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from './dashboard';
import * as api from '../lib/api';

vi.mock('../lib/api', () => ({
  fetchBooks: vi.fn(),
  fetchAiTrace: vi.fn(),
  deleteBook: vi.fn(),
  fetchBookActivity: vi.fn(),
}));

const mockBooks = [
  {
    id: 'book-1',
    title: '测试书籍 1',
    genre: '科幻',
    targetWords: 10000,
    currentWords: 5000,
    chapterCount: 5,
    targetChapterCount: 10,
    status: 'active',
    updatedAt: new Date().toISOString(),
  },
];

const mockTrace = {
  trend: [
    { chapter: 1, score: 0.8 },
    { chapter: 2, score: 0.85 },
  ],
  average: 0.82,
};

describe('Dashboard Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.fetchBooks as any).mockResolvedValue(mockBooks);
    (api.fetchAiTrace as any).mockResolvedValue(mockTrace);
    (api.deleteBook as any).mockResolvedValue(true);
    (api.fetchBookActivity as any).mockResolvedValue([]);
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true)
    );
  });

  it('renders stats and book list', async () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('仪表盘')).toBeDefined();
      expect(screen.getByText('测试书籍 1')).toBeDefined();
      expect(screen.getAllByText(/5,000/).length).toBeGreaterThan(0);
    });
  });

  it('uses book titles as the handoff entry into BookDetail', async () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    await waitFor(() => {
      const link = screen.getByText('测试书籍 1').closest('a');
      expect(link).toHaveAttribute('href', '/book/book-1');
    });
  });

  it('renders quality trend chart', async () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('近 7 章质量评分趋势')).toBeDefined();
      expect(screen.getByText('第1章')).toBeDefined();
      expect(screen.getByText('80%')).toBeDefined();
    });
  });

  it('shows a visible error when deleting a book fails', async () => {
    (api.deleteBook as any).mockRejectedValue(new Error('删除书籍失败：状态目录被占用'));

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('测试书籍 1')).toBeDefined();
    });

    fireEvent.click(screen.getByTitle('删除书籍'));

    await waitFor(() => {
      expect(screen.getByText('删除书籍失败：状态目录被占用')).toBeDefined();
    });
  });

  // TODO: Add error toast for activity fetch failures. Component currently silently ignores them.
  it.skip('shows a visible warning when recent activity loading fails', async () => {
    (api.fetchBookActivity as any).mockRejectedValue(new Error('最近活动暂不可用'));

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/最近活动暂.*不可用/)).toBeDefined();
    });

    expect(screen.getByText('质量趋势 (近7章)')).toBeDefined();
  });
});
