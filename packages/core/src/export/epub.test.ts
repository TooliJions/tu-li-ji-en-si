import { describe, it, expect } from 'vitest';
import AdmZip from 'adm-zip';
import { EpubExporter, type EpubInput, type EpubChapter } from './epub';

function extractZip(buffer: Buffer): Record<string, string> {
  const zip = new AdmZip(buffer);
  const entries: Record<string, string> = {};
  for (const entry of zip.getEntries()) {
    entries[entry.entryName] = entry.getData().toString('utf-8');
  }
  return entries;
}

describe('EpubExporter', () => {
  const mockChapters: EpubChapter[] = [
    {
      number: 1,
      title: '第一章 起点',
      content: '<p>林晨走进了教室。</p><p>今天是新学期第一天。</p>',
    },
    {
      number: 2,
      title: '第二章 相遇',
      content: '<p>苏小雨坐在窗边。</p><p>她转过头看着林晨。</p>',
    },
    { number: 3, title: '第三章 谜团', content: '<p>档案室的门锁着。</p><p>钥匙在哪里？</p>' },
  ];

  const mockInput: EpubInput = {
    title: '测试小说',
    author: '测试作者',
    language: 'zh-CN',
    chapters: mockChapters,
  };

  it('generates a valid EPUB buffer', async () => {
    const exporter = new EpubExporter();
    const buffer = await exporter.generate(mockInput);

    expect(buffer).toBeTruthy();
    expect(buffer.length).toBeGreaterThan(0);
  });

  it('includes mimetype in EPUB', async () => {
    const exporter = new EpubExporter();
    const buffer = await exporter.generate(mockInput);
    const files = extractZip(buffer);

    expect(files['mimetype']).toBe('application/epub+zip');
  });

  it('includes container.xml', async () => {
    const exporter = new EpubExporter();
    const buffer = await exporter.generate(mockInput);
    const files = extractZip(buffer);

    expect(files['META-INF/container.xml']).toBeTruthy();
    expect(files['META-INF/container.xml']).toContain('content.opf');
  });

  it('includes book title and author in content.opf', async () => {
    const exporter = new EpubExporter();
    const buffer = await exporter.generate(mockInput);
    const files = extractZip(buffer);
    const opf = files['OEBPS/content.opf'];

    expect(opf).toContain('测试小说');
    expect(opf).toContain('测试作者');
    expect(opf).toContain('zh-CN');
  });

  it('includes all chapter files', async () => {
    const exporter = new EpubExporter();
    const buffer = await exporter.generate(mockInput);
    const files = extractZip(buffer);

    expect(files['OEBPS/chapter-001.xhtml']).toBeTruthy();
    expect(files['OEBPS/chapter-002.xhtml']).toBeTruthy();
    expect(files['OEBPS/chapter-003.xhtml']).toBeTruthy();
  });

  it('includes chapter content in XHTML files', async () => {
    const exporter = new EpubExporter();
    const buffer = await exporter.generate(mockInput);
    const files = extractZip(buffer);

    expect(files['OEBPS/chapter-001.xhtml']).toContain('林晨走进了教室');
    expect(files['OEBPS/chapter-002.xhtml']).toContain('苏小雨坐在窗边');
  });

  it('escapes HTML special characters in content', async () => {
    const input: EpubInput = {
      title: 'Test & Co',
      author: 'Author "Name"',
      language: 'en',
      chapters: [{ number: 1, title: 'Chapter 1', content: '<p>He said "hello" & smiled.</p>' }],
    };
    const exporter = new EpubExporter();
    const buffer = await exporter.generate(input);
    const files = extractZip(buffer);
    const opf = files['OEBPS/content.opf'];

    // Title/author in XML context should be escaped
    expect(opf).toContain('Test &amp; Co');
    expect(opf).toContain('Author &quot;Name&quot;');
  });

  it('includes chapter titles in navigation', async () => {
    const exporter = new EpubExporter();
    const buffer = await exporter.generate(mockInput);
    const files = extractZip(buffer);
    const nav = files['OEBPS/nav.xhtml'];

    expect(nav).toContain('第一章 起点');
    expect(nav).toContain('第三章 谜团');
  });

  it('generates unique identifier', async () => {
    const exporter = new EpubExporter();
    const buffer = await exporter.generate(mockInput);
    const files = extractZip(buffer);
    const opf = files['OEBPS/content.opf'];

    expect(opf).toMatch(/urn:uuid:[a-f0-9-]{36}/i);
  });

  it('handles empty chapters gracefully', async () => {
    const input: EpubInput = {
      title: 'Empty Book',
      author: 'Nobody',
      language: 'zh-CN',
      chapters: [],
    };
    const exporter = new EpubExporter();
    const buffer = await exporter.generate(input);

    expect(buffer).toBeTruthy();
    expect(buffer.length).toBeGreaterThan(0);
  });

  it('generates larger file with multiple chapters', async () => {
    const manyChapters: EpubChapter[] = Array.from({ length: 20 }, (_, i) => ({
      number: i + 1,
      title: `第${i + 1}章`,
      content: `<p>这是第${i + 1}章的内容。</p>`.repeat(10),
    }));
    const input: EpubInput = {
      title: '长篇测试',
      author: '测试者',
      language: 'zh-CN',
      chapters: manyChapters,
    };
    const exporter = new EpubExporter();
    const buffer = await exporter.generate(input);

    expect(buffer.length).toBeGreaterThan(5000);
  });

  it('uses correct EPUB 3.0 package version', async () => {
    const exporter = new EpubExporter();
    const buffer = await exporter.generate(mockInput);
    const files = extractZip(buffer);
    const opf = files['OEBPS/content.opf'];

    expect(opf).toContain('version="3.0"');
  });
});
