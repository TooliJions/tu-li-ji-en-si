import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import SuggestionBubble from './suggestion-bubble';

describe('SuggestionBubble', () => {
  it('renders suggestion text', () => {
    const { container } = render(
      <SuggestionBubble type="warning" message="建议加强角色对话的个性化" />
    );
    expect(container.textContent).toContain('建议加强角色对话的个性化');
  });

  it('shows warning type with yellow styling', () => {
    const { container } = render(<SuggestionBubble type="warning" message="test" />);
    const bubble = container.querySelector('[class*="bg-amber"]');
    expect(bubble).toBeTruthy();
  });

  it('shows info type with blue styling', () => {
    const { container } = render(<SuggestionBubble type="info" message="test" />);
    const bubble = container.querySelector('[class*="bg-blue"]');
    expect(bubble).toBeTruthy();
  });

  it('shows action type with green styling', () => {
    const { container } = render(<SuggestionBubble type="action" message="test" />);
    const bubble = container.querySelector('[class*="bg-green"]');
    expect(bubble).toBeTruthy();
  });

  it('displays icon alongside text', () => {
    const { container } = render(<SuggestionBubble type="warning" message="test" />);
    // SVG icon should be present
    expect(container.querySelector('svg')).toBeTruthy();
  });
});
