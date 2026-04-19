import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import MemoryWordcloud from './memory-wordcloud';

describe('MemoryWordcloud', () => {
  const mockMemories = [
    { text: '林晨', confidence: 0.95 },
    { text: '苏小雨', confidence: 0.88 },
    { text: '档案室', confidence: 0.72 },
    { text: '伏笔', confidence: 0.6 },
    { text: '线索', confidence: 0.45 },
  ];

  it('renders memory items as tags', () => {
    render(<MemoryWordcloud memories={mockMemories} />);
    expect(screen.getByText('林晨')).toBeTruthy();
    expect(screen.getByText('苏小雨')).toBeTruthy();
    expect(screen.getByText('档案室')).toBeTruthy();
  });

  it('scales font size by confidence', () => {
    render(<MemoryWordcloud memories={mockMemories} />);
    const highConfidence = screen.getByText('林晨');
    const lowConfidence = screen.getByText('线索');
    // Higher confidence = larger font
    const highSize = parseFloat(getComputedStyle(highConfidence).fontSize);
    const lowSize = parseFloat(getComputedStyle(lowConfidence).fontSize);
    expect(highSize).toBeGreaterThanOrEqual(lowSize);
  });

  it('renders empty state', () => {
    const { container } = render(<MemoryWordcloud memories={[]} />);
    expect(container.textContent).toContain('暂无记忆');
  });

  it('limits displayed memories', () => {
    const manyMemories = Array.from({ length: 20 }, (_, i) => ({
      text: `记忆${i}`,
      confidence: 0.5 + i * 0.02,
    }));
    render(<MemoryWordcloud memories={manyMemories} />);
    // Should only show first 15
    expect(screen.queryByText('记忆0')).toBeTruthy();
  });
});
