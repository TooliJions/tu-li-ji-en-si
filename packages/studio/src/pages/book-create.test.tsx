import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import BookCreate from './book-create';

function renderWithRouter() {
  return render(
    <MemoryRouter initialEntries={['/book-create']}>
      <BookCreate />
    </MemoryRouter>
  );
}

describe('BookCreate Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders step 1 with all form fields', () => {
    renderWithRouter();
    expect(screen.getByText('新建书籍')).toBeTruthy();
    expect(screen.getByPlaceholderText('输入书名…')).toBeTruthy();
    expect(screen.getByRole('combobox')).toBeTruthy();
    expect(screen.getByRole('spinbutton')).toBeTruthy();
    expect(screen.getByText('下一步')).toBeTruthy();
  });

  it('advances to step 2 when clicking next', () => {
    renderWithRouter();

    fireEvent.change(screen.getByPlaceholderText('输入书名…'), {
      target: { value: '测试小说' },
    });
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: '玄幻' },
    });
    fireEvent.click(screen.getByText('下一步'));

    expect(screen.getByText('确认信息')).toBeTruthy();
    expect(screen.getByText('测试小说')).toBeTruthy();
    expect(screen.getByText('玄幻')).toBeTruthy();
    expect(screen.getByText('30,000 字')).toBeTruthy();
  });

  it('returns to step 1 when clicking back', () => {
    renderWithRouter();

    fireEvent.change(screen.getByPlaceholderText('输入书名…'), {
      target: { value: '测试小说' },
    });
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: '科幻' },
    });
    fireEvent.click(screen.getByText('下一步'));
    fireEvent.click(screen.getByText('返回修改'));

    expect(screen.getByPlaceholderText('输入书名…')).toBeTruthy();
    // Step indicator should still show step 1 as active
    const stepIndicator = screen.getByText('① 基本信息');
    expect(stepIndicator.className).toContain('font-medium');
  });

  it('submits form and calls API on confirm', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { id: 'book-test-123' } }),
    });

    renderWithRouter();

    fireEvent.change(screen.getByPlaceholderText('输入书名…'), {
      target: { value: '成功小说' },
    });
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: '都市' },
    });
    fireEvent.click(screen.getByText('下一步'));
    fireEvent.click(screen.getByText('确认创建'));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/books', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: '成功小说',
          genre: '都市',
          targetWords: 30000,
          brief: '',
        }),
      });
    });
  });

  it('shows error message on failure', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: { message: '书名已存在' } }),
    });

    renderWithRouter();

    fireEvent.change(screen.getByPlaceholderText('输入书名…'), {
      target: { value: '重复书名' },
    });
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: '历史' },
    });
    fireEvent.click(screen.getByText('下一步'));
    fireEvent.click(screen.getByText('确认创建'));

    await waitFor(() => {
      expect(screen.getByText('书名已存在')).toBeTruthy();
    });
  });

  it('shows default chapter count estimate', () => {
    renderWithRouter();

    const targetInput = screen.getByRole('spinbutton') as HTMLInputElement;
    expect(targetInput.value).toBe('30000');
    expect(screen.getByText('约 10 章（每章 ~3000 字）')).toBeTruthy();
  });
});
