import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ContextPopup from './context-popup';

describe('ContextPopup', () => {
  it('renders context information', () => {
    render(
      <ContextPopup title="角色关系" content="林晨与苏小雨是好友关系，共同调查档案室事件" visible />
    );
    expect(screen.getByText('角色关系')).toBeTruthy();
    expect(screen.getByText(/林晨/)).toBeTruthy();
  });

  it('renders null when not visible', () => {
    const { container } = render(
      <ContextPopup title="角色关系" content="test content" visible={false} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('shows metadata tags', () => {
    render(
      <ContextPopup title="角色关系" content="test content" visible tags={['角色', '关系']} />
    );
    expect(screen.getAllByText('角色').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('关系').length).toBeGreaterThanOrEqual(1);
  });

  it('shows confidence score', () => {
    const { container } = render(
      <ContextPopup title="角色关系" content="test content" visible confidence={0.92} />
    );
    expect(container.textContent).toContain('92%');
  });

  it('applies flow-mode styling', () => {
    render(<ContextPopup title="角色关系" content="test content" visible flowMode />);
    // Flow mode adds subtle animation class
    const popup = screen.getByText('角色关系').closest('[class*="animate"]');
    expect(popup).toBeTruthy();
  });
});
