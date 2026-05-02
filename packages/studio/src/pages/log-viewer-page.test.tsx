import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import LogViewerPage from './log-viewer-page';

interface EventListenerEntry {
  type: string;
  handler: (event: MessageEvent) => void;
}

class MockEventSource {
  listeners: EventListenerEntry[] = [];
  close = vi.fn();
  addEventListener(type: string, handler: EventListener) {
    this.listeners.push({ type, handler: handler as (event: MessageEvent) => void });
  }
  removeEventListener = vi.fn();
  dispatch(type: string, data: unknown) {
    for (const entry of this.listeners) {
      if (entry.type === type) {
        entry.handler({ data: JSON.stringify(data) } as MessageEvent);
      }
    }
  }
}

let mockSource: MockEventSource;

vi.stubGlobal(
  'EventSource',
  vi.fn(() => {
    mockSource = new MockEventSource();
    return mockSource;
  }),
);

function renderWithRouter(entry = '/logs?bookId=book-001') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/logs" element={<LogViewerPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('LogViewerPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows empty-book state when bookId is missing', () => {
    renderWithRouter('/logs');

    expect(screen.getByText('请先选择一本书籍后再查看日志。')).toBeTruthy();
  });

  it('renders log filters and supports keyword search', async () => {
    renderWithRouter();

    expect(screen.getByText('日志查看')).toBeTruthy();
    expect(screen.getByPlaceholderText('搜索章节、错误或事件描述')).toBeTruthy();

    await act(async () => {
      mockSource.dispatch('pipeline_progress', { chapter: 1, status: 'started' });
      mockSource.dispatch('hook_wake', { hookId: 'h1', priority: 'high' });
    });

    await waitFor(() => {
      expect(screen.getByText('pipeline_progress')).toBeTruthy();
      expect(screen.getByText('hook_wake')).toBeTruthy();
    });

    fireEvent.change(screen.getByPlaceholderText('搜索章节、错误或事件描述'), {
      target: { value: 'h1' },
    });

    await waitFor(() => {
      expect(screen.getByText('hook_wake')).toBeTruthy();
      expect(screen.queryByText('pipeline_progress')).toBeNull();
    });
  });
});
