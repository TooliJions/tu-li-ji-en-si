import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../lib/api', () => ({
  fetchDoctorStatus: vi.fn(),
  fixLocks: vi.fn(),
  reorgRecovery: vi.fn(),
  fetchStateDiff: vi.fn(),
}));

import * as api from '../lib/api';
import DoctorView from './doctor-view';
import { pendingPromise } from '../test-utils/pending';

const mockDoctorStatus = {
  issues: [
    {
      type: 'stale_lock',
      path: 'books/book-001/.pipeline.lock',
      severity: 'warning',
      description: '存在过期的锁文件',
    },
    {
      type: 'missing_snapshot',
      path: 'books/book-001/chapters/3/snapshot.json',
      severity: 'error',
      description: '第 3 章快照缺失',
    },
  ],
  reorgSentinels: [],
  qualityBaseline: {
    status: 'established',
    version: 1,
    aiContamination: 'low',
    sampledBooks: 1,
    sampledChapters: 3,
  },
  providerHealth: [
    { provider: 'DashScope', status: 'configured', models: ['qwen3.6-plus'], bookCount: 1 },
    { provider: 'OpenAI', status: 'configured', models: ['gpt-4o'], bookCount: 1 },
  ],
};

const mockStateDiff = {
  file: 'current_state',
  summary: '系统从您的小说文本中提取到 3 处设定变更',
  changes: [
    {
      character: '林晨',
      field: 'location',
      oldValue: '教室',
      newValue: '办公室',
      naturalLanguage: '林晨的位置已从「教室」变更为「办公室」',
    },
    {
      character: '苏小雨',
      field: 'relationship',
      oldValue: '陌生人',
      newValue: '好友',
      naturalLanguage: '苏小雨与主角的关系已从「陌生人」变更为「好友」',
    },
  ],
  severity: 'warning',
};

function renderWithRouter() {
  return render(
    <MemoryRouter initialEntries={['/doctor']}>
      <Routes>
        <Route path="/doctor" element={<DoctorView />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('DoctorView Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state', () => {
    vi.mocked(api.fetchDoctorStatus).mockReturnValue(pendingPromise());

    renderWithRouter();

    expect(screen.getByText('加载中…')).toBeTruthy();
  });

  it('renders system doctor page title', async () => {
    vi.mocked(api.fetchDoctorStatus).mockResolvedValue(mockDoctorStatus);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('系统诊断')).toBeTruthy();
    });
  });

  it('displays issue list with severity badges', async () => {
    vi.mocked(api.fetchDoctorStatus).mockResolvedValue(mockDoctorStatus);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('系统诊断')).toBeTruthy();
    });

    // Issues should be visible
    expect(screen.getByText(/过期/)).toBeTruthy();
    expect(screen.getByText(/缺失/)).toBeTruthy();

    // Severity badges
    expect(screen.getAllByText('warning').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('error').length).toBeGreaterThanOrEqual(1);
  });

  it('shows provider health status', async () => {
    vi.mocked(api.fetchDoctorStatus).mockResolvedValue(mockDoctorStatus);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('系统诊断')).toBeTruthy();
    });

    expect(screen.getAllByText('DashScope').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('已配置').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/模型: qwen3.6-plus/)).toBeTruthy();
    expect(screen.getAllByText(/关联书籍: 1 本/).length).toBeGreaterThanOrEqual(1);
  });

  it('shows quality baseline status', async () => {
    vi.mocked(api.fetchDoctorStatus).mockResolvedValue(mockDoctorStatus);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('系统诊断')).toBeTruthy();
    });

    expect(screen.getByText('质量基线')).toBeTruthy();
    expect(screen.getByText('established')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('fixes stale locks', async () => {
    vi.mocked(api.fetchDoctorStatus).mockResolvedValue(mockDoctorStatus);
    vi.mocked(api.fixLocks).mockResolvedValue({ success: true, fixed: 1 });

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('系统诊断')).toBeTruthy();
    });

    const fixButtons = screen.getAllByTitle('修复锁');
    expect(fixButtons.length).toBeGreaterThanOrEqual(1);

    await act(async () => {
      fireEvent.click(fixButtons[0]);
    });

    await waitFor(() => {
      expect(api.fixLocks).toHaveBeenCalled();
    });
  });

  it('triggers reorg recovery', async () => {
    vi.mocked(api.fetchDoctorStatus).mockResolvedValue({
      ...mockDoctorStatus,
      reorgSentinels: [{ bookId: 'book-001', lastChapter: 5 }],
    });
    vi.mocked(api.reorgRecovery).mockResolvedValue({ success: true, restoredChapters: 3 });

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('系统诊断')).toBeTruthy();
    });

    const recoveryButton = screen.getByTitle('恢复重组');
    await act(async () => {
      fireEvent.click(recoveryButton);
    });

    await waitFor(() => {
      expect(api.reorgRecovery).toHaveBeenCalledWith('book-001');
    });
  });

  it('shows state diff comparison', async () => {
    vi.mocked(api.fetchDoctorStatus).mockResolvedValue(mockDoctorStatus);
    vi.mocked(api.fetchStateDiff).mockResolvedValue(mockStateDiff);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('系统诊断')).toBeTruthy();
    });

    // Click state diff button
    const diffButton = screen.getByTitle('状态差异');
    await act(async () => {
      fireEvent.click(diffButton);
    });

    // Diff panel should show summary
    await waitFor(() => {
      expect(screen.getByText(/设定变更/)).toBeTruthy();
    });

    // Natural language descriptions should be visible
    expect(screen.getByText(/林晨的位置/)).toBeTruthy();
    expect(screen.getByText(/苏小雨/)).toBeTruthy();
  });

  it('shows fix result success', async () => {
    vi.mocked(api.fetchDoctorStatus).mockResolvedValue(mockDoctorStatus);
    vi.mocked(api.fixLocks).mockResolvedValue({ success: true, fixed: 1 });

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('系统诊断')).toBeTruthy();
    });

    const fixButtons = screen.getAllByTitle('修复锁');

    await act(async () => {
      fireEvent.click(fixButtons[0]);
    });

    await waitFor(() => {
      expect(screen.getByText(/修复成功|已修复/)).toBeTruthy();
    });
  });

  it('shows no issues when issues list is empty', async () => {
    vi.mocked(api.fetchDoctorStatus).mockResolvedValue({
      ...mockDoctorStatus,
      issues: [],
      reorgSentinels: [],
    });

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('系统诊断')).toBeTruthy();
    });

    // Check that the "无问题" message is shown
    expect(screen.getByText(/无问题/)).toBeTruthy();
  });

  it('refreshes diagnosis on demand', async () => {
    vi.mocked(api.fetchDoctorStatus)
      .mockResolvedValueOnce({ ...mockDoctorStatus, issues: [] })
      .mockResolvedValueOnce({ ...mockDoctorStatus, issues: [mockDoctorStatus.issues[0]] });

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('系统诊断')).toBeTruthy();
    });

    // Initial: no issues
    expect(screen.queryByText(/过期/)).toBeNull();

    // Click refresh
    const refreshButton = screen.getByTitle('刷新诊断');
    await act(async () => {
      fireEvent.click(refreshButton);
    });

    await waitFor(() => {
      expect(screen.getByText(/过期/)).toBeTruthy();
    });
  });
});
