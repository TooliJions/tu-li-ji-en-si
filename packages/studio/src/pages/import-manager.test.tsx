import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ImportManager from './import-manager';
import * as api from '../lib/api';

vi.mock('../lib/api', () => ({
  fetchTruthFiles: vi.fn(),
  fetchProjectionStatus: vi.fn(),
  importMarkdown: vi.fn(),
  fetchStateDiff: vi.fn(),
}));

const mockFiles = {
  files: [
    { name: 'current_state', updatedAt: '2026-04-21T09:00:00.000Z', size: 2048 },
    { name: 'hooks', updatedAt: '2026-04-21T09:10:00.000Z', size: 1024 },
  ],
};

const mockProjection = {
  synced: false,
  jsonHash: 'hash-001',
  markdownMtime: '2026-04-21T09:30:00.000Z',
  discrepancies: ['current_state.md 比 JSON 新 2 小时'],
};

const mockDiff = {
  file: 'current_state',
  summary: '检测到 2 项状态差异',
  severity: 'warning',
  changes: [
    {
      character: '林晨',
      field: 'emotion',
      oldValue: '谨慎',
      newValue: '自信',
      naturalLanguage: '系统发现您在文本中将【林晨】的心情改为了【自信】。',
    },
  ],
};

function renderWithRouter(entry = '/import-manager?bookId=book-001') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/import-manager" element={<ImportManager />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ImportManager Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.fetchTruthFiles).mockResolvedValue(mockFiles as any);
    vi.mocked(api.fetchProjectionStatus).mockResolvedValue(mockProjection as any);
    vi.mocked(api.fetchStateDiff).mockResolvedValue(mockDiff as any);
    vi.mocked(api.importMarkdown).mockResolvedValue({
      parsed: { versionToken: 14, diff: ['emotion'] },
      preview: '成功同步 1 项变更',
    } as any);
  });

  it('shows empty state when bookId is missing', () => {
    renderWithRouter('/import-manager');

    expect(screen.getByText('请先选择一本书籍后再管理状态导入。')).toBeTruthy();
  });

  it('loads projection status and opens diff view', async () => {
    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('导入管理')).toBeTruthy();
      expect(screen.getByText('存在差异')).toBeTruthy();
      expect(screen.getByText('current_state.md 比 JSON 新 2 小时')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('查看当前状态差异'));

    await waitFor(() => {
      expect(api.fetchStateDiff).toHaveBeenCalledWith('current_state');
      expect(screen.getByText(/设定变更/)).toBeTruthy();
      expect(screen.getByText('系统发现您在文本中将【林晨】的心情改为了【自信】。')).toBeTruthy();
    });
  });

  it('submits markdown import and shows import summary', async () => {
    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByLabelText('目标真相源')).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText('目标真相源'), {
      target: { value: 'hooks' },
    });
    fireEvent.change(screen.getByPlaceholderText('# 在此粘贴 Markdown 内容...'), {
      target: { value: '# 伏笔\n\n- 主角留下新的线索' },
    });

    fireEvent.click(screen.getByText('执行同步导入'));

    await waitFor(() => {
      expect(api.importMarkdown).toHaveBeenCalledWith(
        'book-001',
        'hooks',
        '# 伏笔\n\n- 主角留下新的线索'
      );
      expect(screen.getByText('成功同步 1 项变更')).toBeTruthy();
    });
  });
});
