import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../lib/api', () => ({
  fetchDaemonStatus: vi.fn(),
  startDaemon: vi.fn(),
  pauseDaemon: vi.fn(),
  stopDaemon: vi.fn(),
}));

// Mock EventSource for SSE
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

import * as api from '../lib/api';
import DaemonControl from './daemon-control';
import { pendingPromise } from '../test-utils/pending';

const mockIdleStatus = {
  status: 'idle',
  nextChapter: 1,
  chaptersCompleted: 0,
  intervalSeconds: 30,
  dailyTokenUsed: 0,
  dailyTokenLimit: 1000000,
  consecutiveFallbacks: 0,
  startedAt: null,
};

const mockRunningStatus = {
  ...mockIdleStatus,
  status: 'running',
  nextChapter: 5,
  chaptersCompleted: 4,
  intervalSeconds: 60,
  dailyTokenUsed: 350000,
  startedAt: '2026-04-19T08:00:00.000Z',
};

function renderWithRouter(bookId = 'book-001') {
  return render(
    <MemoryRouter initialEntries={[`/daemon?bookId=${bookId}`]}>
      <Routes>
        <Route path="/daemon" element={<DaemonControl />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('DaemonControl Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEventSource.close.mockClear();
    mockEventSource.addEventListener.mockClear();
  });

  it('shows empty state when bookId is missing', async () => {
    render(
      <MemoryRouter initialEntries={['/daemon']}>
        <Routes>
          <Route path="/daemon" element={<DaemonControl />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('请先选择一本书籍。')).toBeTruthy();
    });

    expect(api.fetchDaemonStatus).not.toHaveBeenCalled();
  });

  it('shows loading state', async () => {
    vi.mocked(api.fetchDaemonStatus).mockImplementation(() => pendingPromise());

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('加载中…')).toBeTruthy();
    });
  });

  it('renders daemon status and config', async () => {
    vi.mocked(api.fetchDaemonStatus).mockResolvedValue(mockIdleStatus);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('守护进程')).toBeTruthy();
    });

    expect(screen.getByText('空闲')).toBeTruthy();
    expect(screen.getByText('30s')).toBeTruthy();
    expect(screen.getByText('1,000,000')).toBeTruthy();
  });

  it('shows running status with progress', async () => {
    vi.mocked(api.fetchDaemonStatus).mockResolvedValue(mockRunningStatus);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('运行中')).toBeTruthy();
    });
    expect(screen.getByText('第 5 章')).toBeTruthy();
    expect(screen.getByText('60s')).toBeTruthy();
    // Token usage shows percentage
    expect(screen.getByText('35%')).toBeTruthy();
  });

  it('starts the daemon with configuration', async () => {
    vi.mocked(api.fetchDaemonStatus).mockResolvedValue(mockIdleStatus);
    vi.mocked(api.startDaemon).mockResolvedValue(mockRunningStatus);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('守护进程')).toBeTruthy();
    });

    // Configure and start — inputs are in a 3-column grid, find by role and order
    const inputs = screen.getAllByRole('spinbutton');
    // inputs[0] = 起始章节, inputs[1] = 目标章节, inputs[2] = 间隔时间
    fireEvent.change(inputs[0], { target: { value: '1' } });
    fireEvent.change(inputs[1], { target: { value: '10' } });
    fireEvent.change(inputs[2], { target: { value: '60' } });

    await act(async () => {
      fireEvent.click(screen.getByText('启动生产'));
    });

    await waitFor(() => {
      expect(api.startDaemon).toHaveBeenCalledWith('book-001', {
        fromChapter: 1,
        toChapter: 10,
        interval: 60,
      });
    });
  });

  it('pauses a running daemon', async () => {
    vi.mocked(api.fetchDaemonStatus).mockResolvedValue(mockRunningStatus);
    vi.mocked(api.pauseDaemon).mockResolvedValue({ ...mockRunningStatus, status: 'paused' });

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('运行中')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('暂停'));
    });

    await waitFor(() => {
      expect(api.pauseDaemon).toHaveBeenCalledWith('book-001');
    });
  });

  it('stops a running daemon', async () => {
    vi.mocked(api.fetchDaemonStatus).mockResolvedValue(mockRunningStatus);
    vi.mocked(api.stopDaemon).mockResolvedValue({ ...mockRunningStatus, status: 'stopped' });

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('运行中')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('停止'));
    });

    await waitFor(() => {
      expect(api.stopDaemon).toHaveBeenCalledWith('book-001');
    });
  });

  it('resumes a paused daemon', async () => {
    vi.mocked(api.fetchDaemonStatus).mockResolvedValue({ ...mockRunningStatus, status: 'paused' });
    vi.mocked(api.startDaemon).mockResolvedValue(mockRunningStatus);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('已暂停')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('继续'));
    });

    await waitFor(() => {
      expect(api.startDaemon).toHaveBeenCalledWith('book-001', expect.any(Object));
    });
  });

  it('shows log panel with filter', async () => {
    vi.mocked(api.fetchDaemonStatus).mockResolvedValue(mockIdleStatus);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('运行日志')).toBeTruthy();
    });

    // Simulate SSE event
    if (mockEventSource.onmessage) {
      mockEventSource.onmessage({
        data: JSON.stringify({
          type: 'daemon_event',
          timestamp: '2026-04-19T08:00:00.000Z',
          message: '守护进程启动',
        }),
      });
    }

    await waitFor(() => {
      expect(screen.getByText('守护进程启动')).toBeTruthy();
    });

    // Filter dropdown
    expect(screen.getByRole('combobox')).toBeTruthy();
  });

  it('filters logs by level', async () => {
    vi.mocked(api.fetchDaemonStatus).mockResolvedValue(mockIdleStatus);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('运行日志')).toBeTruthy();
    });

    // Simulate info event
    if (mockEventSource.onmessage) {
      mockEventSource.onmessage({
        data: JSON.stringify({
          type: 'daemon_event',
          timestamp: '2026-04-19T08:00:00.000Z',
          message: '守护进程启动',
        }),
      });
      // Simulate error event
      mockEventSource.onmessage({
        data: JSON.stringify({
          type: 'chapter_error',
          timestamp: '2026-04-19T08:04:00.000Z',
          chapter: 3,
          error: '创作失败',
        }),
      });
    }

    await waitFor(() => {
      expect(screen.getByText('守护进程启动')).toBeTruthy();
      expect(screen.getByText('第3章 创作失败: 创作失败')).toBeTruthy();
    });

    // Select error filter
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'error' } });

    // Only error logs should be visible
    await waitFor(() => {
      expect(screen.getByText('第3章 创作失败: 创作失败')).toBeTruthy();
      expect(screen.queryByText('守护进程启动')).toBeNull();
    });
  });

  it('shows token usage progress bar', async () => {
    vi.mocked(api.fetchDaemonStatus).mockResolvedValue(mockRunningStatus);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('Token 用量')).toBeTruthy();
    });

    expect(screen.getByText('35%')).toBeTruthy();
  });

  it('shows consecutive fallbacks warning', async () => {
    vi.mocked(api.fetchDaemonStatus).mockResolvedValue({
      ...mockIdleStatus,
      consecutiveFallbacks: 3,
    });

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('守护进程')).toBeTruthy();
    });

    expect(screen.getByText(/连续生成失败回退/)).toBeTruthy();
  });
});
