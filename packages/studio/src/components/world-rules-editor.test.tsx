import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import WorldRulesEditor from './world-rules-editor';

const sampleRules = [
  {
    id: 'rule-001',
    category: 'magic-system',
    rule: '灵力等级分为九级',
    exceptions: ['禁地失效'],
    sourceChapter: 1,
  },
];

describe('WorldRulesEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders existing world rules and exception chips', () => {
    render(<WorldRulesEditor rules={sampleRules} onSave={() => {}} />);

    expect(screen.getByText('世界规则编辑器')).toBeTruthy();
    expect(screen.getByDisplayValue('灵力等级分为九级')).toBeTruthy();
    expect(screen.getByDisplayValue('禁地失效')).toBeTruthy();
    expect(screen.getByText('来源章节：第 1 章')).toBeTruthy();
  });

  it('constrains category input to supported options', () => {
    render(<WorldRulesEditor rules={sampleRules} onSave={() => {}} />);

    const categorySelect = screen.getAllByLabelText('规则分类')[0];
    expect(categorySelect.tagName).toBe('SELECT');
    expect(screen.getByRole('option', { name: '力量体系' })).toBeTruthy();
    expect(screen.getByRole('option', { name: '社会秩序' })).toBeTruthy();
    expect(screen.getByRole('option', { name: '技术约束' })).toBeTruthy();
    expect(screen.getByRole('option', { name: '地理规则' })).toBeTruthy();
    expect(screen.getByRole('option', { name: '自定义规则' })).toBeTruthy();
  });

  it('allows adding a new rule and saves normalized payload', () => {
    const onSave = vi.fn();
    render(<WorldRulesEditor rules={sampleRules} onSave={onSave} />);

    fireEvent.click(screen.getByText('新增规则'));

    const ruleInputs = screen.getAllByLabelText('规则内容');
    fireEvent.change(ruleInputs[1], { target: { value: '跨境传送需要星门许可' } });

    const categoryInputs = screen.getAllByLabelText('规则分类');
    fireEvent.change(categoryInputs[1], { target: { value: 'geography' } });

    fireEvent.click(screen.getByText('保存世界规则'));

    expect(onSave).toHaveBeenCalledWith([
      sampleRules[0],
      {
        id: expect.any(String),
        category: 'geography',
        rule: '跨境传送需要星门许可',
        exceptions: [],
      },
    ]);
  });

  it('supports removing a rule before saving', () => {
    const onSave = vi.fn();
    render(<WorldRulesEditor rules={sampleRules} onSave={onSave} />);

    fireEvent.click(screen.getByText('删除规则'));
    fireEvent.click(screen.getByText('保存世界规则'));

    expect(onSave).toHaveBeenCalledWith([]);
  });

  it('shows saving state on the primary action', () => {
    render(<WorldRulesEditor rules={sampleRules} onSave={() => {}} saving />);

    expect(screen.getByRole('button', { name: '保存中…' })).toBeDisabled();
  });
});
