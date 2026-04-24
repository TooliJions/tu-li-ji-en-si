import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import BookCreate from './book-create';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

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
    mockNavigate.mockReset();
  });

  it('renders step 1 with document-aligned basic fields', () => {
    renderWithRouter();
    expect(screen.getByText('新建书籍')).toBeTruthy();
    expect(screen.getByPlaceholderText('输入书名…')).toBeTruthy();
    expect(screen.getByLabelText('题材')).toBeTruthy();
    expect(screen.getByLabelText('中文')).toBeTruthy();
    expect(screen.getByLabelText('英文')).toBeTruthy();
    expect(screen.getByLabelText('平台')).toBeTruthy();
    expect(screen.getByText('下一步')).toBeTruthy();
  });

  it('advances to step 2 and shows creation settings fields', () => {
    renderWithRouter();

    fireEvent.change(screen.getByPlaceholderText('输入书名…'), {
      target: { value: '测试小说' },
    });
    fireEvent.change(screen.getByLabelText('题材'), {
      target: { value: '玄幻' },
    });
    fireEvent.click(screen.getByText('下一步'));

    expect(screen.getByText('创作设置')).toBeTruthy();
    expect(screen.getByLabelText('目标总字数（万字）')).toBeTruthy();
    expect(screen.getByLabelText('目标字数/章')).toBeTruthy();
    expect(screen.getByLabelText('提示词版本')).toBeTruthy();
    expect(screen.getByLabelText('Writer Agent')).toBeTruthy();
    expect(screen.getByLabelText('Auditor Agent')).toBeTruthy();
    expect(screen.getByLabelText('Planner Agent')).toBeTruthy();
    expect(screen.getByLabelText('创作简报')).toBeTruthy();
    expect(screen.getByLabelText('上传 markdown 文件')).toBeTruthy();
  });

  it('returns to step 1 when clicking back', () => {
    renderWithRouter();

    fireEvent.change(screen.getByPlaceholderText('输入书名…'), {
      target: { value: '测试小说' },
    });
    fireEvent.change(screen.getByLabelText('题材'), {
      target: { value: '科幻' },
    });
    fireEvent.click(screen.getByText('下一步'));
    fireEvent.click(screen.getByText('返回修改'));

    expect(screen.getByPlaceholderText('输入书名…')).toBeTruthy();
    // Step indicator should still show step 1 as active
    const stepIndicator = screen.getByText('① 基本信息');
    expect(stepIndicator.className).toContain('font-medium');
  });

  it('imports markdown brief and submits document-aligned payload', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { id: 'book-test-123' } }),
    });

    renderWithRouter();

    fireEvent.change(screen.getByPlaceholderText('输入书名…'), {
      target: { value: '成功小说' },
    });
    fireEvent.change(screen.getByLabelText('题材'), {
      target: { value: '都市' },
    });
    fireEvent.click(screen.getByLabelText('英文'));
    fireEvent.change(screen.getByLabelText('平台'), {
      target: { value: 'webnovel' },
    });
    fireEvent.click(screen.getByText('下一步'));

    fireEvent.change(screen.getByLabelText('目标总字数（万字）'), {
      target: { value: '38' },
    });
    fireEvent.change(screen.getByLabelText('目标字数/章'), {
      target: { value: '3200' },
    });
    fireEvent.change(screen.getByLabelText('提示词版本'), {
      target: { value: 'latest' },
    });
    fireEvent.click(screen.getByLabelText('不使用全局默认'));
    fireEvent.change(screen.getByLabelText('Writer Agent'), {
      target: { value: 'qwen3.6-plus' },
    });
    fireEvent.change(screen.getByLabelText('Auditor Agent'), {
      target: { value: 'gpt-4o-mini' },
    });
    fireEvent.change(screen.getByLabelText('Planner Agent'), {
      target: { value: 'claude-3.7-sonnet' },
    });

    const fileInput = screen.getByLabelText('上传 markdown 文件');
    const file = new File(['# 创作简报\n\n这是导入的设定。'], 'brief.md', {
      type: 'text/markdown',
    });
    Object.defineProperty(file, 'text', {
      value: () => Promise.resolve('# 创作简报\n\n这是导入的设定。'),
    });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('已导入：brief.md')).toBeTruthy();
    });

    const form = screen.getByText('创建书籍').closest('form') as HTMLFormElement;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/books', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: '成功小说',
          genre: '都市',
          language: 'en-US',
          platform: 'webnovel',
          targetChapterCount: 119,
          targetWordsPerChapter: 3200,
          targetWords: 380000,
          promptVersion: 'latest',
          modelConfig: {
            useGlobalDefaults: false,
            writer: 'qwen3.6-plus',
            auditor: 'gpt-4o-mini',
            planner: 'claude-3.7-sonnet',
          },
          brief: '# 创作简报\n\n这是导入的设定。',
        }),
      });
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        '/writing-plan?bookId=book-test-123&autoBootstrap=1&autoWrite=1'
      );
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
    fireEvent.change(screen.getByLabelText('题材'), {
      target: { value: '历史' },
    });
    fireEvent.click(screen.getByText('下一步'));
    const form2 = screen.getByText('创建书籍').closest('form') as HTMLFormElement;
    fireEvent.submit(form2);

    await waitFor(() => {
      expect(screen.getByText('书名已存在')).toBeTruthy();
    });
  });

  it('shows computed total target words in creation settings', () => {
    renderWithRouter();

    fireEvent.change(screen.getByPlaceholderText('输入书名…'), {
      target: { value: '字数测试' },
    });
    fireEvent.change(screen.getByLabelText('题材'), {
      target: { value: '同人' },
    });
    fireEvent.click(screen.getByText('下一步'));

    expect(screen.getByDisplayValue('30')).toBeTruthy();
    expect(screen.getByDisplayValue('3000')).toBeTruthy();
    expect(screen.getAllByText(/30万字/).length).toBeGreaterThanOrEqual(1);
  });
});
