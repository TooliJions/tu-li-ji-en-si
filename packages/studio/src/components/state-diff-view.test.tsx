import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import StateDiffView from './state-diff-view';

const mockDiff = {
  file: 'current_state',
  summary: '系统从您的小说文本中提取到 2 处设定变更',
  changes: [
    {
      character: '林晨',
      field: 'location',
      oldValue: '教室',
      newValue: '办公室',
      naturalLanguage: '林晨的位置已从「教室」变更为「办公室」',
      category: 'character' as const,
    },
    {
      character: '苏小雨',
      field: 'relationship',
      oldValue: '陌生人',
      newValue: '好友',
      naturalLanguage: '苏小雨与主角的关系已从「陌生人」变更为「好友」',
      category: 'relation' as const,
    },
  ],
  severity: 'warning',
};

describe('StateDiffView', () => {
  it('renders diff summary', () => {
    render(
      <StateDiffView diff={mockDiff} onMerge={() => {}} onIgnore={() => {}} onReRead={() => {}} />
    );
    expect(screen.getByText(/设定变更/)).toBeTruthy();
  });

  it('shows natural language descriptions', () => {
    render(
      <StateDiffView diff={mockDiff} onMerge={() => {}} onIgnore={() => {}} onReRead={() => {}} />
    );
    expect(screen.getByText(/林晨的位置/)).toBeTruthy();
    expect(screen.getAllByText(/苏小雨/).length).toBeGreaterThanOrEqual(1);
  });

  it('shows old/new value comparison', () => {
    render(
      <StateDiffView diff={mockDiff} onMerge={() => {}} onIgnore={() => {}} onReRead={() => {}} />
    );
    expect(screen.getByText('教室')).toBeTruthy();
    expect(screen.getByText('办公室')).toBeTruthy();
  });

  it('shows category grouping', () => {
    render(
      <StateDiffView diff={mockDiff} onMerge={() => {}} onIgnore={() => {}} onReRead={() => {}} />
    );
    expect(screen.getByText('角色状态')).toBeTruthy();
    expect(screen.getByText('关系变更')).toBeTruthy();
  });

  it('shows radio buttons for adopt/ignore per change', () => {
    render(
      <StateDiffView diff={mockDiff} onMerge={() => {}} onIgnore={() => {}} onReRead={() => {}} />
    );
    const radios = screen.getAllByRole('radio');
    expect(radios.length).toBeGreaterThanOrEqual(4); // 2 per change
  });

  it('calls onMerge with adopted indices', async () => {
    const onMerge = vi.fn();
    render(
      <StateDiffView diff={mockDiff} onMerge={onMerge} onIgnore={() => {}} onReRead={() => {}} />
    );

    // Default: all adopted. Click 确认同步
    await act(async () => {
      fireEvent.click(screen.getByText('确认同步'));
    });

    await waitFor(() => {
      expect(onMerge).toHaveBeenCalledWith([0, 1]);
    });
  });

  it('calls onMerge with only adopted indices when some ignored', async () => {
    const onMerge = vi.fn();
    render(
      <StateDiffView diff={mockDiff} onMerge={onMerge} onIgnore={() => {}} onReRead={() => {}} />
    );

    // Set second change to ignore
    const radios = screen.getAllByRole('radio');
    // radios order: [adopt0, ignore0, adopt1, ignore1]
    // Click ignore for second change (index 3)
    await act(async () => {
      fireEvent.click(radios[3]);
    });
    await act(async () => {
      fireEvent.click(screen.getByText('确认同步'));
    });

    await waitFor(() => {
      expect(onMerge).toHaveBeenCalledWith([0]);
    });
  });

  it('shows empty state when no changes', () => {
    const { container } = render(
      <StateDiffView
        diff={{ ...mockDiff, changes: [] }}
        onMerge={() => {}}
        onIgnore={() => {}}
        onReRead={() => {}}
      />
    );
    expect(container.textContent).toContain('无差异');
  });

  it('displays severity badge', () => {
    const { container } = render(
      <StateDiffView diff={mockDiff} onMerge={() => {}} onIgnore={() => {}} onReRead={() => {}} />
    );
    expect(container.textContent).toContain('warning');
  });

  it('shows summary count', () => {
    render(
      <StateDiffView diff={mockDiff} onMerge={() => {}} onIgnore={() => {}} onReRead={() => {}} />
    );
    expect(screen.getByText(/将采纳/)).toBeTruthy();
  });

  it('calls onIgnore when ignore all clicked', async () => {
    const onIgnore = vi.fn();
    render(
      <StateDiffView diff={mockDiff} onMerge={() => {}} onIgnore={onIgnore} onReRead={() => {}} />
    );

    await act(async () => {
      fireEvent.click(screen.getByText('全部忽略'));
    });

    await waitFor(() => {
      expect(onIgnore).toHaveBeenCalled();
    });
  });

  it('calls onReRead when re-read clicked', async () => {
    const onReRead = vi.fn();
    render(
      <StateDiffView diff={mockDiff} onMerge={() => {}} onIgnore={() => {}} onReRead={onReRead} />
    );

    await act(async () => {
      fireEvent.click(screen.getByText('重新阅读文本'));
    });

    await waitFor(() => {
      expect(onReRead).toHaveBeenCalled();
    });
  });
});
