import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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
class MockEventSource {
  onmessage: any;
  onerror: any;
  addEventListener = vi.fn();
  close = vi.fn();
  constructor(public url: string) {}
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
});
