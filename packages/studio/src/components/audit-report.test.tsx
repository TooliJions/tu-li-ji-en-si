import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import AuditReport from './audit-report';

const mockReport = {
  overallScore: 87,
  totalChecks: 33,
  passed: 28,
  warnings: 3,
  blocked: 2,
  categories: [
    {
      name: '阻断级',
      severity: 'blocking',
      checks: [
        { name: '角色一致性', passed: true, score: 95 },
        { name: '情节连贯性', passed: false, score: 45, message: '第3章与第5章时间线冲突' },
        { name: '世界观一致性', passed: true, score: 90 },
      ],
    },
    {
      name: '警告级',
      severity: 'warning',
      checks: [
        { name: '节奏均衡', passed: true, score: 80 },
        { name: '对话自然度', passed: false, score: 60, message: '对话偏模板化' },
      ],
    },
    {
      name: '建议级',
      severity: 'suggestion',
      checks: [
        { name: '修辞丰富度', passed: true, score: 85 },
        { name: '感官描写', passed: true, score: 75 },
      ],
    },
  ],
};

describe('AuditReport', () => {
  it('renders overall score', () => {
    render(<AuditReport report={mockReport} />);
    expect(screen.getByText('87')).toBeTruthy();
  });

  it('shows category headers', () => {
    render(<AuditReport report={mockReport} />);
    expect(screen.getByText('阻断级')).toBeTruthy();
    expect(screen.getByText('警告级')).toBeTruthy();
    expect(screen.getByText('建议级')).toBeTruthy();
  });

  it('collapses categories by default using state', () => {
    render(<AuditReport report={mockReport} />);
    // Categories should be collapsed - checks hidden
    expect(screen.queryByText('角色一致性')).toBeNull();
  });

  it('expands category on click', async () => {
    render(<AuditReport report={mockReport} />);

    const buttons = screen.getAllByRole('button');
    const blockingToggle = buttons.find((b) => b.textContent?.includes('阻断级'));
    expect(blockingToggle).toBeTruthy();

    await act(async () => {
      fireEvent.click(blockingToggle!);
    });

    expect(screen.getByText('角色一致性')).toBeTruthy();
    expect(screen.getByText('情节连贯性')).toBeTruthy();
  });

  it('shows failed check messages', async () => {
    render(<AuditReport report={mockReport} />);

    const buttons = screen.getAllByRole('button');
    const blockingToggle = buttons.find((b) => b.textContent?.includes('阻断级'));

    await act(async () => {
      fireEvent.click(blockingToggle!);
    });

    expect(screen.getByText(/时间线冲突/)).toBeTruthy();
  });

  it('displays summary stats', () => {
    render(<AuditReport report={mockReport} />);
    expect(screen.getByText('33')).toBeTruthy(); // total checks
  });
});
