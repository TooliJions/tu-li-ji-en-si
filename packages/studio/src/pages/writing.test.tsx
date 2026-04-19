import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../lib/api', () => ({
  fetchBook: vi.fn(),
  fetchChapters: vi.fn(),
  fetchMemoryPreview: vi.fn(),
  fetchEntityContext: vi.fn(),
  startFastDraft: vi.fn(),
  startWriteNext: vi.fn(),
  startWriteDraft: vi.fn(),
  startUpgradeDraft: vi.fn(),
  getPipelineStatus: vi.fn(),
}));

import * as api from '../lib/api';
import Writing from './writing';

const mockBook = {
  id: 'book-001',
  title: '测试小说',
  genre: '玄幻',
  targetWords: 30000,
  currentWords: 6000,
  chapterCount: 2,
  targetChapterCount: 10,
  status: 'active',
  updatedAt: '2026-04-19T00:00:00.000Z',
};

const mockChapters = [
  {
    number: 1,
    title: '第一章',
    content: '内容1',
    status: 'published' as const,
    wordCount: 3000,
    qualityScore: 80,
    auditStatus: 'passed',
  },
  {
    number: 2,
    title: '第二章',
    content: '内容2',
    status: 'draft' as const,
    wordCount: 3000,
    qualityScore: null,
    auditStatus: null,
  },
];

const mockPipelineStatus = {
  pipelineId: 'pipeline-123',
  status: 'running',
  stages: ['planning', 'composing', 'writing', 'auditing', 'revising', 'persisting'],
  currentStage: 'planning',
  progress: {
    planning: { status: 'running', elapsedMs: 1000 },
    composing: { status: 'pending', elapsedMs: 0 },
    writing: { status: 'pending', elapsedMs: 0 },
    auditing: { status: 'pending', elapsedMs: 0 },
    revising: { status: 'pending', elapsedMs: 0 },
    persisting: { status: 'pending', elapsedMs: 0 },
  },
  startedAt: '2026-04-19T00:00:00.000Z',
};

const mockMemoryPreview = {
  summary: {
    facts: 2,
    hooks: 1,
    characters: 2,
  },
  memories: [
    { text: '林晨', confidence: 0.95, sourceType: 'character', entityType: 'character' },
    { text: '竞赛试卷', confidence: 0.88, sourceType: 'fact', entityType: 'item' },
    { text: '档案室谜团', confidence: 0.84, sourceType: 'hook', entityType: null },
  ],
};

const mockEntityContext = {
  name: '林晨',
  type: 'character',
  currentLocation: '教室',
  emotion: '专注',
  inventory: ['竞赛试卷'],
  relationships: [{ with: '苏小雨', type: '同伴' }],
  activeHooks: [{ id: 'hook-001', description: '档案室谜团', status: 'open' }],
};

function renderWithRouter(bookId = 'book-001') {
  return render(
    <MemoryRouter initialEntries={[`/writing?bookId=${bookId}`]}>
      <Routes>
        <Route path="/writing" element={<Writing />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('Writing Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders writing page header and book selector', async () => {
    vi.mocked(api.fetchBook).mockResolvedValue(mockBook);
    vi.mocked(api.fetchChapters).mockResolvedValue(mockChapters);
    vi.mocked(api.fetchMemoryPreview).mockResolvedValue(mockMemoryPreview);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('快速试写')).toBeTruthy();
    });
    expect(screen.getByText('完整创作')).toBeTruthy();
  });

  it('shows fast draft panel with word count input', async () => {
    vi.mocked(api.fetchBook).mockResolvedValue(mockBook);
    vi.mocked(api.fetchChapters).mockResolvedValue(mockChapters);
    vi.mocked(api.fetchMemoryPreview).mockResolvedValue(mockMemoryPreview);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('快速试写')).toBeTruthy();
    });

    // Word count input should be present
    const wordInput = screen.getByRole('spinbutton');
    expect(wordInput).toBeTruthy();
  });

  it('submits fast draft and shows result', async () => {
    const draftContent = '这是快速试写的草稿内容...';
    vi.mocked(api.fetchBook).mockResolvedValue(mockBook);
    vi.mocked(api.fetchChapters).mockResolvedValue(mockChapters);
    vi.mocked(api.fetchMemoryPreview).mockResolvedValue(mockMemoryPreview);
    vi.mocked(api.startFastDraft).mockResolvedValue({
      content: draftContent,
      wordCount: 800,
      elapsedMs: 12000,
      llmCalls: 1,
      draftId: 'draft-temp-123',
    });

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('快速试写')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('开始快速试写'));
    });

    await waitFor(() => {
      expect(api.startFastDraft).toHaveBeenCalled();
    });

    expect(screen.getByText(draftContent)).toBeTruthy();
  });

  it('submits write-next and shows pipeline progress', async () => {
    vi.mocked(api.fetchBook).mockResolvedValue(mockBook);
    vi.mocked(api.fetchChapters).mockResolvedValue(mockChapters);
    vi.mocked(api.fetchMemoryPreview).mockResolvedValue(mockMemoryPreview);
    vi.mocked(api.startWriteNext).mockResolvedValue({
      pipelineId: 'pipeline-123',
      status: 'running',
    });
    vi.mocked(api.getPipelineStatus).mockResolvedValue(mockPipelineStatus);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('完整创作')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('开始完整创作'));
    });

    await waitFor(() => {
      expect(api.startWriteNext).toHaveBeenCalled();
    });

    // Should show pipeline stages - use getAllByText since "规划中" appears in both status and stage
    const stageElements = screen.getAllByText('规划中');
    expect(stageElements.length).toBeGreaterThan(0);
  });

  it('submits draft mode write', async () => {
    vi.mocked(api.fetchBook).mockResolvedValue(mockBook);
    vi.mocked(api.fetchChapters).mockResolvedValue(mockChapters);
    vi.mocked(api.fetchMemoryPreview).mockResolvedValue(mockMemoryPreview);
    vi.mocked(api.startWriteDraft).mockResolvedValue({
      number: 3,
      title: null,
      content: '【草稿模式】内容',
      status: 'draft',
      wordCount: 2000,
      qualityScore: null,
    });

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('完整创作')).toBeTruthy();
    });

    // Click draft mode button
    await act(async () => {
      fireEvent.click(screen.getByText('草稿模式'));
    });

    await waitFor(() => {
      expect(api.startWriteDraft).toHaveBeenCalled();
    });
  });

  it('shows quality metrics panel', async () => {
    vi.mocked(api.fetchBook).mockResolvedValue(mockBook);
    vi.mocked(api.fetchChapters).mockResolvedValue(mockChapters);
    vi.mocked(api.fetchMemoryPreview).mockResolvedValue(mockMemoryPreview);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('质量仪表盘')).toBeTruthy();
    });

    expect(screen.getByText('平均质量')).toBeTruthy();
  });

  it('shows runtime memory preview instead of hardcoded keywords', async () => {
    vi.mocked(api.fetchBook).mockResolvedValue(mockBook);
    vi.mocked(api.fetchChapters).mockResolvedValue(mockChapters);
    vi.mocked(api.fetchMemoryPreview).mockResolvedValue(mockMemoryPreview);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('记忆提取')).toBeTruthy();
    });
    expect(screen.getByText('林晨')).toBeTruthy();
    expect(screen.getByText('竞赛试卷')).toBeTruthy();
    expect(screen.getByText('档案室谜团')).toBeTruthy();
    expect(screen.getByText(/已抓取 2 条事实碎片 \+ 1 条伏笔 \+ 2 个角色/)).toBeTruthy();
    expect(screen.getByText('来源于 manifest 角色 / facts / hooks 真相文件')).toBeTruthy();
    expect(screen.getByText('角色 2')).toBeTruthy();
    expect(screen.getByText('事实 2')).toBeTruthy();
    expect(screen.getByText('伏笔 1')).toBeTruthy();
    expect(screen.queryByText('旧档案室')).toBeNull();
  });

  it('supports entity hover in fast draft preview', async () => {
    vi.mocked(api.fetchBook).mockResolvedValue(mockBook);
    vi.mocked(api.fetchChapters).mockResolvedValue(mockChapters);
    vi.mocked(api.fetchMemoryPreview).mockResolvedValue(mockMemoryPreview);
    vi.mocked(api.fetchEntityContext).mockResolvedValue(mockEntityContext);
    vi.mocked(api.startFastDraft).mockResolvedValue({
      content: '林晨拿起竞赛试卷，回到教室。',
      wordCount: 800,
      elapsedMs: 12000,
      llmCalls: 1,
      draftId: 'draft-temp-123',
    });

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('快速试写')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('开始快速试写'));
    });

    await waitFor(() => {
      expect(api.startFastDraft).toHaveBeenCalled();
    });

    const entityMarks = screen.getAllByText('林晨').filter((element) => element.tagName === 'MARK');
    expect(entityMarks.length).toBeGreaterThan(0);

    fireEvent.mouseEnter(entityMarks[0]);

    await waitFor(() => {
      expect(api.fetchEntityContext).toHaveBeenCalledWith('book-001', '林晨');
      expect(screen.getByText(/当前位置：教室/)).toBeTruthy();
      expect(screen.getByText(/持有：竞赛试卷/)).toBeTruthy();
    });
  });

  it('allows custom intent input for write-next', async () => {
    vi.mocked(api.fetchBook).mockResolvedValue(mockBook);
    vi.mocked(api.fetchChapters).mockResolvedValue(mockChapters);
    vi.mocked(api.fetchMemoryPreview).mockResolvedValue(mockMemoryPreview);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('完整创作')).toBeTruthy();
    });

    // Intent textarea should be present (in the full creation section)
    const textarea = screen.getByPlaceholderText('输入创作意图…');
    expect(textarea).toBeTruthy();

    fireEvent.change(textarea, { target: { value: '让主角发现线索' } });
    expect((textarea as HTMLTextAreaElement).value).toBe('让主角发现线索');
  });
});
