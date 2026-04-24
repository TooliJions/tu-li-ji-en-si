import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import InspirationShuffle from './inspiration-shuffle';

describe('InspirationShuffle', () => {
  const mockOptions = [
    { id: 'a', text: '让林晨在档案室发现一封旧信', score: 0.85 },
    { id: 'b', text: '苏小雨透露她曾见过那封信', score: 0.78 },
    { id: 'c', text: '档案室的灯突然熄灭了', score: 0.72 },
  ];

  it('renders three rewrite options', () => {
    render(<InspirationShuffle options={mockOptions} onSelect={() => {}} />);
    expect(screen.getByText('风格改写')).toBeTruthy();
    expect(
      screen.getAllByRole('button').filter((b) => b.textContent?.includes('采用')).length
    ).toBeGreaterThanOrEqual(1);
  });

  it('shows word counts for each option', () => {
    render(<InspirationShuffle options={mockOptions} onSelect={() => {}} />);
    expect(screen.getAllByText(/字数:/).length).toBe(mockOptions.length);
  });

  it('selects an option', async () => {
    const onSelect = vi.fn();
    render(<InspirationShuffle options={mockOptions} onSelect={onSelect} />);

    const adoptButtons = screen.getAllByText('采用');
    await act(async () => {
      fireEvent.click(adoptButtons[0]);
    });

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith('a');
    });
  });

  it('shuffles to get new options', async () => {
    const onShuffle = vi.fn();
    render(<InspirationShuffle options={mockOptions} onSelect={() => {}} onShuffle={onShuffle} />);

    await act(async () => {
      fireEvent.click(screen.getByText('换一批'));
    });

    await waitFor(() => {
      expect(onShuffle).toHaveBeenCalled();
    });
  });
});
