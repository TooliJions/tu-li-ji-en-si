import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import BaselineChart from './baseline-chart';

describe('BaselineChart', () => {
  const mockData = [
    { chapter: 1, score: 0.85, baseline: 0.8 },
    { chapter: 2, score: 0.82, baseline: 0.8 },
    { chapter: 3, score: 0.78, baseline: 0.8 },
    { chapter: 4, score: 0.9, baseline: 0.8 },
    { chapter: 5, score: 0.88, baseline: 0.8 },
  ];

  it('renders chart title', () => {
    render(<BaselineChart data={mockData} title="质量基线趋势" />);
    expect(screen.getByText('质量基线趋势')).toBeTruthy();
  });

  it('shows chapter labels', () => {
    render(<BaselineChart data={mockData} title="test" />);
    expect(screen.getByText('第1章')).toBeTruthy();
    expect(screen.getByText('第5章')).toBeTruthy();
  });

  it('renders score bars', () => {
    const { container } = render(<BaselineChart data={mockData} title="test" />);
    // 4 bars are indigo (above baseline), 1 is orange (below baseline)
    const indigoBars = container.querySelectorAll('[class*="bg-indigo"]');
    const orangeBars = container.querySelectorAll('[class*="bg-orange"]');
    expect(indigoBars.length + orangeBars.length).toBe(5);
  });

  it('highlights below-baseline chapters', () => {
    render(
      <BaselineChart
        data={[
          { chapter: 1, score: 0.75, baseline: 0.8 },
          { chapter: 2, score: 0.9, baseline: 0.8 },
        ]}
        title="test"
      />
    );
    // Chapter 1 is below baseline (0.75 < 0.8)
    expect(screen.getByText('第1章')).toBeTruthy();
  });

  it('renders empty data gracefully', () => {
    const { container } = render(<BaselineChart data={[]} title="test" />);
    expect(container.textContent).toContain('暂无数据');
  });

  it('shows baseline reference line', () => {
    const { container } = render(<BaselineChart data={mockData} title="test" />);
    expect(container.textContent).toContain('基线: 80%');
  });
});
