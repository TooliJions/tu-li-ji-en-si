import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import ChapterPlans from './chapter-plans';
import * as api from '../lib/api';

vi.mock('../lib/api', () => ({
  fetchBook: vi.fn(),
  fetchChapters: vi.fn(),
  fetchTruthFile: vi.fn(),
  planChapter: vi.fn(),
  bootstrapStory: vi.fn(),
}));

const mockBook = {
  id: 'book-1',
  title: '重生-从高考满分作文开始',
  genre: '都市',
  chapterCount: 45,
  targetChapterCount: 100,
  brief: '校园竞赛逆袭题材，主线围绕天赋、代价与成长。',
};

const mockChapters = [
  { number: 44, title: '入学报到', status: 'published', wordCount: 3200 },
  { number: 45, title: '首次测验', status: 'published', wordCount: 3100 },
];

const mockManifest = {
  currentFocus: '当前重点：写主角在首次测验后被竞赛老师盯上的变化。',
  worldRules: [
    { id: 'rule-1', rule: '全国竞赛采用淘汰制，校内仅 1 个推荐名额。' },
    { id: 'rule-2', rule: '都市现实向，无超自然能力。' },
  ],
  characters: [
    { id: 'char-1', name: '林晨' },
    { id: 'char-2', name: '王老师' },
    { id: 'char-3', name: '苏小雨' },
  ],
  hooks: [{ id: 'hook-1', description: '全国竞赛通知' }],
  chapterPlans: {},
};

function LocationEcho() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function renderWithRouter(initialEntry = '/chapter-plans?bookId=book-1') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/chapter-plans" element={<ChapterPlans />} />
        <Route path="/book/:bookId" element={<LocationEcho />} />
        <Route path="/truth-files" element={<LocationEcho />} />
        <Route path="/writing" element={<LocationEcho />} />
        <Route path="/daemon" element={<LocationEcho />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ChapterPlans Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    (api.fetchBook as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(mockBook);
    (api.fetchChapters as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(mockChapters);
    (api.fetchTruthFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: mockManifest,
      versionToken: 3,
    });
    (api.planChapter as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      chapterNumber: 46,
      title: '竞赛邀约',
      summary: '展示主角在首次测验中的惊艳表现，引出竞赛老师的注意。',
      keyEvents: ['测验满分', '老师约谈'],
      hooks: ['全国竞赛通知'],
      characters: ['林晨', '王老师', '苏小雨'],
    });
    (api.bootstrapStory as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      currentFocus: '核心矛盾：竞赛推荐名额只有一个；成长主线：主角从自我怀疑走向主动承担。',
      centralConflict: '竞赛推荐名额只有一个，主角必须在家庭压力和校园竞争中争出资格。',
      growthArc: '主角从自我怀疑走向主动承担。',
      worldRules: ['校园竞赛采用淘汰制，校内仅 1 个推荐名额。', '现实向校园环境，无超自然设定。'],
      characters: [
        { name: '林晨', role: 'protagonist', arc: '从谨慎隐忍到主动出击' },
        { name: '王老师', role: 'supporting', arc: '从观察到押注主角' },
      ],
      hooks: ['全国竞赛推荐名单即将公布'],
      chapterPlan: {
        chapterNumber: 46,
        title: '竞赛邀约',
        summary: '主角在首次测验后被竞赛老师单独约谈，正式进入名额竞争。',
        keyEvents: ['测验结果公布', '老师单独约谈'],
        hooks: ['全国竞赛推荐名单即将公布'],
        characters: ['林晨', '王老师'],
      },
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
      new Error('加载规划页面失败：书籍状态不可用'),
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

  it('shows real step summaries for theme, world setting and characters', async () => {
    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('校园竞赛逆袭题材，主线围绕天赋、代价与成长。')).toBeTruthy();
    });

    expect(screen.getByText('校园竞赛逆袭题材，主线围绕天赋、代价与成长。')).toBeTruthy();
    expect(screen.getByText((content) => content.includes('竞赛老师盯上的变化'))).toBeTruthy();
    expect(screen.getByText('林晨、王老师、苏小雨')).toBeTruthy();
  });

  it('hydrates chapter goal and hook text from persisted manifest chapter plans', async () => {
    (api.fetchTruthFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: {
        ...mockManifest,
        chapterPlans: {
          '46': {
            chapterNumber: 46,
            title: '暗中窥伺',
            intention: '展示主角在首次测验中的惊艳表现，引出竞赛老师的注意，埋下后续竞赛伏笔。',
            characters: ['林尘', '赵炎', '炎长老'],
            keyEvents: ['林尘炼药受阻', '长老暗中观察'],
            hooks: [
              { description: '竞赛老师开始关注林尘' },
              { description: '长老怀疑林尘体质异常' },
            ],
          },
        },
      },
      versionToken: 3,
    });

    renderWithRouter();

    await waitFor(() => {
      expect((screen.getByLabelText('章目标') as HTMLTextAreaElement).value).toContain(
        '展示主角在首次测验中的惊艳表现',
      );
    });

    expect((screen.getByLabelText('章节标题') as HTMLInputElement).value).toBe('暗中窥伺');
    expect((screen.getByLabelText('伏笔埋设') as HTMLInputElement).value).toBe(
      '竞赛老师开始关注林尘、长老怀疑林尘体质异常',
    );
  });

  it('falls back to manifest hooks when stale local storage contains serialized objects', async () => {
    localStorage.setItem(
      'chapter_plans_book-1',
      JSON.stringify({
        46: {
          chapterNumber: 46,
          title: '暗中窥伺',
          goal: '',
          characters: '',
          keyEvents: '',
          hooks: '[object Object]、[object Object]',
        },
      }),
    );

    (api.fetchTruthFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: {
        ...mockManifest,
        chapterPlans: {
          '46': {
            chapterNumber: 46,
            title: '暗中窥伺',
            intention: '展示主角在首次测验中的惊艳表现，引出竞赛老师的注意，埋下后续竞赛伏笔。',
            characters: ['林尘', '赵炎', '炎长老'],
            keyEvents: ['林尘炼药受阻', '长老暗中观察'],
            hooks: [
              { description: '竞赛老师开始关注林尘' },
              { description: '长老怀疑林尘体质异常' },
            ],
          },
        },
      },
      versionToken: 3,
    });

    renderWithRouter();

    await waitFor(() => {
      expect((screen.getByLabelText('伏笔埋设') as HTMLInputElement).value).toBe(
        '竞赛老师开始关注林尘、长老怀疑林尘体质异常',
      );
    });

    expect((screen.getByLabelText('章目标') as HTMLTextAreaElement).value).toContain(
      '展示主角在首次测验中的惊艳表现',
    );
  });

  it('triggers AI planning when clicking the upstream step summary instead of navigating away', async () => {
    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('校园竞赛逆袭题材，主线围绕天赋、代价与成长。')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('校园竞赛逆袭题材，主线围绕天赋、代价与成长。'));

    await waitFor(() => {
      expect(api.planChapter).toHaveBeenCalledWith(
        'book-1',
        46,
        expect.stringContaining('创作简报:'),
      );
    });

    expect(screen.queryByTestId('location')).toBeNull();
    expect(screen.getByText('创作规划')).toBeTruthy();
  });

  it('uses AI planning and forwards selected chapter intent into writing route', async () => {
    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('AI 辅助生成规划')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('AI 辅助生成规划'));

    await waitFor(() => {
      expect(api.planChapter).toHaveBeenCalledWith(
        'book-1',
        46,
        expect.stringContaining('创作简报:'),
      );
    });

    const aiPlanCall =
      (api.planChapter as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[2] ?? '';
    expect(aiPlanCall).toContain('创作简报:');
    expect(aiPlanCall).toContain('当前重点: 写主角在首次测验后被竞赛老师盯上的变化。');
    expect(aiPlanCall).toContain('世界设定: 全国竞赛采用淘汰制，校内仅 1 个推荐名额。');
    expect(aiPlanCall).toContain('都市现实向，无超自然能力');
    expect(aiPlanCall).toContain('角色设定: 林晨、王老师、苏小雨');

    expect((screen.getByLabelText('章节标题') as HTMLInputElement).value).toContain('竞赛邀约');
    expect((screen.getByLabelText('章目标') as HTMLTextAreaElement).value).toContain(
      '展示主角在首次测验中的惊艳表现',
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

  it('blocks the start writing action until title goal characters and key events are present', async () => {
    (api.fetchTruthFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: {
        ...mockManifest,
        chapterPlans: {
          '46': {
            chapterNumber: 46,
            title: '',
            intention: '',
            characters: [],
            keyEvents: [],
            hooks: [],
          },
        },
      },
      versionToken: 3,
    });

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('开始创作')).toBeDisabled();
    });

    expect(
      screen.getByText('进入正文前必须补齐章节标题、章目标、出场人物和关键事件。'),
    ).toBeTruthy();
  });

  it('shows a visible error when AI planning fails', async () => {
    (api.planChapter as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('章节规划失败：Planner Agent 暂不可用'),
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

  it('auto-runs the inspiration bootstrap chain and forwards to writing when requested', async () => {
    renderWithRouter('/chapter-plans?bookId=book-1&autoBootstrap=1&autoWrite=1');

    await waitFor(() => {
      expect(api.bootstrapStory).toHaveBeenCalledWith('book-1', 46);
    });

    await waitFor(() => {
      expect(screen.getByTestId('location').textContent).toContain('/writing?');
    });

    const location = screen.getByTestId('location').textContent ?? '';
    const [, search = ''] = location.split('?');
    const query = new URLSearchParams(search);
    expect(query.get('bookId')).toBe('book-1');
    expect(query.get('chapter')).toBe('46');
    expect(query.get('title')).toBe('竞赛邀约');
    expect(query.get('autoStart')).toBe('1');
    expect(query.get('intent')).toContain(
      '章节目标: 主角在首次测验后被竞赛老师单独约谈，正式进入名额竞争。',
    );
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
        '/truth-files?bookId=book-1&tab=overview',
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
        '/truth-files?bookId=book-1&tab=characters',
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
