import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../lib/api', () => ({
  fetchHooks: vi.fn(),
  fetchHookHealth: vi.fn(),
  fetchHookTimeline: vi.fn(),
  fetchHookWakeSchedule: vi.fn(),
  createHook: vi.fn(),
  updateHook: vi.fn(),
  declareHookIntent: vi.fn(),
  wakeHook: vi.fn(),
}));

import * as api from '../lib/api';
import HookPanel from './hook-panel';

const mockHooks = [
  {
    id: 'hook-001',
    description: '林晨的身份秘密',
    plantedChapter: 1,
    status: 'open',
    priority: 'critical',
    lastAdvancedChapter: 3,
    expectedResolutionWindow: { min: 10, max: 20 },
    healthScore: 85,
  },
  {
    id: 'hook-002',
    description: '档案室的神秘信件',
    plantedChapter: 2,
    status: 'progressing',
    priority: 'major',
    lastAdvancedChapter: 5,
    expectedResolutionWindow: { min: 8, max: 15 },
    healthScore: 72,
  },
  {
    id: 'hook-003',
    description: '苏小雨的过去',
    plantedChapter: 1,
    status: 'dormant',
    priority: 'minor',
    lastAdvancedChapter: 1,
    expectedResolutionWindow: null,
    healthScore: 45,
  },
  {
    id: 'hook-004',
    description: '失踪的钥匙',
    plantedChapter: 3,
    status: 'resolved',
    priority: 'major',
    lastAdvancedChapter: 7,
    expectedResolutionWindow: { min: 5, max: 10 },
    healthScore: 100,
  },
];

const mockHealth = {
  total: 4,
  active: 2,
  dormant: 1,
  resolved: 1,
  overdue: 1,
  recoveryRate: 0.25,
  overdueList: [
    { hookId: 'hook-003', description: '苏小雨的过去', expectedBy: 11, currentChapter: 1 },
  ],
};

const mockTimeline = {
  chapterRange: { from: 1, to: 10 },
  densityHeatmap: [
    { chapter: 1, count: 2 },
    { chapter: 2, count: 1 },
    { chapter: 3, count: 1 },
  ],
  hooks: mockHooks.map((h) => ({
    id: h.id,
    description: h.description,
    plantedChapter: h.plantedChapter,
    status: h.status,
    segments: [{ fromChapter: h.plantedChapter, toChapter: 10, type: h.status }],
    recurrenceChapter: null,
  })),
  thunderingHerdAnimations: [],
  thunderingHerdAlerts: [],
};

const mockWakeSchedule = {
  currentChapter: 4,
  maxWakePerChapter: 3,
  pendingWakes: [
    { hookId: 'hook-003', description: '苏小雨的过去', wakeAtChapter: 6, status: 'dormant' },
  ],
};

function renderWithRouter(bookId = 'book-001') {
  return render(
    <MemoryRouter initialEntries={[`/hooks?bookId=${bookId}`]}>
      <Routes>
        <Route path="/hooks" element={<HookPanel />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('HookPanel Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state', () => {
    vi.mocked(api.fetchHooks).mockResolvedValue([]);
    vi.mocked(api.fetchHookHealth).mockResolvedValue(mockHealth);
    vi.mocked(api.fetchHookTimeline).mockResolvedValue(mockTimeline);
    vi.mocked(api.fetchHookWakeSchedule).mockResolvedValue(mockWakeSchedule);

    renderWithRouter();

    expect(screen.getByText('加载中…')).toBeTruthy();
  });

  it('renders hook list with all hooks', async () => {
    vi.mocked(api.fetchHooks).mockResolvedValue(mockHooks);
    vi.mocked(api.fetchHookHealth).mockResolvedValue(mockHealth);
    vi.mocked(api.fetchHookTimeline).mockResolvedValue(mockTimeline);
    vi.mocked(api.fetchHookWakeSchedule).mockResolvedValue(mockWakeSchedule);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('伏笔管理')).toBeTruthy();
    });

    expect(screen.getByText('林晨的身份秘密')).toBeTruthy();
    expect(screen.getByText('档案室的神秘信件')).toBeTruthy();
    expect(screen.getByText('失踪的钥匙')).toBeTruthy();
  });

  it('shows health summary', async () => {
    vi.mocked(api.fetchHooks).mockResolvedValue(mockHooks);
    vi.mocked(api.fetchHookHealth).mockResolvedValue(mockHealth);
    vi.mocked(api.fetchHookTimeline).mockResolvedValue(mockTimeline);
    vi.mocked(api.fetchHookWakeSchedule).mockResolvedValue(mockWakeSchedule);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('健康概览')).toBeTruthy();
    });

    expect(screen.getByText('4')).toBeTruthy(); // total
    // active and dormant both show '1' - use getAllBy
    expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(2);
  });

  it('displays priority and status badges', async () => {
    vi.mocked(api.fetchHooks).mockResolvedValue(mockHooks);
    vi.mocked(api.fetchHookHealth).mockResolvedValue(mockHealth);
    vi.mocked(api.fetchHookTimeline).mockResolvedValue(mockTimeline);
    vi.mocked(api.fetchHookWakeSchedule).mockResolvedValue(mockWakeSchedule);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('林晨的身份秘密')).toBeTruthy();
    });

    // Use getAllByText since priority/status appear in both dropdown and badge
    expect(screen.getAllByText('critical').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('open').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('dormant').length).toBeGreaterThanOrEqual(1);
  });

  it('shows overdue warning', async () => {
    vi.mocked(api.fetchHooks).mockResolvedValue(mockHooks);
    vi.mocked(api.fetchHookHealth).mockResolvedValue(mockHealth);
    vi.mocked(api.fetchHookTimeline).mockResolvedValue(mockTimeline);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('健康概览')).toBeTruthy();
    });

    expect(screen.getByText(/逾期/)).toBeTruthy();
  });

  it('creates a new hook', async () => {
    vi.mocked(api.fetchHooks).mockResolvedValue(mockHooks);
    vi.mocked(api.fetchHookHealth).mockResolvedValue(mockHealth);
    vi.mocked(api.fetchHookTimeline).mockResolvedValue(mockTimeline);
    vi.mocked(api.fetchHookWakeSchedule).mockResolvedValue(mockWakeSchedule);
    vi.mocked(api.createHook).mockResolvedValue({
      id: 'hook-005',
      description: '新伏笔',
      plantedChapter: 5,
      status: 'open',
      priority: 'major',
      healthScore: 100,
    });

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('伏笔管理')).toBeTruthy();
    });

    // Fill form
    const descInput = screen.getByPlaceholderText('伏笔描述');
    fireEvent.change(descInput, { target: { value: '新伏笔' } });

    const chapterInput = screen.getByPlaceholderText('章节');
    fireEvent.change(chapterInput, { target: { value: '5' } });

    await act(async () => {
      fireEvent.click(screen.getByText('创建'));
    });

    await waitFor(() => {
      expect(api.createHook).toHaveBeenCalledWith('book-001', {
        description: '新伏笔',
        chapter: 5,
        priority: 'major',
      });
    });
  });

  it('opens status change dropdown', async () => {
    vi.mocked(api.fetchHooks).mockResolvedValue(mockHooks);
    vi.mocked(api.fetchHookHealth).mockResolvedValue(mockHealth);
    vi.mocked(api.fetchHookTimeline).mockResolvedValue(mockTimeline);
    vi.mocked(api.fetchHookWakeSchedule).mockResolvedValue(mockWakeSchedule);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('林晨的身份秘密')).toBeTruthy();
    });

    // Status dropdown buttons should exist
    const statusButtons = screen.getAllByTitle('修改状态');
    expect(statusButtons.length).toBeGreaterThanOrEqual(1);

    // Click to open dropdown
    await act(async () => {
      fireEvent.click(statusButtons[0]);
    });

    // Dropdown options should be visible
    expect(screen.getAllByText('open').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('progressing').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('resolved').length).toBeGreaterThanOrEqual(1);
  });

  it('declares intent to set dormant', async () => {
    vi.mocked(api.fetchHooks).mockResolvedValue(mockHooks);
    vi.mocked(api.fetchHookHealth).mockResolvedValue(mockHealth);
    vi.mocked(api.fetchHookTimeline).mockResolvedValue(mockTimeline);
    vi.mocked(api.fetchHookWakeSchedule).mockResolvedValue(mockWakeSchedule);
    vi.mocked(api.declareHookIntent).mockResolvedValue({
      hookId: 'hook-001',
      success: true,
      status: 'dormant',
    });

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('林晨的身份秘密')).toBeTruthy();
    });

    // Click intent button on the first hook (林晨的身份秘密)
    const intentButtons = screen.getAllByTitle('设置意图');
    expect(intentButtons.length).toBeGreaterThanOrEqual(1);

    await act(async () => {
      fireEvent.click(intentButtons[0]);
    });

    // Fill min/max
    const minInput = screen.getByPlaceholderText('最小章节');
    fireEvent.change(minInput, { target: { value: '15' } });

    const maxInput = screen.getByPlaceholderText('最大章节');
    fireEvent.change(maxInput, { target: { value: '30' } });

    await act(async () => {
      fireEvent.click(screen.getByText('确认'));
    });

    await waitFor(() => {
      expect(api.declareHookIntent).toHaveBeenCalled();
    });
  });

  it('wakes a dormant hook', async () => {
    vi.mocked(api.fetchHooks).mockResolvedValue(mockHooks);
    vi.mocked(api.fetchHookHealth).mockResolvedValue(mockHealth);
    vi.mocked(api.fetchHookTimeline).mockResolvedValue(mockTimeline);
    vi.mocked(api.fetchHookWakeSchedule).mockResolvedValue(mockWakeSchedule);
    vi.mocked(api.wakeHook).mockResolvedValue({
      hookId: 'hook-003',
      success: true,
      newStatus: 'open',
    });

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('苏小雨的过去')).toBeTruthy();
    });

    // Click wake button on dormant hook
    const wakeButtons = screen.getAllByTitle('唤醒');
    expect(wakeButtons.length).toBeGreaterThanOrEqual(1);

    await act(async () => {
      fireEvent.click(wakeButtons[0]);
    });

    // Wait for modal to appear and click confirm
    await waitFor(() => {
      expect(screen.getByText('确认唤醒')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('确认唤醒'));
    });

    await waitFor(() => {
      expect(api.wakeHook).toHaveBeenCalled();
    });
  });

  it('shows timeline tab with chapter density', async () => {
    vi.mocked(api.fetchHooks).mockResolvedValue(mockHooks);
    vi.mocked(api.fetchHookHealth).mockResolvedValue(mockHealth);
    vi.mocked(api.fetchHookTimeline).mockResolvedValue(mockTimeline);
    vi.mocked(api.fetchHookWakeSchedule).mockResolvedValue(mockWakeSchedule);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('伏笔管理')).toBeTruthy();
    });

    // Click timeline tab
    fireEvent.click(screen.getByText('时间轴'));

    await waitFor(() => {
      expect(screen.getByText('全局热力小地图')).toBeTruthy();
    });
    expect(screen.getByText('局部放大镜')).toBeTruthy();
    expect(screen.getByText('生命周期轨')).toBeTruthy();
    expect(screen.getByText('唤醒排班轨')).toBeTruthy();
  });

  it('filters hooks by status', async () => {
    vi.mocked(api.fetchHooks).mockResolvedValue(mockHooks);
    vi.mocked(api.fetchHookHealth).mockResolvedValue(mockHealth);
    vi.mocked(api.fetchHookTimeline).mockResolvedValue(mockTimeline);
    vi.mocked(api.fetchHookWakeSchedule).mockResolvedValue(mockWakeSchedule);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('伏笔管理')).toBeTruthy();
    });

    // Filter by status using aria-label
    fireEvent.change(screen.getByLabelText('状态筛选'), { target: { value: 'dormant' } });

    await waitFor(() => {
      expect(screen.getByText('苏小雨的过去')).toBeTruthy();
    });
    expect(screen.queryByText('林晨的身份秘密')).toBeNull();
  });

  it('shows hook health score bar', async () => {
    vi.mocked(api.fetchHooks).mockResolvedValue(mockHooks);
    vi.mocked(api.fetchHookHealth).mockResolvedValue(mockHealth);
    vi.mocked(api.fetchHookTimeline).mockResolvedValue(mockTimeline);
    vi.mocked(api.fetchHookWakeSchedule).mockResolvedValue(mockWakeSchedule);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('林晨的身份秘密')).toBeTruthy();
    });

    // Health score 85 should be visible
    expect(screen.getAllByText('85').length).toBeGreaterThanOrEqual(1);
  });
});
