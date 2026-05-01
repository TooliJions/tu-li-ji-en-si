import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PlanningBriefPage from './planning-brief';
import * as api from '../lib/api';

vi.mock('../lib/api', () => ({
  fetchBook: vi.fn(),
  fetchInspirationSeed: vi.fn(),
  fetchPlanningBrief: vi.fn(),
  createPlanningBrief: vi.fn(),
  updatePlanningBrief: vi.fn(),
}));

function renderWithRouter(entry = '/planning-brief?bookId=book-1') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/planning-brief" element={<PlanningBriefPage />} />
        <Route path="/story-outline" element={<div>outline</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PlanningBrief Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.fetchBook).mockResolvedValue({ id: 'book-1', title: '测试书籍' });
    vi.mocked(api.fetchInspirationSeed).mockResolvedValue({
      id: 'seed-1',
      sourceText: '宗门天才暴露血脉',
      constraints: [],
      sourceType: 'manual',
      createdAt: '2026-04-30T00:00:00.000Z',
    });
    vi.mocked(api.fetchPlanningBrief).mockResolvedValue(null);
    vi.mocked(api.createPlanningBrief).mockResolvedValue({
      id: 'brief-1',
      seedId: 'seed-1',
      audience: '男频玄幻读者',
      genreStrategy: '高开高走',
      styleTarget: '爽点密集',
      lengthTarget: '300 万字',
      tabooRules: ['不降智'],
      marketGoals: ['起点连载'],
      creativeConstraints: ['成长线清晰'],
      status: 'draft',
      createdAt: '2026-04-30T00:00:00.000Z',
      updatedAt: '2026-04-30T00:00:00.000Z',
    });
  });

  it('renders planning page skeleton', async () => {
    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('规划简报')).toBeTruthy();
    });

    expect(screen.getByLabelText('目标读者')).toBeTruthy();
    expect(screen.getByLabelText('题材策略')).toBeTruthy();
    expect(screen.getByText('进入总纲')).toBeTruthy();
  });

  it('creates planning brief after inspiration is ready', async () => {
    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByLabelText('目标读者')).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText('目标读者'), { target: { value: '男频玄幻读者' } });
    fireEvent.change(screen.getByLabelText('题材策略'), { target: { value: '高开高走' } });
    fireEvent.change(screen.getByLabelText('风格目标'), { target: { value: '爽点密集' } });
    fireEvent.change(screen.getByLabelText('篇幅目标'), { target: { value: '300 万字' } });
    fireEvent.change(screen.getByLabelText('禁区规则'), { target: { value: '不降智' } });
    fireEvent.change(screen.getByLabelText('市场目标'), { target: { value: '起点连载' } });
    fireEvent.change(screen.getByLabelText('创作约束'), { target: { value: '成长线清晰' } });
    fireEvent.click(screen.getByText('保存规划简报'));

    await waitFor(() => {
      expect(api.createPlanningBrief).toHaveBeenCalledWith('book-1', {
        audience: '男频玄幻读者',
        genreStrategy: '高开高走',
        styleTarget: '爽点密集',
        lengthTarget: '300 万字',
        tabooRules: ['不降智'],
        marketGoals: ['起点连载'],
        creativeConstraints: ['成长线清晰'],
      });
    });
  });
});
