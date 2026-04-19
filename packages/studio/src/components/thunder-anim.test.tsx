import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ThunderAnim from './thunder-anim';

describe('ThunderAnim', () => {
  it('renders thunder alerts', () => {
    const alerts = [
      { hookId: 'h1', description: '伏笔A', 分流到: 3 },
      { hookId: 'h2', description: '伏笔B', 分流到: 5 },
    ];
    render(<ThunderAnim alerts={alerts} active />);
    expect(screen.getByText('惊群检测')).toBeTruthy();
  });

  it('shows hook descriptions', () => {
    const alerts = [{ hookId: 'h1', description: '伏笔A', 分流到: 3 }];
    render(<ThunderAnim alerts={alerts} active />);
    expect(screen.getByText('伏笔A')).toBeTruthy();
  });

  it('shows inactive state when no active thundering', () => {
    render(<ThunderAnim alerts={[]} active={false} />);
    expect(screen.getByText('惊群检测')).toBeTruthy();
    expect(screen.getByText('无惊群事件')).toBeTruthy();
  });

  it('renders multiple alerts', () => {
    const alerts = [
      { hookId: 'h1', description: '伏笔A', 分流到: 3 },
      { hookId: 'h2', description: '伏笔B', 分流到: 5 },
      { hookId: 'h3', description: '伏笔C', 分流到: 7 },
    ];
    render(<ThunderAnim alerts={alerts} active />);
    expect(screen.getAllByText(/伏笔/).length).toBeGreaterThanOrEqual(3);
  });
});
