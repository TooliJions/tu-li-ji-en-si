import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import InspirationInput from './inspiration-input';
import * as api from '../lib/api';

vi.mock('../lib/api', () => ({
  fetchBook: vi.fn(),
  fetchInspirationSeed: vi.fn(),
  createInspirationSeed: vi.fn(),
  updateInspirationSeed: vi.fn(),
}));

function renderWithRouter(entry = '/inspiration?bookId=book-1') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/inspiration" element={<InspirationInput />} />
        <Route path="/planning-brief" element={<div>planning</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('InspirationInput Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.fetchBook).mockResolvedValue({ id: 'book-1', title: '测试书籍', genre: '玄幻' });
    vi.mocked(api.fetchInspirationSeed).mockResolvedValue(null);
    vi.mocked(api.createInspirationSeed).mockResolvedValue({
      id: 'seed-1',
      sourceText: '宗门天才暴露血脉',
      constraints: ['升级明确'],
      sourceType: 'manual',
      createdAt: '2026-04-30T00:00:00.000Z',
    });
  });

  it('renders inspiration page skeleton', async () => {
    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('灵感输入')).toBeTruthy();
    });

    expect(screen.getByLabelText('原始灵感')).toBeTruthy();
    expect(screen.getByLabelText('题材方向')).toBeTruthy();
    expect(screen.getByText('进入规划')).toBeTruthy();
  });

  it('creates inspiration seed and enables next step', async () => {
    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByLabelText('原始灵感')).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText('原始灵感'), {
      target: { value: '宗门天才暴露血脉' },
    });
    fireEvent.change(screen.getByLabelText('题材方向'), {
      target: { value: '玄幻' },
    });
    fireEvent.click(screen.getByText('保存灵感输入'));

    await waitFor(() => {
      expect(api.createInspirationSeed).toHaveBeenCalledWith('book-1', {
        sourceText: '宗门天才暴露血脉',
        genre: '玄幻',
        theme: undefined,
        conflict: undefined,
        tone: undefined,
        constraints: [],
        sourceType: 'manual',
      });
    });

    expect(screen.getByText('灵感输入已保存')).toBeTruthy();
  });
});
