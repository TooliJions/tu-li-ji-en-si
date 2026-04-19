import { describe, it, expect } from 'vitest';
import { MarkdownExporter, type MarkdownInput } from './markdown';

describe('MarkdownExporter', () => {
  const mockInput: MarkdownInput = {
    title: '测试小说',
    author: '测试作者',
    language: 'zh-CN',
    chapters: [
      { number: 1, title: '第一章 起点', content: '林晨走进了教室。\n今天是新学期第一天。' },
      { number: 2, title: '第二章 相遇', content: '苏小雨坐在窗边。\n她转过头看着林晨。' },
      { number: 3, title: '第三章 谜团', content: '档案室的门锁着。\n钥匙在哪里？' },
    ],
  };

  it('generates markdown output', async () => {
    const exporter = new MarkdownExporter();
    const text = await exporter.generate(mockInput);

    expect(text).toBeTruthy();
    expect(typeof text).toBe('string');
  });

  it('includes frontmatter', async () => {
    const exporter = new MarkdownExporter();
    const text = await exporter.generate(mockInput);

    expect(text.startsWith('---')).toBe(true);
    expect(text).toContain('title: 测试小说');
    expect(text).toContain('author: 测试作者');
    expect(text).toContain('---');
  });

  it('includes table of contents', async () => {
    const exporter = new MarkdownExporter();
    const text = await exporter.generate(mockInput);

    expect(text).toContain('## 目录');
    expect(text).toContain('[第一章 起点](#第一章-起点)');
  });

  it('includes chapter headings as H1', async () => {
    const exporter = new MarkdownExporter();
    const text = await exporter.generate(mockInput);

    expect(text).toContain('# 第一章 起点');
    expect(text).toContain('# 第二章 相遇');
    expect(text).toContain('# 第三章 谜团');
  });

  it('includes chapter content', async () => {
    const exporter = new MarkdownExporter();
    const text = await exporter.generate(mockInput);

    expect(text).toContain('林晨走进了教室');
    expect(text).toContain('苏小雨坐在窗边');
  });

  it('handles empty chapters', async () => {
    const exporter = new MarkdownExporter();
    const text = await exporter.generate({
      title: 'Empty Book',
      author: 'Nobody',
      language: 'en',
      chapters: [],
    });

    expect(text).toContain('title: Empty Book');
    expect(text).not.toContain('## 目录');
  });

  it('escapes special markdown characters in title', async () => {
    const exporter = new MarkdownExporter();
    const text = await exporter.generate({
      title: 'Test & "Special" <Chars>',
      author: 'Author',
      language: 'en',
      chapters: [],
    });

    // Frontmatter values with special chars don't need escaping in YAML
    expect(text).toContain('title: Test & "Special" <Chars>');
  });

  it('generates larger output with many chapters', async () => {
    const manyChapters = Array.from({ length: 30 }, (_, i) => ({
      number: i + 1,
      title: `第${i + 1}章 标题${i + 1}`,
      content: `第${i + 1}章正文。\n包含多行内容。\n这是第三行。`,
    }));
    const exporter = new MarkdownExporter();
    const text = await exporter.generate({
      title: '长篇测试',
      author: '测试者',
      language: 'zh-CN',
      chapters: manyChapters,
    });

    expect(text.length).toBeGreaterThan(1000);
    expect(text).toContain('# 第30章 标题30');
  });
});
