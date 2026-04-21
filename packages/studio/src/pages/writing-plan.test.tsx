import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import WritingPlan from './writing-plan';
import * as api from '../lib/api';

vi.mock('../lib/api', () => ({
  fetchBook: vi.fn(),
  fetchChapters: vi.fn(),
  planChapter: vi.fn(),
}));

const mockBook = {
  id: 'book-1',
  title: '重生-从高考满分作文开始',
  genre: '都市',
  chapterCount: 45,
  targetChapterCount: 100,
};

const mockChapters = [
  { number: 44, title: '入学报到', status: 'published', wordCount: 3200 },
  { number: 45, title: '首次测验', status: 'published', wordCount: 3100 },
];

function LocationEcho() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function renderWithRouter(initialEntry = '/writing-plan?bookId=book-1') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/writing-plan" element={<WritingPlan />} />
        <Route path="/book/:bookId" element={<LocationEcho />} />
        <Route path="/truth-files" element={<LocationEcho />} />
        <Route path="/writing" element={<LocationEcho />} />
        <Route path="/daemon" element={<LocationEcho />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('WritingPlan Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    (api.fetchBook as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(mockBook);
    (api.fetchChapters as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(mockChapters);
    (api.planChapter as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      chapterNumber: 46,
      title: '竞赛邀约',
      summary: '展示主角在首次测验中的惊艳表现，引出竞赛老师的注意。',
      keyEvents: ['测验满分', '老师约谈'],
      hooks: ['全国竞赛通知'],
      characters: ['林晨', '王老师', '苏小雨'],
    });
  });

  it('renders prototype-aligned planning workspace', async () => {
    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('创作规划')).toBeTruthy();
    });

    expect(screen.getByText('重生-从高考满分作文开始')).toBeTruthy();
    expect(screen.getByText('当前：第 46 章规划')).toBeTruthy();
    expect(screen.getByText('灵感与设定')).toBeTruthy();
    expect(screen.getByText('世界观构建')).toBeTruthy();
    expect(screen.getByText('角色设计')).toBeTruthy();
    expect(screen.getByText('分章规划')).toBeTruthy();
    expect(screen.getByText('正文创作')).toBeTruthy();
    expect(screen.getByText('守护进程')).toBeTruthy();
    expect(screen.getByText('大纲规划')).toBeTruthy();
    expect(screen.getByText('第46章 详细规划')).toBeTruthy();
    expect(screen.getByLabelText('章节标题')).toBeTruthy();
    expect(screen.getByLabelText('章目标')).toBeTruthy();
    expect(screen.getByLabelText('出场人物')).toBeTruthy();
    expect(screen.getByLabelText('关键事件')).toBeTruthy();
    expect(screen.getByLabelText('伏笔埋设')).toBeTruthy();
    expect(screen.getByText('保存规划')).toBeTruthy();
    expect(screen.getByText('开始创作')).toBeTruthy();
  });

  it('shows a specific load error when planning workspace loading fails', async () => {
    (api.fetchBook as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('加载规划页面失败：书籍状态不可用')
    );

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('加载规划页面失败：书籍状态不可用');
    });
  });

  it('saves current chapter plan locally and restores it on reload', async () => {
    const view = renderWithRouter();

    await waitFor(() => {
      expect(screen.getByLabelText('章目标')).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText('章目标'), {
      target: { value: '展示主角在首次测验中的惊艳表现。' },
    });
    fireEvent.change(screen.getByLabelText('出场人物'), {
      target: { value: '林晨(主) 王老师 苏小雨' },
    });
    fireEvent.click(screen.getByText('保存规划'));

    await waitFor(() => {
      expect(screen.getByText('规划已保存')).toBeTruthy();
    });

    view.unmount();
    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByDisplayValue('展示主角在首次测验中的惊艳表现。')).toBeTruthy();
    });
    expect(screen.getByDisplayValue('林晨(主) 王老师 苏小雨')).toBeTruthy();
  });

  it('uses AI planning and forwards selected chapter intent into writing route', async () => {
    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('AI 辅助生成规划')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('AI 辅助生成规划'));

    await waitFor(() => {
      expect(api.planChapter).toHaveBeenCalledWith('book-1', 46, '');
    });

    expect((screen.getByLabelText('章节标题') as HTMLInputElement).value).toContain('竞赛邀约');
    expect((screen.getByLabelText('章目标') as HTMLTextAreaElement).value).toContain(
      '展示主角在首次测验中的惊艳表现'
    );
    expect((screen.getByLabelText('关键事件') as HTMLTextAreaElement).value).toContain('测验满分');
    expect((screen.getByLabelText('关键事件') as HTMLTextAreaElement).value).toContain('老师约谈');

    fireEvent.change(screen.getByLabelText('出场人物'), {
      target: { value: '林晨(主) 王老师 苏小雨' },
    });
    fireEvent.click(screen.getByText('开始创作'));

    await waitFor(() => {
      expect(screen.getByTestId('location').textContent).toContain('/writing?');
    });

    const location = screen.getByTestId('location').textContent ?? '';
    expect(location).toContain('bookId=book-1');
    expect(location).toContain('chapter=46');
    const [, search = ''] = location.split('?');
    const query = new URLSearchParams(search);
    expect(query.get('title')).toBe('竞赛邀约');
    expect(query.get('characters')).toBe('林晨(主) 王老师 苏小雨');
    expect(query.get('hooks')).toBe('全国竞赛通知');
    const intent = query.get('intent') ?? '';
    expect(intent).toContain('章节目标: 展示主角在首次测验中的惊艳表现，引出竞赛老师的注意。');
    expect(intent).toContain('出场人物: 林晨(主) 王老师 苏小雨');
  });

  it('shows a visible error when AI planning fails', async () => {
    (api.planChapter as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('章节规划失败：Planner Agent 暂不可用')
    );

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('AI 辅助生成规划')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('AI 辅助生成规划'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('章节规划失败：Planner Agent 暂不可用');
    });
  });

  it('navigates each workflow step to the mapped page with current book context', async () => {
    let view = renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('灵感与设定')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('灵感与设定'));
    await waitFor(() => {
      expect(screen.getByTestId('location').textContent).toBe('/book/book-1');
    });

    view.unmount();
    view = renderWithRouter();
    await waitFor(() => {
      expect(screen.getByText('世界观构建')).toBeTruthy();
    });
    fireEvent.click(screen.getByText('世界观构建'));
    await waitFor(() => {
      expect(screen.getByTestId('location').textContent).toBe(
        '/truth-files?bookId=book-1&tab=overview'
      );
    });

    view.unmount();
    view = renderWithRouter();
    await waitFor(() => {
      expect(screen.getByText('角色设计')).toBeTruthy();
    });
    fireEvent.click(screen.getByText('角色设计'));
    await waitFor(() => {
      expect(screen.getByTestId('location').textContent).toBe(
        '/truth-files?bookId=book-1&tab=characters'
      );
    });

    view.unmount();
    view = renderWithRouter();
    await waitFor(() => {
      expect(screen.getByText('正文创作')).toBeTruthy();
    });
    fireEvent.click(screen.getByText('正文创作'));
    await waitFor(() => {
      expect(screen.getByTestId('location').textContent).toBe('/writing?bookId=book-1');
    });

    view.unmount();
    view = renderWithRouter();
    await waitFor(() => {
      expect(screen.getByText('守护进程')).toBeTruthy();
    });
    fireEvent.click(screen.getByText('守护进程'));
    await waitFor(() => {
      expect(screen.getByTestId('location').textContent).toBe('/daemon?bookId=book-1');
    });

    view.unmount();
  });
});
