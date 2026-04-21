import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import RadarChart from './radar-chart';

describe('RadarChart', () => {
  const mockData = [
    { label: '逻辑性', score: 0.8 },
    { label: '文笔', score: 0.7 },
    { label: '节奏', score: 0.9 },
    { label: '伏笔', score: 0.6 },
    { label: '情感', score: 0.85 },
  ];

  it('renders correctly with data', () => {
    const { container } = render(<RadarChart data={mockData} size={300} />);

    // Check if SVG is rendered
    const svg = container.querySelector('svg');
    expect(svg).toBeDefined();
    expect(svg?.getAttribute('width')).toBe('300');

    // Check if polygon (the data area) is rendered
    const polygon = container.querySelector('polygon');
    expect(polygon).toBeDefined();

    // Check if all labels are rendered
    mockData.forEach((d) => {
      expect(container.textContent).toContain(d.label);
    });
  });

  it('renders nothing with less than 3 points', () => {
    const { container } = render(<RadarChart data={mockData.slice(0, 2)} />);
    expect(container.firstChild).toBeNull();
  });
});
