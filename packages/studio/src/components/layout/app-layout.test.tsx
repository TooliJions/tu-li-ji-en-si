import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AppLayout from './app-layout';

vi.mock('../../lib/api', () => ({
  fetchBook: vi.fn(),
  fetchBooks: vi.fn(),
}));

import * as api from '../../lib/api';

describe('AppLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.fetchBooks).mockResolvedValue([]);
    vi.mocked(api.fetchBook).mockResolvedValue({
      id: 'book-1',
      title: '孽徒大唐',
      chapterCount: 2,
      targetChapterCount: 500,
      status: 'active',
    });
  });

  it('renders sidebar navigation and outlet content', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<div>主页</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('主页')).toBeTruthy();
      expect(screen.getByText('CyberNovelist')).toBeTruthy();
    });
  });

  it('auto-associates current book context from the page bookId into the header', async () => {
    render(
      <MemoryRouter initialEntries={['/writing?bookId=book-1']}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/writing" element={<div>写作页</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('孽徒大唐')).toBeTruthy();
    });

    expect(screen.getByText('当前书籍：')).toBeTruthy();
  });
});
