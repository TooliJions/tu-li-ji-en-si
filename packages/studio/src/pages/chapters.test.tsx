import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../lib/api', () => ({
  fetchBooks: vi.fn(),
  fetchChapters: vi.fn(),
}));

import * as api from '../lib/api';
import ChaptersPage from './chapters';

const mockBooks = [
  {
    id: 'book-001',
    title: '测试小说',
    genre: '玄幻',
    targetWords: 30000,
    currentWords: 6000,
    chapterCount: 2,
    targetChapterCount: 10,
    status: 'active',
    updatedAt: '2026-04-19T00:00:00.000Z',
  },
];

function renderWithRouter() {
  return render(
    <MemoryRouter initialEntries={['/chapters']}>
      <Routes>
        <Route path="/chapters" element={<ChaptersPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('Chapters Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders a real chapter workspace with runtime entry links', async () => {
    vi.mocked(api.fetchBooks).mockResolvedValue(mockBooks);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('书籍与章节')).toBeTruthy();
    });

    expect(screen.queryByText('页面开发中…')).toBeNull();
    expect(screen.getByText('页面说明')).toBeTruthy();
    expect(screen.getByText('测试小说')).toBeTruthy();
    expect(screen.getByRole('link', { name: '打开章节列表' })).toHaveAttribute(
      'href',
      '/book/book-001'
    );
    expect(screen.getByRole('link', { name: '文风配置' })).toHaveAttribute(
      'href',
      '/style-manager?bookId=book-001'
    );
  });

  it('shows an empty-state path to create a book', async () => {
    vi.mocked(api.fetchBooks).mockResolvedValue([]);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('还没有书籍可供浏览')).toBeTruthy();
    });

    const createLinks = screen.getAllByRole('link', { name: '去创建书籍' });
    expect(createLinks.length).toBeGreaterThanOrEqual(1);
    for (const link of createLinks) {
      expect(link).toHaveAttribute('href', '/book-create');
    }
  });
});
