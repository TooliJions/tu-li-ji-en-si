import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import LogViewerPage from './log-viewer-page';

const mockEventSource = {
  close: vi.fn(),
  onmessage: null as ((event: { data: string }) => void) | null,
  onerror: null as (() => void) | null,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
};

vi.stubGlobal(
  'EventSource',
  vi.fn(() => mockEventSource)
);

function renderWithRouter(entry = '/logs?bookId=book-001') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/logs" element={<LogViewerPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('LogViewerPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEventSource.close.mockClear();
    mockEventSource.addEventListener.mockClear();
    mockEventSource.onmessage = null;
    mockEventSource.onerror = null;
  });

  it('shows empty-book state when bookId is missing', () => {
    renderWithRouter('/logs');

    expect(screen.getByText('请先选择一本书籍后再查看日志。')).toBeTruthy();
  });

  it('renders log filters and supports keyword search', async () => {
    renderWithRouter();

    expect(screen.getByText('日志查看')).toBeTruthy();
    expect(screen.getByPlaceholderText('搜索章节、错误或事件描述')).toBeTruthy();

    await act(async () => {
      mockEventSource.onmessage?.({
        data: JSON.stringify({
          type: 'daemon_event',
          timestamp: '2026-04-21T08:00:00.000Z',
          message: '守护进程启动',
        }),
      });
      mockEventSource.onmessage?.({
        data: JSON.stringify({
          type: 'chapter_error',
          timestamp: '2026-04-21T08:01:00.000Z',
          chapter: 3,
          error: '创作失败',
        }),
      });
    });

    await waitFor(() => {
      expect(screen.getByText('守护进程启动')).toBeTruthy();
      expect(screen.getByText('第3章 创作失败: 创作失败')).toBeTruthy();
    });

    fireEvent.change(screen.getByPlaceholderText('搜索章节、错误或事件描述'), {
      target: { value: '创作失败' },
    });

    await waitFor(() => {
      expect(screen.getByText('第3章 创作失败: 创作失败')).toBeTruthy();
      expect(screen.queryByText('守护进程启动')).toBeNull();
    });
  });
});
