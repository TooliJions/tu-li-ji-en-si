import { describe, it, expect } from 'vitest';
import { TxtExporter, type TxtInput } from './txt';

describe('TxtExporter', () => {
  const mockInput: TxtInput = {
    title: '测试小说',
    author: '测试作者',
    chapters: [
      { number: 1, title: '第一章 起点', content: '林晨走进了教室。\n今天是新学期第一天。' },
      { number: 2, title: '第二章 相遇', content: '苏小雨坐在窗边。\n她转过头看着林晨。' },
      { number: 3, title: '第三章 谜团', content: '档案室的门锁着。\n钥匙在哪里？' },
    ],
  };

  it('generates plain text output', async () => {
    const exporter = new TxtExporter();
    const text = await exporter.generate(mockInput);

    expect(text).toBeTruthy();
    expect(typeof text).toBe('string');
  });

  it('includes book title and author', async () => {
    const exporter = new TxtExporter();
    const text = await exporter.generate(mockInput);

    expect(text).toContain('测试小说');
    expect(text).toContain('测试作者');
  });

  it('includes all chapter titles and content', async () => {
    const exporter = new TxtExporter();
    const text = await exporter.generate(mockInput);

    expect(text).toContain('第一章 起点');
    expect(text).toContain('林晨走进了教室');
    expect(text).toContain('第二章 相遇');
    expect(text).toContain('苏小雨坐在窗边');
    expect(text).toContain('第三章 谜团');
  });

  it('separates chapters with divider', async () => {
    const exporter = new TxtExporter();
    const text = await exporter.generate(mockInput);

    // Should have dividers between chapters
    expect(text).toContain('===');
  });

  it('handles empty chapters gracefully', async () => {
    const exporter = new TxtExporter();
    const text = await exporter.generate({
      title: 'Empty Book',
      author: 'Nobody',
      chapters: [],
    });

    expect(text).toContain('Empty Book');
    expect(text).toContain('Nobody');
  });

  it('preserves newlines in chapter content', async () => {
    const exporter = new TxtExporter();
    const text = await exporter.generate(mockInput);

    expect(text).toContain('\n');
  });

  it('generates larger text with many chapters', async () => {
    const manyChapters = Array.from({ length: 50 }, (_, i) => ({
      number: i + 1,
      title: `第${i + 1}章`,
      content: `第${i + 1}章的正文内容，大约有50字。这是一段较长的文本用于测试导出的完整性。`,
    }));
    const exporter = new TxtExporter();
    const text = await exporter.generate({
      title: '长篇测试',
      author: '测试者',
      chapters: manyChapters,
    });

    expect(text.length).toBeGreaterThan(1000);
    expect(text).toContain('第50章');
  });
});
