import { describe, it, expect } from 'vitest';
import { extractSection, extractChapterNumber } from './prompt';

describe('extractSection', () => {
  it('returns content between heading and next heading', () => {
    const prompt = `## 用户意图
写一章主角突破的内容

## 当前内容
这是当前内容`;

    expect(extractSection(prompt, '## 用户意图')).toBe('写一章主角突破的内容');
  });

  it('returns content to end when no next heading', () => {
    const prompt = `## 用户意图
写一章主角突破的内容`;

    expect(extractSection(prompt, '## 用户意图')).toBe('写一章主角突破的内容');
  });

  it('returns empty string when heading not found', () => {
    expect(extractSection('一些文本', '## 不存在')).toBe('');
  });

  it('trims whitespace around extracted content', () => {
    const prompt = `## 用户意图
  \n  内容  \n\n## 其他`;

    expect(extractSection(prompt, '## 用户意图')).toBe('内容');
  });

  it('handles multiple occurrences by using first match', () => {
    const prompt = `## 用户意图
第一段

## 用户意图
第二段`;

    expect(extractSection(prompt, '## 用户意图')).toBe('第一段');
  });
});

describe('extractChapterNumber', () => {
  it('extracts chapter number from "第 X 章" pattern', () => {
    expect(extractChapterNumber('请写第 5 章')).toBe(5);
    expect(extractChapterNumber('第12章内容')).toBe(12);
    expect(extractChapterNumber('第  100  章')).toBe(100);
  });

  it('returns 1 when no chapter pattern found', () => {
    expect(extractChapterNumber('普通文本')).toBe(1);
    expect(extractChapterNumber('')).toBe(1);
  });

  it('handles Chinese chapter numbers', () => {
    expect(extractChapterNumber('请撰写第3章的内容')).toBe(3);
  });
});
