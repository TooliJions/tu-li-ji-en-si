import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import StoryOutlinePage from './story-outline';
import * as api from '../lib/api';

vi.mock('../lib/api', () => ({
  fetchBook: vi.fn(),
  fetchPlanningBrief: vi.fn(),
  fetchStoryOutline: vi.fn(),
  createStoryOutline: vi.fn(),
  updateStoryOutline: vi.fn(),
}));

function renderWithRouter(entry = '/story-outline?bookId=book-1') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/story-outline" element={<StoryOutlinePage />} />
        <Route path="/chapter-plans" element={<div>chapter plans</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('StoryOutline Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.fetchBook).mockResolvedValue({ id: 'book-1', title: '测试书籍' });
    vi.mocked(api.fetchPlanningBrief).mockResolvedValue({
      id: 'brief-1',
      seedId: 'seed-1',
      audience: '男频玄幻读者',
      genreStrategy: '高开高走',
      styleTarget: '爽点密集',
      lengthTarget: '300 万字',
      tabooRules: [],
      marketGoals: [],
      creativeConstraints: [],
      status: 'ready',
      createdAt: '2026-04-30T00:00:00.000Z',
      updatedAt: '2026-04-30T00:00:00.000Z',
    });
    vi.mocked(api.fetchStoryOutline).mockResolvedValue(null);
    vi.mocked(api.createStoryOutline).mockResolvedValue({
      id: 'outline-1',
      planningBriefId: 'brief-1',
      premise: '少年在宗门考核中暴露上古血脉。',
      worldRules: ['血脉越强反噬越重'],
      protagonistArc: {
        characterName: '林辰',
        startState: '隐忍自保',
        growthPath: '从隐藏锋芒到主动夺势',
        endState: '敢于改写宗门秩序',
      },
      supportingArcs: [],
      majorConflicts: ['宗门内部排挤'],
      phaseMilestones: [],
      endingDirection: '主角建立新秩序',
      createdAt: '2026-04-30T00:00:00.000Z',
      updatedAt: '2026-04-30T00:00:00.000Z',
    });
  });

  it('renders story outline page skeleton', async () => {
    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('故事总纲')).toBeTruthy();
    });

    expect(screen.getByLabelText('故事前提')).toBeTruthy();
    expect(screen.getByLabelText('世界规则')).toBeTruthy();
    expect(screen.getByText('进入细纲')).toBeTruthy();
  });

  it('creates story outline from planning brief', async () => {
    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByLabelText('故事前提')).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText('故事前提'), {
      target: { value: '少年在宗门考核中暴露上古血脉。' },
    });
    fireEvent.change(screen.getByLabelText('主角名'), { target: { value: '林辰' } });
    fireEvent.change(screen.getByLabelText('起点状态'), { target: { value: '隐忍自保' } });
    fireEvent.change(screen.getByLabelText('成长路径'), {
      target: { value: '从隐藏锋芒到主动夺势' },
    });
    fireEvent.change(screen.getByLabelText('终点状态'), { target: { value: '敢于改写宗门秩序' } });
    fireEvent.change(screen.getByLabelText('结局方向'), { target: { value: '主角建立新秩序' } });
    fireEvent.change(screen.getByLabelText('世界规则'), { target: { value: '血脉越强反噬越重' } });
    fireEvent.change(screen.getByLabelText('主冲突'), { target: { value: '宗门内部排挤' } });
    fireEvent.click(screen.getByText('保存故事总纲'));

    await waitFor(() => {
      expect(api.createStoryOutline).toHaveBeenCalledWith('book-1', {
        premise: '少年在宗门考核中暴露上古血脉。',
        worldRules: ['血脉越强反噬越重'],
        protagonistArc: {
          characterName: '林辰',
          startState: '隐忍自保',
          growthPath: '从隐藏锋芒到主动夺势',
          endState: '敢于改写宗门秩序',
        },
        supportingArcs: [],
        majorConflicts: ['宗门内部排挤'],
        phaseMilestones: [],
        endingDirection: '主角建立新秩序',
      });
    });
  });
});
