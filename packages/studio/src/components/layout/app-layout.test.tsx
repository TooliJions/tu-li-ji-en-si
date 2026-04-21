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

  it('renders a default right-side info panel on non-writing pages', async () => {
    render(
      <MemoryRouter initialEntries={['/book/book-1']}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/book/:bookId" element={<div>详情页</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('属性 / 状态 / 质量')).toBeTruthy();
      expect(screen.getByText('日志输出')).toBeTruthy();
      expect(screen.getByText('当前工作区')).toBeTruthy();
    });
  });

  it('does not inject the outer right-side info panel on writing pages', async () => {
    render(
      <MemoryRouter initialEntries={['/writing?bookId=book-1']}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/writing" element={<div>写作页</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('写作页')).toBeTruthy();
    });

    expect(screen.queryByText('属性 / 状态 / 质量')).toBeNull();
    expect(screen.queryByText('日志输出')).toBeNull();
  });

  it('renders sidebar navigation and outlet content', async () => {
    render(
      <MemoryRouter initialEntries={['/writing-plan']}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/writing-plan" element={<div>创作规划</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('创作规划')).toBeTruthy();
      expect(screen.getByText('CyberNovelist')).toBeTruthy();
    });
  });
});
