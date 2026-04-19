import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../lib/api', () => ({
  extractStyleFingerprint: vi.fn(),
  applyStyleImitation: vi.fn(),
  fetchBook: vi.fn(),
}));

import * as api from '../lib/api';
import StyleManager from './style-manager';

const mockBook = {
  id: 'book-style-001',
  title: '文风测试书',
  genre: '都市',
  targetWords: 500000,
};

const mockFingerprint = {
  avgSentenceLength: 18,
  dialogueRatio: 0.35,
  descriptionRatio: 0.4,
  actionRatio: 0.25,
  commonPhrases: ['只见', '不禁', '心中', '微微'],
  sentencePatternPreference: '短句为主，多用逗号分隔',
  wordUsageHabit: '偏好具象动词和感官形容词',
  rhetoricTendency: '善用比喻和排比',
};

function renderWithRouter() {
  return render(
    <MemoryRouter initialEntries={['/style-manager?bookId=book-style-001']}>
      <Routes>
        <Route path="/style-manager" element={<StyleManager />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('StyleManager Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state', () => {
    vi.mocked(api.fetchBook).mockResolvedValue(mockBook);

    renderWithRouter();

    expect(screen.getByText('加载中…')).toBeTruthy();
  });

  it('renders style manager page title', async () => {
    vi.mocked(api.fetchBook).mockResolvedValue(mockBook);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('文风仿写配置')).toBeTruthy();
    });
  });

  it('displays reference text upload area', async () => {
    vi.mocked(api.fetchBook).mockResolvedValue(mockBook);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('文风仿写配置')).toBeTruthy();
    });

    expect(screen.getByText('上传参考作品')).toBeTruthy();
    expect(screen.getByPlaceholderText('或粘贴参考文本')).toBeTruthy();
  });

  it('uploads a reference file', async () => {
    vi.mocked(api.fetchBook).mockResolvedValue(mockBook);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('文风仿写配置')).toBeTruthy();
    });

    const fileInput = screen.getByLabelText('上传参考文件');
    const file = new File(['这是一段参考文本内容，用于测试文风仿写功能'], 'reference.txt', {
      type: 'text/plain',
    });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('reference.txt')).toBeTruthy();
    });
  });

  it('shows genre selector', async () => {
    vi.mocked(api.fetchBook).mockResolvedValue(mockBook);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('文风仿写配置')).toBeTruthy();
    });

    expect(screen.getByLabelText('题材')).toBeTruthy();
  });

  it('extracts style fingerprint', async () => {
    vi.mocked(api.fetchBook).mockResolvedValue(mockBook);
    vi.mocked(api.extractStyleFingerprint).mockResolvedValue({ fingerprint: mockFingerprint });

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('文风仿写配置')).toBeTruthy();
    });

    // Paste text
    const textarea = screen.getByPlaceholderText('或粘贴参考文本');
    fireEvent.change(textarea, { target: { value: '参考文本内容，不少于50字。' } });

    // Click extract
    await act(async () => {
      fireEvent.click(screen.getByText('提取指纹'));
    });

    await waitFor(() => {
      expect(api.extractStyleFingerprint).toHaveBeenCalled();
    });
  });

  it('shows fingerprint results after extraction', async () => {
    vi.mocked(api.fetchBook).mockResolvedValue(mockBook);
    vi.mocked(api.extractStyleFingerprint).mockResolvedValue({ fingerprint: mockFingerprint });

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('文风仿写配置')).toBeTruthy();
    });

    const textarea = screen.getByPlaceholderText('或粘贴参考文本');
    fireEvent.change(textarea, { target: { value: '参考文本内容，不少于50字。' } });

    await act(async () => {
      fireEvent.click(screen.getByText('提取指纹'));
    });

    await waitFor(() => {
      expect(screen.getByText('风格指纹')).toBeTruthy();
    });

    expect(screen.getByText('18 字')).toBeTruthy(); // avgSentenceLength
    expect(screen.getByText('35%')).toBeTruthy(); // dialogueRatio
    expect(screen.getAllByText('只见').length).toBeGreaterThanOrEqual(1); // commonPhrases
  });

  it('adjusts imitation intensity', async () => {
    vi.mocked(api.fetchBook).mockResolvedValue(mockBook);
    vi.mocked(api.extractStyleFingerprint).mockResolvedValue({ fingerprint: mockFingerprint });

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('文风仿写配置')).toBeTruthy();
    });

    // Extract fingerprint first
    const textarea = screen.getByPlaceholderText('或粘贴参考文本');
    fireEvent.change(textarea, { target: { value: '参考文本内容，不少于50字。' } });
    await act(async () => {
      fireEvent.click(screen.getByText('提取指纹'));
    });

    await waitFor(() => {
      expect(screen.getByText('风格指纹')).toBeTruthy();
    });

    // Adjust intensity slider
    const intensityInput = screen.getByLabelText('仿写强度');
    fireEvent.change(intensityInput, { target: { value: '80' } });

    expect((intensityInput as HTMLInputElement).value).toBe('80');
  });

  it('applies style imitation', async () => {
    vi.mocked(api.fetchBook).mockResolvedValue(mockBook);
    vi.mocked(api.extractStyleFingerprint).mockResolvedValue({ fingerprint: mockFingerprint });
    vi.mocked(api.applyStyleImitation).mockResolvedValue({ success: true });

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('文风仿写配置')).toBeTruthy();
    });

    // Extract fingerprint
    const textarea = screen.getByPlaceholderText('或粘贴参考文本');
    fireEvent.change(textarea, { target: { value: '参考文本内容，不少于50字。' } });
    await act(async () => {
      fireEvent.click(screen.getByText('提取指纹'));
    });

    await waitFor(() => {
      expect(screen.getByText('风格指纹')).toBeTruthy();
    });

    // Click apply
    await act(async () => {
      fireEvent.click(screen.getByText('应用配置'));
    });

    await waitFor(() => {
      expect(api.applyStyleImitation).toHaveBeenCalled();
    });
  });

  it('shows preview of fingerprint JSON', async () => {
    vi.mocked(api.fetchBook).mockResolvedValue(mockBook);
    vi.mocked(api.extractStyleFingerprint).mockResolvedValue({ fingerprint: mockFingerprint });

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('文风仿写配置')).toBeTruthy();
    });

    const textarea = screen.getByPlaceholderText('或粘贴参考文本');
    fireEvent.change(textarea, { target: { value: '参考文本内容，不少于50字。' } });
    await act(async () => {
      fireEvent.click(screen.getByText('提取指纹'));
    });

    await waitFor(() => {
      expect(screen.getByText('JSON 预览')).toBeTruthy();
    });

    // JSON preview should contain avgSentenceLength
    expect(screen.getByText(/"avgSentenceLength"/)).toBeTruthy();
  });

  it('shows book title in header', async () => {
    vi.mocked(api.fetchBook).mockResolvedValue({ ...mockBook, title: '测试书籍' });

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('测试书籍')).toBeTruthy();
    });
  });
});
