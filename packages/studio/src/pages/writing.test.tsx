import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Writing from './writing';
import * as api from '../lib/api';

vi.mock('../lib/api', () => ({
  fetchBook: vi.fn(),
  fetchChapters: vi.fn(),
  fetchMemoryPreview: vi.fn(),
  fetchTruthFiles: vi.fn(),
  startFastDraft: vi.fn(),
  startWriteNext: vi.fn(),
  startWriteDraft: vi.fn(),
  startUpgradeDraft: vi.fn(),
  fetchTokenUsage: vi.fn(),
  fetchAiTrace: vi.fn(),
  fetchAuditRate: vi.fn(),
}));

// Mock EventSource
const eventSources: MockEventSource[] = [];

class MockEventSource {
  onmessage: any;
  onerror: any;
  addEventListener = vi.fn();
  close = vi.fn();
  constructor(public url: string) {
    eventSources.push(this);
  }
}
(global as any).EventSource = MockEventSource;

const mockBook = {
  id: 'book-1',
  title: '测试书籍',
  currentWords: 1000,
  targetWords: 100000,
};

describe('Writing Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    eventSources.length = 0;
    (api.fetchBook as any).mockResolvedValue(mockBook);
    (api.fetchChapters as any).mockResolvedValue([]);
    (api.fetchMemoryPreview as any).mockResolvedValue({
      summary: { facts: 0, hooks: 0, characters: 0 },
      memories: [],
    });
    (api.fetchTruthFiles as any).mockResolvedValue({ versionToken: 1, files: [] });
    (api.fetchTokenUsage as any).mockResolvedValue({ total: 1000, prompt: 500, completion: 500 });
    (api.fetchAiTrace as any).mockResolvedValue({ score: 0.1, labels: ['自然'] });
    (api.fetchAuditRate as any).mockResolvedValue({ passed: 10, failed: 1, total: 11 });
  });

  it('renders dashboard with analytics', async () => {
    render(
      <MemoryRouter initialEntries={['/writing?bookId=book-1']}>
        <Writing />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getAllByText('质量仪表盘').length).toBeGreaterThan(0);
    });
    expect(screen.getByText('审计通过率')).toBeDefined();
    expect(screen.getByText('91%')).toBeDefined(); // 10/11
  });

  it('shows log panel', async () => {
    render(
      <MemoryRouter initialEntries={['/writing?bookId=book-1']}>
        <Writing />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('流水线日志')).toBeDefined();
    });
  });

  it('handles write next and starts pipeline', async () => {
    (api.startWriteNext as any).mockResolvedValue({ pipelineId: 'pipe-123' });

    render(
      <MemoryRouter initialEntries={['/writing?bookId=book-1']}>
        <Writing />
      </MemoryRouter>
    );

    await waitFor(() => screen.getByText('开始完整创作'));

    const btn = screen.getByText('开始完整创作');
    fireEvent.click(btn);

    expect(api.startWriteNext).toHaveBeenCalled();
    expect(screen.getByText('启动完整创作流水线...')).toBeDefined();
  });

  it('consumes planning query params to prefill intent and drive chapter-aware calls', async () => {
    (api.fetchChapters as any).mockResolvedValue([
      { number: 45, title: '首次测验', status: 'published' },
    ]);
    (api.startWriteNext as any).mockResolvedValue({ pipelineId: 'pipe-123' });
    (api.startWriteDraft as any).mockResolvedValue({ number: 46, content: 'draft content' });

    render(
      <MemoryRouter
        initialEntries={[
          '/writing?bookId=book-1&chapter=46&title=%E7%AB%9E%E8%B5%9B%E9%82%80%E7%BA%A6&characters=%E6%9E%97%E6%99%A8(%E4%B8%BB)%20%E7%8E%8B%E8%80%81%E5%B8%88%20%E8%8B%8F%E5%B0%8F%E9%9B%A8&hooks=%E5%85%A8%E5%9B%BD%E7%AB%9E%E8%B5%9B%E9%80%9A%E7%9F%A5&intent=%E7%AB%A0%E8%8A%82%E7%9B%AE%E6%A0%87%3A%20%E5%B1%95%E7%A4%BA%E4%B8%BB%E8%A7%92%E5%9C%A8%E9%A6%96%E6%AC%A1%E6%B5%8B%E9%AA%8C%E4%B8%AD%E7%9A%84%E6%83%8A%E8%89%B3%E8%A1%A8%E7%8E%B0%EF%BC%9B%E5%87%BA%E5%9C%BA%E4%BA%BA%E7%89%A9%3A%20%E6%9E%97%E6%99%A8(%E4%B8%BB)%20%E7%8E%8B%E8%80%81%E5%B8%88%20%E8%8B%8F%E5%B0%8F%E9%9B%A8%EF%BC%9B%E4%BC%8F%E7%AC%94%E5%9F%8B%E8%AE%BE%3A%20%E5%85%A8%E5%9B%BD%E7%AB%9E%E8%B5%9B%E9%80%9A%E7%9F%A5',
        ]}
      >
        <Writing />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('开始完整创作')).toBeDefined();
    });

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('第46章');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('竞赛邀约');
    expect(screen.getByLabelText('创作意图（可选）')).toHaveValue(
      '章节目标: 展示主角在首次测验中的惊艳表现；出场人物: 林晨(主) 王老师 苏小雨；伏笔埋设: 全国竞赛通知'
    );

    fireEvent.click(screen.getByText('开始完整创作'));
    expect(api.startWriteNext).toHaveBeenCalledWith(
      'book-1',
      46,
      '章节目标: 展示主角在首次测验中的惊艳表现；出场人物: 林晨(主) 王老师 苏小雨；伏笔埋设: 全国竞赛通知'
    );

    fireEvent.click(screen.getByText('草稿模式'));
    await waitFor(() => {
      expect(api.startWriteDraft).toHaveBeenCalledWith('book-1', 46);
    });
  });

  it('auto-associates title characters and hooks into writing intents when explicit intent is absent', async () => {
    (api.fetchChapters as any).mockResolvedValue([
      { number: 45, title: '首次测验', status: 'published' },
    ]);
    (api.startFastDraft as any).mockResolvedValue({
      content: 'draft content',
      wordCount: 800,
      elapsedMs: 1200,
      llmCalls: 1,
      draftId: 'draft-1',
    });
    (api.startWriteNext as any).mockResolvedValue({ pipelineId: 'pipe-123' });

    const autoIntent =
      '章节标题: 竞赛邀约；出场人物: 林晨(主) 王老师 苏小雨；伏笔埋设: 全国竞赛通知';

    render(
      <MemoryRouter
        initialEntries={[
          '/writing?bookId=book-1&chapter=46&title=%E7%AB%9E%E8%B5%9B%E9%82%80%E7%BA%A6&characters=%E6%9E%97%E6%99%A8(%E4%B8%BB)%20%E7%8E%8B%E8%80%81%E5%B8%88%20%E8%8B%8F%E5%B0%8F%E9%9B%A8&hooks=%E5%85%A8%E5%9B%BD%E7%AB%9E%E8%B5%9B%E9%80%9A%E7%9F%A5',
        ]}
      >
        <Writing />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('开始完整创作')).toBeDefined();
    });

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('第46章');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('竞赛邀约');
    expect(screen.getByLabelText('创作意图（可选）')).toHaveValue(autoIntent);
    expect(screen.getByLabelText('试写意图（可选）')).toHaveValue(autoIntent);

    fireEvent.click(screen.getByText('开始快速试写'));
    await waitFor(() => {
      expect(api.startFastDraft).toHaveBeenCalledWith('book-1', autoIntent, 800);
    });

    fireEvent.click(screen.getByText('开始完整创作'));
    expect(api.startWriteNext).toHaveBeenCalledWith('book-1', 46, autoIntent);
  });

  it('auto-starts the write-next pipeline when autoStart=1 is present', async () => {
    (api.fetchChapters as any).mockResolvedValue([
      { number: 45, title: '首次测验', status: 'published' },
    ]);
    (api.startWriteNext as any).mockResolvedValue({ pipelineId: 'pipe-auto-1' });

    render(
      <MemoryRouter
        initialEntries={[
          '/writing?bookId=book-1&chapter=46&title=%E7%AB%9E%E8%B5%9B%E9%82%80%E7%BA%A6&intent=%E7%AB%A0%E8%8A%82%E7%9B%AE%E6%A0%87%3A%20%E4%B8%BB%E8%A7%92%E5%9C%A8%E9%A6%96%E6%AC%A1%E6%B5%8B%E9%AA%8C%E5%90%8E%E8%A2%AB%E7%AB%9E%E8%B5%9B%E8%80%81%E5%B8%88%E5%8D%95%E7%8B%AC%E7%BA%A6%E8%B0%88&autoStart=1',
        ]}
      >
        <Writing />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(api.startWriteNext).toHaveBeenCalledWith(
        'book-1',
        46,
        '章节目标: 主角在首次测验后被竞赛老师单独约谈'
      );
    });
  });

  it('shows 8-dimension quality dashboard with progress bars', async () => {
    render(
      <MemoryRouter initialEntries={['/writing?bookId=book-1']}>
        <Writing />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getAllByText('质量仪表盘').length).toBeGreaterThan(0);
    });
    expect(screen.getByText('AI痕迹')).toBeDefined();
    expect(screen.getByText('连贯性')).toBeDefined();
    expect(screen.getByText('节奏')).toBeDefined();
    expect(screen.getByText('对话')).toBeDefined();
    expect(screen.getByText('描写')).toBeDefined();
    expect(screen.getByText('情感')).toBeDefined();
    expect(screen.getByText('创新')).toBeDefined();
    expect(screen.getByText('完整性')).toBeDefined();
    // Initial state shows '等待中'
    expect(screen.getAllByText('等待中').length).toBeGreaterThan(0);
  });

  it('does not crash when pipeline progress events omit stages', async () => {
    (api.startWriteNext as any).mockResolvedValue({ pipelineId: 'pipe-123' });

    render(
      <MemoryRouter initialEntries={['/writing?bookId=book-1']}>
        <Writing />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(eventSources).toHaveLength(1);
    });

    const pipelineHandler = eventSources[0].addEventListener.mock.calls.find(
      ([eventName]) => eventName === 'pipeline_progress'
    )?.[1] as ((event: MessageEvent<string>) => void) | undefined;

    expect(pipelineHandler).toBeDefined();

    fireEvent.click(screen.getByText('开始完整创作'));

    await act(async () => {
      pipelineHandler?.({
        data: JSON.stringify({
          pipelineId: 'pipe-123',
          status: 'running',
          currentStage: 'planning',
          progress: {},
        }),
      } as MessageEvent<string>);
    });

    await waitFor(() => {
      expect(screen.getByText('流水线 123')).toBeDefined();
    });
    expect(screen.getByText('0%')).toBeDefined();
  });
});
