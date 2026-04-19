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
    },
    {
      character: '苏小雨',
      field: 'relationship',
      oldValue: '陌生人',
      newValue: '好友',
      naturalLanguage: '苏小雨与主角的关系已从「陌生人」变更为「好友」',
    },
  ],
  severity: 'warning',
};

describe('StateDiffView', () => {
  it('renders diff summary', () => {
    render(<StateDiffView diff={mockDiff} onMerge={() => {}} />);
    expect(screen.getByText(/设定变更/)).toBeTruthy();
  });

  it('shows natural language descriptions', () => {
    render(<StateDiffView diff={mockDiff} onMerge={() => {}} />);
    expect(screen.getByText(/林晨的位置/)).toBeTruthy();
    // 苏小雨 appears in both natural language and character tag, use getAllByText
    expect(screen.getAllByText(/苏小雨/).length).toBeGreaterThanOrEqual(1);
  });

  it('shows old/new value comparison', () => {
    render(<StateDiffView diff={mockDiff} onMerge={() => {}} />);
    expect(screen.getByText('教室')).toBeTruthy();
    expect(screen.getByText('办公室')).toBeTruthy();
  });

  it('shows side-by-side left/right panels for each change', () => {
    render(<StateDiffView diff={mockDiff} onMerge={() => {}} />);

    // Should have "当前" (current/old) and "新值" (new) column labels
    expect(screen.getAllByText('当前').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('新值').length).toBeGreaterThanOrEqual(1);
  });

  it('allows selecting changes for merge', async () => {
    const onMerge = vi.fn();
    render(<StateDiffView diff={mockDiff} onMerge={onMerge} />);

    // Checkboxes should be present
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes.length).toBeGreaterThanOrEqual(2);

    // Select first change
    await act(async () => {
      fireEvent.click(checkboxes[0]);
    });

    // Merge button should be enabled
    await act(async () => {
      fireEvent.click(screen.getByText('合并选中'));
    });

    await waitFor(() => {
      expect(onMerge).toHaveBeenCalled();
    });
  });

  it('passes selected indices to onMerge', async () => {
    const onMerge = vi.fn();
    render(<StateDiffView diff={mockDiff} onMerge={onMerge} />);

    const checkboxes = screen.getAllByRole('checkbox');
    // Select second change only
    await act(async () => {
      fireEvent.click(checkboxes[1]);
    });
    await act(async () => {
      fireEvent.click(screen.getByText('合并选中'));
    });

    await waitFor(() => {
      expect(onMerge).toHaveBeenCalledWith([1]);
    });
  });

  it('shows empty state when no changes', () => {
    const { container } = render(
      <StateDiffView diff={{ ...mockDiff, changes: [] }} onMerge={() => {}} />
    );
    expect(container.textContent).toContain('无差异');
  });

  it('displays severity badge', () => {
    const { container } = render(<StateDiffView diff={mockDiff} onMerge={() => {}} />);
    expect(container.textContent).toContain('warning');
  });

  it('allows selecting multiple changes', async () => {
    const onMerge = vi.fn();
    render(<StateDiffView diff={mockDiff} onMerge={onMerge} />);

    const checkboxes = screen.getAllByRole('checkbox');
    await act(async () => {
      fireEvent.click(checkboxes[0]);
      fireEvent.click(checkboxes[1]);
    });
    await act(async () => {
      fireEvent.click(screen.getByText('合并选中'));
    });

    await waitFor(() => {
      expect(onMerge).toHaveBeenCalledWith([0, 1]);
    });
  });

  it('hides merge button when nothing selected', () => {
    render(<StateDiffView diff={mockDiff} onMerge={() => {}} />);
    expect(screen.queryByText('合并选中')).not.toBeInTheDocument();
  });

  it('shows selected count', async () => {
    render(<StateDiffView diff={mockDiff} onMerge={() => {}} />);

    const checkboxes = screen.getAllByRole('checkbox');
    await act(async () => {
      fireEvent.click(checkboxes[0]);
    });

    expect(screen.getByText(/已选择/)).toBeTruthy();
  });

  it('toggles selection off when clicking checkbox again', async () => {
    render(<StateDiffView diff={mockDiff} onMerge={() => {}} />);

    const checkboxes = screen.getAllByRole('checkbox');
    // Select then deselect
    await act(async () => {
      fireEvent.click(checkboxes[0]);
    });
    expect(screen.getByText(/已选择/)).toBeTruthy();

    await act(async () => {
      fireEvent.click(checkboxes[0]);
    });
    expect(screen.queryByText(/已选择/)).not.toBeInTheDocument();
  });
});
