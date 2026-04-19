import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../lib/api', () => ({
  fetchHookTimeline: vi.fn(),
  fetchHookWakeSchedule: vi.fn(),
}));

import * as api from '../lib/api';
import HookTimelinePage from './hook-timeline';

const mockTimeline = {
  chapterRange: { from: 1, to: 12 },
  densityHeatmap: [
    { chapter: 1, count: 1 },
    { chapter: 2, count: 0 },
    { chapter: 3, count: 1 },
    { chapter: 4, count: 0 },
    { chapter: 5, count: 0 },
    { chapter: 6, count: 4 },
    { chapter: 7, count: 1 },
    { chapter: 8, count: 0 },
  ],
  hooks: [
    {
      id: 'hook-001',
      description: '林晨的身份秘密',
      plantedChapter: 1,
      status: 'open',
      recurrenceChapter: 6,
      segments: [{ fromChapter: 1, toChapter: 6, type: 'open' }],
    },
    {
      id: 'hook-002',
      description: '档案室的神秘信件',
      plantedChapter: 3,
      status: 'deferred',
      recurrenceChapter: 6,
      segments: [{ fromChapter: 3, toChapter: 6, type: 'deferred' }],
    },
  ],
  thunderingHerdAnimations: [{ chapter: 6, intensity: 4 }],
  thunderingHerdAlerts: [
    { chapter: 6, count: 4, message: '第 6 章预计同时唤醒 4 个伏笔' },
  ],
};

const mockWakeSchedule = {
  currentChapter: 4,
  maxWakePerChapter: 3,
  pendingWakes: [
    { hookId: 'hook-001', description: '林晨的身份秘密', wakeAtChapter: 6, status: 'deferred' },
    { hookId: 'hook-002', description: '档案室的神秘信件', wakeAtChapter: 6, status: 'dormant' },
  ],
};

function renderWithRouter(bookId = 'book-001') {
  return render(
    <MemoryRouter initialEntries={[`/hooks/timeline?bookId=${bookId}`]}>
      <Routes>
        <Route path="/hooks/timeline" element={<HookTimelinePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('HookTimeline Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders dual-track timeline with minimap and wake schedule', async () => {
    vi.mocked(api.fetchHookTimeline).mockResolvedValue(mockTimeline);
    vi.mocked(api.fetchHookWakeSchedule).mockResolvedValue(mockWakeSchedule);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('伏笔双轨时间轴')).toBeTruthy();
    });

    expect(screen.getByText('全局热力小地图')).toBeTruthy();
    expect(screen.getByText('局部放大镜')).toBeTruthy();
    expect(screen.getByText('生命周期轨')).toBeTruthy();
    expect(screen.getByText('唤醒排班轨')).toBeTruthy();
    expect(screen.getAllByText('林晨的身份秘密').length).toBeGreaterThan(0);
    expect(screen.getAllByText('档案室的神秘信件').length).toBeGreaterThan(0);
  });

  it('shows thundering herd animation and alert summary from runtime data', async () => {
    vi.mocked(api.fetchHookTimeline).mockResolvedValue(mockTimeline);
    vi.mocked(api.fetchHookWakeSchedule).mockResolvedValue(mockWakeSchedule);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('惊群检测')).toBeTruthy();
    });

    expect(screen.getAllByText('第 6 章预计同时唤醒 4 个伏笔').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/第6章/).length).toBeGreaterThan(0);
  });

  it('updates magnifier focus when selecting a chapter from the minimap', async () => {
    vi.mocked(api.fetchHookTimeline).mockResolvedValue(mockTimeline);
    vi.mocked(api.fetchHookWakeSchedule).mockResolvedValue(mockWakeSchedule);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('局部放大镜')).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: '聚焦第6章' }));

    await waitFor(() => {
      expect(screen.getByText('聚焦章节：第 6 章')).toBeTruthy();
    });
    expect(screen.getAllByText('待唤醒 2').length).toBeGreaterThan(0);
  });
});