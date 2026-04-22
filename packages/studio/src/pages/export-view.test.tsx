import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('../lib/api', () => ({
  fetchBooks: vi.fn(),
  fetchConfig: vi.fn(),
  startExport: vi.fn(),
  fetchChapters: vi.fn().mockResolvedValue([]),
}));

import * as api from '../lib/api';
import ExportView from './export-view';

const mockBooks = [
  {
    id: 'book-001',
    title: '测试小说',
    genre: '玄幻',
    chapterCount: 12,
    targetChapterCount: 100,
    currentWords: 32000,
  },
];

function renderWithRouter(entry = '/export?bookId=book-001') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/export" element={<ExportView />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ExportView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders export page with selected book context', async () => {
    vi.mocked(api.fetchBooks).mockResolvedValue(mockBooks as never);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('导出')).toBeTruthy();
    });

    expect(screen.getByText('测试小说')).toBeTruthy();
    expect(screen.getByText('Markdown')).toBeTruthy();
    expect(screen.getByRole('button', { name: '开始导出' })).toBeTruthy();
  });

  it('starts export for the selected book and format', async () => {
    vi.mocked(api.fetchBooks).mockResolvedValue(mockBooks as never);
    vi.mocked(api.startExport).mockResolvedValue({
      filename: '测试小说.txt',
      format: 'txt',
    } as never);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('测试小说')).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: 'TXT 纯文本导出，适合快速交付与校对。' }));
    fireEvent.click(screen.getByRole('button', { name: '开始导出' }));

    await waitFor(() => {
      expect(api.startExport).toHaveBeenCalled();
    });
    expect(screen.getByText('已下载 测试小说，文件：测试小说.txt。')).toBeTruthy();
  });
});
