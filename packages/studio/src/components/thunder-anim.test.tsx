import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ThunderAnim from './thunder-anim';

describe('ThunderAnim', () => {
  it('renders thunder alerts', () => {
    const alerts = [
      { chapter: 3, count: 2, message: '第 3 章预计同时唤醒 2 个伏笔' },
      { chapter: 5, count: 4, message: '第 5 章预计同时唤醒 4 个伏笔' },
    ];
    render(<ThunderAnim alerts={alerts} active />);
    expect(screen.getByText('惊群检测')).toBeTruthy();
  });

  it('shows hook descriptions', () => {
    const alerts = [{ chapter: 3, count: 2, message: '第 3 章预计同时唤醒 2 个伏笔' }];
    render(<ThunderAnim alerts={alerts} active />);
    expect(screen.getByText('第 3 章预计同时唤醒 2 个伏笔')).toBeTruthy();
  });

  it('shows inactive state when no active thundering', () => {
    render(<ThunderAnim alerts={[]} active={false} />);
    expect(screen.getByText('惊群检测')).toBeTruthy();
    expect(screen.getByText('无惊群事件')).toBeTruthy();
  });

  it('renders multiple alerts', () => {
    const alerts = [
      { chapter: 3, count: 2, message: '第 3 章预计同时唤醒 2 个伏笔' },
      { chapter: 5, count: 4, message: '第 5 章预计同时唤醒 4 个伏笔' },
      { chapter: 7, count: 5, message: '第 7 章预计同时唤醒 5 个伏笔' },
    ];
    render(<ThunderAnim alerts={alerts} active />);
    expect(screen.getAllByText(/预计同时唤醒/).length).toBeGreaterThanOrEqual(3);
  });
});
