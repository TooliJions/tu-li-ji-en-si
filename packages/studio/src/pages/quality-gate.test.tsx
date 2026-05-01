import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('../lib/api', () => ({
  fetchBooks: vi.fn(),
  fetchChapters: vi.fn(),
  fetchAuditReport: vi.fn(),
  runAudit: vi.fn(),
}));

import * as api from '../lib/api';
import QualityGate from './quality-gate';

const mockBooks = [{ id: 'book-001', title: '测试小说', genre: '玄幻', chapterCount: 3 }];

const mockChapters = [
  { number: 1, title: '第一章', status: 'published', wordCount: 2000 },
  { number: 2, title: '第二章', status: 'draft', wordCount: 1800 },
];

function renderWithRouter(entry = '/quality?bookId=book-001&chapter=1') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/quality" element={<QualityGate />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('QualityGate Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.fetchBooks).mockResolvedValue(mockBooks as never);
    vi.mocked(api.fetchChapters).mockResolvedValue(mockChapters as never);
  });

  it('renders quality gate page with header', async () => {
    vi.mocked(api.fetchAuditReport).mockResolvedValue(null);
    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /质量检查/ })).toBeTruthy();
    });
    expect(screen.getByText('审计章节质量，阻断不合格内容进入导出阶段')).toBeTruthy();
  });

  it('shows no audit report placeholder when report is empty', async () => {
    vi.mocked(api.fetchAuditReport).mockResolvedValue(null);
    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('暂无审计报告，请点击「重新审计」')).toBeTruthy();
    });
  });

  it('displays audit report with pass decision', async () => {
    vi.mocked(api.fetchAuditReport).mockResolvedValue({
      draftId: 'draft-1',
      scoreSummary: { overall: 0.92, dimensions: { continuity: 0.95, style: 0.9 } },
      blockerIssues: [],
      warningIssues: [],
      suggestionIssues: [
        {
          id: 's1',
          description: '可增加环境描写',
          tier: 'suggestion',
          category: '描写',
          suggestion: '在对话间插入环境细节',
        },
      ],
      finalDecision: 'pass',
    } as never);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('通过')).toBeTruthy();
    });
    expect(screen.getByText('92分')).toBeTruthy();
    expect(screen.getByText('可增加环境描写')).toBeTruthy();
  });

  it('displays audit report with fail decision and blockers', async () => {
    vi.mocked(api.fetchAuditReport).mockResolvedValue({
      draftId: 'draft-1',
      scoreSummary: { overall: 0.45, dimensions: {} },
      blockerIssues: [
        {
          id: 'b1',
          description: '角色已死亡但再次出场',
          tier: 'blocker',
          category: '一致性',
          suggestion: '修正角色状态',
        },
      ],
      warningIssues: [
        {
          id: 'w1',
          description: '节奏偏慢',
          tier: 'warning',
          category: '节奏',
          suggestion: '加快冲突推进',
        },
      ],
      suggestionIssues: [],
      finalDecision: 'fail',
    } as never);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('未通过')).toBeTruthy();
    });
    expect(screen.getByText('角色已死亡但再次出场')).toBeTruthy();
    expect(screen.getByText('节奏偏慢')).toBeTruthy();
  });

  it('triggers re-audit when clicking button', async () => {
    vi.mocked(api.fetchAuditReport).mockResolvedValue(null);
    vi.mocked(api.runAudit).mockResolvedValue({
      draftId: 'draft-1',
      scoreSummary: { overall: 0.88 },
      blockerIssues: [],
      warningIssues: [],
      suggestionIssues: [],
      finalDecision: 'pass',
    } as never);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('重新审计')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('重新审计'));

    await waitFor(() => {
      expect(api.runAudit).toHaveBeenCalledWith('book-001', 1);
    });
  });

  it('shows repair actions when present', async () => {
    vi.mocked(api.fetchAuditReport).mockResolvedValue({
      draftId: 'draft-1',
      scoreSummary: { overall: 0.7 },
      blockerIssues: [],
      warningIssues: [
        {
          id: 'w1',
          description: '用词重复',
          tier: 'warning',
          category: '语言',
          suggestion: '替换同义词',
        },
      ],
      suggestionIssues: [],
      repairActions: [
        { type: 'local_replace', targetIssueIds: ['w1'], description: '替换第 3 段重复词汇' },
      ],
      finalDecision: 'warning',
    } as never);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('修复建议')).toBeTruthy();
    });
    expect(screen.getByText('替换第 3 段重复词汇')).toBeTruthy();
  });

  it('allows navigation to export when passed', async () => {
    vi.mocked(api.fetchAuditReport).mockResolvedValue({
      draftId: 'draft-1',
      scoreSummary: { overall: 0.9 },
      blockerIssues: [],
      warningIssues: [],
      suggestionIssues: [],
      finalDecision: 'pass',
    } as never);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('前往导出')).toBeTruthy();
    });
  });

  it('hides export button when failed', async () => {
    vi.mocked(api.fetchAuditReport).mockResolvedValue({
      draftId: 'draft-1',
      scoreSummary: { overall: 0.3 },
      blockerIssues: [
        { id: 'b1', description: '矛盾', tier: 'blocker', category: '一致性', suggestion: '修正' },
      ],
      warningIssues: [],
      suggestionIssues: [],
      finalDecision: 'fail',
    } as never);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('未通过')).toBeTruthy();
    });
    expect(screen.queryByText('前往导出')).toBeNull();
  });
});
