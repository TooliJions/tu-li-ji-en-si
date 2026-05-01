import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from './dashboard';
import * as api from '../lib/api';

vi.mock('../lib/api', () => ({
  fetchBooks: vi.fn(),
  deleteBook: vi.fn(),
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

describe('Dashboard Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (api.fetchBooks as any).mockResolvedValue(mockBooks);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (api.deleteBook as any).mockResolvedValue(true);
  });

  it('renders book list', async () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('我的书籍')).toBeDefined();
      expect(screen.getByText('测试书籍 1')).toBeDefined();
    });
  });

  it('uses book titles as the handoff entry into writing page', async () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    await waitFor(() => {
      const link = screen.getByText('测试书籍 1').closest('a');
      expect(link).toHaveAttribute('href', '/writing?bookId=book-1');
    });
  });

  it('shows a visible error when deleting a book fails', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (api.deleteBook as any).mockRejectedValue(new Error('删除书籍失败：状态目录被占用'));

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('测试书籍 1')).toBeDefined();
    });

    const deleteBtn = screen.getByTitle('删除书籍');
    fireEvent.pointerDown(deleteBtn);
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '确认删除' })).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: '确认删除' }));

    await waitFor(() => {
      expect(screen.getByText('删除书籍失败：状态目录被占用')).toBeDefined();
    });
  });
});
