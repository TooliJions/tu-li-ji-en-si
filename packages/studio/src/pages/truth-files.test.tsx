import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../lib/api', () => ({
  fetchTruthFiles: vi.fn(),
  fetchTruthFile: vi.fn(),
  fetchProjectionStatus: vi.fn(),
  updateTruthFile: vi.fn(),
  importMarkdown: vi.fn(),
  fetchHooks: vi.fn(),
  fetchMemoryPreview: vi.fn(),
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
    // Default mocks for all APIs the component calls
    vi.mocked(api.fetchTruthFiles).mockResolvedValue(mockTruthFilesList);
    vi.mocked(api.fetchProjectionStatus).mockResolvedValue(mockProjectionStatus);
    vi.mocked(api.fetchHooks).mockResolvedValue([]);
    vi.mocked(api.fetchMemoryPreview).mockResolvedValue({ memories: [] });
    vi.mocked(api.fetchTruthFile).mockResolvedValue({ content: null, versionToken: 1 });
  });

  it('shows empty state when bookId is missing', async () => {
    render(
      <MemoryRouter initialEntries={['/truth-files']}>
        <Routes>
          <Route path="/truth-files" element={<TruthFiles />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByText(/真相文件/, {}, { timeout: 3000 });

    expect(api.fetchTruthFiles).not.toHaveBeenCalled();
    expect(api.fetchProjectionStatus).not.toHaveBeenCalled();
  });

  it('shows loading state', () => {
    vi.mocked(api.fetchTruthFiles).mockReturnValue(pendingPromise());
    vi.mocked(api.fetchProjectionStatus).mockReturnValue(pendingPromise());

    renderWithRouter();

    expect(screen.getByText('加载真相中…')).toBeTruthy();
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

    await screen.findByText(/真相文件/, {}, { timeout: 3000 });
    // Use getAllByText since file names appear in both file list and import dropdown
    expect(screen.getAllByText('current_state').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('hooks').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('manifest').length).toBeGreaterThanOrEqual(1);
  });

  it('shows projection status', async () => {
    vi.mocked(api.fetchTruthFiles).mockResolvedValue(mockTruthFilesList);
    vi.mocked(api.fetchProjectionStatus).mockResolvedValue(mockProjectionStatus);

    renderWithRouter();

    await screen.findByText(/投影状态/, {}, { timeout: 3000 });
    expect(screen.getByText('已同步')).toBeTruthy();
  });

  it('opens file viewer when clicking a file', async () => {
    vi.mocked(api.fetchTruthFiles).mockResolvedValue(mockTruthFilesList);
    vi.mocked(api.fetchProjectionStatus).mockResolvedValue(mockProjectionStatus);
    vi.mocked(api.fetchTruthFile).mockResolvedValue(mockTruthFileContent);

    renderWithRouter();

    await screen.findByText(/投影状态/, {}, { timeout: 3000 });

    // Switch to JSON source editing tab to see file list
    fireEvent.click(screen.getByText('源码编辑'));

    // Find the file list button and click it
    const fileButton = await screen.findByRole(
      'button',
      { name: /current_state/ },
      { timeout: 3000 }
    );
    await act(async () => {
      fireEvent.click(fileButton);
    });

    await screen.findByText(/worldRules/, {}, { timeout: 3000 });
  });

  it('edits file content in edit mode', async () => {
    vi.mocked(api.fetchTruthFiles).mockResolvedValue(mockTruthFilesList);
    vi.mocked(api.fetchProjectionStatus).mockResolvedValue(mockProjectionStatus);
    vi.mocked(api.fetchTruthFile).mockResolvedValue(mockTruthFileContent);

    renderWithRouter();

    await screen.findByText(/投影状态/, {}, { timeout: 3000 });
    fireEvent.click(screen.getByText('源码编辑'));

    const fileButton = await screen.findByRole(
      'button',
      { name: /current_state/ },
      { timeout: 3000 }
    );
    await act(async () => {
      fireEvent.click(fileButton);
    });

    await screen.findByText(/worldRules/, {}, { timeout: 3000 });

    // Click edit button
    fireEvent.click(screen.getByText('编辑源码'));

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

    await screen.findByText(/投影状态/, {}, { timeout: 3000 });
    fireEvent.click(screen.getByText('源码编辑'));

    const fileButton = await screen.findByRole(
      'button',
      { name: /current_state/ },
      { timeout: 3000 }
    );
    await act(async () => {
      fireEvent.click(fileButton);
    });

    await screen.findByText(/worldRules/, {}, { timeout: 3000 });

    fireEvent.click(screen.getByText('编辑源码'));

    const textarea = screen.getAllByRole('textbox')[0];
    fireEvent.change(textarea, { target: { value: '{ "worldRules": ["新规则"] }' } });

    await act(async () => {
      fireEvent.click(screen.getByText('保存'));
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

    await screen.findByText(/投影状态/, {}, { timeout: 3000 });
    fireEvent.click(screen.getByText('源码编辑'));

    const fileButton = await screen.findByRole(
      'button',
      { name: /current_state/ },
      { timeout: 3000 }
    );
    await act(async () => {
      fireEvent.click(fileButton);
    });

    await screen.findByText(/worldRules/, {}, { timeout: 3000 });

    fireEvent.click(screen.getByText('编辑源码'));
    expect(screen.getAllByRole('textbox')[0]).toBeTruthy();

    fireEvent.click(screen.getByText('取消'));
    // After canceling, should show read-only file viewer again
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText(/worldRules/)).toBeTruthy();
  });

  it('shows import markdown section', async () => {
    vi.mocked(api.fetchTruthFiles).mockResolvedValue(mockTruthFilesList);
    vi.mocked(api.fetchProjectionStatus).mockResolvedValue(mockProjectionStatus);

    renderWithRouter();

    await screen.findByText(/手动导入 Markdown/, {}, { timeout: 3000 });

    // Should have file selector and import button
    expect(screen.getByRole('combobox')).toBeTruthy();
    expect(screen.getByPlaceholderText(/在此粘贴 Markdown/)).toBeTruthy();
    expect(screen.getByText('执行同步导入')).toBeTruthy();
  });

  it('passes markdown content to importMarkdown', async () => {
    vi.mocked(api.fetchTruthFiles).mockResolvedValue(mockTruthFilesList);
    vi.mocked(api.fetchProjectionStatus).mockResolvedValue(mockProjectionStatus);
    vi.mocked(api.importMarkdown).mockResolvedValue({
      parsed: { versionToken: 123, diff: [] },
      preview: '变更预览摘要',
    });

    renderWithRouter();

    await screen.findByText(/手动导入 Markdown/, {}, { timeout: 3000 });

    // Select a file from dropdown
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'manifest' } });
    fireEvent.change(screen.getByPlaceholderText(/在此粘贴 Markdown/), {
      target: { value: '# 新导入内容\n\n这里是正文。' },
    });

    await act(async () => {
      fireEvent.click(screen.getByText('执行同步导入'));
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

    await screen.findByText(/投影状态/, {}, { timeout: 3000 });
    fireEvent.click(screen.getByText('源码编辑'));

    const fileButton = await screen.findByRole(
      'button',
      { name: /current_state/ },
      { timeout: 3000 }
    );
    await act(async () => {
      fireEvent.click(fileButton);
    });

    await screen.findByText(/worldRules/, {}, { timeout: 3000 });

    // Switch back to overview tab to use import markdown
    fireEvent.click(screen.getByText('概览与同步'));
    await screen.findByText(/手动导入 Markdown/, {}, { timeout: 3000 });

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'current_state' } });
    fireEvent.change(screen.getByPlaceholderText(/在此粘贴 Markdown/), {
      target: { value: '# 导入后的内容\n\n新的规则' },
    });

    await act(async () => {
      fireEvent.click(screen.getByText('执行同步导入'));
    });

    await screen.findByText(/存在差异/, {}, { timeout: 3000 });

    expect(api.fetchProjectionStatus).toHaveBeenCalledTimes(2);
    expect(api.fetchTruthFile).toHaveBeenCalledTimes(2);
  });

  it('shows file size and update time', async () => {
    vi.mocked(api.fetchTruthFiles).mockResolvedValue(mockTruthFilesList);
    vi.mocked(api.fetchProjectionStatus).mockResolvedValue(mockProjectionStatus);

    renderWithRouter();

    await screen.findByText(/投影状态/, {}, { timeout: 3000 });
    fireEvent.click(screen.getByText('源码编辑'));

    await screen.findByText(/1\.0 KB/, {}, { timeout: 3000 });
  });

  it('closes file viewer when clicking close', async () => {
    vi.mocked(api.fetchTruthFiles).mockResolvedValue(mockTruthFilesList);
    vi.mocked(api.fetchProjectionStatus).mockResolvedValue(mockProjectionStatus);
    vi.mocked(api.fetchTruthFile).mockResolvedValue(mockTruthFileContent);

    renderWithRouter();

    await screen.findByText(/投影状态/, {}, { timeout: 3000 });
    fireEvent.click(screen.getByText('源码编辑'));

    const fileButton = await screen.findByRole(
      'button',
      { name: /current_state/ },
      { timeout: 3000 }
    );
    await act(async () => {
      fireEvent.click(fileButton);
    });

    await screen.findByText(/worldRules/, {}, { timeout: 3000 });

    // Switch to another tab and back to verify file viewer state persists
    fireEvent.click(screen.getByText('概览与同步'));
    await screen.findByText(/投影状态/, {}, { timeout: 3000 });

    // Switch back to JSON tab - file viewer state should persist
    fireEvent.click(screen.getByText('源码编辑'));
    await screen.findByText(/worldRules/, {}, { timeout: 3000 });
  });

  it('概览Tab显示当前世界状态角色卡片', async () => {
    vi.mocked(api.fetchTruthFiles).mockResolvedValue(mockTruthFilesList);
    vi.mocked(api.fetchProjectionStatus).mockResolvedValue(mockProjectionStatus);
    vi.mocked(api.fetchTruthFile).mockResolvedValue({
      content: {
        chapter: 5,
        physics: '现实世界',
        powerSystem: '灵气复苏',
        characters: {
          林晨: {
            location: '档案室',
            health: '良好',
            emotion: '焦虑',
            inventory: ['档案钥匙', '旧照片'],
            knownInfo: ['林晨的身份秘密'],
          },
          苏小雨: {
            location: '医院',
            health: '虚弱',
            emotion: '平静',
            inventory: [],
            knownInfo: [],
          },
        },
      },
      versionToken: 1234567890,
    });

    renderWithRouter();

    await screen.findByText(/当前世界状态/, {}, { timeout: 3000 });

    expect(screen.getAllByText(/位置/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/健康/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/林晨/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/档案室/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/灵气复苏/)).toBeTruthy();
    expect(screen.getAllByText(/编辑/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/从 JSON 查看/)).toBeTruthy();
    expect(screen.getByText(/回滚到上一章状态/)).toBeTruthy();
  });
});
