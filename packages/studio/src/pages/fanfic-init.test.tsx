import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../lib/api', () => ({
  initFanfic: vi.fn(),
  fetchBook: vi.fn(),
}));

import * as api from '../lib/api';
import FanficInit from './fanfic-init';

const mockBook = {
  id: 'book-fanfic-001',
  title: '同人测试书',
  genre: '同人',
  targetWords: 500000,
  fanficMode: null,
};

function renderWithRouter() {
  return render(
    <MemoryRouter initialEntries={['/fanfic-init?bookId=book-fanfic-001']}>
      <Routes>
        <Route path="/fanfic-init" element={<FanficInit />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('FanficInit Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state', () => {
    vi.mocked(api.fetchBook).mockResolvedValue(mockBook);

    renderWithRouter();

    expect(screen.getByText('加载中…')).toBeTruthy();
  });

  it('renders fanfic initialization page title', async () => {
    vi.mocked(api.fetchBook).mockResolvedValue(mockBook);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('同人模式初始化')).toBeTruthy();
    });
  });

  it('displays four mode options', async () => {
    vi.mocked(api.fetchBook).mockResolvedValue(mockBook);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('同人模式初始化')).toBeTruthy();
    });

    expect(screen.getByText('Canon')).toBeTruthy();
    expect(screen.getByText('AU')).toBeTruthy();
    expect(screen.getByText('OOC')).toBeTruthy();
    expect(screen.getByText('CP')).toBeTruthy();
  });

  it('shows mode descriptions', async () => {
    vi.mocked(api.fetchBook).mockResolvedValue(mockBook);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('同人模式初始化')).toBeTruthy();
    });

    // Canon description
    expect(screen.getByText(/遵循正典/)).toBeTruthy();
    // AU description
    expect(screen.getByText(/替代宇宙/)).toBeTruthy();
    // OOC description
    expect(screen.getByText(/角色性格偏离/)).toBeTruthy();
    // CP description
    expect(screen.getByText(/配对驱动/)).toBeTruthy();
  });

  it('selects a mode and highlights it', async () => {
    vi.mocked(api.fetchBook).mockResolvedValue(mockBook);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('同人模式初始化')).toBeTruthy();
    });

    // Select AU mode
    const auButton = screen.getByTitle('AU模式');
    fireEvent.click(auButton);

    // AU should be highlighted
    expect(auButton).toHaveClass('border-purple-500');
  });

  it('shows canon reference upload for canon mode', async () => {
    vi.mocked(api.fetchBook).mockResolvedValue(mockBook);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('同人模式初始化')).toBeTruthy();
    });

    // Select canon mode
    const canonButton = screen.getByTitle('Canon模式');
    fireEvent.click(canonButton);

    // Canon upload section should appear
    expect(screen.getByText('上传正典参考')).toBeTruthy();
  });

  it('uploads canon reference file', async () => {
    vi.mocked(api.fetchBook).mockResolvedValue(mockBook);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('同人模式初始化')).toBeTruthy();
    });

    const canonButton = screen.getByTitle('Canon模式');
    fireEvent.click(canonButton);

    // Simulate file upload
    const fileInput = screen.getByLabelText('上传正典参考文件');
    const file = new File(['正典内容'], 'canon.md', { type: 'text/markdown' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('canon.md')).toBeTruthy();
    });
  });

  it('initializes fanfic mode', async () => {
    vi.mocked(api.fetchBook).mockResolvedValue(mockBook);
    vi.mocked(api.initFanfic).mockResolvedValue({ success: true, mode: 'au' });

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('同人模式初始化')).toBeTruthy();
    });

    // Select AU
    const auButton = screen.getByTitle('AU模式');
    fireEvent.click(auButton);

    // Fill description
    const descInput = screen.getByPlaceholderText('同人设定描述');
    fireEvent.change(descInput, { target: { value: '这是一个平行世界的故事' } });

    // Click initialize
    await act(async () => {
      fireEvent.click(screen.getByText('初始化'));
    });

    await waitFor(() => {
      expect(api.initFanfic).toHaveBeenCalledWith('book-fanfic-001', {
        mode: 'au',
        description: '这是一个平行世界的故事',
        canonReference: '',
      });
    });
  });

  it('shows success message after initialization', async () => {
    vi.mocked(api.fetchBook).mockResolvedValue(mockBook);
    vi.mocked(api.initFanfic).mockResolvedValue({ success: true, mode: 'canon' });

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('同人模式初始化')).toBeTruthy();
    });

    const canonButton = screen.getByTitle('Canon模式');
    fireEvent.click(canonButton);

    const descInput = screen.getByPlaceholderText('同人设定描述');
    fireEvent.change(descInput, { target: { value: '遵循原作设定' } });

    await act(async () => {
      fireEvent.click(screen.getByText('初始化'));
    });

    await waitFor(() => {
      expect(screen.getByText(/初始化成功/)).toBeTruthy();
    });
  });

  it('validates mode selection before submit', async () => {
    vi.mocked(api.fetchBook).mockResolvedValue(mockBook);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('同人模式初始化')).toBeTruthy();
    });

    // Don't select a mode, click initialize
    await act(async () => {
      fireEvent.click(screen.getByText('初始化'));
    });

    // Should show error
    await waitFor(() => {
      expect(screen.getByText(/请选择同人模式/)).toBeTruthy();
    });

    // initFanfic should NOT be called
    expect(api.initFanfic).not.toHaveBeenCalled();
  });

  it('shows book title in header', async () => {
    vi.mocked(api.fetchBook).mockResolvedValue({ ...mockBook, title: '哈利波特同人' });

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('哈利波特同人')).toBeTruthy();
    });
  });
});
