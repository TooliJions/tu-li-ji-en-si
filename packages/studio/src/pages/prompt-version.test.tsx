import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PromptVersionView from './prompt-version';
import * as api from '../lib/api';

vi.mock('../lib/api', () => ({
  fetchBook: vi.fn(),
  fetchPromptVersions: vi.fn(),
  setPromptVersion: vi.fn(),
  fetchPromptDiff: vi.fn(),
}));

const mockBook = {
  id: 'book-1',
  title: '测试书籍',
};

const mockPromptData = {
  versions: [
    { version: 'v1', label: '初版', date: '2026-03-01', description: '初始版本' },
    { version: 'v2', label: '增强版', date: '2026-04-01', description: '优化版本' },
  ],
  current: 'v2',
};

describe('PromptVersionView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', async () => {
    (api.fetchBook as any).mockReturnValue(new Promise(() => {}));
    (api.fetchPromptVersions as any).mockReturnValue(new Promise(() => {}));

    render(
      <MemoryRouter initialEntries={['/book/book-1/prompts']}>
        <Routes>
          <Route path="/book/:bookId/prompts" element={<PromptVersionView />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText(/加载中/)).toBeDefined();
  });

  it('renders prompt versions after loading', async () => {
    (api.fetchBook as any).mockResolvedValue(mockBook);
    (api.fetchPromptVersions as any).mockResolvedValue(mockPromptData);

    render(
      <MemoryRouter initialEntries={['/book/book-1/prompts']}>
        <Routes>
          <Route path="/book/:bookId/prompts" element={<PromptVersionView />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('提示词版本管理')).toBeDefined();
      expect(screen.getAllByText('v1').length).toBeGreaterThan(0);
      expect(screen.getAllByText('v2').length).toBeGreaterThan(0);
      expect(screen.getByText(/当前使用版本:/)).toBeDefined();
    });
  });

  it('handles switching versions', async () => {
    (api.fetchBook as any).mockResolvedValue(mockBook);
    (api.fetchPromptVersions as any).mockResolvedValue(mockPromptData);
    (api.setPromptVersion as any).mockResolvedValue({ success: true });

    render(
      <MemoryRouter initialEntries={['/book/book-1/prompts']}>
        <Routes>
          <Route path="/book/:bookId/prompts" element={<PromptVersionView />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getAllByText('v1').length).toBeGreaterThan(0));

    const switchBtn = screen.getByText('切换到v1');
    await act(async () => {
      fireEvent.click(switchBtn);
    });

    expect(api.setPromptVersion).toHaveBeenCalledWith('book-1', 'v1');
  });

  it('handles version comparison', async () => {
    (api.fetchBook as any).mockResolvedValue(mockBook);
    (api.fetchPromptVersions as any).mockResolvedValue(mockPromptData);
    (api.fetchPromptDiff as any).mockResolvedValue({
      from: 'v1',
      to: 'v2',
      diff: 'ScenePolisher: 增加段落节奏控制',
    });

    render(
      <MemoryRouter initialEntries={['/book/book-1/prompts']}>
        <Routes>
          <Route path="/book/:bookId/prompts" element={<PromptVersionView />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => screen.getByText('开始对比'));

    const compareBtn = screen.getByText('开始对比');
    await act(async () => {
      fireEvent.click(compareBtn);
    });

    await waitFor(() => {
      expect(api.fetchPromptDiff).toHaveBeenCalled();
      expect(screen.getByText('ScenePolisher: 增加段落节奏控制')).toBeDefined();
    });
  });

  it('shows a visible error when switching version fails', async () => {
    (api.fetchBook as any).mockResolvedValue(mockBook);
    (api.fetchPromptVersions as any).mockResolvedValue(mockPromptData);
    (api.setPromptVersion as any).mockRejectedValue(new Error('切换失败：版本不存在'));

    render(
      <MemoryRouter initialEntries={['/book/book-1/prompts']}>
        <Routes>
          <Route path="/book/:bookId/prompts" element={<PromptVersionView />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('切换到v1')).toBeDefined());

    await act(async () => {
      fireEvent.click(screen.getByText('切换到v1'));
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('切换失败：版本不存在');
    });
  });

  it('shows a visible error when comparison fails', async () => {
    (api.fetchBook as any).mockResolvedValue(mockBook);
    (api.fetchPromptVersions as any).mockResolvedValue(mockPromptData);
    (api.fetchPromptDiff as any).mockRejectedValue(new Error('对比失败：缺少版本差异数据'));

    render(
      <MemoryRouter initialEntries={['/book/book-1/prompts']}>
        <Routes>
          <Route path="/book/:bookId/prompts" element={<PromptVersionView />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('开始对比')).toBeDefined());

    await act(async () => {
      fireEvent.click(screen.getByText('开始对比'));
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('对比失败：缺少版本差异数据');
    });
  });
});
