import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../lib/api', () => ({
  fetchTruthFiles: vi.fn(),
  fetchTruthFile: vi.fn(),
  fetchProjectionStatus: vi.fn(),
  updateTruthFile: vi.fn(),
  importMarkdown: vi.fn(),
}));

import * as api from '../lib/api';
import TruthFiles from './truth-files';
import { pendingPromise } from '../test-utils/pending';

const mockTruthFilesList = {
  versionToken: 1234567890,
  files: [
    { name: 'current_state', updatedAt: '2026-04-19T00:00:00.000Z', size: 1024 },
    { name: 'hooks', updatedAt: '2026-04-19T01:00:00.000Z', size: 2048 },
    { name: 'chapter_summaries', updatedAt: '2026-04-18T00:00:00.000Z', size: 512 },
    { name: 'subplot_board', updatedAt: '2026-04-17T00:00:00.000Z', size: 768 },
    { name: 'emotional_arcs', updatedAt: '2026-04-16T00:00:00.000Z', size: 400 },
    { name: 'character_matrix', updatedAt: '2026-04-15T00:00:00.000Z', size: 350 },
    { name: 'manifest', updatedAt: '2026-04-14T00:00:00.000Z', size: 256 },
  ],
};

const mockTruthFileContent = {
  name: 'current_state',
  content: {
    worldRules: ['规则1', '规则2'],
    plotTwists: ['伏笔1'],
    characterSecrets: ['秘密1'],
  },
  versionToken: 1234567890,
};

const mockProjectionStatus = {
  synced: true,
  jsonHash: 'abc123',
  markdownMtime: '2026-04-19T00:00:00.000Z',
  discrepancies: [],
};

function renderWithRouter(bookId = 'book-001') {
  return render(
    <MemoryRouter initialEntries={[`/truth-files?bookId=${bookId}`]}>
      <Routes>
        <Route path="/truth-files" element={<TruthFiles />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('TruthFiles Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows empty state when bookId is missing', async () => {
    render(
      <MemoryRouter initialEntries={['/truth-files']}>
        <Routes>
          <Route path="/truth-files" element={<TruthFiles />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('请选择一本书')).toBeTruthy();
    });

    expect(api.fetchTruthFiles).not.toHaveBeenCalled();
    expect(api.fetchProjectionStatus).not.toHaveBeenCalled();
  });

  it('shows loading state', () => {
    vi.mocked(api.fetchTruthFiles).mockReturnValue(pendingPromise());
    vi.mocked(api.fetchProjectionStatus).mockReturnValue(pendingPromise());

    renderWithRouter();

    expect(screen.getByText('加载中…')).toBeTruthy();
  });

  it('loads truth files with the active bookId', async () => {
    vi.mocked(api.fetchTruthFiles).mockResolvedValue(mockTruthFilesList);
    vi.mocked(api.fetchProjectionStatus).mockResolvedValue(mockProjectionStatus);

    renderWithRouter('book-xyz');

    await waitFor(() => {
      expect(api.fetchTruthFiles).toHaveBeenCalledWith('book-xyz');
      expect(api.fetchProjectionStatus).toHaveBeenCalledWith('book-xyz');
    });
  });

  it('renders truth file list', async () => {
    vi.mocked(api.fetchTruthFiles).mockResolvedValue(mockTruthFilesList);
    vi.mocked(api.fetchProjectionStatus).mockResolvedValue(mockProjectionStatus);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('真相文件')).toBeTruthy();
    });
    // Use getAllByText since file names appear in both file list and import dropdown
    expect(screen.getAllByText('current_state').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('hooks').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('manifest').length).toBeGreaterThanOrEqual(1);
  });

  it('shows projection status', async () => {
    vi.mocked(api.fetchTruthFiles).mockResolvedValue(mockTruthFilesList);
    vi.mocked(api.fetchProjectionStatus).mockResolvedValue(mockProjectionStatus);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('投影状态')).toBeTruthy();
    });
    expect(screen.getByText('已同步')).toBeTruthy();
  });

  it('opens file viewer when clicking a file', async () => {
    vi.mocked(api.fetchTruthFiles).mockResolvedValue(mockTruthFilesList);
    vi.mocked(api.fetchProjectionStatus).mockResolvedValue(mockProjectionStatus);
    vi.mocked(api.fetchTruthFile).mockResolvedValue(mockTruthFileContent);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getAllByText('current_state').length).toBeGreaterThanOrEqual(1);
    });

    const fileButtons = screen.getAllByRole('button');
    const currentFileButton = fileButtons.find((btn) => btn.textContent?.includes('current_state'));
    expect(currentFileButton).toBeTruthy();

    await act(async () => {
      fireEvent.click(currentFileButton!);
    });

    await waitFor(() => {
      expect(screen.getByText('worldRules')).toBeTruthy();
    });
  });

  it('edits file content in edit mode', async () => {
    vi.mocked(api.fetchTruthFiles).mockResolvedValue(mockTruthFilesList);
    vi.mocked(api.fetchProjectionStatus).mockResolvedValue(mockProjectionStatus);
    vi.mocked(api.fetchTruthFile).mockResolvedValue(mockTruthFileContent);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getAllByText('current_state').length).toBeGreaterThanOrEqual(1);
    });

    const fileButtons = screen.getAllByRole('button');
    const currentFileButton = fileButtons.find((btn) => btn.textContent?.includes('current_state'));

    await act(async () => {
      fireEvent.click(currentFileButton!);
    });

    await waitFor(() => {
      expect(screen.getByText('worldRules')).toBeTruthy();
    });

    // Click edit button
    fireEvent.click(screen.getByTitle('编辑'));

    // Should show textarea
    const textarea = screen.getAllByRole('textbox')[0];
    expect(textarea).toBeTruthy();
  });

  it('saves edited content', async () => {
    vi.mocked(api.fetchTruthFiles).mockResolvedValue(mockTruthFilesList);
    vi.mocked(api.fetchProjectionStatus).mockResolvedValue(mockProjectionStatus);
    vi.mocked(api.fetchTruthFile).mockResolvedValue(mockTruthFileContent);
    vi.mocked(api.updateTruthFile).mockResolvedValue({
      ...mockTruthFileContent,
      versionToken: 1234567891,
    });

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getAllByText('current_state').length).toBeGreaterThanOrEqual(1);
    });

    const fileButtons = screen.getAllByRole('button');
    const currentFileButton = fileButtons.find((btn) => btn.textContent?.includes('current_state'));

    await act(async () => {
      fireEvent.click(currentFileButton!);
    });

    await waitFor(() => {
      expect(screen.getByText('worldRules')).toBeTruthy();
    });

    fireEvent.click(screen.getByTitle('编辑'));

    const textarea = screen.getAllByRole('textbox')[0];
    fireEvent.change(textarea, { target: { value: '{ "worldRules": ["新规则"] }' } });

    await act(async () => {
      fireEvent.click(screen.getByTitle('保存'));
    });

    await waitFor(() => {
      expect(api.updateTruthFile).toHaveBeenCalled();
    });
  });

  it('cancels edit mode', async () => {
    vi.mocked(api.fetchTruthFiles).mockResolvedValue(mockTruthFilesList);
    vi.mocked(api.fetchProjectionStatus).mockResolvedValue(mockProjectionStatus);
    vi.mocked(api.fetchTruthFile).mockResolvedValue(mockTruthFileContent);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getAllByText('current_state').length).toBeGreaterThanOrEqual(1);
    });

    const fileButtons = screen.getAllByRole('button');
    const currentFileButton = fileButtons.find((btn) => btn.textContent?.includes('current_state'));

    await act(async () => {
      fireEvent.click(currentFileButton!);
    });

    await waitFor(() => {
      expect(screen.getByText('worldRules')).toBeTruthy();
    });

    fireEvent.click(screen.getByTitle('编辑'));
    expect(screen.getAllByRole('textbox')[0]).toBeTruthy();

    fireEvent.click(screen.getByTitle('取消'));
    expect(screen.getByLabelText('Markdown 内容')).toBeTruthy();
    expect(screen.queryByDisplayValue(/"worldRules"/)).toBeNull();
  });

  it('shows import markdown section', async () => {
    vi.mocked(api.fetchTruthFiles).mockResolvedValue(mockTruthFilesList);
    vi.mocked(api.fetchProjectionStatus).mockResolvedValue(mockProjectionStatus);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('导入 Markdown')).toBeTruthy();
    });

    // Should have file selector and import button
    expect(screen.getByRole('combobox')).toBeTruthy();
    expect(screen.getByLabelText('Markdown 内容')).toBeTruthy();
    expect(screen.getByText('导入')).toBeTruthy();
  });

  it('passes markdown content to importMarkdown', async () => {
    vi.mocked(api.fetchTruthFiles).mockResolvedValue(mockTruthFilesList);
    vi.mocked(api.fetchProjectionStatus).mockResolvedValue(mockProjectionStatus);
    vi.mocked(api.importMarkdown).mockResolvedValue({
      parsed: { versionToken: 123, diff: [] },
      preview: '变更预览摘要',
    });

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('导入 Markdown')).toBeTruthy();
    });

    // Select a file from dropdown
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'manifest' } });
    fireEvent.change(screen.getByLabelText('Markdown 内容'), {
      target: { value: '# 新导入内容\n\n这里是正文。' },
    });

    await act(async () => {
      fireEvent.click(screen.getByText('导入'));
    });

    await waitFor(() => {
      expect(api.importMarkdown).toHaveBeenCalledWith(
        'book-001',
        'manifest',
        '# 新导入内容\n\n这里是正文。'
      );
    });
  });

  it('refreshes projection status and selected file after importing markdown', async () => {
    vi.mocked(api.fetchTruthFiles)
      .mockResolvedValueOnce(mockTruthFilesList)
      .mockResolvedValueOnce({
        ...mockTruthFilesList,
        versionToken: 1234567891,
      });
    vi.mocked(api.fetchProjectionStatus)
      .mockResolvedValueOnce(mockProjectionStatus)
      .mockResolvedValueOnce({
        ...mockProjectionStatus,
        synced: false,
        discrepancies: ['存在 1 处差异'],
      });
    vi.mocked(api.fetchTruthFile)
      .mockResolvedValueOnce(mockTruthFileContent)
      .mockResolvedValueOnce({
        ...mockTruthFileContent,
        content: {
          worldRules: ['导入后的规则'],
          plotTwists: ['新伏笔'],
          characterSecrets: ['秘密1'],
        },
        versionToken: 1234567891,
      });
    vi.mocked(api.importMarkdown).mockResolvedValue({
      parsed: { versionToken: 1234567891, diff: ['新增设定'] },
      preview: '导入完成',
    });

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getAllByText('current_state').length).toBeGreaterThanOrEqual(1);
    });

    const fileButtons = screen.getAllByRole('button');
    const currentFileButton = fileButtons.find((btn) => btn.textContent?.includes('current_state'));

    await act(async () => {
      fireEvent.click(currentFileButton!);
    });

    await waitFor(() => {
      expect(screen.getByText('worldRules')).toBeTruthy();
    });

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'current_state' } });
    fireEvent.change(screen.getByLabelText('Markdown 内容'), {
      target: { value: '# 导入后的内容\n\n新的规则' },
    });

    await act(async () => {
      fireEvent.click(screen.getByText('导入'));
    });

    await waitFor(() => {
      expect(api.fetchProjectionStatus).toHaveBeenCalledTimes(2);
      expect(api.fetchTruthFile).toHaveBeenCalledTimes(2);
      expect(screen.getByText('未同步')).toBeTruthy();
    });

    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === 'PRE' && (element.textContent?.includes('导入后的规则') ?? false)
      )
    ).toBeTruthy();
  });

  it('shows file size and update time', async () => {
    vi.mocked(api.fetchTruthFiles).mockResolvedValue(mockTruthFilesList);
    vi.mocked(api.fetchProjectionStatus).mockResolvedValue(mockProjectionStatus);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getAllByText('current_state').length).toBeGreaterThanOrEqual(1);
    });

    expect(screen.getByText(/1,?024/)).toBeTruthy();
  });

  it('closes file viewer when clicking close', async () => {
    vi.mocked(api.fetchTruthFiles).mockResolvedValue(mockTruthFilesList);
    vi.mocked(api.fetchProjectionStatus).mockResolvedValue(mockProjectionStatus);
    vi.mocked(api.fetchTruthFile).mockResolvedValue(mockTruthFileContent);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getAllByText('current_state').length).toBeGreaterThanOrEqual(1);
    });

    const fileButtons = screen.getAllByRole('button');
    const currentFileButton = fileButtons.find((btn) => btn.textContent?.includes('current_state'));

    await act(async () => {
      fireEvent.click(currentFileButton!);
    });

    await waitFor(() => {
      expect(screen.getByText('worldRules')).toBeTruthy();
    });

    fireEvent.click(screen.getByTitle('关闭'));
    expect(screen.queryByText('worldRules')).toBeNull();
  });
});
