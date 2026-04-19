import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import PollutionBadge from './pollution-badge';

describe('PollutionBadge', () => {
  it('renders with pollution info', () => {
    const { container } = render(
      <PollutionBadge level="high" contaminationScore={0.85} source="chapter-5" />
    );
    expect(container.querySelector('.border-orange-500')).toBeTruthy();
    expect(container.textContent).toContain('污染隔离');
  });

  it('shows contamination score', () => {
    const { container } = render(
      <PollutionBadge level="high" contaminationScore={0.85} source="chapter-5" />
    );
    expect(container.textContent).toContain('85%');
  });

  it('renders low level with green styling', () => {
    const { container } = render(
      <PollutionBadge level="low" contaminationScore={0.15} source="chapter-3" />
    );
    expect(container.querySelector('.border-orange-500')).toBeFalsy();
    expect(container.textContent).toContain('已隔离');
  });

  it('shows source reference', () => {
    const { container } = render(
      <PollutionBadge level="medium" contaminationScore={0.5} source="chapter-8" />
    );
    expect(container.textContent).toContain('chapter-8');
  });

  it('renders collapsed by default', () => {
    const { container } = render(
      <PollutionBadge level="high" contaminationScore={0.85} source="chapter-5" />
    );
    // Should show badge without expanded details
    expect(container.querySelector('.text-xs')).toBeTruthy();
  });
});
