import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import TimeDial from './time-dial';

const snapshots = [
  { id: 'snap-1', chapter: 3, label: '第3章快照', timestamp: '2026-04-19T08:00:00.000Z' },
  { id: 'snap-2', chapter: 2, label: '第2章快照', timestamp: '2026-04-19T07:00:00.000Z' },
];

describe('TimeDial', () => {
  it('renders dial when open', () => {
    render(
      <TimeDial open snapshots={[]} currentChapter={1} onConfirm={() => {}} onClose={() => {}} />
    );
    expect(screen.getByText('时间回溯')).toBeTruthy();
  });

  it('renders null when not open', () => {
    const { container } = render(
      <TimeDial
        open={false}
        snapshots={[]}
        currentChapter={1}
        onConfirm={() => {}}
        onClose={() => {}}
      />
    );
    expect(container.innerHTML).toBe('');
  });

  it('shows available snapshots', () => {
    render(
      <TimeDial
        open
        snapshots={snapshots}
        currentChapter={5}
        onConfirm={() => {}}
        onClose={() => {}}
      />
    );
    expect(screen.getByText('第3章快照')).toBeTruthy();
    expect(screen.getByText('第2章快照')).toBeTruthy();
  });

  it('selects a snapshot', async () => {
    const onConfirm = vi.fn();
    render(
      <TimeDial
        open
        snapshots={snapshots}
        currentChapter={5}
        onConfirm={onConfirm}
        onClose={() => {}}
      />
    );

    await act(async () => {
      fireEvent.click(screen.getByText('第3章快照'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('确认回滚'));
    });

    await waitFor(
      () => {
        expect(onConfirm).toHaveBeenCalledWith('snap-1');
      },
      { timeout: 2000 }
    );
  });

  it('closes on cancel', async () => {
    const onClose = vi.fn();
    render(
      <TimeDial open snapshots={[]} currentChapter={1} onConfirm={() => {}} onClose={onClose} />
    );

    await act(async () => {
      fireEvent.click(screen.getByText('取消'));
    });

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('shows dial rotation progress indicator', () => {
    render(
      <TimeDial
        open
        snapshots={snapshots}
        currentChapter={5}
        onConfirm={() => {}}
        onClose={() => {}}
      />
    );
    // Must select a snapshot first to show the dial
    fireEvent.click(screen.getByText('第3章快照'));
    // Should show rotation instruction
    expect(screen.getByText(/拖拽旋转|旋转拨盘|拖动|拖拽/)).toBeTruthy();
  });

  it('shows shatter animation on confirm', async () => {
    const onConfirm = vi.fn();
    render(
      <TimeDial
        open
        snapshots={snapshots}
        currentChapter={5}
        onConfirm={onConfirm}
        onClose={() => {}}
      />
    );

    // Select a snapshot
    await act(async () => {
      fireEvent.click(screen.getByText('第3章快照'));
    });

    // Confirm — should trigger shatter animation
    await act(async () => {
      fireEvent.click(screen.getByText('确认回滚'));
    });

    // Shatter text/animation should appear
    await waitFor(() => {
      expect(screen.getAllByText(/碎裂|回溯中|时间碎裂|正在回滚/).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('disables confirm without selection', () => {
    render(
      <TimeDial
        open
        snapshots={snapshots}
        currentChapter={5}
        onConfirm={() => {}}
        onClose={() => {}}
      />
    );

    const confirmBtn = screen.getByText('确认回滚');
    expect(confirmBtn).toBeDisabled();
  });

  it('shows current chapter info with warning', () => {
    render(
      <TimeDial
        open
        snapshots={snapshots}
        currentChapter={5}
        onConfirm={() => {}}
        onClose={() => {}}
      />
    );
    expect(screen.getByText(/当前第5章/)).toBeTruthy();
  });

  it('shows no snapshots message when empty', () => {
    render(
      <TimeDial open snapshots={[]} currentChapter={1} onConfirm={() => {}} onClose={() => {}} />
    );
    expect(screen.getByText('暂无可用快照')).toBeTruthy();
  });
});
