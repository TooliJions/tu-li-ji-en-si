import { describe, it, expect } from 'vitest';
import { escapeXml } from './escape-xml';

describe('escapeXml', () => {
  it('escapes ampersand', () => {
    expect(escapeXml('A & B')).toBe('A &amp; B');
  });

  it('escapes less-than and greater-than', () => {
    expect(escapeXml('<tag>')).toBe('&lt;tag&gt;');
  });

  it('escapes double quotes', () => {
    expect(escapeXml('say "hello"')).toBe('say &quot;hello&quot;');
  });

  it('escapes single quotes', () => {
    expect(escapeXml("it's")).toBe('it&apos;s');
  });

  it('escapes all special chars in one string', () => {
    const input = `<div class="test">It's & cool</div>`;
    const expected = `&lt;div class=&quot;test&quot;&gt;It&apos;s &amp; cool&lt;/div&gt;`;
    expect(escapeXml(input)).toBe(expected);
  });

  it('returns plain text unchanged', () => {
    expect(escapeXml('hello world 你好')).toBe('hello world 你好');
  });

  it('handles empty string', () => {
    expect(escapeXml('')).toBe('');
  });

  it('does not double-escape', () => {
    expect(escapeXml('&amp;')).toBe('&amp;amp;');
  });
});
