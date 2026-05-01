import { describe, it, expect } from 'vitest';
import { evalCondition } from './safe-condition-eval';

describe('evalCondition', () => {
  const item = {
    status: 'open',
    priority: 'major',
    type: 'plot',
    nested: { value: 'deep' },
    count: 42,
    flag: true,
  };

  it('计算布尔字面值', () => {
    expect(evalCondition('true', item)).toBe(true);
    expect(evalCondition('false', item)).toBe(false);
  });

  it('计算相等比较', () => {
    expect(evalCondition("item.status === 'open'", item)).toBe(true);
    expect(evalCondition("item.status === 'closed'", item)).toBe(false);
  });

  it('计算双等比较', () => {
    expect(evalCondition("item.status == 'open'", item)).toBe(true);
    expect(evalCondition("item.status == 'closed'", item)).toBe(false);
  });

  it('计算不等比较', () => {
    expect(evalCondition("item.status !== 'closed'", item)).toBe(true);
    expect(evalCondition("item.status !== 'open'", item)).toBe(false);
  });

  it('计算不等比较 (!=)', () => {
    expect(evalCondition("item.status != 'closed'", item)).toBe(true);
    expect(evalCondition("item.status != 'open'", item)).toBe(false);
  });

  it('计算嵌套路径', () => {
    expect(evalCondition("item.nested.value === 'deep'", item)).toBe(true);
    expect(evalCondition("item.nested.value === 'shallow'", item)).toBe(false);
  });

  it('计算 && 逻辑', () => {
    expect(evalCondition("item.status === 'open' && item.priority === 'major'", item)).toBe(true);
    expect(evalCondition("item.status === 'open' && item.priority === 'minor'", item)).toBe(false);
  });

  it('计算 || 逻辑', () => {
    expect(evalCondition("item.status === 'closed' || item.priority === 'major'", item)).toBe(true);
    expect(evalCondition("item.status === 'closed' || item.priority === 'minor'", item)).toBe(
      false,
    );
  });

  it('混合 && 与 ||', () => {
    expect(
      evalCondition(
        "item.status === 'open' && (item.priority === 'minor' || item.type === 'plot')",
        item,
      ),
    ).toBe(true);
  });

  it('未知属性返回 false', () => {
    expect(evalCondition("item.unknown === 'x'", item)).toBe(false);
  });

  it('未知字符被安全跳过', () => {
    expect(evalCondition("item.status === 'open' ; drop table", item)).toBe(true);
  });

  it('空字符串返回 false', () => {
    expect(evalCondition('', item)).toBe(false);
  });

  it('无运算符的表达式返回 false', () => {
    expect(evalCondition('item.status', item)).toBe(false);
  });

  it('比较运算符后缺少值返回 false', () => {
    expect(evalCondition('item.status ===', item)).toBe(false);
  });
});
