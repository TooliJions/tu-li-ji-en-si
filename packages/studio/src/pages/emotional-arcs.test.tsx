import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../lib/api', () => ({
  fetchEmotionalArcs: vi.fn(),
}));

import * as api from '../lib/api';
import EmotionalArcs from './emotional-arcs';

const mockArcData = {
  characters: [
    {
      name: '林晨',
      chapters: [
        {
          chapterNumber: 1,
          emotions: {
            joy: 0.7,
            anger: 0.1,
            sadness: 0.1,
            fear: 0.1,
            surprise: 0,
            disgust: 0,
            trust: 0,
            anticipation: 0,
          },
          deltas: null,
          dominantEmotion: 'joy',
          summary: '喜悦为主(70%)',
        },
        {
          chapterNumber: 2,
          emotions: {
            joy: 0.5,
            anger: 0.2,
            sadness: 0.2,
            fear: 0.1,
            surprise: 0,
            disgust: 0,
            trust: 0,
            anticipation: 0,
          },
          deltas: {
            joy: -0.2,
            anger: 0.1,
            sadness: 0.1,
            fear: 0,
            surprise: 0,
            disgust: 0,
            trust: 0,
            anticipation: 0,
          },
          dominantEmotion: 'joy',
          summary: '喜悦为主(50%)',
        },
        {
          chapterNumber: 3,
          emotions: {
            joy: 0.2,
            anger: 0.3,
            sadness: 0.4,
            fear: 0.1,
            surprise: 0,
            disgust: 0,
            trust: 0,
            anticipation: 0,
          },
          deltas: {
            joy: -0.3,
            anger: 0.1,
            sadness: 0.2,
            fear: 0,
            surprise: 0,
            disgust: 0,
            trust: 0,
            anticipation: 0,
          },
          dominantEmotion: 'sadness',
          summary: '悲伤为主(40%)',
        },
      ],
    },
    {
      name: '苏小雨',
      chapters: [
        {
          chapterNumber: 1,
          emotions: {
            joy: 0.2,
            anger: 0.1,
            sadness: 0.6,
            fear: 0.1,
            surprise: 0,
            disgust: 0,
            trust: 0,
            anticipation: 0,
          },
          deltas: null,
          dominantEmotion: 'sadness',
          summary: '悲伤为主(60%)',
        },
        {
          chapterNumber: 2,
          emotions: {
            joy: 0.5,
            anger: 0.1,
            sadness: 0.3,
            fear: 0.1,
            surprise: 0,
            disgust: 0,
            trust: 0,
            anticipation: 0,
          },
          deltas: {
            joy: 0.3,
            anger: 0,
            sadness: -0.3,
            fear: 0,
            surprise: 0,
            disgust: 0,
            trust: 0,
            anticipation: 0,
          },
          dominantEmotion: 'joy',
          summary: '喜悦为主(50%)',
        },
      ],
    },
  ],
  alerts: [
    {
      type: 'sudden_shift' as const,
      character: '林晨',
      chapterNumber: 3,
      emotion: 'sadness' as const,
      severity: 'warning' as const,
      message: '林晨 在第3章 悲伤 剧烈变化 (+30%)',
    },
  ],
};

function renderWithRouter(bookId = 'book-001') {
  return render(
    <MemoryRouter initialEntries={[`/book/${bookId}/emotional-arcs`]}>
      <Routes>
        <Route path="/book/:bookId/emotional-arcs" element={<EmotionalArcs />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('EmotionalArcs Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls fetchEmotionalArcs on mount', async () => {
    vi.mocked(api.fetchEmotionalArcs).mockResolvedValue(mockArcData);

    await act(async () => {
      renderWithRouter();
    });

    expect(api.fetchEmotionalArcs).toHaveBeenCalledWith('book-001');
  });

  it('renders loading state', () => {
    vi.mocked(api.fetchEmotionalArcs).mockResolvedValue(new Promise(() => {}));

    renderWithRouter();

    expect(screen.getByText('加载中…')).toBeTruthy();
  });

  it('renders character tabs and arc data', async () => {
    vi.mocked(api.fetchEmotionalArcs).mockResolvedValue(mockArcData);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('情感弧线')).toBeTruthy();
    });

    expect(screen.getByText('林晨')).toBeTruthy();
    expect(screen.getByText('苏小雨')).toBeTruthy();
  });

  it('shows emotion summary for each chapter', async () => {
    vi.mocked(api.fetchEmotionalArcs).mockResolvedValue(mockArcData);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('喜悦为主(70%)')).toBeTruthy();
    });
    expect(screen.getByText('悲伤为主(40%)')).toBeTruthy();
  });

  it('displays alert banner when arc breaks detected', async () => {
    vi.mocked(api.fetchEmotionalArcs).mockResolvedValue(mockArcData);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText(/情感弧线断裂|弧线告警|断裂告警/)).toBeTruthy();
    });
  });

  it('switches between character tabs', async () => {
    vi.mocked(api.fetchEmotionalArcs).mockResolvedValue(mockArcData);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('林晨')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('苏小雨'));

    // After switching, should see 苏小雨's emotions
    expect(screen.getByText('悲伤为主(60%)')).toBeTruthy();
  });

  it('shows empty state when no data', async () => {
    vi.mocked(api.fetchEmotionalArcs).mockResolvedValue({ characters: [], alerts: [] });

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('暂无情感弧线数据')).toBeTruthy();
    });
  });

  it('shows error state on fetch failure', async () => {
    vi.mocked(api.fetchEmotionalArcs).mockRejectedValue(new Error('加载失败'));

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('加载失败')).toBeTruthy();
    });
  });

  it('renders emotion mini-bars for selected character', async () => {
    vi.mocked(api.fetchEmotionalArcs).mockResolvedValue(mockArcData);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('林晨')).toBeTruthy();
    });

    // Should show emotion bars - first character labels
    expect(screen.getAllByText('喜').length).toBeGreaterThanOrEqual(1);
  });
});
