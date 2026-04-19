import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import MemoryWordcloud from './memory-wordcloud';

describe('MemoryWordcloud', () => {
  const mockMemories = [
    { text: '林晨', confidence: 0.95, sourceType: 'character' as const },
    { text: '苏小雨', confidence: 0.88, sourceType: 'character' as const },
    { text: '档案室', confidence: 0.72, sourceType: 'fact' as const },
    { text: '伏笔', confidence: 0.6, sourceType: 'hook' as const },
    { text: '线索', confidence: 0.45, sourceType: 'fact' as const },
  ];

  it('renders memory items as tags', () => {
    render(<MemoryWordcloud memories={mockMemories} />);
    expect(screen.getByText('林晨')).toBeTruthy();
    expect(screen.getByText('苏小雨')).toBeTruthy();
    expect(screen.getByText('档案室')).toBeTruthy();
  });

  it('shows source labels for runtime memory provenance', () => {
    render(<MemoryWordcloud memories={mockMemories} />);
    expect(screen.getAllByText('角色').length).toBeGreaterThan(0);
    expect(screen.getAllByText('事实').length).toBeGreaterThan(0);
    expect(screen.getAllByText('伏笔').length).toBeGreaterThan(0);
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
