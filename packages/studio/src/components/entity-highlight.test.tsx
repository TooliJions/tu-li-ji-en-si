import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import EntityHighlight from './entity-highlight';

describe('EntityHighlight', () => {
  it('renders text without highlighting when no entities', () => {
    render(<EntityHighlight text="普通文本" entities={[]} />);
    expect(screen.getByText('普通文本')).toBeTruthy();
  });

  it('highlights entity occurrences in text', () => {
    render(<EntityHighlight text="林晨走进了教室，苏小雨跟在后面" entities={['林晨', '苏小雨']} />);
    const markElements = screen.getAllByRole('mark');
    expect(markElements.length).toBe(2);
    expect(markElements[0]).toHaveTextContent('林晨');
    expect(markElements[1]).toHaveTextContent('苏小雨');
  });

  it('applies custom highlight style', () => {
    render(
      <EntityHighlight text="林晨在办公室" entities={['林晨']} highlightClass="bg-yellow-200" />
    );
    const mark = screen.getByText('林晨');
    expect(mark).toHaveClass('bg-yellow-200');
  });

  it('highlights multiple occurrences of the same entity', () => {
    render(<EntityHighlight text="林晨是林晨，不是别人" entities={['林晨']} />);
    const markElements = screen.getAllByRole('mark');
    expect(markElements.length).toBe(2);
  });

  it('is case-insensitive for matching', () => {
    render(<EntityHighlight text="The Room is locked" entities={['room']} />);
    const mark = screen.getByText('Room');
    expect(mark).toHaveClass('border-b-2 border-dashed border-amber-500');
  });

  it('does not break HTML when entity contains special characters', () => {
    render(<EntityHighlight text="测试 & 特殊字符" entities={['&']} />);
    expect(screen.getByText(/测试/)).toBeTruthy();
  });

  it('renders with empty text', () => {
    const { container } = render(<EntityHighlight text="" entities={['test']} />);
    expect(container.textContent).toBe('');
  });

  it('prioritizes longer entities to avoid partial matches', () => {
    render(<EntityHighlight text="档案室" entities={['档', '档案室']} />);
    const markElements = screen.getAllByRole('mark');
    expect(markElements.length).toBe(1);
    expect(markElements[0]).toHaveTextContent('档案室');
  });
});
